import { STARTER_CHARACTERS } from './roster';
import {
  CharacterDefinition,
  CombatRole,
  ElementAffinity,
  MatchSummaryRecord,
  TeamSide,
} from './types';

export type AnalyticsSortMode = 'matches' | 'winRate' | 'fastest' | 'longest';
export type AnalyticsModeFilter = 'all' | 'solo' | 'multiplayer';

export interface CharacterBattleAnalytics {
  characterId: string;
  name: string;
  shortName: string;
  role: CombatRole;
  element: ElementAffinity;
  artworkUrl: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number; // 0-100 rounded to 1 decimal
  winLossRatio: number; // wins / max(1, losses), rounded to 2 decimals
  winLossRatioLabel: string;
  totalRounds: number;
  totalTurns: number;
  avgRounds: number; // rounded to 1 decimal
  avgTurns: number; // rounded to 1 decimal
  avgTeamDamage: number;
  avgTeamHealing: number;
  avgSurvivors: number;
}

export interface RecentMatchDurationPoint {
  matchLabel: string;
  matchId: string;
  turns: number;
  rounds: number;
  winner: TeamSide;
  damage: number;
}

export interface BattleAnalyticsSummaryData {
  totalMatches: number;
  totalWins: number;
  totalLosses: number;
  overallWinRate: number;
  overallWinLossRatioLabel: string;
  avgRounds: number;
  avgTurns: number;
  avgPlayerDamage: number;
  avgPlayerHealing: number;
  fastestMatch: MatchSummaryRecord | null;
  longestMatch: MatchSummaryRecord | null;
  topWinRateCharacter: CharacterBattleAnalytics | null;
  fastestFinisherCharacter: CharacterBattleAnalytics | null;
  mostDeployedCharacter: CharacterBattleAnalytics | null;
  characters: CharacterBattleAnalytics[];
  outcomePieData: Array<{
    name: 'Victories' | 'Defeats';
    value: number;
    fill: string;
  }>;
  recentTrend: RecentMatchDurationPoint[];
}

export interface ComputeBattleAnalyticsOptions {
  modeFilter?: AnalyticsModeFilter;
  roleFilter?: CombatRole | 'ALL';
  sortBy?: AnalyticsSortMode;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toShortCharacterName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.length > 11 ? `${first.slice(0, 10)}…` : first;
}

function formatWinLossRatio(wins: number, losses: number): string {
  if (wins === 0 && losses === 0) return '0.00';
  if (losses === 0) return `${wins}.00 (Undefeated)`;
  return round2(wins / losses).toFixed(2);
}

/**
 * Aggregates real MatchSummaryRecord history into per-character win-loss ratios,
 * average match duration (turns & rounds), overall win-loss splits, and trend series
 * ready for Recharts visualizations.
 */
export function computeBattleAnalytics(
  matches: MatchSummaryRecord[],
  availableCharacters: CharacterDefinition[] = STARTER_CHARACTERS,
  options: ComputeBattleAnalyticsOptions = {}
): BattleAnalyticsSummaryData {
  const {
    modeFilter = 'all',
    roleFilter = 'ALL',
    sortBy = 'matches',
  } = options;

  const filteredMatches = matches.filter((m) => {
    if (modeFilter === 'all') return true;
    const matchMode = m.mode ?? 'solo';
    return matchMode === modeFilter;
  });

  const charById = new Map<string, CharacterDefinition>();
  for (const starter of STARTER_CHARACTERS) {
    charById.set(starter.id, starter);
  }
  for (const card of availableCharacters) {
    charById.set(card.id, card);
  }

  const totalMatches = filteredMatches.length;
  const totalWins = filteredMatches.filter((m) => m.winner === 'player').length;
  const totalLosses = totalMatches - totalWins;
  const overallWinRate =
    totalMatches > 0 ? round1((totalWins / totalMatches) * 100) : 0;

  const sumRounds = filteredMatches.reduce((s, m) => s + m.rounds, 0);
  const sumTurns = filteredMatches.reduce((s, m) => s + m.turns, 0);
  const sumDamage = filteredMatches.reduce((s, m) => s + m.totalPlayerDamage, 0);
  const sumHealing = filteredMatches.reduce(
    (s, m) => s + m.totalPlayerHealing,
    0
  );

  const avgRounds = totalMatches > 0 ? round1(sumRounds / totalMatches) : 0;
  const avgTurns = totalMatches > 0 ? round1(sumTurns / totalMatches) : 0;
  const avgPlayerDamage =
    totalMatches > 0 ? Math.round(sumDamage / totalMatches) : 0;
  const avgPlayerHealing =
    totalMatches > 0 ? Math.round(sumHealing / totalMatches) : 0;

  let fastestMatch: MatchSummaryRecord | null = null;
  let longestMatch: MatchSummaryRecord | null = null;

  for (const m of filteredMatches) {
    if (
      !fastestMatch ||
      m.turns < fastestMatch.turns ||
      (m.turns === fastestMatch.turns && m.rounds < fastestMatch.rounds)
    ) {
      fastestMatch = m;
    }
    if (
      !longestMatch ||
      m.turns > longestMatch.turns ||
      (m.turns === longestMatch.turns && m.rounds > longestMatch.rounds)
    ) {
      longestMatch = m;
    }
  }

  // Per-character aggregation across every match in which the champion was deployed
  const buckets = new Map<
    string,
    {
      matchesPlayed: number;
      wins: number;
      losses: number;
      totalRounds: number;
      totalTurns: number;
      totalDamage: number;
      totalHealing: number;
      totalSurvivors: number;
    }
  >();

  for (const match of filteredMatches) {
    const uniqueSquadIds = Array.from(new Set(match.playerSquadIds));
    const won = match.winner === 'player';

    for (const charId of uniqueSquadIds) {
      if (!charId) continue;
      let acc = buckets.get(charId);
      if (!acc) {
        acc = {
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          totalRounds: 0,
          totalTurns: 0,
          totalDamage: 0,
          totalHealing: 0,
          totalSurvivors: 0,
        };
        buckets.set(charId, acc);
      }
      acc.matchesPlayed += 1;
      if (won) acc.wins += 1;
      else acc.losses += 1;
      acc.totalRounds += match.rounds;
      acc.totalTurns += match.turns;
      acc.totalDamage += match.totalPlayerDamage;
      acc.totalHealing += match.totalPlayerHealing;
      acc.totalSurvivors += match.playerSurvivors;
    }
  }

  const allCharacterStats: CharacterBattleAnalytics[] = [];
  for (const [charId, acc] of buckets.entries()) {
    const def = charById.get(charId);
    const name = def?.name ?? 'Archived Champion';
    const role: CombatRole = def?.role ?? 'Striker';
    const element: ElementAffinity = def?.element ?? 'Aether';
    const artworkUrl =
      def?.artworkUrl ?? STARTER_CHARACTERS[0].artworkUrl;

    const winRate = round1((acc.wins / acc.matchesPlayed) * 100);
    const winLossRatio =
      acc.losses === 0 ? acc.wins : round2(acc.wins / acc.losses);

    allCharacterStats.push({
      characterId: charId,
      name,
      shortName: toShortCharacterName(name),
      role,
      element,
      artworkUrl,
      matchesPlayed: acc.matchesPlayed,
      wins: acc.wins,
      losses: acc.losses,
      winRate,
      winLossRatio,
      winLossRatioLabel: formatWinLossRatio(acc.wins, acc.losses),
      totalRounds: acc.totalRounds,
      totalTurns: acc.totalTurns,
      avgRounds: round1(acc.totalRounds / acc.matchesPlayed),
      avgTurns: round1(acc.totalTurns / acc.matchesPlayed),
      avgTeamDamage: Math.round(acc.totalDamage / acc.matchesPlayed),
      avgTeamHealing: Math.round(acc.totalHealing / acc.matchesPlayed),
      avgSurvivors: round1(acc.totalSurvivors / acc.matchesPlayed),
    });
  }

  // Highlight callouts computed across all deployed characters in the selected mode
  const topWinRateCharacter =
    [...allCharacterStats].sort(
      (a, b) =>
        b.winRate - a.winRate ||
        b.wins - a.wins ||
        b.matchesPlayed - a.matchesPlayed ||
        a.name.localeCompare(b.name)
    )[0] ?? null;

  const fastestFinisherCharacter =
    [...allCharacterStats].sort(
      (a, b) =>
        a.avgTurns - b.avgTurns ||
        a.avgRounds - b.avgRounds ||
        b.winRate - a.winRate ||
        a.name.localeCompare(b.name)
    )[0] ?? null;

  const mostDeployedCharacter =
    [...allCharacterStats].sort(
      (a, b) =>
        b.matchesPlayed - a.matchesPlayed ||
        b.winRate - a.winRate ||
        a.name.localeCompare(b.name)
    )[0] ?? null;

  // Apply role filter & user sort to character series
  const roleFiltered =
    roleFilter === 'ALL'
      ? allCharacterStats
      : allCharacterStats.filter((c) => c.role === roleFilter);

  const sortedCharacters = [...roleFiltered].sort((a, b) => {
    switch (sortBy) {
      case 'winRate':
        return (
          b.winRate - a.winRate ||
          b.wins - a.wins ||
          b.matchesPlayed - a.matchesPlayed ||
          a.name.localeCompare(b.name)
        );
      case 'fastest':
        return (
          a.avgTurns - b.avgTurns ||
          a.avgRounds - b.avgRounds ||
          b.matchesPlayed - a.matchesPlayed ||
          a.name.localeCompare(b.name)
        );
      case 'longest':
        return (
          b.avgTurns - a.avgTurns ||
          b.avgRounds - a.avgRounds ||
          b.matchesPlayed - a.matchesPlayed ||
          a.name.localeCompare(b.name)
        );
      case 'matches':
      default:
        return (
          b.matchesPlayed - a.matchesPlayed ||
          b.winRate - a.winRate ||
          a.name.localeCompare(b.name)
        );
    }
  });

  // Chronological oldest -> newest match pace trend (up to 12 most recent matches)
  const chronological = [...filteredMatches]
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    .slice(-12);

  const recentTrend: RecentMatchDurationPoint[] = chronological.map(
    (m, idx) => ({
      matchLabel: `M${idx + 1}`,
      matchId: m.matchId,
      turns: m.turns,
      rounds: m.rounds,
      winner: m.winner,
      damage: m.totalPlayerDamage,
    })
  );

  return {
    totalMatches,
    totalWins,
    totalLosses,
    overallWinRate,
    overallWinLossRatioLabel: formatWinLossRatio(totalWins, totalLosses),
    avgRounds,
    avgTurns,
    avgPlayerDamage,
    avgPlayerHealing,
    fastestMatch,
    longestMatch,
    topWinRateCharacter,
    fastestFinisherCharacter,
    mostDeployedCharacter,
    characters: sortedCharacters,
    outcomePieData: [
      { name: 'Victories', value: totalWins, fill: '#34D399' },
      { name: 'Defeats', value: totalLosses, fill: '#FB7185' },
    ],
    recentTrend,
  };
}
