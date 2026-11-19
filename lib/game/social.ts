import { TradableCardDoc } from './economy';
import { PlayerProfileDoc } from './multiplayer';
import { LEVEL_XP_THRESHOLDS } from './progression';
import {
  CharacterDefinition,
  ElementAffinity,
  MatchSummaryRecord,
} from './types';

export type ClanRole = 'leader' | 'officer' | 'member';
export type ClanJoinPolicy = 'open' | 'invite_only';
export type FriendshipStatus = 'pending' | 'accepted' | 'declined';
export type ClanInviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type ClanMessageKind =
  | 'chat'
  | 'announcement'
  | 'challenge'
  | 'battle_result'
  | 'achievement';
export type ClanActivityFilter =
  | 'all'
  | 'battle_result'
  | 'achievement'
  | 'chat';

export const MAX_CLAN_MEMBERS = 30;

export const CLAN_EMBLEMS: readonly ElementAffinity[] = [
  'Solar',
  'Void',
  'Storm',
  'Aether',
  'Cyber',
  'Iron',
  'Ember',
  'Frost',
] as const;

export const ARENA_TITLES: readonly string[] = [
  'Founding Tactician',
  'Oracle Architect',
  'Rift Strategist',
  'Solar Vanguard',
  'Void Weaver',
  'Guild Marshal',
  'Grand Collector',
  'Arena Sovereign',
] as const;

export interface FriendshipDoc {
  friendshipId: string;
  requesterUid: string;
  requesterName: string;
  addresseeUid: string;
  addresseeName: string;
  status: FriendshipStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClanDoc {
  clanId: string;
  name: string;
  tag: string;
  motto: string;
  emblem: ElementAffinity;
  joinPolicy: ClanJoinPolicy;
  leaderUid: string;
  leaderName: string;
  memberCount: number;
  totalRating: number;
  lastEventMemberUid: string;
  lastEventRefId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClanMemberDoc {
  uid: string;
  clanId: string;
  displayName: string;
  title: string;
  rating: number;
  role: ClanRole;
  joinedAt?: unknown;
  updatedAt?: unknown;
}

export interface ClanMessageDoc {
  messageId: string;
  clanId: string;
  authorUid: string;
  authorName: string;
  authorRole: ClanRole;
  kind: ClanMessageKind;
  body: string;
  roomCode: string;
  badgeLabel?: string;
  highlightMeta?: string;
  createdAt?: unknown;
}

export interface ClanMembershipDoc {
  uid: string;
  clanId: string;
  clanName: string;
  clanTag: string;
  role: ClanRole;
  joinedAt?: unknown;
  updatedAt?: unknown;
}

export interface ClanInviteDoc {
  inviteId: string;
  clanId: string;
  clanName: string;
  clanTag: string;
  inviterUid: string;
  inviterName: string;
  inviteeUid: string;
  inviteeName: string;
  status: ClanInviteStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClanDraftInput {
  name: string;
  tag: string;
  motto: string;
  emblem: ElementAffinity;
  joinPolicy: ClanJoinPolicy;
}

export interface ValidationOutcome {
  ok: boolean;
  error?: string;
}

export type FriendRelationKind =
  | 'none'
  | 'friend'
  | 'incoming_pending'
  | 'outgoing_pending'
  | 'declined';

export interface FriendshipSummary {
  friends: FriendshipDoc[];
  incomingRequests: FriendshipDoc[];
  outgoingRequests: FriendshipDoc[];
  relationByUid: Record<
    string,
    { kind: FriendRelationKind; doc: FriendshipDoc }
  >;
}

/**
 * Deterministic sorted pair key preventing duplicate friendship documents
 * regardless of which player initiates the friend request.
 */
export function buildFriendshipId(uidA: string, uidB: string): string {
  const a = uidA.trim();
  const b = uidB.trim();
  if (!a || !b) {
    throw new Error('Both player UIDs are required to build a friendship ID.');
  }
  if (a === b) {
    throw new Error('A player cannot send a friend request to themselves.');
  }
  const [first, second] = a < b ? [a, b] : [b, a];
  return `fr-${first}_${second}`;
}

export function normalizeClanTag(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
}

export function sanitizeArenaTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 48);
}

export function sanitizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 40);
}

export function validateClanDraft(input: ClanDraftInput): ValidationOutcome {
  const name = input.name.trim();
  if (name.length < 3 || name.length > 32) {
    return {
      ok: false,
      error: 'Clan name must be between 3 and 32 characters.',
    };
  }

  const tag = normalizeClanTag(input.tag);
  if (!/^[A-Z0-9]{2,5}$/.test(tag)) {
    return {
      ok: false,
      error: 'Clan tag must be 2–5 uppercase letters or numbers.',
    };
  }

  const motto = input.motto.trim();
  if (motto.length < 4 || motto.length > 140) {
    return {
      ok: false,
      error: 'Clan motto must be between 4 and 140 characters.',
    };
  }

  if (!CLAN_EMBLEMS.includes(input.emblem)) {
    return { ok: false, error: 'Select a valid elemental emblem.' };
  }

  if (input.joinPolicy !== 'open' && input.joinPolicy !== 'invite_only') {
    return { ok: false, error: 'Select a valid recruitment policy.' };
  }

  return { ok: true };
}

export function canManageClanRole(
  actorRole: ClanRole,
  targetRole: ClanRole
): boolean {
  return actorRole === 'leader' && targetRole !== 'leader';
}

export function canSendClanInvite(role: ClanRole): boolean {
  return role === 'leader' || role === 'officer';
}

export function canPostClanAnnouncement(role: ClanRole): boolean {
  return role === 'leader' || role === 'officer';
}

export function validateClanMessageDraft(
  rawBody: string,
  kind: ClanMessageKind,
  actorRole: ClanRole,
  rawRoomCode = '',
  rawBadgeLabel = '',
  rawHighlightMeta = ''
): ValidationOutcome {
  const body = rawBody.trim();
  if (body.length < 1 || body.length > 280) {
    return {
      ok: false,
      error: 'Message must be between 1 and 280 characters.',
    };
  }

  if (kind === 'announcement' && !canPostClanAnnouncement(actorRole)) {
    return {
      ok: false,
      error: 'Only clan Leaders and Officers can post Warroom announcements.',
    };
  }

  const roomCode = rawRoomCode
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);

  if (kind === 'challenge') {
    if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
      return {
        ok: false,
        error: 'Spar challenges require a valid 6-character PvP room code.',
      };
    }
  } else if (roomCode.length > 0) {
    return {
      ok: false,
      error: 'Room code is only valid for PvP spar challenge callouts.',
    };
  }

  const badgeLabel = rawBadgeLabel.trim();
  const highlightMeta = rawHighlightMeta.trim();
  if (badgeLabel.length > 60) {
    return {
      ok: false,
      error: 'Activity badge label cannot exceed 60 characters.',
    };
  }
  if (highlightMeta.length > 120) {
    return {
      ok: false,
      error: 'Activity highlight metadata cannot exceed 120 characters.',
    };
  }
  if (
    (kind === 'battle_result' || kind === 'achievement') &&
    badgeLabel.length < 2
  ) {
    return {
      ok: false,
      error: 'Shared battle results and achievements require a summary badge.',
    };
  }

  return { ok: true };
}

export function computeClanAverageRating(
  totalRating: number,
  memberCount: number
): number {
  if (memberCount <= 0) return 0;
  return Math.round(Math.max(0, totalRating) / memberCount);
}

const ROLE_PRIORITY: Record<ClanRole, number> = {
  leader: 0,
  officer: 1,
  member: 2,
};

export function sortClanMembersByRole(
  members: ClanMemberDoc[]
): ClanMemberDoc[] {
  return [...members].sort((a, b) => {
    const roleDiff = ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role];
    if (roleDiff !== 0) return roleDiff;
    if (b.rating !== a.rating) return b.rating - a.rating;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function summarizeFriendships(
  friendships: FriendshipDoc[],
  currentUid: string
): FriendshipSummary {
  const friends: FriendshipDoc[] = [];
  const incomingRequests: FriendshipDoc[] = [];
  const outgoingRequests: FriendshipDoc[] = [];
  const relationByUid: FriendshipSummary['relationByUid'] = {};

  for (const doc of friendships) {
    const isRequester = doc.requesterUid === currentUid;
    const isAddressee = doc.addresseeUid === currentUid;
    if (!isRequester && !isAddressee) continue;

    const otherUid = isRequester ? doc.addresseeUid : doc.requesterUid;

    if (doc.status === 'accepted') {
      friends.push(doc);
      relationByUid[otherUid] = { kind: 'friend', doc };
    } else if (doc.status === 'pending') {
      if (isAddressee) {
        incomingRequests.push(doc);
        relationByUid[otherUid] = { kind: 'incoming_pending', doc };
      } else {
        outgoingRequests.push(doc);
        relationByUid[otherUid] = { kind: 'outgoing_pending', doc };
      }
    } else if (doc.status === 'declined') {
      relationByUid[otherUid] = { kind: 'declined', doc };
    }
  }

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    relationByUid,
  };
}

// =============================================================================
// Global Clan Rankings Aggregation (Win Rates & Active XP Totals)
// =============================================================================

export type ClanRankingSortKey = 'composite' | 'winRate' | 'activeXp' | 'avgRating';

export interface ClanMemberContribution {
  uid: string;
  displayName: string;
  role: ClanRole;
  rating: number;
  wins: number;
  losses: number;
  winRatePct: number;
  championCardXp: number;
  battleRecordXp: number;
  activeXp: number;
}

export interface GlobalClanRankingEntry {
  rank: number;
  clan: ClanDoc;
  trackedMembers: number;
  totalWins: number;
  totalLosses: number;
  totalMatches: number;
  winRatePct: number;
  championCardXpTotal: number;
  battleRecordXpTotal: number;
  activeXpTotal: number;
  averageRating: number;
  compositeScore: number;
  topContributors: ClanMemberContribution[];
}

export const MATCH_WIN_XP_WEIGHT = 120;
export const MATCH_LOSS_XP_WEIGHT = 55;

export function computeMemberActiveXp(
  player: Pick<PlayerProfileDoc, 'wins' | 'losses'> | undefined,
  ownedCards: Pick<TradableCardDoc, 'level' | 'cardData'>[]
): { championCardXp: number; battleRecordXp: number; activeXp: number } {
  let championCardXp = 0;
  for (const card of ownedCards) {
    const rawXp =
      card.cardData && typeof card.cardData.xp === 'number'
        ? Math.max(0, Math.round(card.cardData.xp))
        : 0;
    const levelFloor =
      LEVEL_XP_THRESHOLDS[
        Math.max(0, Math.min(LEVEL_XP_THRESHOLDS.length - 1, (card.level || 1) - 1))
      ] ?? 0;
    championCardXp += Math.max(rawXp, levelFloor);
  }

  const wins = Math.max(0, player?.wins ?? 0);
  const losses = Math.max(0, player?.losses ?? 0);
  const battleRecordXp = wins * MATCH_WIN_XP_WEIGHT + losses * MATCH_LOSS_XP_WEIGHT;

  return {
    championCardXp,
    battleRecordXp,
    activeXp: championCardXp + battleRecordXp,
  };
}

export function aggregateGlobalClanRankings(params: {
  clans: ClanDoc[];
  players: PlayerProfileDoc[];
  membershipsByUid: Record<string, ClanMembershipDoc>;
  tradableCatalog: TradableCardDoc[];
  sortBy?: ClanRankingSortKey;
}): GlobalClanRankingEntry[] {
  const {
    clans,
    players,
    membershipsByUid,
    tradableCatalog,
    sortBy = 'composite',
  } = params;

  const playerByUid = new Map<string, PlayerProfileDoc>();
  for (const p of players) {
    playerByUid.set(p.uid, p);
  }

  const cardsByOwnerUid = new Map<string, TradableCardDoc[]>();
  for (const card of tradableCatalog) {
    const existing = cardsByOwnerUid.get(card.ownerId);
    if (existing) {
      existing.push(card);
    } else {
      cardsByOwnerUid.set(card.ownerId, [card]);
    }
  }

  const memberRecordsByClan = new Map<string, ClanMembershipDoc[]>();
  for (const m of Object.values(membershipsByUid)) {
    const existing = memberRecordsByClan.get(m.clanId);
    if (existing) {
      existing.push(m);
    } else {
      memberRecordsByClan.set(m.clanId, [m]);
    }
  }

  const entries: Omit<GlobalClanRankingEntry, 'rank'>[] = clans.map((clan) => {
    const rawMembers = memberRecordsByClan.get(clan.clanId) ?? [];
    const seenUids = new Set<string>();
    const memberEntries: Array<{ uid: string; role: ClanRole }> = [];

    for (const m of rawMembers) {
      if (!seenUids.has(m.uid)) {
        seenUids.add(m.uid);
        memberEntries.push({ uid: m.uid, role: m.role });
      }
    }

    // Guarantee clan leader is counted even if membership list hasn't synced yet
    if (clan.leaderUid && !seenUids.has(clan.leaderUid)) {
      seenUids.add(clan.leaderUid);
      memberEntries.push({ uid: clan.leaderUid, role: 'leader' });
    }

    let totalWins = 0;
    let totalLosses = 0;
    let championCardXpTotal = 0;
    let battleRecordXpTotal = 0;
    const contributors: ClanMemberContribution[] = [];

    for (const { uid, role } of memberEntries) {
      const profile = playerByUid.get(uid);
      const ownedCards = cardsByOwnerUid.get(uid) ?? [];
      const wins = Math.max(0, profile?.wins ?? 0);
      const losses = Math.max(0, profile?.losses ?? 0);
      const matches = wins + losses;
      const winRatePct =
        matches > 0 ? Math.round((wins / matches) * 1000) / 10 : 0;

      const xp = computeMemberActiveXp(profile, ownedCards);

      totalWins += wins;
      totalLosses += losses;
      championCardXpTotal += xp.championCardXp;
      battleRecordXpTotal += xp.battleRecordXp;

      contributors.push({
        uid,
        displayName:
          profile?.displayName ||
          (uid === clan.leaderUid ? clan.leaderName : 'Arena Tactician'),
        role,
        rating: profile?.rating ?? 1000,
        wins,
        losses,
        winRatePct,
        championCardXp: xp.championCardXp,
        battleRecordXp: xp.battleRecordXp,
        activeXp: xp.activeXp,
      });
    }

    const totalMatches = totalWins + totalLosses;
    const winRatePct =
      totalMatches > 0 ? Math.round((totalWins / totalMatches) * 1000) / 10 : 0;
    const activeXpTotal = championCardXpTotal + battleRecordXpTotal;
    const averageRating = computeClanAverageRating(
      clan.totalRating,
      clan.memberCount
    );
    const compositeScore = Math.round(
      averageRating + winRatePct * 8 + Math.min(2500, activeXpTotal / 20)
    );

    const topContributors = contributors
      .sort((a, b) => {
        if (b.activeXp !== a.activeXp) return b.activeXp - a.activeXp;
        if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
        return b.rating - a.rating;
      })
      .slice(0, 3);

    return {
      clan,
      trackedMembers: Math.max(clan.memberCount, memberEntries.length),
      totalWins,
      totalLosses,
      totalMatches,
      winRatePct,
      championCardXpTotal,
      battleRecordXpTotal,
      activeXpTotal,
      averageRating,
      compositeScore,
      topContributors,
    };
  });

  entries.sort((a, b) => {
    if (sortBy === 'winRate') {
      if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
      if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
      return b.activeXpTotal - a.activeXpTotal;
    }
    if (sortBy === 'activeXp') {
      if (b.activeXpTotal !== a.activeXpTotal) {
        return b.activeXpTotal - a.activeXpTotal;
      }
      if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
      return b.averageRating - a.averageRating;
    }
    if (sortBy === 'avgRating') {
      if (b.averageRating !== a.averageRating) {
        return b.averageRating - a.averageRating;
      }
      return b.activeXpTotal - a.activeXpTotal;
    }
    // default 'composite'
    if (b.compositeScore !== a.compositeScore) {
      return b.compositeScore - a.compositeScore;
    }
    if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
    return b.activeXpTotal - a.activeXpTotal;
  });

  return entries.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));
}

// =============================================================================
// Clan Activity Feed: Shared Battle Results & Earned Achievements
// =============================================================================

export interface PlayerAchievement {
  id: string;
  title: string;
  tier: 'gold' | 'violet' | 'emerald' | 'sky';
  summaryMeta: string;
  defaultNote: string;
}

export interface FormattedActivityShare {
  kind: 'battle_result' | 'achievement';
  badgeLabel: string;
  highlightMeta: string;
  body: string;
}

/**
 * Derives real, earned Arena achievements strictly from verified player state
 * (profile combat record, forged custom champions, champion levels/evolutions,
 * recent match outcomes, and clan leadership/membership).
 */
export function derivePlayerAchievements(params: {
  profile: Pick<
    PlayerProfileDoc,
    'rating' | 'wins' | 'losses' | 'matchesPlayed' | 'customCardCount'
  > | null;
  characters: CharacterDefinition[];
  recentMatches: MatchSummaryRecord[];
  clanMembership: ClanMembershipDoc | null;
}): PlayerAchievement[] {
  const { profile, characters, recentMatches, clanMembership } = params;
  const earned: PlayerAchievement[] = [];

  const wins = Math.max(
    profile?.wins ?? 0,
    recentMatches.filter((m) => m.winner === 'player').length
  );
  const matchesPlayed = Math.max(
    profile?.matchesPlayed ?? 0,
    recentMatches.length
  );
  const rating = profile?.rating ?? 1000;

  const customCards = characters.filter((c) => c.id.startsWith('chr-custom-'));
  const customCount = Math.max(
    profile?.customCardCount ?? 0,
    customCards.length
  );

  const highestChampion = [...characters].sort((a, b) => {
    if (b.evolutionStage !== a.evolutionStage) {
      return b.evolutionStage - a.evolutionStage;
    }
    if (b.level !== a.level) return b.level - a.level;
    return b.xp - a.xp;
  })[0];

  const cleanSweepMatch = recentMatches.find(
    (m) => m.winner === 'player' && m.playerSurvivors >= 4
  );

  if (wins >= 1) {
    const winRate =
      matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 100;
    earned.push({
      id: 'ach-arena-victor',
      title: wins >= 5 ? 'Seasoned Arena Victor' : 'First Arena Victory',
      tier: 'emerald',
      summaryMeta: `${wins} Wins · ${winRate}% Win Rate · ${rating} ELO`,
      defaultNote: `Logged ${wins} Arena ${wins === 1 ? 'victory' : 'victories'} (${winRate}% win rate) and climbed to ${rating} ELO!`,
    });
  }

  if (cleanSweepMatch) {
    earned.push({
      id: 'ach-tactical-dominance',
      title: 'Tactical Dominance',
      tier: 'gold',
      summaryMeta: `${cleanSweepMatch.playerSurvivors}/5 Standing · ${cleanSweepMatch.turns} Turns`,
      defaultNote: `Secured a dominant 5v5 victory with ${cleanSweepMatch.playerSurvivors}/5 champions still standing in ${cleanSweepMatch.turns} turns!`,
    });
  }

  if (customCount >= 1) {
    const showcase = customCards[0];
    earned.push({
      id: 'ach-oracle-architect',
      title: customCount >= 3 ? 'Master Oracle Architect' : 'Oracle Architect',
      tier: 'violet',
      summaryMeta: showcase
        ? `${customCount} Custom · Featured: ${showcase.name}`
        : `${customCount} Custom Champions Forged`,
      defaultNote: showcase
        ? `Forged ${customCount} custom ${customCount === 1 ? 'champion' : 'champions'} in Oracle Studio — spotlighting ${showcase.name} (${showcase.role})!`
        : `Forged ${customCount} original champions in Oracle Studio!`,
    });
  }

  if (
    highestChampion &&
    (highestChampion.level >= 2 || highestChampion.evolutionStage >= 1)
  ) {
    const stageLabel =
      highestChampion.evolutionStage >= 2
        ? 'Mythic Ascended'
        : highestChampion.evolutionStage === 1
          ? 'Evolved Stage I'
          : `Level ${highestChampion.level}`;
    earned.push({
      id: 'ach-champion-ascension',
      title:
        highestChampion.evolutionStage >= 1
          ? 'Champion Evolution'
          : 'Rising Champion',
      tier: 'gold',
      summaryMeta: `${highestChampion.name} · Lv.${highestChampion.level} · ${stageLabel}`,
      defaultNote: `Upgraded ${highestChampion.name} to Level ${highestChampion.level} (${stageLabel}) in the Evolution Chamber!`,
    });
  }

  if (rating >= 1050) {
    earned.push({
      id: 'ach-ranked-climber',
      title: rating >= 1200 ? 'Grandmaster Tactician' : 'Ranked Ascendant',
      tier: 'sky',
      summaryMeta: `${rating} ELO · ${matchesPlayed} Matches Played`,
      defaultNote: `Crossed ${rating} ELO across ${matchesPlayed} tactical 5v5 battles!`,
    });
  }

  if (clanMembership) {
    earned.push({
      id: 'ach-clan-vanguard',
      title:
        clanMembership.role === 'leader'
          ? 'Clan Founder'
          : clanMembership.role === 'officer'
            ? 'Clan War Officer'
            : 'Clan Vanguard',
      tier: 'sky',
      summaryMeta: `[${clanMembership.clanTag}] ${clanMembership.clanName} · ${clanMembership.role.toUpperCase()}`,
      defaultNote:
        clanMembership.role === 'leader'
          ? `Leading [${clanMembership.clanTag}] ${clanMembership.clanName} onto the Global Clan Rankings!`
          : `Standing ready with [${clanMembership.clanTag}] ${clanMembership.clanName} for 5v5 Arena warfare!`,
    });
  }

  return earned;
}

export function formatBattleResultShare(
  match: MatchSummaryRecord,
  customNote = ''
): FormattedActivityShare {
  const isVictory = match.winner === 'player';
  const badgeLabel = `${isVictory ? 'VICTORY' : 'DEFEAT'} · ${match.rounds}R / ${match.turns}T`.slice(
    0,
    60
  );
  const highlightMeta =
    `${match.playerSurvivors}/5 Allies Standing · ${match.enemySurvivors}/5 Foes Left · Seed #${match.seed}`.slice(
      0,
      120
    );
  const fallbackBody = isVictory
    ? `Claimed a 5v5 Arena victory in ${match.turns} turns with ${match.playerSurvivors}/5 champions standing!`
    : `Fought a hard-fought ${match.turns}-turn 5v5 battle (${match.rounds} rounds) — gearing up for the rematch!`;
  const body = (customNote.trim() || fallbackBody).slice(0, 280);

  return {
    kind: 'battle_result',
    badgeLabel,
    highlightMeta,
    body,
  };
}

export function formatAchievementShare(
  achievement: PlayerAchievement,
  customNote = ''
): FormattedActivityShare {
  return {
    kind: 'achievement',
    badgeLabel: achievement.title.trim().slice(0, 60),
    highlightMeta: achievement.summaryMeta.trim().slice(0, 120),
    body: (customNote.trim() || achievement.defaultNote).slice(0, 280),
  };
}

export function filterClanActivityFeed(
  messages: ClanMessageDoc[],
  filter: ClanActivityFilter
): ClanMessageDoc[] {
  if (filter === 'all') return messages;
  if (filter === 'battle_result') {
    return messages.filter((m) => m.kind === 'battle_result');
  }
  if (filter === 'achievement') {
    return messages.filter((m) => m.kind === 'achievement');
  }
  return messages.filter(
    (m) =>
      m.kind === 'chat' || m.kind === 'announcement' || m.kind === 'challenge'
  );
}

// =============================================================================
// Player Leaderboard Aggregation (ELO Rating & Total Match Wins)
// =============================================================================

export type PlayerLeaderboardSortKey = 'elo' | 'wins' | 'winRate' | 'activeXp';

export type CompetitiveTierId =
  | 'sovereign'
  | 'grandmaster'
  | 'vanguard'
  | 'tactician'
  | 'challenger';

export interface CompetitiveTier {
  id: CompetitiveTierId;
  label: string;
  minRating: number;
  accent: 'gold' | 'violet' | 'sky' | 'emerald' | 'slate';
}

export const COMPETITIVE_TIERS: readonly CompetitiveTier[] = [
  {
    id: 'sovereign',
    label: 'Oracle Sovereign',
    minRating: 1400,
    accent: 'gold',
  },
  {
    id: 'grandmaster',
    label: 'Astral Grandmaster',
    minRating: 1250,
    accent: 'violet',
  },
  {
    id: 'vanguard',
    label: 'Vanguard Elite',
    minRating: 1125,
    accent: 'sky',
  },
  {
    id: 'tactician',
    label: 'Arena Tactician',
    minRating: 1025,
    accent: 'emerald',
  },
  {
    id: 'challenger',
    label: 'Challenger',
    minRating: 0,
    accent: 'slate',
  },
] as const;

export function getCompetitiveTier(rating: number): CompetitiveTier {
  const safeRating = Math.max(0, Math.round(rating || 0));
  for (const tier of COMPETITIVE_TIERS) {
    if (safeRating >= tier.minRating) return tier;
  }
  return COMPETITIVE_TIERS[COMPETITIVE_TIERS.length - 1];
}

export interface PlayerLeaderboardEntry {
  rank: number;
  player: PlayerProfileDoc;
  tier: CompetitiveTier;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winRatePct: number;
  activeXp: number;
  customCardCount: number;
  clanTag: string | null;
  clanName: string | null;
  clanRole: ClanRole | null;
}

export function aggregatePlayerLeaderboard(params: {
  players: PlayerProfileDoc[];
  membershipsByUid: Record<string, ClanMembershipDoc>;
  tradableCatalog: TradableCardDoc[];
  sortBy?: PlayerLeaderboardSortKey;
  search?: string;
  tierFilter?: CompetitiveTierId | 'all';
}): PlayerLeaderboardEntry[] {
  const {
    players,
    membershipsByUid,
    tradableCatalog,
    sortBy = 'elo',
    search = '',
    tierFilter = 'all',
  } = params;

  const cardsByOwner = new Map<string, TradableCardDoc[]>();
  for (const card of tradableCatalog) {
    const bucket = cardsByOwner.get(card.ownerId);
    if (bucket) {
      bucket.push(card);
    } else {
      cardsByOwner.set(card.ownerId, [card]);
    }
  }

  const baseEntries: Omit<PlayerLeaderboardEntry, 'rank'>[] = players.map(
    (player) => {
      const rating = Math.max(0, Math.round(player.rating ?? 1000));
      const wins = Math.max(0, Math.round(player.wins ?? 0));
      const losses = Math.max(0, Math.round(player.losses ?? 0));
      const matchesPlayed = Math.max(
        wins + losses,
        Math.round(player.matchesPlayed ?? 0)
      );
      const winRatePct =
        wins + losses > 0
          ? Math.round((wins / (wins + losses)) * 1000) / 10
          : 0;
      const ownedCards = cardsByOwner.get(player.uid) ?? [];
      const xp = computeMemberActiveXp(player, ownedCards);
      const membership = membershipsByUid[player.uid];

      return {
        player,
        tier: getCompetitiveTier(rating),
        rating,
        wins,
        losses,
        matchesPlayed,
        winRatePct,
        activeXp: xp.activeXp,
        customCardCount: Math.max(
          player.customCardCount ?? 0,
          ownedCards.length
        ),
        clanTag: membership?.clanTag ?? null,
        clanName: membership?.clanName ?? null,
        clanRole: membership?.role ?? null,
      };
    }
  );

  baseEntries.sort((a, b) => {
    if (sortBy === 'wins') {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
      return a.player.displayName.localeCompare(b.player.displayName);
    }
    if (sortBy === 'winRate') {
      const aHasMatches = a.matchesPlayed > 0 ? 1 : 0;
      const bHasMatches = b.matchesPlayed > 0 ? 1 : 0;
      if (bHasMatches !== aHasMatches) return bHasMatches - aHasMatches;
      if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.player.displayName.localeCompare(b.player.displayName);
    }
    if (sortBy === 'activeXp') {
      if (b.activeXp !== a.activeXp) return b.activeXp - a.activeXp;
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.player.displayName.localeCompare(b.player.displayName);
    }
    // default 'elo'
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
    return a.player.displayName.localeCompare(b.player.displayName);
  });

  // Assign canonical global ranks BEFORE search/tier filtering
  const ranked: PlayerLeaderboardEntry[] = baseEntries.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));

  const q = search.trim().toLowerCase();
  return ranked.filter((entry) => {
    if (tierFilter !== 'all' && entry.tier.id !== tierFilter) {
      return false;
    }
    if (!q) return true;
    return (
      entry.player.displayName.toLowerCase().includes(q) ||
      (entry.player.title || '').toLowerCase().includes(q) ||
      (entry.clanTag || '').toLowerCase().includes(q) ||
      (entry.clanName || '').toLowerCase().includes(q)
    );
  });
}

