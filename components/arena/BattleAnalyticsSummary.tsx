'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Crown,
  Film,
  Flame,
  Layers,
  RotateCcw,
  Swords,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AnalyticsModeFilter,
  AnalyticsSortMode,
  CharacterBattleAnalytics,
  computeBattleAnalytics,
} from '@/lib/game/analytics';
import { getCharacterById } from '@/lib/game/roster';
import {
  CharacterDefinition,
  CombatRole,
  MatchSummaryRecord,
} from '@/lib/game/types';
import { AccountBar } from './AccountBar';
import { CharacterDetailModal } from './CharacterDetailModal';
import { ELEMENT_STYLES } from './ui-meta';

interface BattleAnalyticsSummaryProps {
  matches: MatchSummaryRecord[];
  allCharacters: CharacterDefinition[];
  syncingCloud?: boolean;
  onStartBattle: () => void;
  onOpenReplay: (matchId?: string) => void;
  onOpenCollection: () => void;
  onBackToTitle: () => void;
}

const ROLE_OPTIONS: Array<CombatRole | 'ALL'> = [
  'ALL',
  'Vanguard',
  'Striker',
  'Arcanist',
  'Warden',
  'Tactician',
];

interface TooltipPayloadEntry {
  payload?: CharacterBattleAnalytics;
}

function WinLossTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div className="rounded-lg bg-[#0B0E17]/95 border border-[#D4AF37]/40 px-3.5 py-2.5 shadow-2xl text-xs space-y-1.5 min-w-[190px]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-1.5">
        <span className="font-display font-bold text-[#F5EFE0]">
          {item.name}
        </span>
        <span className="text-[10px] font-mono uppercase text-[#9CA3B8]">
          {item.role}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono tabular-nums">
        <span className="text-[#8F96AB]">Record</span>
        <span className="text-right text-[#F5EFE0]">
          <span className="text-emerald-300">{item.wins}W</span> –{' '}
          <span className="text-rose-300">{item.losses}L</span>
        </span>
        <span className="text-[#8F96AB]">Win Rate</span>
        <span className="text-right font-semibold text-[#F5DC8B]">
          {item.winRate.toFixed(1)}%
        </span>
        <span className="text-[#8F96AB]">W/L Ratio</span>
        <span className="text-right text-sky-300">
          {item.winLossRatioLabel}
        </span>
        <span className="text-[#8F96AB]">Matches</span>
        <span className="text-right text-[#C4C9D8]">{item.matchesPlayed}</span>
      </div>
    </div>
  );
}

function DurationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div className="rounded-lg bg-[#0B0E17]/95 border border-[#D4AF37]/40 px-3.5 py-2.5 shadow-2xl text-xs space-y-1.5 min-w-[205px]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-1.5">
        <span className="font-display font-bold text-[#F5EFE0]">
          {item.name}
        </span>
        <span className="text-[10px] font-mono uppercase text-[#9CA3B8]">
          {item.matchesPlayed} {item.matchesPlayed === 1 ? 'Match' : 'Matches'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono tabular-nums">
        <span className="text-[#8F96AB]">Avg Turns</span>
        <span className="text-right font-semibold text-[#F5DC8B]">
          {item.avgTurns.toFixed(1)} turns
        </span>
        <span className="text-[#8F96AB]">Avg Rounds</span>
        <span className="text-right font-semibold text-sky-300">
          {item.avgRounds.toFixed(1)} rounds
        </span>
        <span className="text-[#8F96AB]">Avg Squad DMG</span>
        <span className="text-right text-rose-300">{item.avgTeamDamage}</span>
        <span className="text-[#8F96AB]">Avg Survivors</span>
        <span className="text-right text-emerald-300">
          {item.avgSurvivors.toFixed(1)} / 5
        </span>
      </div>
    </div>
  );
}

function OutcomePieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
}) {
  const entry = payload?.[0];
  if (!active || !entry) return null;
  return (
    <div className="rounded-md bg-[#0B0E17]/95 border border-white/15 px-3 py-1.5 text-xs font-mono text-[#F5EFE0] shadow-xl">
      {entry.name}: <strong>{entry.value}</strong>
    </div>
  );
}

export function BattleAnalyticsSummary({
  matches,
  allCharacters,
  syncingCloud = false,
  onStartBattle,
  onOpenReplay,
  onOpenCollection,
  onBackToTitle,
}: BattleAnalyticsSummaryProps) {
  const [modeFilter, setModeFilter] = useState<AnalyticsModeFilter>('all');
  const [roleFilter, setRoleFilter] = useState<CombatRole | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<AnalyticsSortMode>('matches');
  const [winChartView, setWinChartView] = useState<'counts' | 'winRate'>(
    'counts'
  );
  const [inspectDefId, setInspectDefId] = useState<string | null>(null);

  const analytics = useMemo(
    () =>
      computeBattleAnalytics(matches, allCharacters, {
        modeFilter,
        roleFilter,
        sortBy,
      }),
    [matches, allCharacters, modeFilter, roleFilter, sortBy]
  );

  const inspectCharacter = useMemo(
    () =>
      inspectDefId
        ? getCharacterById(inspectDefId, allCharacters) ?? null
        : null,
    [inspectDefId, allCharacters]
  );

  const chartCharacters = useMemo(
    () => analytics.characters.slice(0, 12),
    [analytics.characters]
  );

  const hasActiveFilter = modeFilter !== 'all' || roleFilter !== 'ALL';

  // Honest empty state when zero matches have been recorded
  if (matches.length === 0) {
    return (
      <div className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0E16]/95 backdrop-blur px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToTitle}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-white/10 text-xs font-medium text-[#C4C9D8] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Title</span>
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <BarChart3 className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <h1 className="font-display text-sm sm:text-base font-bold tracking-[0.06em] text-[#F5EFE0] truncate">
                BATTLE ANALYTICS
              </h1>
            </div>
          </div>
          <AccountBar syncingCloud={syncingCloud} />
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-xl bg-[#111521] border border-white/10 p-8 text-center space-y-5 shadow-2xl">
            <div className="mx-auto w-14 h-14 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center">
              <BarChart3 className="w-7 h-7 text-[#D4AF37]" />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-bold text-[#F5EFE0]">
                No Battle Analytics Yet
              </h2>
              <p className="text-sm text-[#9CA3B8] leading-relaxed">
                Complete at least one 5v5 Battle Arena or Multiplayer PvP match
                to chart per-character win-loss ratios, average match durations
                in turns and rounds, and squad performance trends.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onStartBattle}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-sm hover:bg-[#E5C454] transition-colors cursor-pointer"
              >
                <Swords className="w-4 h-4" />
                <span>Enter 5v5 Battle Arena</span>
              </button>
              <button
                type="button"
                onClick={onOpenCollection}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-white/15 text-sm text-[#C4C9D8] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Layers className="w-4 h-4" />
                <span>Inspect Squad</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col">
      {/* Single-Row Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0E16]/95 backdrop-blur px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToTitle}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-white/10 text-xs font-medium text-[#C4C9D8] hover:text-white hover:bg-white/5 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Title</span>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <h1 className="font-display text-sm sm:text-base font-bold tracking-[0.06em] text-[#F5EFE0] truncate">
              BATTLE ANALYTICS
            </h1>
          </div>
          <span className="hidden md:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-[#D4AF37]/12 text-[#F5DC8B] border border-[#D4AF37]/30">
            {matches.length} {matches.length === 1 ? 'Match' : 'Matches'}{' '}
            Analyzed
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onOpenReplay(matches[0]?.matchId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-sky-400/35 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 text-xs font-medium transition-colors cursor-pointer"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Match Replays</span>
          </button>
          <button
            type="button"
            onClick={onStartBattle}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-xs hover:bg-[#E5C454] transition-colors cursor-pointer"
          >
            <Swords className="w-3.5 h-3.5" />
            <span>New Battle</span>
          </button>
          <AccountBar syncingCloud={syncingCloud} />
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Filter & Sort Controls Ribbon */}
        <section className="rounded-xl bg-[#111521] border border-white/10 p-3.5 flex flex-wrap items-center justify-between gap-3">
          {/* Mode Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#8F96AB]">
              Mode:
            </span>
            <div className="inline-flex rounded-md bg-[#0B0E16] border border-white/10 p-0.5">
              {(
                [
                  { id: 'all', label: 'All Matches' },
                  { id: 'solo', label: 'Solo 5v5' },
                  { id: 'multiplayer', label: 'PvP' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModeFilter(tab.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                    modeFilter === tab.id
                      ? 'bg-[#D4AF37] text-[#0B0D13] font-semibold'
                      : 'text-[#9CA3B8] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Role Filter */}
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#8F96AB] ml-2">
              Role:
            </span>
            <div className="flex flex-wrap gap-1">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(role)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
                    roleFilter === role
                      ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                      : 'bg-[#0B0E16] border-white/10 text-[#9CA3B8] hover:text-white'
                  }`}
                >
                  {role === 'ALL' ? 'All Roles' : role}
                </button>
              ))}
            </div>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="analytics-sort-select"
              className="text-[11px] font-mono uppercase tracking-wider text-[#8F96AB]"
            >
              Sort:
            </label>
            <select
              id="analytics-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as AnalyticsSortMode)}
              className="rounded-md bg-[#0B0E16] border border-white/15 px-3 py-1.5 text-xs text-[#ECEEF4] focus:outline-none focus:border-[#D4AF37] cursor-pointer"
            >
              <option value="matches">Most Deployed</option>
              <option value="winRate">Highest Win Rate</option>
              <option value="fastest">Fastest Avg Finish</option>
              <option value="longest">Longest Avg Match</option>
            </select>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setModeFilter('all');
                  setRoleFilter('ALL');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-white/10 text-xs text-[#C4C9D8] hover:text-white hover:bg-white/5 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </section>

        {/* Filtered-Empty State */}
        {analytics.totalMatches === 0 || analytics.characters.length === 0 ? (
          <div className="rounded-xl bg-[#111521] border border-white/10 p-10 text-center space-y-3">
            <p className="font-display text-lg font-bold text-[#F5EFE0]">
              No Matches Match Current Filters
            </p>
            <p className="text-xs text-[#9CA3B8]">
              Try switching back to All Matches or All Roles to inspect your
              full performance history.
            </p>
            <button
              type="button"
              onClick={() => {
                setModeFilter('all');
                setRoleFilter('ALL');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-xs hover:bg-[#E5C454] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        ) : (
          <>
            {/* Top 4 KPI Summary Cards */}
            <section
              aria-label="Battle analytics summary metrics"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
            >
              <div className="rounded-xl bg-[#111521] border border-white/10 p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#8F96AB]">
                  <span className="uppercase tracking-wider font-mono text-[11px]">
                    Win-Loss Ratio
                  </span>
                  <Trophy className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <p className="font-display text-2xl font-bold text-[#F5EFE0] tabular-nums">
                  {analytics.overallWinRate.toFixed(1)}%
                </p>
                <p className="text-xs font-mono text-[#9CA3B8] tabular-nums">
                  <span className="text-emerald-300">
                    {analytics.totalWins}W
                  </span>{' '}
                  –{' '}
                  <span className="text-rose-300">
                    {analytics.totalLosses}L
                  </span>{' '}
                  · Ratio {analytics.overallWinLossRatioLabel}
                </p>
              </div>

              <div className="rounded-xl bg-[#111521] border border-white/10 p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#8F96AB]">
                  <span className="uppercase tracking-wider font-mono text-[11px]">
                    Avg Match Duration
                  </span>
                  <Clock className="w-4 h-4 text-sky-300" />
                </div>
                <p className="font-display text-2xl font-bold text-[#F5EFE0] tabular-nums">
                  {analytics.avgTurns.toFixed(1)}{' '}
                  <span className="text-sm font-sans font-normal text-[#9CA3B8]">
                    turns
                  </span>
                </p>
                <p className="text-xs font-mono text-[#9CA3B8] tabular-nums">
                  {analytics.avgRounds.toFixed(1)} avg rounds · Range{' '}
                  {analytics.fastestMatch?.turns ?? 0}–
                  {analytics.longestMatch?.turns ?? 0}t
                </p>
              </div>

              <div className="rounded-xl bg-[#111521] border border-white/10 p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#8F96AB]">
                  <span className="uppercase tracking-wider font-mono text-[11px]">
                    Top Win Rate Champion
                  </span>
                  <Crown className="w-4 h-4 text-emerald-300" />
                </div>
                <p className="font-display text-lg font-bold text-[#F5EFE0] truncate">
                  {analytics.topWinRateCharacter?.name ?? '—'}
                </p>
                <p className="text-xs font-mono text-[#9CA3B8] tabular-nums">
                  {analytics.topWinRateCharacter
                    ? `${analytics.topWinRateCharacter.winRate.toFixed(1)}% WR (${analytics.topWinRateCharacter.wins}W–${analytics.topWinRateCharacter.losses}L)`
                    : 'No data'}
                </p>
              </div>

              <div className="rounded-xl bg-[#111521] border border-white/10 p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#8F96AB]">
                  <span className="uppercase tracking-wider font-mono text-[11px]">
                    Fastest Finisher
                  </span>
                  <Zap className="w-4 h-4 text-amber-300" />
                </div>
                <p className="font-display text-lg font-bold text-[#F5EFE0] truncate">
                  {analytics.fastestFinisherCharacter?.name ?? '—'}
                </p>
                <p className="text-xs font-mono text-[#9CA3B8] tabular-nums">
                  {analytics.fastestFinisherCharacter
                    ? `${analytics.fastestFinisherCharacter.avgTurns.toFixed(1)} turns · ${analytics.fastestFinisherCharacter.avgRounds.toFixed(1)} rounds avg`
                    : 'No data'}
                </p>
              </div>
            </section>

            {/* Primary Recharts Grid: Win-Loss Ratio per Character + Overall Outcome Split */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Chart 1: Win-Loss Ratio per Character */}
              <div
                data-testid="analytics-winloss-chart"
                className="lg:col-span-8 rounded-xl bg-[#111521] border border-white/10 p-4 sm:p-5 space-y-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-base font-bold text-[#F5EFE0] tracking-wide">
                      Win-Loss Ratio per Character
                    </h2>
                    <p className="text-xs text-[#8F96AB]">
                      Victory vs. defeat distribution across every deployed
                      champion
                    </p>
                  </div>
                  <div className="inline-flex rounded-md bg-[#0B0E16] border border-white/10 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setWinChartView('counts')}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        winChartView === 'counts'
                          ? 'bg-[#D4AF37] text-[#0B0D13] font-semibold'
                          : 'text-[#9CA3B8] hover:text-white'
                      }`}
                    >
                      Wins vs Losses
                    </button>
                    <button
                      type="button"
                      onClick={() => setWinChartView('winRate')}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        winChartView === 'winRate'
                          ? 'bg-[#D4AF37] text-[#0B0D13] font-semibold'
                          : 'text-[#9CA3B8] hover:text-white'
                      }`}
                    >
                      Win Rate %
                    </button>
                  </div>
                </div>

                <div className="h-[290px] w-full">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    minWidth={240}
                    minHeight={220}
                  >
                    {winChartView === 'counts' ? (
                      <BarChart
                        data={chartCharacters}
                        margin={{ top: 10, right: 16, left: -10, bottom: 8 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.08)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="shortName"
                          stroke="#8F96AB"
                          tick={{ fill: '#C4C9D8', fontSize: 11 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          stroke="#8F96AB"
                          tick={{ fill: '#8F96AB', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          content={<WinLossTooltip />}
                          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 12, paddingTop: 6 }}
                        />
                        <Bar
                          dataKey="wins"
                          name="Victories"
                          fill="#34D399"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={32}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="losses"
                          name="Defeats"
                          fill="#FB7185"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={32}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    ) : (
                      <BarChart
                        data={chartCharacters}
                        margin={{ top: 10, right: 16, left: -10, bottom: 8 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.08)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="shortName"
                          stroke="#8F96AB"
                          tick={{ fill: '#C4C9D8', fontSize: 11 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          unit="%"
                          stroke="#8F96AB"
                          tick={{ fill: '#8F96AB', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          content={<WinLossTooltip />}
                          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                        />
                        <Bar
                          dataKey="winRate"
                          name="Win Rate %"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={42}
                          isAnimationActive={false}
                        >
                          {chartCharacters.map((entry) => (
                            <Cell
                              key={entry.characterId}
                              fill={
                                entry.winRate >= 60
                                  ? '#34D399'
                                  : entry.winRate >= 40
                                    ? '#D4AF37'
                                    : '#FB7185'
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Overall Outcome Split Donut + Squad Output Averages */}
              <div
                data-testid="analytics-outcome-pie"
                className="lg:col-span-4 rounded-xl bg-[#111521] border border-white/10 p-4 sm:p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <h2 className="font-display text-base font-bold text-[#F5EFE0] tracking-wide">
                    Overall Outcome Split
                  </h2>
                  <p className="text-xs text-[#8F96AB]">
                    Aggregate win-loss ratio &amp; average squad output
                  </p>
                </div>

                <div className="relative h-[190px] w-full">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    minWidth={180}
                    minHeight={180}
                  >
                    <PieChart>
                      <Pie
                        data={analytics.outcomePieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={54}
                        outerRadius={78}
                        paddingAngle={
                          analytics.totalWins > 0 && analytics.totalLosses > 0
                            ? 4
                            : 0
                        }
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {analytics.outcomePieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<OutcomePieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-2xl font-bold text-[#F5EFE0] tabular-nums">
                      {analytics.overallWinRate.toFixed(0)}%
                    </span>
                    <span className="text-[11px] font-mono text-[#8F96AB]">
                      {analytics.totalWins}W – {analytics.totalLosses}L
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs font-mono tabular-nums pt-2 border-t border-white/10">
                  <div className="rounded-lg bg-[#0B0E16] border border-white/8 p-2.5">
                    <p className="text-[10px] uppercase text-[#8F96AB]">
                      Avg Allied DMG
                    </p>
                    <p className="text-sm font-semibold text-rose-300 mt-0.5 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5" />
                      {analytics.avgPlayerDamage}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#0B0E16] border border-white/8 p-2.5">
                    <p className="text-[10px] uppercase text-[#8F96AB]">
                      Avg Allied Heal
                    </p>
                    <p className="text-sm font-semibold text-emerald-300 mt-0.5">
                      {analytics.avgPlayerHealing} HP
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Chart 3: Average Match Duration per Character (Turns + Rounds ComposedChart) */}
            <section
              data-testid="analytics-duration-chart"
              className="rounded-xl bg-[#111521] border border-white/10 p-4 sm:p-5 space-y-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-[#F5EFE0] tracking-wide">
                    Average Match Duration per Character
                  </h2>
                  <p className="text-xs text-[#8F96AB]">
                    Average total turns (gold bars) and average rounds (sky
                    line) for matches featuring each champion
                  </p>
                </div>
                <span className="text-[11px] font-mono text-[#9CA3B8]">
                  Lower turns = faster blitz finishes · Higher turns = attrition
                  sustain
                </span>
              </div>

              <div className="h-[290px] w-full">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={240}
                  minHeight={220}
                >
                  <ComposedChart
                    data={chartCharacters}
                    margin={{ top: 10, right: 16, left: -8, bottom: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.08)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="shortName"
                      stroke="#8F96AB"
                      tick={{ fill: '#C4C9D8', fontSize: 11 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="turns"
                      stroke="#D4AF37"
                      tick={{ fill: '#F5DC8B', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      label={{
                        value: 'Avg Turns',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#D4AF37',
                        fontSize: 11,
                        offset: 16,
                      }}
                    />
                    <YAxis
                      yAxisId="rounds"
                      orientation="right"
                      stroke="#38BDF8"
                      tick={{ fill: '#7DD3FC', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      label={{
                        value: 'Avg Rounds',
                        angle: 90,
                        position: 'insideRight',
                        fill: '#38BDF8',
                        fontSize: 11,
                        offset: 14,
                      }}
                    />
                    <Tooltip
                      content={<DurationTooltip />}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                    <Bar
                      yAxisId="turns"
                      dataKey="avgTurns"
                      name="Avg Turns"
                      fill="#D4AF37"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={44}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="rounds"
                      type="monotone"
                      dataKey="avgRounds"
                      name="Avg Rounds"
                      stroke="#38BDF8"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#38BDF8', stroke: '#090B10', strokeWidth: 1.5 }}
                      activeDot={{ r: 6 }}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Detailed Per-Character Performance Ledger */}
            <section className="rounded-xl bg-[#111521] border border-white/10 overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-[#F5EFE0] tracking-wide">
                    Character Performance Ledger
                  </h2>
                  <p className="text-xs text-[#8F96AB]">
                    Click any champion row to inspect their abilities and
                    progression
                  </p>
                </div>
                <span className="text-xs font-mono text-[#9CA3B8]">
                  Showing {analytics.characters.length}{' '}
                  {analytics.characters.length === 1
                    ? 'champion'
                    : 'champions'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#0C101A] text-[#8F96AB] font-mono uppercase text-[11px] border-b border-white/10">
                    <tr>
                      <th className="py-2.5 px-4 text-left font-medium">
                        Champion
                      </th>
                      <th className="py-2.5 px-3 text-left font-medium">
                        Role
                      </th>
                      <th className="py-2.5 px-3 text-right font-medium">
                        Matches
                      </th>
                      <th className="py-2.5 px-3 text-right font-medium">
                        W – L
                      </th>
                      <th className="py-2.5 px-3 text-right font-medium">
                        W/L Ratio
                      </th>
                      <th className="py-2.5 px-4 text-left font-medium min-w-[140px]">
                        Win Rate
                      </th>
                      <th className="py-2.5 px-3 text-right font-medium">
                        Avg Turns
                      </th>
                      <th className="py-2.5 px-3 text-right font-medium">
                        Avg Rounds
                      </th>
                      <th className="py-2.5 px-4 text-right font-medium">
                        Avg Squad DMG
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono tabular-nums">
                    {analytics.characters.map((ch) => {
                      const elem = ELEMENT_STYLES[ch.element];
                      return (
                        <tr
                          key={ch.characterId}
                          className="hover:bg-white/[0.03] transition-colors"
                        >
                          <td className="py-2.5 px-4 font-sans">
                            <button
                              type="button"
                              onClick={() => setInspectDefId(ch.characterId)}
                              className="flex items-center gap-3 text-left group cursor-pointer"
                            >
                              <div className="relative w-9 h-10 rounded overflow-hidden border border-white/15 shrink-0">
                                <Image
                                  src={ch.artworkUrl}
                                  alt={ch.name}
                                  fill
                                  sizes="36px"
                                  referrerPolicy="no-referrer"
                                  className="object-cover object-top"
                                />
                              </div>
                              <div>
                                <p className="font-semibold text-[#F5EFE0] group-hover:text-[#F5DC8B] transition-colors">
                                  {ch.name}
                                </p>
                                <p className={`text-[11px] ${elem.text}`}>
                                  {ch.element}
                                </p>
                              </div>
                            </button>
                          </td>
                          <td className="py-2.5 px-3 font-sans text-[#C4C9D8]">
                            {ch.role}
                          </td>
                          <td className="py-2.5 px-3 text-right text-[#ECEEF4]">
                            {ch.matchesPlayed}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="text-emerald-300">{ch.wins}W</span>{' '}
                            –{' '}
                            <span className="text-rose-300">{ch.losses}L</span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-sky-300">
                            {ch.winLossRatioLabel}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-rose-500/30 overflow-hidden">
                                <div
                                  className="h-full bg-emerald-400"
                                  style={{ width: `${ch.winRate}%` }}
                                />
                              </div>
                              <span className="w-11 text-right text-[#F5EFE0]">
                                {ch.winRate.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right text-[#F5DC8B] font-semibold">
                            {ch.avgTurns.toFixed(1)}t
                          </td>
                          <td className="py-2.5 px-3 text-right text-sky-300">
                            {ch.avgRounds.toFixed(1)}R
                          </td>
                          <td className="py-2.5 px-4 text-right text-rose-300">
                            {ch.avgTeamDamage}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>

      <CharacterDetailModal
        character={inspectCharacter}
        onClose={() => setInspectDefId(null)}
      />
    </div>
  );
}
