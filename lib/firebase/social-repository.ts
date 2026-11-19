'use client';

import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { PlayerProfileDoc } from '@/lib/game/multiplayer';
import {
  buildFriendshipId,
  ClanDoc,
  ClanDraftInput,
  ClanInviteDoc,
  ClanJoinPolicy,
  ClanMemberDoc,
  ClanMembershipDoc,
  ClanMessageDoc,
  ClanMessageKind,
  ClanRole,
  FriendshipDoc,
  MAX_CLAN_MEMBERS,
  normalizeClanTag,
  sanitizeArenaTitle,
  sanitizeDisplayName,
  sortClanMembersByRole,
  validateClanDraft,
  validateClanMessageDraft,
} from '@/lib/game/social';
import { ElementAffinity } from '@/lib/game/types';
import { db, handleFirestoreError, OperationType } from './client';

function createClientId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function getTimestampMillis(ts: unknown): number {
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

// =============================================================================
// 1. Public Community Directory & Profile Title Updates
// =============================================================================

export function subscribeCommunityPlayers(
  onData: (players: PlayerProfileDoc[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const q = query(
    collection(db, 'players'),
    where('rating', '>=', 0),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as PlayerProfileDoc)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function updatePlayerProfileIdentity(
  uid: string,
  rawDisplayName: string,
  rawTitle: string
): Promise<void> {
  const displayName = sanitizeDisplayName(rawDisplayName);
  const title = sanitizeArenaTitle(rawTitle);
  if (displayName.length < 2 || displayName.length > 40) {
    throw new Error('Display name must be between 2 and 40 characters.');
  }
  if (title.length < 2 || title.length > 48) {
    throw new Error('Arena title must be between 2 and 48 characters.');
  }

  const ref = doc(db, 'players', uid);
  try {
    await updateDoc(ref, {
      displayName,
      title,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `players/${uid}`);
  }
}

export async function fetchPlayerClanMembership(
  uid: string
): Promise<ClanMembershipDoc | null> {
  const ref = doc(db, 'clanMemberships', uid);
  try {
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as ClanMembershipDoc) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `clanMemberships/${uid}`);
  }
}

export function subscribeMyClanMembership(
  uid: string,
  onData: (membership: ClanMembershipDoc | null) => void,
  onError?: (err: unknown) => void
): () => void {
  const ref = doc(db, 'clanMemberships', uid);
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? (snap.data() as ClanMembershipDoc) : null);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export function subscribeAllClanMemberships(
  onData: (byUid: Record<string, ClanMembershipDoc>) => void,
  onError?: (err: unknown) => void
): () => void {
  const q = query(
    collection(db, 'clanMemberships'),
    where('clanTag', '>=', '0'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const map: Record<string, ClanMembershipDoc> = {};
      for (const d of snap.docs) {
        const data = d.data() as ClanMembershipDoc;
        map[data.uid] = data;
      }
      onData(map);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

// =============================================================================
// 2. Friendships (/friendships/{friendshipId})
// =============================================================================

export function subscribeMyFriendships(
  uid: string,
  onData: (friendships: FriendshipDoc[]) => void,
  onError?: (err: unknown) => void
): () => void {
  let asRequester: FriendshipDoc[] = [];
  let asAddressee: FriendshipDoc[] = [];

  const emit = () => {
    const merged = new Map<string, FriendshipDoc>();
    for (const f of [...asRequester, ...asAddressee]) {
      merged.set(f.friendshipId, f);
    }
    const list = Array.from(merged.values()).sort(
      (a, b) =>
        getTimestampMillis(b.updatedAt) - getTimestampMillis(a.updatedAt)
    );
    onData(list);
  };

  const qReq = query(
    collection(db, 'friendships'),
    where('requesterUid', '==', uid),
    limit(60)
  );
  const qAdd = query(
    collection(db, 'friendships'),
    where('addresseeUid', '==', uid),
    limit(60)
  );

  const unsubReq = onSnapshot(
    qReq,
    (snap) => {
      asRequester = snap.docs.map((d) => d.data() as FriendshipDoc);
      emit();
    },
    (err) => {
      if (onError) onError(err);
    }
  );

  const unsubAdd = onSnapshot(
    qAdd,
    (snap) => {
      asAddressee = snap.docs.map((d) => d.data() as FriendshipDoc);
      emit();
    },
    (err) => {
      if (onError) onError(err);
    }
  );

  return () => {
    unsubReq();
    unsubAdd();
  };
}

export async function sendFriendRequest(
  requesterUid: string,
  requesterName: string,
  addresseeUid: string,
  addresseeName: string
): Promise<void> {
  const friendshipId = buildFriendshipId(requesterUid, addresseeUid);
  const ref = doc(db, 'friendships', friendshipId);
  const now = serverTimestamp();

  const payload: FriendshipDoc = {
    friendshipId,
    requesterUid,
    requesterName: sanitizeDisplayName(requesterName) || 'Arena Tactician',
    addresseeUid,
    addresseeName: sanitizeDisplayName(addresseeName) || 'Arena Tactician',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `friendships/${friendshipId}`
    );
  }
}

export async function respondToFriendRequest(
  friendshipId: string,
  status: 'accepted' | 'declined'
): Promise<void> {
  const ref = doc(db, 'friendships', friendshipId);
  try {
    await updateDoc(ref, {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `friendships/${friendshipId}`
    );
  }
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  const ref = doc(db, 'friendships', friendshipId);
  try {
    await deleteDoc(ref);
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.DELETE,
      `friendships/${friendshipId}`
    );
  }
}

// =============================================================================
// 3. Clans, Roster RBAC, Warroom Messages & Invites
// =============================================================================

export function subscribeClansDirectory(
  onData: (clans: ClanDoc[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const q = query(
    collection(db, 'clans'),
    where('memberCount', '>=', 1),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as ClanDoc)
        .sort((a, b) => {
          if (b.totalRating !== a.totalRating) {
            return b.totalRating - a.totalRating;
          }
          return b.memberCount - a.memberCount;
        });
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export function subscribeClanDetail(
  clanId: string,
  onData: (clan: ClanDoc | null) => void,
  onError?: (err: unknown) => void
): () => void {
  return onSnapshot(
    doc(db, 'clans', clanId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as ClanDoc) : null);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export function subscribeClanMembers(
  clanId: string,
  onData: (members: ClanMemberDoc[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const q = query(
    collection(db, 'clans', clanId, 'members'),
    where('clanId', '==', clanId),
    limit(MAX_CLAN_MEMBERS)
  );
  return onSnapshot(
    q,
    (snap) => {
      const members = snap.docs.map((d) => d.data() as ClanMemberDoc);
      onData(sortClanMembersByRole(members));
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export function subscribeClanMessages(
  clanId: string,
  onData: (messages: ClanMessageDoc[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const q = query(
    collection(db, 'clans', clanId, 'messages'),
    where('clanId', '==', clanId),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const messages = snap.docs
        .map((d) => d.data() as ClanMessageDoc)
        .sort(
          (a, b) =>
            getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt)
        );
      onData(messages);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export function subscribeMyClanInvites(
  uid: string,
  onData: (payload: {
    incoming: ClanInviteDoc[];
    outgoing: ClanInviteDoc[];
  }) => void,
  onError?: (err: unknown) => void
): () => void {
  let incoming: ClanInviteDoc[] = [];
  let outgoing: ClanInviteDoc[] = [];

  const emit = () => {
    const sortByTime = (arr: ClanInviteDoc[]) =>
      [...arr].sort(
        (a, b) =>
          getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)
      );
    onData({
      incoming: sortByTime(incoming),
      outgoing: sortByTime(outgoing),
    });
  };

  const qIn = query(
    collection(db, 'clanInvites'),
    where('inviteeUid', '==', uid),
    limit(30)
  );
  const qOut = query(
    collection(db, 'clanInvites'),
    where('inviterUid', '==', uid),
    limit(30)
  );

  const unsubIn = onSnapshot(
    qIn,
    (snap) => {
      incoming = snap.docs.map((d) => d.data() as ClanInviteDoc);
      emit();
    },
    (err) => {
      if (onError) onError(err);
    }
  );

  const unsubOut = onSnapshot(
    qOut,
    (snap) => {
      outgoing = snap.docs.map((d) => d.data() as ClanInviteDoc);
      emit();
    },
    (err) => {
      if (onError) onError(err);
    }
  );

  return () => {
    unsubIn();
    unsubOut();
  };
}

export async function createClanAtomic(
  user: User,
  profile: PlayerProfileDoc,
  draft: ClanDraftInput
): Promise<ClanDoc> {
  const check = validateClanDraft(draft);
  if (!check.ok) {
    throw new Error(check.error || 'Invalid clan configuration.');
  }

  const clanId = createClientId('clan');
  const cleanName = draft.name.trim();
  const cleanTag = normalizeClanTag(draft.tag);
  const cleanMotto = draft.motto.trim();
  const leaderName =
    sanitizeDisplayName(profile.displayName || user.displayName || '') ||
    'Arena Tactician';
  const rating = Math.max(0, Math.min(5000, Math.round(profile.rating || 1000)));
  const title = sanitizeArenaTitle(profile.title || 'Founding Tactician');
  const now = serverTimestamp();

  const clanDoc: ClanDoc = {
    clanId,
    name: cleanName,
    tag: cleanTag,
    motto: cleanMotto,
    emblem: draft.emblem,
    joinPolicy: draft.joinPolicy,
    leaderUid: user.uid,
    leaderName,
    memberCount: 1,
    totalRating: rating,
    lastEventMemberUid: user.uid,
    lastEventRefId: '',
    createdAt: now,
    updatedAt: now,
  };

  const memberDoc: ClanMemberDoc = {
    uid: user.uid,
    clanId,
    displayName: leaderName,
    title,
    rating,
    role: 'leader',
    joinedAt: now,
    updatedAt: now,
  };

  const membershipDoc: ClanMembershipDoc = {
    uid: user.uid,
    clanId,
    clanName: cleanName,
    clanTag: cleanTag,
    role: 'leader',
    joinedAt: now,
    updatedAt: now,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'clans', clanId), clanDoc);
  batch.set(doc(db, 'clans', clanId, 'members', user.uid), memberDoc);
  batch.set(doc(db, 'clanMemberships', user.uid), membershipDoc);

  try {
    await batch.commit();
    return clanDoc;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `clans/${clanId}`);
  }
}

export async function updateClanSettings(
  clanId: string,
  updates: {
    name: string;
    motto: string;
    emblem: ElementAffinity;
    joinPolicy: ClanJoinPolicy;
  },
  existingTag: string
): Promise<void> {
  const check = validateClanDraft({
    ...updates,
    tag: existingTag,
  });
  if (!check.ok) {
    throw new Error(check.error || 'Invalid clan settings.');
  }

  const ref = doc(db, 'clans', clanId);
  try {
    await updateDoc(ref, {
      name: updates.name.trim(),
      motto: updates.motto.trim(),
      emblem: updates.emblem,
      joinPolicy: updates.joinPolicy,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `clans/${clanId}`);
  }
}

export async function joinOpenClanAtomic(
  clan: ClanDoc,
  user: User,
  profile: PlayerProfileDoc
): Promise<void> {
  if (clan.joinPolicy !== 'open') {
    throw new Error('This clan is Invite-Only. Request an invite from a Leader or Officer.');
  }
  if (clan.memberCount >= MAX_CLAN_MEMBERS) {
    throw new Error('This clan has reached the maximum roster size of 30 members.');
  }

  const displayName =
    sanitizeDisplayName(profile.displayName || user.displayName || '') ||
    'Arena Tactician';
  const title = sanitizeArenaTitle(profile.title || 'Founding Tactician');
  const rating = Math.max(0, Math.min(5000, Math.round(profile.rating || 1000)));
  const now = serverTimestamp();

  const batch = writeBatch(db);
  batch.update(doc(db, 'clans', clan.clanId), {
    memberCount: clan.memberCount + 1,
    totalRating: Math.min(200000, Math.max(0, clan.totalRating + rating)),
    lastEventMemberUid: user.uid,
    lastEventRefId: '',
    updatedAt: now,
  });
  batch.set(doc(db, 'clans', clan.clanId, 'members', user.uid), {
    uid: user.uid,
    clanId: clan.clanId,
    displayName,
    title,
    rating,
    role: 'member',
    joinedAt: now,
    updatedAt: now,
  } satisfies ClanMemberDoc);
  batch.set(doc(db, 'clanMemberships', user.uid), {
    uid: user.uid,
    clanId: clan.clanId,
    clanName: clan.name,
    clanTag: clan.tag,
    role: 'member',
    joinedAt: now,
    updatedAt: now,
  } satisfies ClanMembershipDoc);

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `clans/${clan.clanId}`);
  }
}

export async function acceptClanInviteAtomic(
  invite: ClanInviteDoc,
  user: User,
  profile: PlayerProfileDoc
): Promise<void> {
  const clanSnap = await getDoc(doc(db, 'clans', invite.clanId));
  if (!clanSnap.exists()) {
    throw new Error('This clan no longer exists.');
  }
  const clan = clanSnap.data() as ClanDoc;
  if (clan.memberCount >= MAX_CLAN_MEMBERS) {
    throw new Error('This clan is already at maximum capacity (30 members).');
  }

  const displayName =
    sanitizeDisplayName(profile.displayName || user.displayName || '') ||
    'Arena Tactician';
  const title = sanitizeArenaTitle(profile.title || 'Founding Tactician');
  const rating = Math.max(0, Math.min(5000, Math.round(profile.rating || 1000)));
  const now = serverTimestamp();

  const batch = writeBatch(db);
  batch.update(doc(db, 'clanInvites', invite.inviteId), {
    status: 'accepted',
    updatedAt: now,
  });
  batch.update(doc(db, 'clans', clan.clanId), {
    memberCount: clan.memberCount + 1,
    totalRating: Math.min(200000, Math.max(0, clan.totalRating + rating)),
    lastEventMemberUid: user.uid,
    lastEventRefId: invite.inviteId,
    updatedAt: now,
  });
  batch.set(doc(db, 'clans', clan.clanId, 'members', user.uid), {
    uid: user.uid,
    clanId: clan.clanId,
    displayName,
    title,
    rating,
    role: 'member',
    joinedAt: now,
    updatedAt: now,
  } satisfies ClanMemberDoc);
  batch.set(doc(db, 'clanMemberships', user.uid), {
    uid: user.uid,
    clanId: clan.clanId,
    clanName: clan.name,
    clanTag: clan.tag,
    role: 'member',
    joinedAt: now,
    updatedAt: now,
  } satisfies ClanMembershipDoc);

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `clanInvites/${invite.inviteId}`
    );
  }
}

export async function leaveClanAtomic(
  clan: ClanDoc,
  uid: string,
  memberRating: number
): Promise<void> {
  if (clan.leaderUid === uid) {
    throw new Error(
      'Clan leaders must transfer leadership to another member or disband a solo clan before leaving.'
    );
  }

  const now = serverTimestamp();
  const nextTotalRating = Math.max(0, clan.totalRating - Math.max(0, memberRating));

  const batch = writeBatch(db);
  batch.update(doc(db, 'clans', clan.clanId), {
    memberCount: Math.max(1, clan.memberCount - 1),
    totalRating: nextTotalRating,
    lastEventMemberUid: uid,
    lastEventRefId: '',
    updatedAt: now,
  });
  batch.delete(doc(db, 'clans', clan.clanId, 'members', uid));
  batch.delete(doc(db, 'clanMemberships', uid));

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `clans/${clan.clanId}`);
  }
}

export async function kickClanMemberAtomic(
  clan: ClanDoc,
  targetMember: ClanMemberDoc
): Promise<void> {
  if (targetMember.role === 'leader') {
    throw new Error('Cannot remove the clan leader.');
  }

  const now = serverTimestamp();
  const nextTotalRating = Math.max(
    0,
    clan.totalRating - Math.max(0, targetMember.rating)
  );

  const batch = writeBatch(db);
  batch.update(doc(db, 'clans', clan.clanId), {
    memberCount: Math.max(1, clan.memberCount - 1),
    totalRating: nextTotalRating,
    lastEventMemberUid: targetMember.uid,
    lastEventRefId: '',
    updatedAt: now,
  });
  batch.delete(doc(db, 'clans', clan.clanId, 'members', targetMember.uid));
  batch.delete(doc(db, 'clanMemberships', targetMember.uid));

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `clans/${clan.clanId}`);
  }
}

export async function updateClanMemberRoleAtomic(
  clanId: string,
  targetUid: string,
  nextRole: 'officer' | 'member'
): Promise<void> {
  const now = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(doc(db, 'clans', clanId, 'members', targetUid), {
    role: nextRole,
    updatedAt: now,
  });
  batch.update(doc(db, 'clanMemberships', targetUid), {
    role: nextRole,
    updatedAt: now,
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `clans/${clanId}/members/${targetUid}`
    );
  }
}

export async function transferClanLeadershipAtomic(
  clan: ClanDoc,
  currentLeaderUid: string,
  successor: ClanMemberDoc
): Promise<void> {
  if (successor.uid === currentLeaderUid) {
    throw new Error('Select a different member to inherit clan leadership.');
  }

  const now = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(doc(db, 'clans', clan.clanId), {
    leaderUid: successor.uid,
    leaderName: successor.displayName,
    updatedAt: now,
  });
  batch.update(doc(db, 'clans', clan.clanId, 'members', successor.uid), {
    role: 'leader',
    updatedAt: now,
  });
  batch.update(doc(db, 'clanMemberships', successor.uid), {
    role: 'leader',
    updatedAt: now,
  });
  batch.update(doc(db, 'clans', clan.clanId, 'members', currentLeaderUid), {
    role: 'officer',
    updatedAt: now,
  });
  batch.update(doc(db, 'clanMemberships', currentLeaderUid), {
    role: 'officer',
    updatedAt: now,
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `clans/${clan.clanId}`);
  }
}

export async function disbandSoloClanAtomic(
  clanId: string,
  leaderUid: string
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'clans', clanId));
  batch.delete(doc(db, 'clans', clanId, 'members', leaderUid));
  batch.delete(doc(db, 'clanMemberships', leaderUid));

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `clans/${clanId}`);
  }
}

export async function sendClanInvite(
  clan: ClanDoc,
  inviterUid: string,
  inviterName: string,
  invitee: Pick<PlayerProfileDoc, 'uid' | 'displayName'>
): Promise<void> {
  if (invitee.uid === inviterUid) {
    throw new Error('You cannot invite yourself to a clan.');
  }

  const inviteId = createClientId('cinv');
  const now = serverTimestamp();

  const payload: ClanInviteDoc = {
    inviteId,
    clanId: clan.clanId,
    clanName: clan.name,
    clanTag: clan.tag,
    inviterUid,
    inviterName: sanitizeDisplayName(inviterName) || 'Arena Tactician',
    inviteeUid: invitee.uid,
    inviteeName: sanitizeDisplayName(invitee.displayName) || 'Arena Tactician',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'clanInvites', inviteId), payload);
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `clanInvites/${inviteId}`
    );
  }
}

export async function updateClanInviteStatus(
  inviteId: string,
  status: 'declined' | 'cancelled'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'clanInvites', inviteId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `clanInvites/${inviteId}`
    );
  }
}

export async function postClanMessage(
  clanId: string,
  authorUid: string,
  authorName: string,
  authorRole: ClanRole,
  kind: ClanMessageKind,
  rawBody: string,
  rawRoomCode = '',
  rawBadgeLabel = '',
  rawHighlightMeta = ''
): Promise<void> {
  const check = validateClanMessageDraft(
    rawBody,
    kind,
    authorRole,
    rawRoomCode,
    rawBadgeLabel,
    rawHighlightMeta
  );
  if (!check.ok) {
    throw new Error(check.error || 'Invalid message.');
  }

  const messageId = createClientId('cmsg');
  const cleanRoomCode = rawRoomCode
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
  const cleanBadgeLabel = rawBadgeLabel.trim().slice(0, 60);
  const cleanHighlightMeta = rawHighlightMeta.trim().slice(0, 120);

  const payload: ClanMessageDoc = {
    messageId,
    clanId,
    authorUid,
    authorName: sanitizeDisplayName(authorName) || 'Arena Tactician',
    authorRole,
    kind,
    body: rawBody.trim().slice(0, 280),
    roomCode: kind === 'challenge' ? cleanRoomCode : '',
    badgeLabel:
      kind === 'battle_result' || kind === 'achievement' ? cleanBadgeLabel : '',
    highlightMeta:
      kind === 'battle_result' || kind === 'achievement'
        ? cleanHighlightMeta
        : '',
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'clans', clanId, 'messages', messageId), payload);
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `clans/${clanId}/messages/${messageId}`
    );
  }
}

export async function deleteClanMessage(
  clanId: string,
  messageId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'clans', clanId, 'messages', messageId));
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.DELETE,
      `clans/${clanId}/messages/${messageId}`
    );
  }
}
