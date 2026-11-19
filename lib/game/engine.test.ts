import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAbilityPowerBudget,
  validateCharacterBalance,
} from './balance';
import { chooseTacticalAction } from './bot';
import {
  createBattle,
  executeAction,
  getActiveUnit,
  getLegalAbilities,
  getValidTargets,
  isActionLegal,
} from './engine';
import {
  DEFAULT_ENEMY_SQUAD_IDS,
  DEFAULT_PLAYER_SQUAD_IDS,
  getSquadCharacters,
  STARTER_CHARACTERS,
} from './roster';
import { CharacterDefinition } from './types';

test('all 10 starter characters pass universal schema and balance validation', () => {
  assert.equal(STARTER_CHARACTERS.length, 10);
  for (const card of STARTER_CHARACTERS) {
    const result = validateCharacterBalance(card);
    assert.equal(
      result.valid,
      true,
      `Card ${card.name} failed balance validation: ${result.issues
        .map((i) => i.message)
        .join('; ')}`
    );
  }
});

test('balance validator rejects an overpowered ability', () => {
  const brokenCard: CharacterDefinition = {
    ...STARTER_CHARACTERS[0],
    specialAbilities: [
      {
        ...STARTER_CHARACTERS[0].specialAbilities[0],
        name: 'Broken Obliteration',
        targetType: 'all_enemies',
        damageMultiplier: 2.5,
        flatDamage: 100,
        energyCost: 10,
        cooldown: 0,
      },
      STARTER_CHARACTERS[0].specialAbilities[1],
    ],
  };

  const budget = computeAbilityPowerBudget(brokenCard.specialAbilities[0]);
  assert.ok(budget > 100);
  const validation = validateCharacterBalance(brokenCard);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.length > 0);
});

test('battle initializes 5v5 units and orders turns strictly by highest speed', () => {
  const playerSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS);
  const enemySquad = getSquadCharacters(DEFAULT_ENEMY_SQUAD_IDS);
  const state = createBattle(playerSquad, enemySquad, 1337);

  assert.equal(state.units.length, 10);
  assert.equal(state.phase, 'active');

  // Nyx has 116 speed (highest across all 10 cards), so she must act first
  const active = getActiveUnit(state);
  assert.ok(active);
  assert.equal(active.definitionId, 'chr-nyx-shadowblade');
  assert.equal(active.side, 'enemy');
});

test('direct damage, shields, cooldowns, and energy expenditure resolve deterministically', () => {
  const playerSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS);
  const enemySquad = getSquadCharacters(DEFAULT_ENEMY_SQUAD_IDS);
  const state1 = createBattle(playerSquad, enemySquad, 9001);
  const state2 = createBattle(playerSquad, enemySquad, 9001);

  const actor = getActiveUnit(state1)!;
  const special = actor.abilities[0]; // Nyx Night Rend (35 energy, 2cd, Bleed)
  const target = state1.units.find(
    (u) => u.side === 'player' && u.definitionId === 'chr-kaelen-solaris'
  )!;

  const action = {
    actorId: actor.instanceId,
    abilityId: special.id,
    targetIds: [target.instanceId],
  };

  assert.equal(isActionLegal(state1, action), true);

  const next1 = executeAction(state1, action);
  const next2 = executeAction(state2, action);

  // Exact deterministic match across identical seeds
  const kaelen1 = next1.units.find((u) => u.instanceId === target.instanceId)!;
  const kaelen2 = next2.units.find((u) => u.instanceId === target.instanceId)!;
  assert.equal(kaelen1.currentHp, kaelen2.currentHp);
  assert.ok(kaelen1.currentHp < kaelen1.maxHp, 'Target should lose HP');
  assert.ok(
    kaelen1.statuses.some((s) => s.type === 'bleed'),
    'Bleed status should be applied'
  );

  // Nyx spent energy and placed ability on cooldown
  const nyxAfter = next1.units.find((u) => u.instanceId === actor.instanceId)!;
  assert.equal(nyxAfter.cooldowns[special.id], special.cooldown);
  assert.equal(
    nyxAfter.currentEnergy,
    actor.currentEnergy - special.energyCost
  );

  // Second fastest unit is Vex (112 speed), so Vex acts next
  const nextActive = getActiveUnit(next1)!;
  assert.equal(nextActive.definitionId, 'chr-vex-chronostriker');
  assert.equal(nextActive.side, 'player');
});

test('shield absorbs damage before HP and Guard grants energy + shield', () => {
  const playerSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS);
  const enemySquad = getSquadCharacters(DEFAULT_ENEMY_SQUAD_IDS);
  let state = createBattle(playerSquad, enemySquad, 777);

  // Nyx uses Guard
  const nyx = getActiveUnit(state)!;
  const guardAction = {
    actorId: nyx.instanceId,
    abilityId: nyx.guardAction.id,
    targetIds: [nyx.instanceId],
  };
  state = executeAction(state, guardAction);

  const nyxGuarding = state.units.find((u) => u.instanceId === nyx.instanceId)!;
  assert.equal(nyxGuarding.shield, 32);
  assert.ok(nyxGuarding.statuses.some((s) => s.type === 'guarding'));
  assert.ok(nyxGuarding.currentEnergy > nyx.currentEnergy);

  // Vex attacks guarding Nyx — shield must absorb part of the strike
  const vex = getActiveUnit(state)!;
  state = executeAction(state, {
    actorId: vex.instanceId,
    abilityId: vex.basicAttack.id,
    targetIds: [nyx.instanceId],
  });

  const damageEvt = state.lastTurnEvents.find((e) => e.kind === 'damage');
  assert.ok(damageEvt);
  assert.ok((damageEvt.shieldAbsorbed ?? 0) > 0, 'Shield must absorb incoming damage');
});

test('illegal actions (insufficient energy or wrong target side) are rejected', () => {
  const playerSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS);
  const enemySquad = getSquadCharacters(DEFAULT_ENEMY_SQUAD_IDS);
  const state = createBattle(playerSquad, enemySquad, 2026);
  const nyx = getActiveUnit(state)!;

  // Ultimate costs 68 energy, Nyx starts with 40
  const ultimate = nyx.abilities.find((a) => a.category === 'ultimate')!;
  const legalAbilities = getLegalAbilities(state, nyx.instanceId);
  assert.equal(
    legalAbilities.some((a) => a.id === ultimate.id),
    false,
    'Ultimate should not be legal without enough energy'
  );

  // Cannot target an ally with a single_enemy basic attack
  const ally = state.units.find(
    (u) => u.side === nyx.side && u.instanceId !== nyx.instanceId
  )!;
  assert.equal(
    isActionLegal(state, {
      actorId: nyx.instanceId,
      abilityId: nyx.basicAttack.id,
      targetIds: [ally.instanceId],
    }),
    false
  );
});

test('full 5v5 battle runs to valid victory or defeat using fair tactical AI', () => {
  const playerSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS);
  const enemySquad = getSquadCharacters(DEFAULT_ENEMY_SQUAD_IDS);
  let state = createBattle(playerSquad, enemySquad, 55501);

  let steps = 0;
  while (state.phase === 'active' && steps < 250) {
    const action = chooseTacticalAction(state);
    assert.ok(action, 'Tactical AI must always return a legal action');
    assert.equal(
      isActionLegal(state, action),
      true,
      `AI generated illegal action at turn ${state.turnNumber}`
    );
    const validTargets = getValidTargets(state, action.actorId, action.abilityId);
    assert.ok(validTargets.length > 0);
    state = executeAction(state, action);
    steps += 1;
  }

  assert.ok(
    state.phase === 'victory' || state.phase === 'defeat',
    `Expected battle to finish within 140 turns, got phase=${state.phase} after ${steps} turns`
  );
  assert.ok(steps <= 120, `Expected decisive match length (<=120 turns), took ${steps}`);
  assert.ok(state.winner === 'player' || state.winner === 'enemy');
  assert.ok(state.replayLog.length > 0);

  // Verify losing team has 0 living units and winning team has >= 1
  const playerAlive = state.units.filter((u) => u.side === 'player' && u.alive).length;
  const enemyAlive = state.units.filter((u) => u.side === 'enemy' && u.alive).length;
  if (state.winner === 'player') {
    assert.equal(enemyAlive, 0);
    assert.ok(playerAlive >= 1);
  } else {
    assert.equal(playerAlive, 0);
    assert.ok(enemyAlive >= 1);
  }
});
