import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTacticalAction } from './bot';
import { createBattle, executeAction } from './engine';
import {
  buildMatchReplayTimeline,
  createReplayMetadataFromBattle,
} from './replay';
import {
  DEFAULT_PLAYER_SQUAD_IDS,
  getComplementaryEnemySquad,
  getSquadCharacters,
  STARTER_CHARACTERS,
} from './roster';
import { MatchSummaryRecord, RULESET_VERSION } from './types';

function runCompleteMatch(seed: number) {
  const playerSquad = getSquadCharacters(
    DEFAULT_PLAYER_SQUAD_IDS,
    STARTER_CHARACTERS
  );
  const enemySquad = getComplementaryEnemySquad(
    DEFAULT_PLAYER_SQUAD_IDS,
    STARTER_CHARACTERS
  );
  let state = createBattle(playerSquad, enemySquad, seed);
  let guard = 0;
  while (state.phase === 'active' && guard < 160) {
    const action = chooseTacticalAction(state);
    assert.ok(action, 'Tactical AI should return a legal action');
    state = executeAction(state, action);
    guard += 1;
  }
  assert.notEqual(state.phase, 'active', 'Match should reach victory or defeat');
  assert.ok(state.winner, 'Match should have a winner');
  return { state, playerSquad, enemySquad };
}

test('exact recorded replay reproduces final state identically even after champions level up', () => {
  const { state } = runCompleteMatch(77312);
  const myUnits = state.units.filter((u) => u.side === 'player');
  const enemyUnits = state.units.filter((u) => u.side === 'enemy');
  const replayMeta = createReplayMetadataFromBattle(
    state,
    'player',
    STARTER_CHARACTERS
  );

  const summary: MatchSummaryRecord = {
    matchId: state.matchId,
    seed: state.seed,
    timestamp: '2026-11-19T12:00:00.000Z',
    winner: state.winner!,
    rounds: state.round,
    turns: state.turnNumber,
    playerSquadIds: myUnits.map((u) => u.definitionId),
    enemySquadIds: enemyUnits.map((u) => u.definitionId),
    playerSurvivors: myUnits.filter((u) => u.alive).length,
    enemySurvivors: enemyUnits.filter((u) => u.alive).length,
    totalPlayerDamage: myUnits.reduce((s, u) => s + u.statsTracker.damageDealt, 0),
    totalPlayerHealing: myUnits.reduce((s, u) => s + u.statsTracker.healingDone, 0),
    rulesetVersion: RULESET_VERSION,
    mode: 'solo',
    opponentName: 'Arena AI Vanguard',
    ...replayMeta,
  };

  // Mutate roster stats as if player leveled up all champions after the match
  const leveledRoster = STARTER_CHARACTERS.map((c) => ({
    ...c,
    level: 5,
    stats: {
      ...c.stats,
      maxHp: c.stats.maxHp + 120,
      attack: c.stats.attack + 25,
    },
  }));

  const timeline = buildMatchReplayTimeline(summary, leveledRoster);

  assert.equal(timeline.mode, 'recorded');
  assert.equal(timeline.recordedActionsMatched, state.replayLog.length);
  assert.equal(timeline.frames.length, state.replayLog.length + 1);

  const finalFrame = timeline.frames[timeline.frames.length - 1];
  assert.equal(finalFrame.state.winner, state.winner);
  assert.equal(finalFrame.state.round, state.round);
  assert.equal(
    timeline.insights.playerTotals.damage,
    summary.totalPlayerDamage
  );
  assert.equal(
    timeline.insights.playerTotals.survivors,
    summary.playerSurvivors
  );
  assert.ok(timeline.insights.mvpUnit, 'MVP unit should be identified');
  assert.ok(
    timeline.insights.keyMomentFrameIndices.length >= 1,
    'Completed match should have at least one key moment (final blow / KOs)'
  );
  assert.ok(
    timeline.insights.roundSummaries.length >= 1,
    'Round summaries should aggregate per-round combat totals'
  );
});

test('PvP guest perspective (viewerSide = enemy) normalizes replay actions to player perspective', () => {
  const { state } = runCompleteMatch(51904);
  const myUnits = state.units.filter((u) => u.side === 'enemy');
  const rivalUnits = state.units.filter((u) => u.side === 'player');
  const replayMeta = createReplayMetadataFromBattle(
    state,
    'enemy',
    STARTER_CHARACTERS
  );

  const summary: MatchSummaryRecord = {
    matchId: 'pvp-room-guest',
    seed: state.seed,
    timestamp: '2026-11-19T12:15:00.000Z',
    winner: state.winner === 'enemy' ? 'player' : 'enemy',
    rounds: state.round,
    turns: state.turnNumber,
    playerSquadIds: myUnits.map((u) => u.definitionId),
    enemySquadIds: rivalUnits.map((u) => u.definitionId),
    playerSurvivors: myUnits.filter((u) => u.alive).length,
    enemySurvivors: rivalUnits.filter((u) => u.alive).length,
    totalPlayerDamage: myUnits.reduce((s, u) => s + u.statsTracker.damageDealt, 0),
    totalPlayerHealing: myUnits.reduce((s, u) => s + u.statsTracker.healingDone, 0),
    rulesetVersion: RULESET_VERSION,
    mode: 'multiplayer',
    opponentName: 'Host Tactician',
    ...replayMeta,
  };

  // All normalized actions should reference oriented player/enemy slots cleanly
  assert.ok(summary.replayLog && summary.replayLog.length > 0);
  const timeline = buildMatchReplayTimeline(summary, STARTER_CHARACTERS);
  assert.ok(timeline.frames.length > 1);
  assert.equal(
    timeline.frames[timeline.frames.length - 1].state.phase !== 'active',
    true
  );
});

test('legacy MatchSummaryRecord without replayLog reconstructs deterministically and handles missing custom card IDs', () => {
  const legacySummary: MatchSummaryRecord = {
    matchId: 'legacy-cloud-match-1',
    seed: 90421,
    timestamp: '2026-11-18T18:30:00.000Z',
    winner: 'player',
    rounds: 5,
    turns: 34,
    playerSquadIds: [
      'chr-custom-deleted-999',
      DEFAULT_PLAYER_SQUAD_IDS[1],
      DEFAULT_PLAYER_SQUAD_IDS[2],
      DEFAULT_PLAYER_SQUAD_IDS[3],
      DEFAULT_PLAYER_SQUAD_IDS[4],
    ],
    enemySquadIds: getComplementaryEnemySquad(
      DEFAULT_PLAYER_SQUAD_IDS,
      STARTER_CHARACTERS
    ).map((c) => c.id),
    playerSurvivors: 3,
    enemySurvivors: 0,
    totalPlayerDamage: 2400,
    totalPlayerHealing: 450,
    rulesetVersion: RULESET_VERSION,
  };

  const runA = buildMatchReplayTimeline(legacySummary, STARTER_CHARACTERS);
  const runB = buildMatchReplayTimeline(legacySummary, STARTER_CHARACTERS);

  assert.equal(runA.mode, 'simulated');
  assert.deepEqual(runA.substitutedCharacterIds, ['chr-custom-deleted-999']);
  assert.equal(runA.frames.length, runB.frames.length);
  assert.equal(
    runA.frames[runA.frames.length - 1].state.winner,
    runB.frames[runB.frames.length - 1].state.winner
  );
  assert.deepEqual(
    runA.insights.roundSummaries,
    runB.insights.roundSummaries
  );
  assert.ok(
    runA.insights.tacticalTakeaways.some((t) =>
      t.includes('deterministic tactical simulation')
    )
  );
});
