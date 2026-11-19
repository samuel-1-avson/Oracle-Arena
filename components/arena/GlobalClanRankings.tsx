'use client';

import React, { useMemo, useState } from 'react';
import {
  Award,
  Crown,
  Flame,
  Loader2,
  Lock,
  Search,
  Shield,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { TradableCardDoc } from '@/lib/game/economy';
import { PlayerProfileDoc } from '@/lib/game/multiplayer';
import {
  aggregateGlobalClanRankings,
  ClanDoc,
  ClanMembershipDoc,
  ClanRankingSortKey,
  GlobalClanRankingEntry,
  MAX_CLAN_MEMBERS,
} from '@/lib/game/social';
import { ELEMENT_STYLES } from './ui-meta';

interface GlobalClanRankingsProps {
  clans: ClanDoc[];
  players: PlayerProfileDoc[];
  membershipsByUid: Record<string, ClanMembershipDoc>;
  tradableCatalog: TradableCardDoc[];
  currentUserClanId: string | null;
  busyAction: string | null;
  onJoinOpenClan: (clan: ClanDoc) => void;
  onInspectPlayerUid: (uid: string) => void;
}

const SORT_OPTIONS: Array<{
  key: ClanRankingSortKey;
  label: string;
}> = [
  { key: 'composite', label: 'Overall Power' },
  { key: 'winRate', label: 'Win Rate %' },
  { key: 'activeXp', label: 'Active XP Total' },
  { key: 'avgRating', label: 'Avg ELO' },
];

function getRankBadgeStyle(rank: number): string {
  if (rank === 1) {
    return 'bg-[#D4AF37]/20 border-[#D4AF37]/70 text-[#F5DC8B]';
  }
  if (rank === 2) {
    return 'bg-slate-300/15 border-slate-300/50 text-slate-200';
  }
  if (rank === 3) {
    return 'bg-amber-700/20 border-amber-500/50 text-amber-300';
  }
  return 'bg-[#0B0E17] border-white/10 text-[#9CA3B8]';
}

export function GlobalClanRankings({
  clans,
  players,
  membershipsByUid,
  tradableCatalog,
  currentUserClanId,
  busyAction,
  onJoinOpenClan,
  onInspectPlayerUid,
}: GlobalClanRankingsProps) {
  const [sortBy, setSortBy] = useState<ClanRankingSortKey>('composite');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedClanId, setExpandedClanId] = useState<string | null>(null);

  const rankedClans = useMemo<GlobalClanRankingEntry[]>(
    () =>
      aggregateGlobalClanRankings({
        clans,
        players,
        membershipsByUid,
        tradableCatalog,
        sortBy,
      }),
    [clans, players, membershipsByUid, tradableCatalog, sortBy]
  );

  const filteredRankings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rankedClans;
    return rankedClans.filter(
      (entry) =>
        entry.clan.name.toLowerCase().includes(q) ||
        entry.clan.tag.toLowerCase().includes(q) ||
        entry.clan.emblem.toLowerCase().includes(q)
    );
  }, [rankedClans, searchQuery]);

  const totalArenaClanXp = useMemo(
    () => rankedClans.reduce((sum, r) => sum + r.activeXpTotal, 0),
    [rankedClans]
  );

  const totalTrackedMatches = useMemo(
    () => rankedClans.reduce((sum, r) => sum + r.totalMatches, 0),
    [rankedClans]
  );

  return (
    <section
      aria-label="Global Clan Rankings"
      className="rounded-lg bg-[#111521] border border-[#D4AF37]/30 overflow-hidden shadow-xl"
    >
      {/* Header Band */}
      <div className="p-5 sm:p-6 border-b border-white/10 bg-gradient-to-r from-[#161B2C] via-[#121624] to-[#111521] space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-[#D4AF37]">
              <Trophy className="w-3.5 h-3.5" />
              <span>Global Clan Rankings</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F5EFE0]">
              Live Guild Standings · Win Rates &amp; Active XP
            </h2>
            <p className="text-xs sm:text-sm text-[#9CA3B8] max-w-2xl">
              Aggregates every clan member&apos;s verified battle win rate and
              active XP (custom champion progression XP + active Arena battle
              XP) across Cloud Firestore in real time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
            <div className="px-3 py-2 rounded-md bg-[#0B0E17] border border-white/10">
              <p className="text-[10px] uppercase text-[#7C849B]">Active Clans</p>
              <p className="text-sm font-bold text-[#F5DC8B]">
                {rankedClans.length}
              </p>
            </div>
            <div className="px-3 py-2 rounded-md bg-[#0B0E17] border border-white/10">
              <p className="text-[10px] uppercase text-[#7C849B]">Clan Battles</p>
              <p className="text-sm font-bold text-sky-300">
                {totalTrackedMatches.toLocaleString()}
              </p>
            </div>
            <div className="px-3 py-2 rounded-md bg-[#0B0E17] border border-white/10">
              <p className="text-[10px] uppercase text-[#7C849B]">Global XP</p>
              <p className="text-sm font-bold text-violet-300">
                {totalArenaClanXp.toLocaleString()} XP
              </p>
            </div>
          </div>
        </div>

        {/* Controls Bar: Sort Mode + Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div
            role="group"
            aria-label="Sort Global Clan Rankings"
            className="flex flex-wrap items-center gap-1.5"
          >
            {SORT_OPTIONS.map((opt) => {
              const active = sortBy === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSortBy(opt.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#D4AF37] text-[#090B10] font-semibold'
                      : 'bg-[#0B0E17] text-[#B8C0D4] border border-white/10 hover:text-white hover:border-white/25'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-[#7C849B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter clan, tag, or element..."
              aria-label="Filter Global Clan Rankings"
              className="w-full rounded-md bg-[#090B10] border border-white/15 pl-8 pr-3 py-1.5 text-xs text-[#F5EFE0] placeholder:text-[#666E85] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        </div>
      </div>

      {/* Rankings Table / Cards */}
      {filteredRankings.length === 0 ? (
        <div className="p-10 text-center space-y-2">
          <Shield className="w-8 h-8 text-[#D4AF37]/50 mx-auto" />
          <p className="font-display text-base font-semibold text-[#F5EFE0]">
            {rankedClans.length === 0
              ? 'No Clans Forged Yet'
              : 'No Clans Match Your Filter'}
          </p>
          <p className="text-xs sm:text-sm text-[#9CA3B8] max-w-md mx-auto">
            {rankedClans.length === 0
              ? 'Be the first tactician to establish a clan in Clan HQ and claim #1 on the Global Clan Rankings.'
              : 'Try searching a different clan name, tag, or elemental emblem.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/8">
          {/* Desktop Column Labels */}
          <div className="hidden lg:grid lg:grid-cols-[56px_1.6fr_150px_170px_130px_130px] gap-4 px-5 py-2.5 bg-[#0C0F18] text-[11px] font-mono uppercase tracking-wider text-[#7C849B]">
            <span>Rank</span>
            <span>Clan &amp; Leadership</span>
            <span className="text-right">Win Rate</span>
            <span className="text-right">Active XP Total</span>
            <span className="text-right">Avg ELO</span>
            <span className="text-right">Action</span>
          </div>

          {filteredRankings.map((entry) => {
            const { clan } = entry;
            const elem = ELEMENT_STYLES[clan.emblem] ?? ELEMENT_STYLES.Solar;
            const isMyClan = currentUserClanId === clan.clanId;
            const isExpanded = expandedClanId === clan.clanId;
            const canJoin =
              !currentUserClanId &&
              clan.joinPolicy === 'open' &&
              clan.memberCount < MAX_CLAN_MEMBERS;

            return (
              <div
                key={clan.clanId}
                className={`transition-colors ${
                  isMyClan ? 'bg-[#191724]/80' : 'hover:bg-white/[0.02]'
                }`}
              >
                <div className="px-4 sm:px-5 py-4 grid grid-cols-1 lg:grid-cols-[56px_1.6fr_150px_170px_130px_130px] gap-4 items-center">
                  {/* Rank Badge */}
                  <div className="flex items-center gap-3 lg:block">
                    <span
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-md border font-mono text-sm font-bold tabular-nums ${getRankBadgeStyle(
                        entry.rank
                      )}`}
                    >
                      #{entry.rank}
                    </span>
                    <div className="lg:hidden min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded border ${elem.border} ${elem.subtleBg} ${elem.text}`}
                        >
                          [{clan.tag}]
                        </span>
                        <span className="font-display font-bold text-[#F5EFE0] truncate">
                          {clan.name}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Clan Identity */}
                  <div className="min-w-0 space-y-1">
                    <div className="hidden lg:flex items-center gap-2 flex-wrap">
                      <span
                        className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded border ${elem.border} ${elem.subtleBg} ${elem.text}`}
                      >
                        [{clan.tag}]
                      </span>
                      <span className="font-display font-bold text-[#F5EFE0] truncate">
                        {clan.name}
                      </span>
                      {isMyClan && (
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#D4AF37]/20 text-[#F5DC8B] border border-[#D4AF37]/40">
                          Your Clan
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#9CA3B8] truncate">
                      {clan.motto}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#7C849B] font-mono">
                      <span className="inline-flex items-center gap-1">
                        <Crown className="w-3 h-3 text-[#D4AF37]" />
                        {clan.leaderName}
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Users className="w-3 h-3 text-sky-300" />
                        {clan.memberCount}/{MAX_CLAN_MEMBERS}
                      </span>
                      <span className={elem.text}>{clan.emblem}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedClanId(isExpanded ? null : clan.clanId)
                        }
                        className="text-[#D4AF37] hover:underline cursor-pointer"
                      >
                        {isExpanded ? 'Hide Breakdown' : 'Member Breakdown'}
                      </button>
                    </div>
                  </div>

                  {/* Aggregated Member Win Rate */}
                  <div className="flex lg:flex-col items-center lg:items-end justify-between gap-1 font-mono tabular-nums">
                    <span className="lg:hidden text-[11px] text-[#7C849B] uppercase">
                      Win Rate
                    </span>
                    <div className="text-right">
                      <p
                        className={`text-sm font-bold ${
                          entry.totalMatches === 0
                            ? 'text-[#8F96AB]'
                            : entry.winRatePct >= 55
                              ? 'text-emerald-300'
                              : entry.winRatePct >= 45
                                ? 'text-[#F5DC8B]'
                                : 'text-rose-300'
                        }`}
                      >
                        {entry.totalMatches > 0
                          ? `${entry.winRatePct.toFixed(1)}%`
                          : '—'}
                      </p>
                      <p className="text-[11px] text-[#8F96AB]">
                        {entry.totalWins}W – {entry.totalLosses}L
                      </p>
                    </div>
                  </div>

                  {/* Aggregated Active XP Total */}
                  <div className="flex lg:flex-col items-center lg:items-end justify-between gap-1 font-mono tabular-nums">
                    <span className="lg:hidden text-[11px] text-[#7C849B] uppercase">
                      Active XP
                    </span>
                    <div className="text-right">
                      <p className="text-sm font-bold text-violet-300 inline-flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                        {entry.activeXpTotal.toLocaleString()} XP
                      </p>
                      <p className="text-[10px] text-[#8F96AB]">
                        {entry.championCardXpTotal.toLocaleString()} Card ·{' '}
                        {entry.battleRecordXpTotal.toLocaleString()} Battle
                      </p>
                    </div>
                  </div>

                  {/* Average Rating */}
                  <div className="flex lg:flex-col items-center lg:items-end justify-between gap-1 font-mono tabular-nums">
                    <span className="lg:hidden text-[11px] text-[#7C849B] uppercase">
                      Avg ELO
                    </span>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#F5DC8B]">
                        {entry.averageRating} ELO
                      </p>
                      <p className="text-[10px] text-[#8F96AB]">
                        Score {entry.compositeScore.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="flex justify-end">
                    {isMyClan ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-xs font-medium text-[#F5DC8B]">
                        <Award className="w-3.5 h-3.5" />
                        <span>Member</span>
                      </span>
                    ) : canJoin ? (
                      <button
                        type="button"
                        disabled={busyAction === `join-clan-${clan.clanId}`}
                        onClick={() => onJoinOpenClan(clan)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#D4AF37] text-[#090B10] text-xs font-semibold hover:bg-[#E5C454] transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {busyAction === `join-clan-${clan.clanId}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="w-3.5 h-3.5" />
                        )}
                        <span>Join Clan</span>
                      </button>
                    ) : clan.joinPolicy === 'invite_only' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#0B0E17] border border-white/10 text-[11px] text-[#8F96AB]">
                        <Lock className="w-3 h-3" />
                        <span>Invite Only</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-[#7C849B]">
                        {clan.memberCount >= MAX_CLAN_MEMBERS
                          ? 'Roster Full'
                          : 'In Another Clan'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expandable Top Contributors & XP Breakdown */}
                {isExpanded && (
                  <div className="px-4 sm:px-5 pb-4 pt-1">
                    <div className="rounded-md bg-[#0A0D16] border border-white/10 p-3.5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#9CA3B8]">
                        <span className="inline-flex items-center gap-1.5 text-[#F5EFE0] font-semibold">
                          <Flame className="w-3.5 h-3.5 text-amber-300" />
                          Top Active Contributors ({entry.trackedMembers} Members
                          Tracked)
                        </span>
                        <span>
                          Win Rate Bar: {entry.totalWins}W / {entry.totalMatches}{' '}
                          Matches
                        </span>
                      </div>

                      {/* Win rate progress meter */}
                      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#D4AF37] via-emerald-400 to-sky-400 transition-all"
                          style={{
                            width: `${Math.min(100, Math.max(2, entry.winRatePct))}%`,
                          }}
                        />
                      </div>

                      {entry.topContributors.length === 0 ? (
                        <p className="text-xs text-[#7C849B]">
                          Member battle stats appear as members complete matches.
                        </p>
                      ) : (
                        <div className="grid sm:grid-cols-3 gap-2.5 pt-1">
                          {entry.topContributors.map((member) => (
                            <button
                              key={member.uid}
                              type="button"
                              onClick={() => onInspectPlayerUid(member.uid)}
                              className="text-left rounded-md bg-[#111521] border border-white/10 hover:border-[#D4AF37]/45 p-2.5 transition-colors cursor-pointer space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-[#F5EFE0] truncate">
                                  {member.displayName}
                                </span>
                                <span className="text-[10px] font-mono uppercase text-[#D4AF37]">
                                  {member.role}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#9CA3B8]">
                                <span className="text-violet-300">
                                  {member.activeXp.toLocaleString()} XP
                                </span>
                                <span>
                                  {member.wins + member.losses > 0
                                    ? `${member.winRatePct.toFixed(0)}% WR`
                                    : `${member.rating} ELO`}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
