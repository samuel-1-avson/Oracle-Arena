'use client';

import React, { useMemo, useState } from 'react';
import {
  Award,
  Crown,
  Flame,
  Search,
  Shield,
  Sparkles,
  Swords,
  TrendingUp,
  Trophy,
  User,
} from 'lucide-react';
import { TradableCardDoc } from '@/lib/game/economy';
import { PlayerProfileDoc } from '@/lib/game/multiplayer';
import {
  aggregatePlayerLeaderboard,
  ClanMembershipDoc,
  COMPETITIVE_TIERS,
  CompetitiveTier,
  CompetitiveTierId,
  PlayerLeaderboardSortKey,
} from '@/lib/game/social';

interface PlayerLeaderboardProps {
  players: PlayerProfileDoc[];
  membershipsByUid: Record<string, ClanMembershipDoc>;
  tradableCatalog: TradableCardDoc[];
  currentUserUid: string;
  onInspectPlayerUid: (uid: string) => void;
  onOpenMultiplayer: () => void;
}

function tierBadgeClass(accent: CompetitiveTier['accent']): string {
  switch (accent) {
    case 'gold':
      return 'bg-[#D4AF37]/20 border-[#D4AF37]/55 text-[#F5DC8B]';
    case 'violet':
      return 'bg-violet-500/20 border-violet-400/50 text-violet-200';
    case 'sky':
      return 'bg-sky-500/15 border-sky-400/45 text-sky-200';
    case 'emerald':
      return 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200';
    default:
      return 'bg-white/5 border-white/15 text-[#B4BACD]';
  }
}

export function PlayerLeaderboard({
  players,
  membershipsByUid,
  tradableCatalog,
  currentUserUid,
  onInspectPlayerUid,
  onOpenMultiplayer,
}: PlayerLeaderboardProps) {
  const [sortBy, setSortBy] = useState<PlayerLeaderboardSortKey>('elo');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<CompetitiveTierId | 'all'>('all');

  const fullStandings = useMemo(
    () =>
      aggregatePlayerLeaderboard({
        players,
        membershipsByUid,
        tradableCatalog,
        sortBy,
      }),
    [players, membershipsByUid, tradableCatalog, sortBy]
  );

  const visibleStandings = useMemo(
    () =>
      aggregatePlayerLeaderboard({
        players,
        membershipsByUid,
        tradableCatalog,
        sortBy,
        search,
        tierFilter,
      }),
    [players, membershipsByUid, tradableCatalog, sortBy, search, tierFilter]
  );

  const myStanding = useMemo(
    () => fullStandings.find((e) => e.player.uid === currentUserUid) ?? null,
    [fullStandings, currentUserUid]
  );

  const podium = useMemo(() => fullStandings.slice(0, 3), [fullStandings]);

  const communityTotals = useMemo(() => {
    let totalWins = 0;
    let totalMatches = 0;
    let peakElo = 0;
    for (const entry of fullStandings) {
      totalWins += entry.wins;
      totalMatches += entry.matchesPlayed;
      if (entry.rating > peakElo) peakElo = entry.rating;
    }
    return {
      totalPlayers: fullStandings.length,
      totalWins,
      totalMatches,
      peakElo,
    };
  }, [fullStandings]);

  const showPodium =
    podium.length > 0 && search.trim() === '' && tierFilter === 'all';

  return (
    <div className="space-y-6">
      {/* Header + Personal Standing Strip */}
      <section className="rounded-lg bg-[#111521] border border-[#D4AF37]/30 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#D4AF37]">
              Competitive Arena Ladder
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F5EFE0]">
              Global Player Leaderboard
            </h2>
            <p className="text-xs sm:text-sm text-[#9CA3B8] max-w-2xl">
              Live rankings of Oracle Arena tacticians ordered by ELO Rating and
              Total Match Wins. Inspect any rival&apos;s 5-champion squad or
              challenge the ladder in ranked 5v5 PvP.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenMultiplayer}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-[#D4AF37] text-[#090B10] text-xs sm:text-sm font-semibold hover:bg-[#E5C454] transition-colors cursor-pointer shrink-0"
          >
            <Swords className="w-4 h-4" />
            <span>Climb in Ranked PvP</span>
          </button>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
          <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-[#7C849B]">
              Ranked Tacticians
            </p>
            <p className="text-lg font-bold text-[#F5EFE0] tabular-nums">
              {communityTotals.totalPlayers.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-[#7C849B]">
              Peak Arena ELO
            </p>
            <p className="text-lg font-bold text-[#F5DC8B] tabular-nums">
              {communityTotals.peakElo > 0
                ? `${communityTotals.peakElo.toLocaleString()} ELO`
                : '—'}
            </p>
          </div>
          <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-[#7C849B]">
              Community Match Wins
            </p>
            <p className="text-lg font-bold text-emerald-300 tabular-nums">
              {communityTotals.totalWins.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md bg-[#0B0E17] border border-[#D4AF37]/30 p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-[#D4AF37]">
              Your Current Rank
            </p>
            {myStanding ? (
              <div className="flex items-baseline gap-2">
                <p className="text-lg font-bold text-[#F5DC8B] tabular-nums">
                  #{myStanding.rank}
                </p>
                <span className="text-[11px] text-[#9CA3B8]">
                  {myStanding.rating} ELO · {myStanding.wins}W
                </span>
              </div>
            ) : (
              <p className="text-sm font-semibold text-[#9CA3B8]">Unranked</p>
            )}
          </div>
        </div>
      </section>

      {/* Top 3 Podium Spotlight */}
      {showPodium && (
        <section
          aria-label="Top 3 Ranked Tacticians"
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {podium.map((entry) => {
            const isFirst = entry.rank === 1;
            const isSecond = entry.rank === 2;
            const isSelf = entry.player.uid === currentUserUid;
            const borderStyle = isFirst
              ? 'border-[#D4AF37]/65 bg-gradient-to-b from-[#1D1910] to-[#111521]'
              : isSecond
                ? 'border-slate-300/40 bg-gradient-to-b from-[#161B29] to-[#111521]'
                : 'border-amber-700/50 bg-gradient-to-b from-[#1B1410] to-[#111521]';

            return (
              <button
                key={entry.player.uid}
                type="button"
                onClick={() => onInspectPlayerUid(entry.player.uid)}
                className={`text-left rounded-lg border p-5 space-y-3.5 transition-all hover:scale-[1.01] cursor-pointer ${borderStyle}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-xs font-bold ${
                      isFirst
                        ? 'bg-[#D4AF37] text-[#090B10]'
                        : isSecond
                          ? 'bg-slate-200 text-[#090B10]'
                          : 'bg-amber-600 text-[#090B10]'
                    }`}
                  >
                    {isFirst ? (
                      <Crown className="w-3.5 h-3.5" />
                    ) : (
                      <Trophy className="w-3.5 h-3.5" />
                    )}
                    <span>RANK #{entry.rank}</span>
                  </span>

                  <span
                    className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${tierBadgeClass(
                      entry.tier.accent
                    )}`}
                  >
                    {entry.tier.label}
                  </span>
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display text-lg font-bold text-[#F5EFE0] truncate">
                      {entry.player.displayName}
                    </h3>
                    {entry.clanTag && (
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-400/40 text-violet-200">
                        [{entry.clanTag}]
                      </span>
                    )}
                    {isSelf && (
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#9CA3B8] truncate">
                    {entry.player.title || 'Arena Tactician'}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 font-mono">
                  <div>
                    <p className="text-[10px] uppercase text-[#7C849B]">ELO</p>
                    <p className="text-sm font-bold text-[#F5DC8B] tabular-nums">
                      {entry.rating}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-[#7C849B]">Wins</p>
                    <p className="text-sm font-bold text-emerald-300 tabular-nums">
                      {entry.wins}W
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-[#7C849B]">
                      Win %
                    </p>
                    <p className="text-sm font-bold text-sky-300 tabular-nums">
                      {entry.matchesPlayed > 0
                        ? `${entry.winRatePct.toFixed(1)}%`
                        : '—'}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* Controls: Sort Tabs + Tier Filter + Search */}
      <section className="rounded-lg bg-[#111521] border border-white/10 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Sort leaderboard"
            className="flex flex-wrap items-center gap-1.5"
          >
            {(
              [
                {
                  id: 'elo',
                  label: 'ELO Rating',
                  icon: TrendingUp,
                },
                {
                  id: 'wins',
                  label: 'Total Wins',
                  icon: Trophy,
                },
                {
                  id: 'winRate',
                  label: 'Win Rate %',
                  icon: Flame,
                },
                {
                  id: 'activeXp',
                  label: 'Active XP',
                  icon: Sparkles,
                },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = sortBy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSortBy(opt.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#D4AF37] text-[#090B10]'
                      : 'bg-[#0B0E17] border border-white/10 text-[#C4C9D8] hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              aria-label="Filter by competitive tier"
              value={tierFilter}
              onChange={(e) =>
                setTierFilter(e.target.value as CompetitiveTierId | 'all')
              }
              className="rounded-md bg-[#090B10] border border-white/15 px-3 py-2 text-xs text-[#F5EFE0] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="all">All Tiers</option>
              {COMPETITIVE_TIERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.minRating}+ ELO)
                </option>
              ))}
            </select>

            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-[#7C849B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search player or [TAG]..."
                aria-label="Search leaderboard players"
                className="w-full rounded-md bg-[#090B10] border border-white/15 pl-8 pr-3 py-2 text-xs text-[#F5EFE0] placeholder:text-[#666E85] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>
        </div>

        {/* Standings List */}
        {visibleStandings.length === 0 ? (
          <div className="rounded-md bg-[#0B0E17] border border-dashed border-white/10 p-10 text-center space-y-2">
            <Award className="w-7 h-7 text-[#D4AF37]/60 mx-auto" />
            <p className="text-sm font-medium text-[#C4C9D8]">
              No ranked tacticians match your current filter.
            </p>
            <p className="text-xs text-[#8F96AB]">
              Clear your search or tier filter to view all registered Oracle
              Arena competitors.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-wider text-[#7C849B]">
                  <th className="py-2.5 pl-3 pr-2 w-16">Rank</th>
                  <th className="py-2.5 px-2">Tactician</th>
                  <th className="py-2.5 px-2">Tier</th>
                  <th className="py-2.5 px-2 text-right">ELO Rating</th>
                  <th className="py-2.5 px-2 text-right">Total Wins</th>
                  <th className="py-2.5 px-2 hidden md:table-cell">Win Rate</th>
                  <th className="py-2.5 px-2 text-right hidden lg:table-cell">
                    Active XP
                  </th>
                  <th className="py-2.5 pl-2 pr-3 text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8 text-xs sm:text-sm">
                {visibleStandings.map((entry) => {
                  const isSelf = entry.player.uid === currentUserUid;
                  return (
                    <tr
                      key={entry.player.uid}
                      className={`transition-colors ${
                        isSelf
                          ? 'bg-[#D4AF37]/10 hover:bg-[#D4AF37]/15'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="py-3 pl-3 pr-2 font-mono font-bold tabular-nums">
                        <span
                          className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded text-xs ${
                            entry.rank === 1
                              ? 'bg-[#D4AF37] text-[#090B10]'
                              : entry.rank === 2
                                ? 'bg-slate-200 text-[#090B10]'
                                : entry.rank === 3
                                  ? 'bg-amber-600 text-[#090B10]'
                                  : 'bg-white/5 text-[#C4C9D8]'
                          }`}
                        >
                          #{entry.rank}
                        </span>
                      </td>

                      <td className="py-3 px-2">
                        <button
                          type="button"
                          onClick={() => onInspectPlayerUid(entry.player.uid)}
                          className="text-left group cursor-pointer"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-[#F5EFE0] group-hover:text-[#F5DC8B] transition-colors">
                              {entry.player.displayName}
                            </span>
                            {entry.clanTag && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-400/35 text-violet-200">
                                <Shield className="w-2.5 h-2.5" />[
                                {entry.clanTag}]
                              </span>
                            )}
                            {isSelf && (
                              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#8F96AB]">
                            {entry.player.title || 'Arena Tactician'}
                          </p>
                        </button>
                      </td>

                      <td className="py-3 px-2">
                        <span
                          className={`inline-block text-[10px] font-mono uppercase px-2 py-0.5 rounded border whitespace-nowrap ${tierBadgeClass(
                            entry.tier.accent
                          )}`}
                        >
                          {entry.tier.label}
                        </span>
                      </td>

                      <td className="py-3 px-2 text-right font-mono font-bold text-[#F5DC8B] tabular-nums whitespace-nowrap">
                        {entry.rating.toLocaleString()}
                      </td>

                      <td className="py-3 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="font-bold text-emerald-300">
                          {entry.wins}W
                        </span>
                        <span className="text-[#7C849B] text-xs ml-1">
                          / {entry.losses}L
                        </span>
                      </td>

                      <td className="py-3 px-2 hidden md:table-cell">
                        <div className="flex items-center gap-2 min-w-[115px]">
                          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-400 to-[#D4AF37]"
                              style={{
                                width: `${Math.min(100, Math.max(0, entry.winRatePct))}%`,
                              }}
                            />
                          </div>
                          <span className="font-mono text-xs text-[#C4C9D8] tabular-nums w-11 text-right">
                            {entry.matchesPlayed > 0
                              ? `${entry.winRatePct.toFixed(0)}%`
                              : '—'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-2 text-right font-mono text-xs text-violet-300 tabular-nums hidden lg:table-cell whitespace-nowrap">
                        {entry.activeXp.toLocaleString()} XP
                      </td>

                      <td className="py-3 pl-2 pr-3 text-right">
                        <button
                          type="button"
                          onClick={() => onInspectPlayerUid(entry.player.uid)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#182034] border border-white/15 text-[11px] font-medium text-[#D8DCE8] hover:border-[#D4AF37]/50 hover:text-[#F5DC8B] transition-colors cursor-pointer"
                        >
                          <User className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
