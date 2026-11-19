import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTacticalAction } from '../game/bot';
import { createBattle, executeAction, isActionLegal } from '../game/engine';
import {
  DEFAULT_ENEMY_SQUAD_IDS,
  DEFAULT_PLAYER_SQUAD_IDS,
  getSquadCharacters,
  STARTER_CHARACTERS,
} from '../game/roster';
import { checkOriginality, compileOracleDraft } from './compiler';

test('Oracle compiler balances an overpowered raw draft into a legal Level 1 card with transparent adjustment notes', () => {
  const overpoweredRaw = {
    name: 'Aurelius <script>alert(1)</script>',
    title: 'God-Emperor of Infinite Stars',
    role: 'Arcanist',
    element: 'Solar',
    appearance: 'Tall armored solar sovereign cloaked in radiant obsidian silk.',
    backstory: 'Forged in the core of a dying sun to challenge the arena.',
    personality: 'Commanding and fearless.',
    strengths: ['Massive burst', 'High durability'],
    weaknesses: ['Slow recovery'],
    stats: {
      maxHp: 480,
      attack: 112,
      defense: 90,
      speed: 120,
      startingEnergy: 50,
      healingPower: 80,
    },
    basicAttack: {
      name: 'Solar Bolt',
      description: 'Fires a beam of sunlight.',
      targetType: 'single_enemy',
      damageMultiplier: 1.8,
      flatDamage: 40,
      healMultiplier: 0,
      flatHeal: 0,
      shieldAmount: 0,
      energyCost: 0,
      energyGain: 30,
      cooldown: 0,
      cooldownReduction: 0,
      statuses: [],
      visualEffect: 'Golden beam.',
    },
    specialAbilities: [
      {
        name: 'Supernova Wipe',
        description: 'Annihilates all enemies instantly.',
        targetType: 'all_enemies',
        damageMultiplier: 2.2,
        flatDamage: 80,
        healMultiplier: 0,
        flatHeal: 0,
        shieldAmount: 0,
        energyCost: 20,
        energyGain: 0,
        cooldown: 1,
        cooldownReduction: 0,
        statuses: [{ type: 'stun', duration: 3, potency: 1, chance: 1 }],
        visualEffect: 'Blinding supernova.',
      },
      {
        name: 'Sun Ward',
        description: 'Shields an ally.',
        targetType: 'single_ally',
        damageMultiplier: 0,
        flatDamage: 0,
        healMultiplier: 0,
        flatHeal: 0,
        shieldAmount: 75,
        energyCost: 30,
        energyGain: 0,
        cooldown: 2,
        cooldownReduction: 0,
        statuses: [{ type: 'fortify', duration: 2, potency: 25, chance: 1 }],
        visualEffect: 'Golden dome.',
      },
    ],
    ultimateAbility: {
      name: 'Star Collapse',
      description: 'Massive solar explosion.',
      targetType: 'all_enemies',
      damageMultiplier: 2.4,
      flatDamage: 90,
      healMultiplier: 0,
      flatHeal: 0,
      shieldAmount: 0,
      energyCost: 40,
      energyGain: 0,
      cooldown: 2,
      cooldownReduction: 0,
      statuses: [{ type: 'burn', duration: 3, potency: 45, chance: 1 }],
      visualEffect: 'Collapsing star.',
    },
    clarifyingQuestions: ['Would you prefer more team shields or burn damage?'],
    oracleCommentary: 'Drafted as a solar arcanist.',
  };

  const compiled = compileOracleDraft(overpoweredRaw, {
    oracleProfile: 'Mythic Oracle',
    creatorId: 'player-42',
    creatorName: 'Commander Vale',
    existingRoster: STARTER_CHARACTERS,
    uniqueSuffix: 'test01',
  });

  // Strict sanitization & creator attribution preserved
  assert.ok(!compiled.character.name.includes('<script>'));
  assert.equal(compiled.character.originalCreatorId, 'player-42');
  assert.equal(compiled.character.originalCreatorName, 'Commander Vale');
  assert.equal(compiled.character.oracleProfile, 'Mythic Oracle');

  // Must pass universal balance validator after auto-balancing
  assert.equal(
    compiled.validation.valid,
    true,
    `Expected compiled card to pass balance validation: ${compiled.validation.issues
      .map((i) => i.message)
      .join('; ')}`
  );

  // Must report transparent explanations for stat and ability adjustments
  assert.ok(compiled.adjustments.some((a) => a.scope === 'stats'));
  assert.ok(compiled.adjustments.some((a) => a.scope === 'ability'));
});

test('originality checker flags near-duplicate names and marks distinct designs cleanly', () => {
  const duplicate = checkOriginality(
    {
      name: 'Kaelen Solaris',
      title: 'Dawnwall Sentinel',
      role: 'Vanguard',
      element: 'Solar',
      backstory: 'Sworn warden of the Seventh Sun Ring in obsidian gold mail.',
    },
    STARTER_CHARACTERS
  );
  assert.equal(duplicate.status, 'near_duplicate');
  assert.equal(duplicate.closestMatchName, 'Kaelen Solaris');

  const original = checkOriginality(
    {
      name: 'Thalassa Mire',
      title: 'Tidal Chronomancer',
      role: 'Tactician',
      element: 'Frost',
      backstory: 'Diver from the sunken brass spires who bends ocean currents.',
    },
    STARTER_CHARACTERS
  );
  assert.equal(original.status, 'distinct');
});

test('Oracle-created custom champion deploys and fights legally through a full 5v5 match', () => {
  const customDraft = compileOracleDraft(
    {
      name: 'Zephyr Voss',
      title: 'Gale Circuit Lancer',
      role: 'Striker',
      element: 'Storm',
      appearance: 'Sleek storm lancer wearing silver-obsidian wings and a voltaic spear.',
      backstory: 'Courier of the skyway relays who channels atmospheric lightning into precision thrusts.',
      personality: 'Bold, witty, thrives in open skies.',
      strengths: ['High speed', 'Armor piercing'],
      weaknesses: ['Low health pool'],
      stats: {
        maxHp: 270,
        attack: 94,
        defense: 38,
        speed: 114,
        startingEnergy: 40,
        healingPower: 0,
      },
      basicAttack: {
        name: 'Volt Thrust',
        description: 'Quick lightning spear jab restoring +18 Energy.',
        targetType: 'single_enemy',
        damageMultiplier: 1.0,
        flatDamage: 7,
        healMultiplier: 0,
        flatHeal: 0,
        shieldAmount: 0,
        energyCost: 0,
        energyGain: 18,
        cooldown: 0,
        cooldownReduction: 0,
        statuses: [],
        visualEffect: 'Electric spear flash.',
      },
      specialAbilities: [
        {
          name: 'Skybreaker Lance',
          description: 'Pierce a target and expose their armor.',
          targetType: 'single_enemy',
          damageMultiplier: 1.35,
          flatDamage: 14,
          healMultiplier: 0,
          flatHeal: 0,
          shieldAmount: 0,
          energyCost: 34,
          energyGain: 0,
          cooldown: 2,
          cooldownReduction: 0,
          statuses: [{ type: 'vulnerable', duration: 2, potency: 25, chance: 1 }],
          visualEffect: 'Azure lance streak.',
        },
        {
          name: 'Tailwind Matrix',
          description: 'Grant Haste and shield to self.',
          targetType: 'self',
          damageMultiplier: 0,
          flatDamage: 0,
          healMultiplier: 0,
          flatHeal: 0,
          shieldAmount: 45,
          energyCost: 26,
          energyGain: 10,
          cooldown: 3,
          cooldownReduction: 0,
          statuses: [{ type: 'haste', duration: 2, potency: 18, chance: 1 }],
          visualEffect: 'Swirling silver wind.',
        },
      ],
      ultimateAbility: {
        name: 'Thunderhead Dive',
        description: 'Devastating storm spear impact on one enemy.',
        targetType: 'single_enemy',
        damageMultiplier: 2.0,
        flatDamage: 28,
        healMultiplier: 0,
        flatHeal: 0,
        shieldAmount: 0,
        energyCost: 66,
        energyGain: 0,
        cooldown: 4,
        cooldownReduction: 0,
        statuses: [{ type: 'bleed', duration: 2, potency: 20, chance: 1 }],
        visualEffect: 'Orbital lightning lance impact.',
      },
      clarifyingQuestions: [],
      oracleCommentary: 'Balanced Storm Striker.',
    },
    {
      oracleProfile: 'Cyber Oracle',
      creatorId: 'local-player',
      creatorName: 'Arena Architect',
      existingRoster: STARTER_CHARACTERS,
      uniqueSuffix: 'battle01',
    }
  );

  assert.equal(customDraft.validation.valid, true);

  const playerSquad = [
    customDraft.character,
    ...getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS.slice(1)),
  ];
  const enemySquad = getSquadCharacters(DEFAULT_ENEMY_SQUAD_IDS);

  let state = createBattle(playerSquad, enemySquad, 20262);
  let customActed = false;
  let steps = 0;

  while (state.phase === 'active' && steps < 140) {
    const action = chooseTacticalAction(state);
    assert.ok(action);
    assert.equal(isActionLegal(state, action), true);
    if (action.actorId.includes(customDraft.character.id)) {
      customActed = true;
    }
    state = executeAction(state, action);
    steps += 1;
  }

  assert.equal(customActed, true, 'Custom Oracle character must act in battle');
  assert.ok(state.phase === 'victory' || state.phase === 'defeat');
});
