import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseTacticalAction } from './bot';
import { createBattle, getActiveUnit } from './engine';
import {
  computeEloDelta,
  generateRoomCode,
  getOrientedTeams,
  getViewerSide,
  normalizeRoomCode,
  validateAndAdvanceMultiplayerTurn,
} from './multiplayer';
import { computeValidatedBattleRewards } from './progression';
import {
  DEFAULT_PLAYER_SQUAD_IDS,
  getComplementaryEnemySquad,
  getSquadCharacters,
  STARTER_CHARACTERS,
} from './roster';

test('generateRoomCode always yields valid 6-char uppercase alphanumeric codes', () => {
  for (let i = 0; i < 40; i += 1) {
    const code = generateRoomCode();
    assert.match(code, /^[A-Z0-9]{6}$/);
  }
  assert.equal(normalizeRoomCode(' ab-12c9! '), 'AB12C9');
});

test('computeEloDelta stays strictly bounded within [-40, +40] and [0, 5000]', () => {
  const pvpWin = computeEloDelta(1000, true, 'multiplayer');
  assert.equal(pvpWin.delta, 25);
  assert.equal(pvpWin.nextRating, 1025);

  const pvpLoss = computeEloDelta(1000, false, 'multiplayer');
  assert.equal(pvpLoss.delta, -15);
  assert.equal(pvpLoss.nextRating, 985);

  const floorCheck = computeEloDelta(5, false, 'multiplayer');
  assert.equal(floorCheck.nextRating, 0);
  assert.ok(floorCheck.delta >= -40 && floorCheck.delta <= 40);

  const capCheck = computeEloDelta(4990, true, 'multiplayer');
  assert.equal(capCheck.nextRating, 5000);
  assert.ok(capCheck.delta >= -40 && capCheck.delta <= 40);
});

test('getViewerSide and getOrientedTeams flip perspective cleanly for Guest vs Host', () => {
  const hostSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS, STARTER_CHARACTERS);
  const guestSquad = getComplementaryEnemySquad(DEFAULT_PLAYER_SQUAD_IDS, STARTER_CHARACTERS);
  const battle = createBattle(hostSquad, guestSquad, 9001);

  assert.equal(getViewerSide({ hostUid: 'u-host', guestUid: 'u-guest' }, 'u-host'), 'player');
  assert.equal(getViewerSide({ hostUid: 'u-host', guestUid: 'u-guest' }, 'u-guest'), 'enemy');
  assert.equal(getViewerSide({ hostUid: 'u-host', guestUid: 'u-guest' }, 'u-other'), null);

  const hostView = getOrientedTeams(battle.units, 'player');
  assert.equal(hostView.alliedUnits.length, 5);
  assert.equal(hostView.opposingUnits.length, 5);
  assert.ok(hostView.alliedUnits.every((u) => u.side === 'player'));

  const guestView = getOrientedTeams(battle.units, 'enemy');
  assert.equal(guestView.alliedUnits.length, 5);
  assert.equal(guestView.opposingUnits.length, 5);
  assert.ok(guestView.alliedUnits.every((u) => u.side === 'enemy'));
  assert.ok(guestView.opposingUnits.every((u) => u.side === 'player'));
});

test('validateAndAdvanceMultiplayerTurn rejects out-of-turn and illegal actions', () => {
  const hostSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS, STARTER_CHARACTERS);
  const guestSquad = getComplementaryEnemySquad(DEFAULT_PLAYER_SQUAD_IDS, STARTER_CHARACTERS);
  const battle = createBattle(hostSquad, guestSquad, 7777);
  const active = getActiveUnit(battle)!;
  const wrongSide = active.side === 'player' ? 'enemy' : 'player';
  const legalAction = chooseTacticalAction(battle)!;

  // Reject wrong player attempting to move out of turn
  const outOfTurn = validateAndAdvanceMultiplayerTurn(battle, legalAction, wrongSide);
  assert.equal(outOfTurn.ok, false);

  // Reject casting ultimate without sufficient energy
  const ultimate = active.abilities.find((a) => a.category === 'ultimate');
  if (ultimate && active.currentEnergy < ultimate.energyCost) {
    const illegalEnergy = validateAndAdvanceMultiplayerTurn(
      battle,
      {
        actorId: active.instanceId,
        abilityId: ultimate.id,
        targetIds: legalAction.targetIds,
      },
      active.side
    );
    assert.equal(illegalEnergy.ok, false);
  }

  // Accept valid turn by owning side
  const valid = validateAndAdvanceMultiplayerTurn(battle, legalAction, active.side);
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.result.turnNumber, battle.turnNumber + 1);
  }
});

test('full 5v5 host-vs-guest PvP simulation runs deterministically to completion and grants Guest XP', () => {
  const hostSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS, STARTER_CHARACTERS);
  const guestSquad = getComplementaryEnemySquad(DEFAULT_PLAYER_SQUAD_IDS, STARTER_CHARACTERS);
  let state = createBattle(hostSquad, guestSquad, 54321);
  let steps = 0;

  while (state.phase === 'active' && steps < 250) {
    const active = getActiveUnit(state);
    assert.ok(active, 'Active unit must exist during active match');
    const action = chooseTacticalAction(state);
    assert.ok(action, 'Legal action must exist for active unit');

    const res = validateAndAdvanceMultiplayerTurn(state, action, active.side);
    assert.equal(res.ok, true, 'Authoritative turn validator must accept legal PvP turn');
    if (!res.ok) break;

    state = res.result.nextBattleState;
    steps += 1;
  }

  assert.ok(
    state.phase === 'victory' || state.phase === 'defeat',
    'Simulated PvP match must reach decisive finish'
  );
  assert.ok(state.winner === 'player' || state.winner === 'enemy');

  // Verify Guest ('enemy') receives validated XP rewards for their own 5 champions
  const guestRewards = computeValidatedBattleRewards(state, STARTER_CHARACTERS, 'enemy');
  assert.equal(guestRewards.grants.length, 5);
  assert.ok(guestRewards.grants.every((g) => g.xpGained >= 55));
});
