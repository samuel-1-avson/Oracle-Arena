import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { createBattle, getActiveUnit } from '@/lib/game/engine';
import {
  BattleRoomDoc,
  computeEloDelta,
  generateRoomCode,
  normalizeRoomCode,
  PlayerProfileDoc,
  ValidatedTurnResult,
} from '@/lib/game/multiplayer';
import { normalizeCharacterProgression } from '@/lib/game/progression';
import { DEFAULT_PLAYER_SQUAD_IDS } from '@/lib/game/roster';
import {
  BattleAction,
  BattleState,
  CharacterDefinition,
  CharacterDefinitionSchema,
  MatchSummaryRecord,
  RULESET_VERSION,
  TeamSide,
} from '@/lib/game/types';
import { db, handleFirestoreError, OperationType } from './client';

/**
 * Recursively strips `undefined` properties because Firestore rejects explicit `undefined` values
 * inside nested objects and arrays. Preserves Firestore FieldValues and Timestamps intact.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Timestamp) return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

function clampString(val: string, minLen: number, maxLen: number, fallback: string): string {
  const cleaned = val.trim().slice(0, maxLen);
  if (cleaned.length < minLen) return fallback.slice(0, maxLen);
  return cleaned;
}

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  return cleaned.length >= 1 ? cleaned : `${fallbackPrefix}-${Date.now()}`;
}

function ensureFiveValidSquadIds(ids: string[]): string[] {
  const valid = ids
    .filter((id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id))
    .slice(0, 5);
  for (const fallback of DEFAULT_PLAYER_SQUAD_IDS) {
    if (valid.length >= 5) break;
    if (!valid.includes(fallback)) valid.push(fallback);
  }
  return valid.slice(0, 5);
}

function prepareBattleStateForFirestore(state: BattleState): BattleState {
  // Trim very long event histories to keep room documents fast and well below 1MB
  const trimmedEvents =
    state.events.length > 140 ? state.events.slice(-140) : state.events;
  return stripUndefinedDeep({
    ...state,
    events: trimmedEvents,
  });
}

function getTimestampMillis(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (
    ts &&
    typeof ts === 'object' &&
    'toMillis' in ts &&
    typeof (ts as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

// ============================================================================
// 1. Player Profile & Private Account (Split PII Collection)
// ============================================================================

export async function ensurePlayerProfile(
  user: User,
  localActiveSquadIds: string[],
  customCardCount: number
): Promise<PlayerProfileDoc> {
  const profilePath = `players/${user.uid}`;
  const privatePath = `players/${user.uid}/private/account`;
  const profileRef = doc(db, 'players', user.uid);
  const privateRef = doc(db, 'players', user.uid, 'private', 'account');

  const safeName = clampString(
    user.displayName || user.email?.split('@')[0] || 'Arena Tactician',
    2,
    40,
    'Arena Tactician'
  );
  const safeAvatar = (user.photoURL || '').slice(0, 400);
  const safeSquad = ensureFiveValidSquadIds(localActiveSquadIds);
  const safeCustomCount = Math.max(0, Math.min(100, Math.floor(customCardCount)));

  try {
    const existingSnap = await getDoc(profileRef);
    let profile: PlayerProfileDoc;

    if (!existingSnap.exists()) {
      const newProfile: PlayerProfileDoc = {
        uid: user.uid,
        displayName: safeName,
        avatarUrl: safeAvatar,
        title: 'Founding Tactician',
        rating: 1000,
        wins: 0,
        losses: 0,
        matchesPlayed: 0,
        customCardCount: safeCustomCount,
        activeSquadIds: safeSquad,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(profileRef, newProfile);
      profile = { ...newProfile };
    } else {
      const data = existingSnap.data() as PlayerProfileDoc;
      profile = data;
      // Sync updated Google display name / avatar cleanly via Action A
      if (
        data.displayName !== safeName ||
        data.avatarUrl !== safeAvatar ||
        data.customCardCount !== safeCustomCount
      ) {
        await updateDoc(profileRef, {
          displayName: safeName,
          avatarUrl: safeAvatar,
          customCardCount: safeCustomCount,
          updatedAt: serverTimestamp(),
        });
        profile = {
          ...data,
          displayName: safeName,
          avatarUrl: safeAvatar,
          customCardCount: safeCustomCount,
        };
      }
    }

    // Ensure strictly private PII doc exists (after /players/{uid} Master Gate)
    if (user.email && user.email.length >= 3) {
      try {
        const privSnap = await getDoc(privateRef);
        const safeEmail = user.email.slice(0, 254);
        if (!privSnap.exists()) {
          await setDoc(privateRef, {
            uid: user.uid,
            email: safeEmail,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (privSnap.data()?.email !== safeEmail) {
          await updateDoc(privateRef, {
            email: safeEmail,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (privErr) {
        handleFirestoreError(privErr, OperationType.WRITE, privatePath);
      }
    }

    return profile;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, profilePath);
  }
}

export function subscribePlayerProfile(
  uid: string,
  onData: (profile: PlayerProfileDoc | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const profilePath = `players/${uid}`;
  return onSnapshot(
    doc(db, 'players', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as PlayerProfileDoc);
    },
    (err) => {
      if (onError) onError(err);
      else console.error(`Profile listener error at ${profilePath}:`, err);
    }
  );
}

export async function updateProfileSquadAndCount(
  uid: string,
  activeSquadIds: string[],
  customCardCount: number
): Promise<void> {
  const path = `players/${uid}`;
  try {
    await updateDoc(doc(db, 'players', uid), {
      activeSquadIds: ensureFiveValidSquadIds(activeSquadIds),
      customCardCount: Math.max(0, Math.min(100, Math.floor(customCardCount))),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// ============================================================================
// 2. Cloud Card Collection & Progression Sync (/players/{uid}/cards/{cardId})
// ============================================================================

export async function fetchCloudCards(uid: string): Promise<CharacterDefinition[]> {
  const path = `players/${uid}/cards`;
  try {
    const q = query(
      collection(db, 'players', uid, 'cards'),
      where('ownerId', '==', uid),
      limit(120)
    );
    const snap = await getDocs(q);
    const results: CharacterDefinition[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const parsed = CharacterDefinitionSchema.safeParse(data.cardData);
      if (parsed.success) {
        results.push(normalizeCharacterProgression(parsed.data));
      }
    });
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveCardToCloud(
  uid: string,
  rawCard: CharacterDefinition
): Promise<void> {
  const card = normalizeCharacterProgression(rawCard);
  const safeCardId = sanitizeId(card.id, 'chr');
  const path = `players/${uid}/cards/${safeCardId}`;
  const cardRef = doc(db, 'players', uid, 'cards', safeCardId);
  const isCustom = safeCardId.startsWith('chr-custom-');

  const normalizedForOwner: CharacterDefinition = {
    ...card,
    id: safeCardId,
    currentOwnerId: uid,
  };

  try {
    const snap = await getDoc(cardRef);
    const cleanCardData = stripUndefinedDeep(normalizedForOwner);

    if (!snap.exists()) {
      await setDoc(cardRef, {
        id: safeCardId,
        ownerId: uid,
        originalCreatorId: clampString(
          normalizedForOwner.originalCreatorId,
          1,
          128,
          uid
        ),
        originalCreatorName: clampString(
          normalizedForOwner.originalCreatorName,
          1,
          48,
          'Oracle Arena'
        ),
        name: clampString(normalizedForOwner.name, 2, 48, 'Champion'),
        level: Math.max(1, Math.min(10, Math.floor(normalizedForOwner.level))),
        xp: Math.max(0, Math.min(1000000, Math.floor(normalizedForOwner.xp))),
        evolutionStage: Math.max(
          0,
          Math.min(2, Math.floor(normalizedForOwner.evolutionStage))
        ),
        isCustom,
        cardData: cleanCardData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(cardRef, {
        name: clampString(normalizedForOwner.name, 2, 48, 'Champion'),
        level: Math.max(1, Math.min(10, Math.floor(normalizedForOwner.level))),
        xp: Math.max(0, Math.min(1000000, Math.floor(normalizedForOwner.xp))),
        evolutionStage: Math.max(
          0,
          Math.min(2, Math.floor(normalizedForOwner.evolutionStage))
        ),
        cardData: cleanCardData,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveCardsToCloud(
  uid: string,
  cards: CharacterDefinition[]
): Promise<void> {
  for (const card of cards) {
    await saveCardToCloud(uid, card);
  }
}

export async function deleteCustomCardFromCloud(
  uid: string,
  cardId: string
): Promise<void> {
  if (!cardId.startsWith('chr-custom-')) return;
  const path = `players/${uid}/cards/${cardId}`;
  try {
    await deleteDoc(doc(db, 'players', uid, 'cards', cardId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ============================================================================
// 3. Match History & Bounded ELO Rating Update
// ============================================================================

export async function fetchCloudMatches(uid: string): Promise<MatchSummaryRecord[]> {
  const path = `players/${uid}/matches`;
  try {
    const q = query(
      collection(db, 'players', uid, 'matches'),
      where('ownerId', '==', uid),
      limit(25)
    );
    const snap = await getDocs(q);
    const rows: Array<{ ts: number; rec: MatchSummaryRecord }> = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      rows.push({
        ts: getTimestampMillis(d.createdAt),
        rec: {
          matchId: String(d.matchId || docSnap.id),
          seed: Number(d.seed || 0),
          timestamp:
            d.createdAt instanceof Timestamp
              ? d.createdAt.toDate().toISOString()
              : new Date().toISOString(),
          winner: d.winner === 'player' ? 'player' : 'enemy',
          rounds: Number(d.rounds || 1),
          turns: Number(d.turns || 0),
          playerSquadIds: Array.isArray(d.playerSquadIds) ? d.playerSquadIds : [],
          enemySquadIds: Array.isArray(d.enemySquadIds) ? d.enemySquadIds : [],
          playerSurvivors: Number(d.playerSurvivors || 0),
          enemySurvivors: Number(d.enemySurvivors || 0),
          totalPlayerDamage: Number(d.totalPlayerDamage || 0),
          totalPlayerHealing: Number(d.totalPlayerHealing || 0),
          rulesetVersion: String(d.rulesetVersion || RULESET_VERSION),
        },
      });
    });
    rows.sort((a, b) => b.ts - a.ts);
    return rows.slice(0, 20).map((r) => r.rec);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function recordCloudMatchAndRating(
  uid: string,
  summary: MatchSummaryRecord,
  mode: 'solo' | 'multiplayer',
  opponentName: string,
  didViewerWin: boolean
): Promise<{ nextRating: number; delta: number }> {
  const safeMatchId = sanitizeId(
    `${summary.matchId}-${Date.now().toString(36)}`,
    'match'
  );
  const matchPath = `players/${uid}/matches/${safeMatchId}`;
  const profilePath = `players/${uid}`;

  try {
    const profileRef = doc(db, 'players', uid);
    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      return { nextRating: 1000, delta: 0 };
    }
    const profile = profileSnap.data() as PlayerProfileDoc;
    const elo = computeEloDelta(profile.rating, didViewerWin, mode);

    const batch = writeBatch(db);
    const matchRef = doc(db, 'players', uid, 'matches', safeMatchId);

    batch.set(matchRef, {
      matchId: safeMatchId,
      ownerId: uid,
      mode,
      opponentName: clampString(opponentName, 1, 48, 'Rival Tactician'),
      winner: didViewerWin ? 'player' : 'enemy',
      rounds: Math.max(1, Math.min(100, Math.floor(summary.rounds))),
      turns: Math.max(0, Math.min(500, Math.floor(summary.turns))),
      playerSurvivors: Math.max(0, Math.min(5, Math.floor(summary.playerSurvivors))),
      enemySurvivors: Math.max(0, Math.min(5, Math.floor(summary.enemySurvivors))),
      totalPlayerDamage: Math.max(
        0,
        Math.min(1000000, Math.floor(summary.totalPlayerDamage))
      ),
      totalPlayerHealing: Math.max(
        0,
        Math.min(1000000, Math.floor(summary.totalPlayerHealing))
      ),
      seed: Math.max(0, Math.min(9999999, Math.floor(summary.seed))),
      rulesetVersion: clampString(summary.rulesetVersion, 1, 24, RULESET_VERSION),
      playerSquadIds: ensureFiveValidSquadIds(summary.playerSquadIds),
      enemySquadIds: ensureFiveValidSquadIds(summary.enemySquadIds),
      createdAt: serverTimestamp(),
    });

    // Action B bounded progression update on /players/{uid}
    batch.update(profileRef, {
      rating: elo.nextRating,
      wins: profile.wins + (didViewerWin ? 1 : 0),
      losses: profile.losses + (didViewerWin ? 0 : 1),
      matchesPlayed: profile.matchesPlayed + 1,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return elo;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${matchPath} + ${profilePath}`);
  }
}

// ============================================================================
// 4. Arena Leaderboard (/players) — Zero PII
// ============================================================================

export function subscribeLeaderboard(
  onData: (players: PlayerProfileDoc[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(
    collection(db, 'players'),
    where('rating', '>=', 0),
    orderBy('rating', 'desc'),
    limit(20)
  );
  return onSnapshot(
    q,
    (snap) => {
      const players: PlayerProfileDoc[] = [];
      snap.forEach((docSnap) => {
        players.push(docSnap.data() as PlayerProfileDoc);
      });
      onData(players);
    },
    (err) => {
      if (onError) onError(err);
      else console.error('Leaderboard listener error:', err);
    }
  );
}

// ============================================================================
// 5. Real-Time 5v5 Multiplayer Battle Rooms (/rooms/{roomId} + /moves)
// ============================================================================

export async function createBattleRoom(
  user: User,
  hostName: string,
  hostSquad: CharacterDefinition[]
): Promise<BattleRoomDoc> {
  if (hostSquad.length !== 5) {
    throw new Error('A complete 5-champion squad is required to create a PvP room.');
  }

  const roomCode = generateRoomCode();
  const roomId = `room-${roomCode.toLowerCase()}-${Date.now().toString(36)}`;
  const seed = Math.floor(10000 + Math.random() * 899999);
  const path = `rooms/${roomId}`;

  const cleanHostSquad = hostSquad.map((c) =>
    stripUndefinedDeep(normalizeCharacterProgression(c))
  );

  const roomPayload: BattleRoomDoc = {
    roomId,
    roomCode,
    status: 'waiting',
    rulesetVersion: RULESET_VERSION,
    seed,
    hostUid: user.uid,
    hostName: clampString(hostName, 2, 40, 'Arena Host'),
    hostSquad: cleanHostSquad,
    guestUid: '',
    guestName: '',
    guestSquad: [],
    turnNumber: 0,
    round: 1,
    activeSide: 'player',
    winnerSide: '',
    winnerUid: '',
    battleState: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'rooms', roomId), roomPayload);
    return roomPayload;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function findWaitingRoomByCode(
  rawCode: string
): Promise<BattleRoomDoc | null> {
  const code = normalizeRoomCode(rawCode);
  if (code.length !== 6) return null;

  const path = 'rooms';
  try {
    // Query solely on status == 'waiting' (matches allow list & needs zero composite index)
    const q = query(
      collection(db, 'rooms'),
      where('status', '==', 'waiting'),
      limit(50)
    );
    const snap = await getDocs(q);
    for (const docSnap of snap.docs) {
      const data = docSnap.data() as BattleRoomDoc;
      if (data.roomCode === code) {
        return data;
      }
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function joinBattleRoom(
  roomId: string,
  user: User,
  guestName: string,
  guestSquad: CharacterDefinition[]
): Promise<BattleRoomDoc> {
  if (guestSquad.length !== 5) {
    throw new Error('You need a full 5-champion squad to join a PvP battle.');
  }

  const path = `rooms/${roomId}`;
  const roomRef = doc(db, 'rooms', roomId);

  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) {
      throw new Error('Battle room not found.');
    }

    const room = snap.data() as BattleRoomDoc;
    if (room.status !== 'waiting') {
      throw new Error('This battle room is no longer open for challengers.');
    }
    if (room.hostUid === user.uid) {
      throw new Error('You cannot join your own room as the opposing player.');
    }

    const cleanGuestSquad = guestSquad.map((c) =>
      stripUndefinedDeep(normalizeCharacterProgression(c))
    );
    const cleanHostSquad = room.hostSquad.map((c) =>
      normalizeCharacterProgression(c)
    );

    const initialBattle = createBattle(cleanHostSquad, cleanGuestSquad, room.seed);
    const firstActive = getActiveUnit(initialBattle);
    const initialActiveSide: TeamSide = firstActive ? firstActive.side : 'player';

    const sanitizedBattle = prepareBattleStateForFirestore(initialBattle);

    // Action 2 on /rooms/{roomId}
    await updateDoc(roomRef, {
      guestUid: user.uid,
      guestName: clampString(guestName, 2, 40, 'Arena Challenger'),
      guestSquad: cleanGuestSquad,
      status: 'active',
      battleState: sanitizedBattle,
      activeSide: initialActiveSide,
      round: sanitizedBattle.round,
      turnNumber: 0,
      updatedAt: serverTimestamp(),
    });

    return {
      ...room,
      guestUid: user.uid,
      guestName: clampString(guestName, 2, 40, 'Arena Challenger'),
      guestSquad: cleanGuestSquad,
      status: 'active',
      battleState: sanitizedBattle,
      activeSide: initialActiveSide,
      round: sanitizedBattle.round,
      turnNumber: 0,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function cancelWaitingRoom(roomId: string): Promise<void> {
  const path = `rooms/${roomId}`;
  try {
    // Action 1 on /rooms/{roomId}
    await updateDoc(doc(db, 'rooms', roomId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function forfeitActiveRoom(
  room: BattleRoomDoc,
  forfeitingUid: string
): Promise<void> {
  const path = `rooms/${room.roomId}`;
  const isHost = room.hostUid === forfeitingUid;
  const winnerSide: TeamSide = isHost ? 'enemy' : 'player';
  const winnerUid = isHost ? room.guestUid : room.hostUid;

  try {
    // Action 4 on /rooms/{roomId}
    await updateDoc(doc(db, 'rooms', room.roomId), {
      status: 'finished',
      winnerSide,
      winnerUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Commits a server-validated PvP turn atomically via Firestore writeBatch:
 * 1) Updates /rooms/{roomId} (Action 3) with sequential room turnNumber = existing + 1
 * 2) Creates /rooms/{roomId}/moves/turn-{nextTurnNumber} immutable audit record
 */
export async function commitValidatedMultiplayerMove(
  room: BattleRoomDoc,
  actorUid: string,
  side: TeamSide,
  action: BattleAction,
  validated: ValidatedTurnResult
): Promise<void> {
  const nextRoomTurnNumber = room.turnNumber + 1;
  const moveId = `turn-${nextRoomTurnNumber}`;
  const roomPath = `rooms/${room.roomId}`;
  const movePath = `rooms/${room.roomId}/moves/${moveId}`;

  const winnerUid =
    validated.status === 'finished'
      ? validated.winnerSide === 'player'
        ? room.hostUid
        : room.guestUid
      : '';

  try {
    const batch = writeBatch(db);
    const roomRef = doc(db, 'rooms', room.roomId);
    const moveRef = doc(db, 'rooms', room.roomId, 'moves', moveId);

    batch.update(roomRef, {
      battleState: prepareBattleStateForFirestore(validated.nextBattleState),
      turnNumber: nextRoomTurnNumber,
      round: validated.round,
      activeSide: validated.nextActiveSide,
      status: validated.status,
      winnerSide: validated.winnerSide,
      winnerUid,
      updatedAt: serverTimestamp(),
    });

    batch.set(moveRef, {
      moveId,
      roomId: room.roomId,
      turnNumber: nextRoomTurnNumber,
      actorUid,
      side,
      actorId: action.actorId,
      abilityId: action.abilityId,
      targetIds: validated.resolvedTargetIds.slice(0, 5),
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${roomPath} + ${movePath}`);
  }
}

export function subscribeBattleRoom(
  roomId: string,
  onData: (room: BattleRoomDoc | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const path = `rooms/${roomId}`;
  return onSnapshot(
    doc(db, 'rooms', roomId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as BattleRoomDoc);
    },
    (err) => {
      if (onError) onError(err);
      else console.error(`Room listener error at ${path}:`, err);
    }
  );
}

/**
 * Subscribes to open waiting rooms plus rooms where the user is host or guest.
 * Uses 3 single-field queries sorted client-side to satisfy Firestore allow-list rules
 * without requiring custom composite indexes.
 */
export function subscribeLobbyRooms(
  uid: string,
  onData: (payload: {
    openRooms: BattleRoomDoc[];
    myRooms: BattleRoomDoc[];
  }) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  let waitingList: BattleRoomDoc[] = [];
  let hostList: BattleRoomDoc[] = [];
  let guestList: BattleRoomDoc[] = [];

  const emit = () => {
    const openRooms = waitingList
      .filter((r) => r.status === 'waiting' && r.hostUid !== uid)
      .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));

    const myMap = new Map<string, BattleRoomDoc>();
    for (const r of [...hostList, ...guestList]) {
      if (r.status !== 'cancelled') {
        myMap.set(r.roomId, r);
      }
    }
    const myRooms = Array.from(myMap.values()).sort(
      (a, b) => getTimestampMillis(b.updatedAt) - getTimestampMillis(a.updatedAt)
    );

    onData({ openRooms, myRooms });
  };

  const unsubWaiting = onSnapshot(
    query(collection(db, 'rooms'), where('status', '==', 'waiting'), limit(25)),
    (snap) => {
      waitingList = snap.docs.map((d) => d.data() as BattleRoomDoc);
      emit();
    },
    (err) => {
      if (onError) onError(err);
      else console.error('Waiting rooms listener error:', err);
    }
  );

  const unsubHost = onSnapshot(
    query(collection(db, 'rooms'), where('hostUid', '==', uid), limit(20)),
    (snap) => {
      hostList = snap.docs.map((d) => d.data() as BattleRoomDoc);
      emit();
    },
    (err) => {
      if (onError) onError(err);
      else console.error('Host rooms listener error:', err);
    }
  );

  const unsubGuest = onSnapshot(
    query(collection(db, 'rooms'), where('guestUid', '==', uid), limit(20)),
    (snap) => {
      guestList = snap.docs.map((d) => d.data() as BattleRoomDoc);
      emit();
    },
    (err) => {
      if (onError) onError(err);
      else console.error('Guest rooms listener error:', err);
    }
  );

  return () => {
    unsubWaiting();
    unsubHost();
    unsubGuest();
  };
}
