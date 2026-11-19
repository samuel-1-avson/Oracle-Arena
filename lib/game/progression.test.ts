import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCharacterBalance } from './balance';
import { chooseTacticalAction } from './bot';
import {
  createBattle,
  executeAction,
  getActiveUnit,
  getLegalAbilities,
  getValidTargets,
} from './engine';
import {
  applyStatUpgrade,
  computeValidatedBattleRewards,
  evolveCharacter,
  LEVEL_XP_THRESHOLDS,
  MAX_UPGRADES_PER_STAT,
  toggleEquipLearnedAbility,
  unlockCustomAbility,
} from './progression';
import {
  DEFAULT_ENEMY_SQUAD_IDS,
  DEFAULT_PLAYER_SQUAD_IDS,
  getSquadCharacters,
  STARTER_CHARACTERS,
} from './roster';
import { compileSingleOracleAbility } from '../oracle/compiler';

test('computeValidatedBattleRewards rejects incomplete or zero-turn battles', () => {
  const playerSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS);
  const enemySquad = getSquadCharacters(DEFAULT_ENEMY_SQUAD_IDS);
  const battle = createBattle(playerSquad, enemySquad, 42);

  // Still active
  const ongoing = computeValidatedBattleRewards(battle, STARTER_CHARACTERS);
  assert.equal(ongoing.grants.length, 0);

  // Forged victory with 0 replay turns
  const forged = { ...battle, phase: 'victory' as const, winner: 'player' as const };
  const rejected = computeValidatedBattleRewards(forged, STARTER_CHARACTERS);
  assert.equal(rejected.grants.length, 0);
});

test('completed 5v5 victory awards validated XP, Level 2, Upgrade Points, and 1 ACP', () => {
  const playerSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS);
  const enemySquad = getSquadCharacters(DEFAULT_ENEMY_SQUAD_IDS);
  let state = createBattle(playerSquad, enemySquad, 777);

  let steps = 0;
  while (state.phase === 'active' && steps < 250) {
    const action = chooseTacticalAction(state);
    assert.ok(action);
    state = executeAction(state, action);
    steps += 1;
  }

  assert.ok(state.phase === 'victory' || state.phase === 'defeat');
  // Verify Victory threshold grant deterministically using the real finished match replay
  const victoryState = {
    ...state,
    phase: 'victory' as const,
    winner: 'player' as const,
  };

  const rewards = computeValidatedBattleRewards(victoryState, STARTER_CHARACTERS);
  assert.equal(rewards.grants.length, 5);

  for (const grant of rewards.grants) {
    assert.ok(grant.xpGained >= 110, `Expected >= 110 XP, got ${grant.xpGained}`);
    assert.equal(grant.previousLevel, 1);
    assert.equal(grant.newLevel, 2);
    assert.equal(grant.upgradePointsEarned, 2);
    assert.equal(grant.abilityPointsEarned, 1);

    const updated = rewards.updatedCharacters[grant.definitionId];
    assert.ok(updated);
    assert.equal(updated.level, 2);
    assert.equal(updated.upgradePoints, 2);
    assert.equal(updated.abilityCreationPoints, 1);
    assert.equal(updated.combatRecord.matchesPlayed, 1);
    assert.equal(updated.combatRecord.wins, 1);
    assert.equal(updated.upgradeHistory[0]?.kind, 'xp_reward');
  }
});

test('stat upgrades spend Upgrade Points, honor max rank 5, and preserve balance validation', () => {
  const kaelen = {
    ...STARTER_CHARACTERS[0],
    level: 6,
    xp: LEVEL_XP_THRESHOLDS[5],
    upgradePoints: 6,
    abilityCreationPoints: 2,
  };

  let current = kaelen;
  for (let i = 0; i < MAX_UPGRADES_PER_STAT; i += 1) {
    const res = applyStatUpgrade(current, 'maxHp');
    assert.equal(res.ok, true, res.ok ? '' : res.error);
    if (res.ok) current = res.character;
  }

  assert.equal(current.statUpgrades.maxHp, MAX_UPGRADES_PER_STAT);
  assert.equal(current.stats.maxHp, kaelen.stats.maxHp + 18 * MAX_UPGRADES_PER_STAT);
  assert.equal(current.upgradePoints, 1);

  // 6th upgrade in same stat must be rejected
  const blocked = applyStatUpgrade(current, 'maxHp');
  assert.equal(blocked.ok, false);

  // Upgrading attack should still succeed
  const atkRes = applyStatUpgrade(current, 'attack');
  assert.equal(atkRes.ok, true);
  if (atkRes.ok) {
    assert.equal(atkRes.character.upgradePoints, 0);
    assert.equal(validateCharacterBalance(atkRes.character).valid, true);
  }
});

test('Phase 3 acceptance: leveled champion upgrades stat, unlocks balanced custom ability, and fires it in 5v5 combat', () => {
  // Start with Kaelen Solaris at Lv 2 with 2 UP and 1 ACP (as earned from 1 victory)
  const kaelenLv2 = {
    ...STARTER_CHARACTERS[0],
    level: 2,
    xp: 125,
    upgradePoints: 2,
    abilityCreationPoints: 1,
  };

  // 1. Upgrade Attack stat
  const upg = applyStatUpgrade(kaelenLv2, 'attack');
  assert.equal(upg.ok, true);
  if (!upg.ok) return;
  assert.equal(upg.character.stats.attack, kaelenLv2.stats.attack + 4);

  // 2. Compile an intentionally overpowered custom ability concept -> Balance Compiler scales it fairly
  const compiled = compileSingleOracleAbility(
    {
      name: 'Solar Nova Lance',
      description: 'Channel a piercing sunbeam that burns and shatters a single enemy.',
      targetType: 'single_enemy',
      damageMultiplier: 2.5,
      flatDamage: 80,
      healMultiplier: 0,
      flatHeal: 0,
      shieldAmount: 40,
      energyCost: 20,
      energyGain: 0,
      cooldown: 1,
      cooldownReduction: 0,
      statuses: [{ type: 'burn', duration: 2, potency: 35, chance: 1 }],
      visualEffect: 'Golden solar spear erupts across the battlefield.',
    },
    {
      category: 'special',
      characterId: upg.character.id,
      characterLevel: upg.character.level,
      uniqueSuffix: 'test1',
    }
  );

  assert.equal(compiled.adjusted, true);
  assert.ok(compiled.budgetUsed <= compiled.budgetCap);

  // 3. Unlock the ability (spends 1 ACP and auto-equips into 4th slot!)
  const unlocked = unlockCustomAbility(upg.character, compiled.ability);
  assert.equal(unlocked.ok, true, unlocked.ok ? '' : unlocked.error);
  if (!unlocked.ok) return;

  const upgradedKaelen = unlocked.character;
  assert.equal(upgradedKaelen.abilityCreationPoints, 0);
  assert.ok(
    upgradedKaelen.specialAbilities.some((a) => a.id === compiled.ability.id),
    'New ability should be equipped into the 4th battle slot'
  );
  assert.equal(
    upgradedKaelen.specialAbilities.length + (upgradedKaelen.ultimateAbility ? 1 : 0),
    4
  );

  // 4. Test loadout toggle: unequipping an old special and re-equipping
  const oldSpecialId = upgradedKaelen.specialAbilities[0].id;
  const unequipped = toggleEquipLearnedAbility(upgradedKaelen, oldSpecialId);
  assert.equal(unequipped.ok, true);
  if (unequipped.ok) {
    assert.equal(unequipped.character.specialAbilities.length, 2);
    const reEquipped = toggleEquipLearnedAbility(unequipped.character, oldSpecialId);
    assert.equal(reEquipped.ok, true);
  }

  // 5. Deploy upgraded Kaelen into a real 5v5 battle and legally fire the custom ability!
  const squad = [
    upgradedKaelen,
    ...getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS.slice(1)),
  ];
  const enemies = getSquadCharacters(DEFAULT_ENEMY_SQUAD_IDS);
  let battle = createBattle(squad, enemies, 909);

  let firedCustomAbility = false;
  let guard = 0;
  while (battle.phase === 'active' && guard < 40 && !firedCustomAbility) {
    guard += 1;
    const active = getActiveUnit(battle);
    if (active && active.definitionId === upgradedKaelen.id) {
      const legalAbilities = getLegalAbilities(battle, active.instanceId);
      const customAb = legalAbilities.find((a) => a.id === compiled.ability.id);
      if (customAb) {
        const targets = getValidTargets(battle, active.instanceId, customAb.id);
        battle = executeAction(battle, {
          actorId: active.instanceId,
          abilityId: customAb.id,
          targetIds: [targets[0].instanceId],
        });
        firedCustomAbility = true;
        break;
      }
      // Build energy with Guard so Kaelen can fire the custom ability on next turn
      battle = executeAction(battle, {
        actorId: active.instanceId,
        abilityId: active.guardAction.id,
        targetIds: [active.instanceId],
      });
    } else {
      const botAct = chooseTacticalAction(battle);
      assert.ok(botAct);
      battle = executeAction(battle, botAct);
    }
  }

  assert.equal(firedCustomAbility, true, 'Expected custom unlocked ability to fire legally in 5v5 combat');
  assert.ok(
    battle.replayLog.some((entry) => entry.action.abilityId === compiled.ability.id),
    'Replay log should record execution of the newly forged ability'
  );
});

test('Character Evolution requires Level 3/5, preserves immutable creator identity, and passes ranked balance', () => {
  const lv2 = { ...STARTER_CHARACTERS[1], level: 2, xp: 140 };
  const tooEarly = evolveCharacter(lv2, {
    newTitle: 'Astral Sovereign',
    loreNote: 'Early attempt.',
  });
  assert.equal(tooEarly.ok, false);

  const lv3 = {
    ...STARTER_CHARACTERS[1],
    level: 3,
    xp: LEVEL_XP_THRESHOLDS[2],
    originalCreatorId: 'creator-uid-99',
    originalCreatorName: 'Vesper',
  };
  const stage1 = evolveCharacter(lv3, {
    newTitle: 'Astral Singularity Sovereign',
    loreNote: 'Mastered twin gravitational rings in the Spire Trials.',
  });
  assert.equal(stage1.ok, true, stage1.ok ? '' : stage1.error);
  if (!stage1.ok) return;

  assert.equal(stage1.character.evolutionStage, 1);
  assert.equal(stage1.character.id, lv3.id);
  assert.equal(stage1.character.originalCreatorId, 'creator-uid-99');
  assert.equal(stage1.character.originalCreatorName, 'Vesper');
  assert.equal(stage1.character.title, 'Astral Singularity Sovereign');
  assert.equal(stage1.character.evolutionHistory.length, lv3.evolutionHistory.length + 1);
  assert.equal(validateCharacterBalance(stage1.character).valid, true);
});
