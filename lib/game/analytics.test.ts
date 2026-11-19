import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBattleAnalytics } from './analytics';
import { DEFAULT_PLAYER_SQUAD_IDS, STARTER_CHARACTERS } from './roster';
import { MatchSummaryRecord, RULESET_VERSION } from './types';

const ALT_IDS = STARTER_CHARACTERS.filter(
  (c) => !DEFAULT_PLAYER_SQUAD_IDS.includes(c.id)
).map((c) => c.id);

function makeMatch(
  overrides: Partial<MatchSummaryRecord> & { matchId: string }
): MatchSummaryRecord {
  return {
    seed: 10001,
    timestamp: '2026-11-19T12:00:00.000Z',
    winner: 'player',
    rounds: 6,
    turns: 40,
    playerSquadIds: [...DEFAULT_PLAYER_SQUAD_IDS],
    enemySquadIds: [...ALT_IDS],
    playerSurvivors: 3,
    enemySurvivors: 0,
    totalPlayerDamage: 2100,
    totalPlayerHealing: 420,
    rulesetVersion: RULESET_VERSION,
    mode: 'solo',
    ...overrides,
  };
}

test('computeBattleAnalytics returns clean zero-state summary when no matches exist', () => {
  const result = computeBattleAnalytics([], STARTER_CHARACTERS);
  assert.equal(result.totalMatches, 0);
  assert.equal(result.overallWinRate, 0);
  assert.equal(result.avgTurns, 0);
  assert.equal(result.avgRounds, 0);
  assert.equal(result.characters.length, 0);
  assert.equal(result.topWinRateCharacter, null);
  assert.equal(result.fastestFinisherCharacter, null);
});

test('computeBattleAnalytics accurately aggregates per-character win-loss ratios and average match durations', () => {
  const [slot0, slot1, slot2, slot3, slot4] = DEFAULT_PLAYER_SQUAD_IDS;
  const matches: MatchSummaryRecord[] = [
    makeMatch({
      matchId: 'm1',
      timestamp: '2026-11-19T10:00:00.000Z',
      winner: 'player',
      rounds: 5,
      turns: 30,
      playerSquadIds: [slot0, slot1, slot2, slot3, slot4],
      totalPlayerDamage: 2000,
      mode: 'solo',
    }),
    makeMatch({
      matchId: 'm2',
      timestamp: '2026-11-19T11:00:00.000Z',
      winner: 'enemy',
      rounds: 9,
      turns: 60,
      playerSquadIds: [slot0, slot1, slot2, slot3, ALT_IDS[0]],
      totalPlayerDamage: 2600,
      mode: 'multiplayer',
    }),
    makeMatch({
      matchId: 'm3',
      timestamp: '2026-11-19T12:00:00.000Z',
      winner: 'player',
      rounds: 4,
      turns: 24,
      playerSquadIds: [slot0, slot4, ALT_IDS[1], ALT_IDS[2], ALT_IDS[3]],
      totalPlayerDamage: 1700,
      mode: 'solo',
    }),
  ];

  const summary = computeBattleAnalytics(matches, STARTER_CHARACTERS, {
    sortBy: 'matches',
  });

  assert.equal(summary.totalMatches, 3);
  assert.equal(summary.totalWins, 2);
  assert.equal(summary.totalLosses, 1);
  assert.equal(summary.overallWinRate, 66.7);
  assert.equal(summary.overallWinLossRatioLabel, '2.00');
  assert.equal(summary.avgRounds, 6);
  assert.equal(summary.avgTurns, 38);
  assert.equal(summary.fastestMatch?.matchId, 'm3');
  assert.equal(summary.longestMatch?.matchId, 'm2');

  // slot0 (Kaelen Solaris) played all 3 matches: 2W-1L, avg (30+60+24)/3 = 38 turns, (5+9+4)/3 = 6 rounds
  const kaelen = summary.characters.find((c) => c.characterId === slot0);
  assert.ok(kaelen);
  assert.equal(kaelen.name, 'Kaelen Solaris');
  assert.equal(kaelen.role, 'Vanguard');
  assert.equal(kaelen.matchesPlayed, 3);
  assert.equal(kaelen.wins, 2);
  assert.equal(kaelen.losses, 1);
  assert.equal(kaelen.winRate, 66.7);
  assert.equal(kaelen.winLossRatio, 2);
  assert.equal(kaelen.avgTurns, 38);
  assert.equal(kaelen.avgRounds, 6);

  // slot4 played m1 (win, 30t/5r) and m3 (win, 24t/4r) -> 100% WR, avg 27 turns, 4.5 rounds
  const slot4Stats = summary.characters.find((c) => c.characterId === slot4);
  assert.ok(slot4Stats);
  assert.equal(slot4Stats.matchesPlayed, 2);
  assert.equal(slot4Stats.wins, 2);
  assert.equal(slot4Stats.losses, 0);
  assert.equal(slot4Stats.winRate, 100);
  assert.equal(slot4Stats.avgTurns, 27);
  assert.equal(slot4Stats.avgRounds, 4.5);

  // Chronological recentTrend preserves oldest -> newest
  assert.deepEqual(
    summary.recentTrend.map((p) => p.matchId),
    ['m1', 'm2', 'm3']
  );
});

test('computeBattleAnalytics honors modeFilter, roleFilter, and fastest/winRate sorting', () => {
  const matches: MatchSummaryRecord[] = [
    makeMatch({
      matchId: 'solo-1',
      winner: 'player',
      rounds: 5,
      turns: 28,
      mode: 'solo',
    }),
    makeMatch({
      matchId: 'pvp-1',
      winner: 'enemy',
      rounds: 10,
      turns: 64,
      mode: 'multiplayer',
    }),
  ];

  const pvpOnly = computeBattleAnalytics(matches, STARTER_CHARACTERS, {
    modeFilter: 'multiplayer',
    roleFilter: 'Vanguard',
    sortBy: 'fastest',
  });

  assert.equal(pvpOnly.totalMatches, 1);
  assert.equal(pvpOnly.totalWins, 0);
  assert.equal(pvpOnly.totalLosses, 1);
  assert.equal(pvpOnly.characters.length, 1);
  assert.equal(pvpOnly.characters[0].role, 'Vanguard');
  assert.equal(pvpOnly.characters[0].name, 'Kaelen Solaris');
  assert.equal(pvpOnly.characters[0].avgTurns, 64);
});
