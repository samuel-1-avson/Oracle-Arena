import { validateCharacterBalance } from './balance';
import {
  CardTierId,
  getCardTierForLevel,
  SHARD_TRAINING_COST,
  SHARD_TRAINING_XP,
} from './card-tiers';
import {
  AbilityDefinition,
  BattleState,
  CharacterDefinition,
  StatUpgradeTally,
  UpgradeTransaction,
} from './types';

export const MAX_CHARACTER_LEVEL = 10;
export const MAX_UPGRADES_PER_STAT = 5;

export type UpgradableStatKey = keyof StatUpgradeTally;

export const STAT_UPGRADE_INCREMENTS: Record<
  UpgradableStatKey,
  { label: string; delta: number; unit: string }
> = {
  maxHp: { label: 'Max Health', delta: 18, unit: 'HP' },
  attack: { label: 'Attack', delta: 4, unit: 'ATK' },
  defense: { label: 'Defense', delta: 4, unit: 'DEF' },
  speed: { label: 'Speed', delta: 3, unit: 'SPD' },
  healingPower: { label: 'Healing Power', delta: 6, unit: 'HEAL' },
};

// Cumulative XP thresholds to reach each level (index = level - 1)
// Level 2 requires 100 XP so winning a single legitimate 5v5 match unlocks leveling + 1 ACP!
export const LEVEL_XP_THRESHOLDS: number[] = [
  0,    // Lv 1
  100,  // Lv 2 (+2 UP, +1 ACP)
  240,  // Lv 3 (+2 UP, Evolution Stage 1 eligible)
  420,  // Lv 4 (+2 UP, +1 ACP)
  640,  // Lv 5 (+2 UP, Evolution Stage 2 eligible)
  900,  // Lv 6 (+2 UP, +1 ACP)
  1200, // Lv 7 (+2 UP)
  1550, // Lv 8 (+2 UP, +1 ACP)
  1950, // Lv 9 (+2 UP)
  2400, // Lv 10 (+2 UP, +1 ACP)
];

export const ABILITY_POINT_MILESTONE_LEVELS = new Set([2, 4, 6, 8, 10]);

export const EVOLUTION_REQUIREMENTS: Record<
  1 | 2,
  { minLevel: number; label: string; hpBonus: number; atkBonus: number; defBonus: number }
> = {
  1: {
    minLevel: 3,
    label: 'Ascended Resonance (Stage I)',
    hpBonus: 20,
    atkBonus: 3,
    defBonus: 3,
  },
  2: {
    minLevel: 5,
    label: 'Mythic Transcendence (Stage II)',
    hpBonus: 24,
    atkBonus: 4,
    defBonus: 4,
  },
};

export interface BattleXpGrant {
  definitionId: string;
  name: string;
  xpGained: number;
  previousLevel: number;
  newLevel: number;
  previousTier: CardTierId;
  newTier: CardTierId;
  tierPromoted: boolean;
  upgradePointsEarned: number;
  abilityPointsEarned: number;
}

export function getXpForNextLevel(level: number): number | null {
  if (level >= MAX_CHARACTER_LEVEL) return null;
  return LEVEL_XP_THRESHOLDS[level] ?? null;
}

export function getXpProgressWithinLevel(character: CharacterDefinition): {
  currentInLevel: number;
  neededForNext: number;
  percent: number;
  isMax: boolean;
} {
  if (character.level >= MAX_CHARACTER_LEVEL) {
    return { currentInLevel: 1, neededForNext: 1, percent: 100, isMax: true };
  }
  const floor = LEVEL_XP_THRESHOLDS[character.level - 1] ?? 0;
  const ceil = LEVEL_XP_THRESHOLDS[character.level] ?? floor + 100;
  const span = Math.max(1, ceil - floor);
  const current = Math.max(0, character.xp - floor);
  return {
    currentInLevel: current,
    neededForNext: span,
    percent: Math.min(100, Math.round((current / span) * 100)),
    isMax: false,
  };
}

export function normalizeCharacterProgression(
  card: CharacterDefinition
): CharacterDefinition {
  const baseAbilities: AbilityDefinition[] = [
    ...card.specialAbilities,
    ...(card.ultimateAbility ? [card.ultimateAbility] : []),
  ];
  const existingLearned = card.learnedAbilities ?? [];
  const learnedMap = new Map<string, AbilityDefinition>();
  for (const ab of [...baseAbilities, ...existingLearned]) {
    learnedMap.set(ab.id, ab);
  }

  return {
    ...card,
    level: card.level ?? 1,
    xp: card.xp ?? 0,
    upgradePoints: card.upgradePoints ?? 0,
    abilityCreationPoints: card.abilityCreationPoints ?? 0,
    evolutionStage: card.evolutionStage ?? 0,
    statUpgrades: {
      maxHp: card.statUpgrades?.maxHp ?? 0,
      attack: card.statUpgrades?.attack ?? 0,
      defense: card.statUpgrades?.defense ?? 0,
      speed: card.statUpgrades?.speed ?? 0,
      healingPower: card.statUpgrades?.healingPower ?? 0,
    },
    learnedAbilities: Array.from(learnedMap.values()),
    upgradeHistory: card.upgradeHistory ?? [],
  };
}

/**
 * Computes validated XP rewards strictly from a completed BattleState.
 * Rejects incomplete or 0-turn matches to prevent XP farming exploits.
 */
export function computeValidatedBattleRewards(
  battle: BattleState,
  playerCollection: CharacterDefinition[],
  forSide: 'player' | 'enemy' = 'player',
  overrideWinner?: 'player' | 'enemy'
): {
  grants: BattleXpGrant[];
  updatedCharacters: Record<string, CharacterDefinition>;
} {
  const effectiveWinner = overrideWinner ?? battle.winner;
  const isCompleted =
    overrideWinner !== undefined ||
    battle.phase === 'victory' ||
    battle.phase === 'defeat';

  if (
    !isCompleted ||
    !effectiveWinner ||
    (overrideWinner === undefined && battle.replayLog.length === 0)
  ) {
    return { grants: [], updatedCharacters: {} };
  }

  const playerUnits = battle.units.filter((u) => u.side === forSide);
  const isVictory = effectiveWinner === forSide;
  const nowIso = new Date().toISOString();

  const grants: BattleXpGrant[] = [];
  const updatedCharacters: Record<string, CharacterDefinition> = {};

  for (const unit of playerUnits) {
    const rawDef = playerCollection.find((c) => c.id === unit.definitionId);
    if (!rawDef) continue;
    const def = normalizeCharacterProgression(rawDef);

    const baseXp = isVictory ? 110 : 55;
    const koBonus = unit.statsTracker.kosScored * (isVictory ? 12 : 8);
    const survivalBonus = unit.alive ? 15 : 0;
    const contributionRaw =
      unit.statsTracker.damageDealt +
      unit.statsTracker.healingDone +
      unit.statsTracker.shieldGranted;
    const contributionBonus = Math.min(30, Math.floor(contributionRaw / 65));
    const xpGained = baseXp + koBonus + survivalBonus + contributionBonus;

    const prevLevel = def.level;
    const nextXp = def.xp + xpGained;
    let nextLevel = prevLevel;
    let upEarned = 0;
    let acpEarned = 0;

    while (
      nextLevel < MAX_CHARACTER_LEVEL &&
      nextXp >= LEVEL_XP_THRESHOLDS[nextLevel]
    ) {
      nextLevel += 1;
      upEarned += 2;
      if (ABILITY_POINT_MILESTONE_LEVELS.has(nextLevel)) {
        acpEarned += 1;
      }
    }

    const prevTier = getCardTierForLevel(prevLevel);
    const nextTier = getCardTierForLevel(nextLevel);
    const tierPromoted = nextTier.id !== prevTier.id;

    const tx: UpgradeTransaction = {
      id: `tx-xp-${battle.matchId}-${def.id}`,
      timestamp: nowIso,
      kind: 'xp_reward',
      matchId: battle.matchId,
      summary: `${isVictory ? 'Victory' : 'Battle'} reward: +${xpGained} XP${
        nextLevel > prevLevel
          ? ` (Leveled up to Lv.${nextLevel}, +${upEarned} UP${
              acpEarned > 0 ? `, +${acpEarned} ACP` : ''
            }${tierPromoted ? ` — Promoted to ${nextTier.rankTitle}!` : ''})`
          : ''
      }.`,
    };

    const updated: CharacterDefinition = {
      ...def,
      xp: nextXp,
      level: nextLevel,
      upgradePoints: def.upgradePoints + upEarned,
      abilityCreationPoints: def.abilityCreationPoints + acpEarned,
      combatRecord: {
        matchesPlayed: def.combatRecord.matchesPlayed + 1,
        wins: def.combatRecord.wins + (isVictory ? 1 : 0),
        totalDamageDealt:
          def.combatRecord.totalDamageDealt + unit.statsTracker.damageDealt,
        totalHealingDone:
          def.combatRecord.totalHealingDone + unit.statsTracker.healingDone,
      },
      upgradeHistory: [tx, ...def.upgradeHistory].slice(0, 40),
    };

    updatedCharacters[def.id] = updated;
    grants.push({
      definitionId: def.id,
      name: def.name,
      xpGained,
      previousLevel: prevLevel,
      newLevel: nextLevel,
      previousTier: prevTier.id,
      newTier: nextTier.id,
      tierPromoted,
      upgradePointsEarned: upEarned,
      abilityPointsEarned: acpEarned,
    });
  }

  return { grants, updatedCharacters };
}

/**
 * Trains a champion in the Evolution Chamber by spending Oracle Shards for XP,
 * promoting the card through Bronze -> Silver -> Gold -> Diamond -> Legendary Trump Card.
 */
export function trainCharacterWithShards(
  rawCard: CharacterDefinition,
  availableShards: number,
  options?: { shardCost?: number; xpGain?: number }
):
  | {
      ok: true;
      character: CharacterDefinition;
      shardsSpent: number;
      xpGained: number;
      previousLevel: number;
      newLevel: number;
      previousTier: CardTierId;
      newTier: CardTierId;
      tierPromoted: boolean;
    }
  | { ok: false; error: string } {
  const card = normalizeCharacterProgression(rawCard);
  const shardCost = options?.shardCost ?? SHARD_TRAINING_COST;
  const xpGain = options?.xpGain ?? SHARD_TRAINING_XP;

  if (card.level >= MAX_CHARACTER_LEVEL) {
    return {
      ok: false,
      error: `${card.name} is already at Max Level (${MAX_CHARACTER_LEVEL} — Legendary Trump Card).`,
    };
  }

  if (availableShards < shardCost) {
    return {
      ok: false,
      error: `Need ${shardCost} Oracle Shards to train (you have ${availableShards}). Win battles or claim Daily Rewards to earn more Shards.`,
    };
  }

  const prevLevel = card.level;
  const prevTier = getCardTierForLevel(prevLevel);
  const nextXp = card.xp + xpGain;
  let nextLevel = prevLevel;
  let upEarned = 0;
  let acpEarned = 0;

  while (
    nextLevel < MAX_CHARACTER_LEVEL &&
    nextXp >= LEVEL_XP_THRESHOLDS[nextLevel]
  ) {
    nextLevel += 1;
    upEarned += 2;
    if (ABILITY_POINT_MILESTONE_LEVELS.has(nextLevel)) {
      acpEarned += 1;
    }
  }

  const nextTier = getCardTierForLevel(nextLevel);
  const tierPromoted = nextTier.id !== prevTier.id;

  const tx: UpgradeTransaction = {
    id: `tx-train-${Date.now()}-${card.id}`,
    timestamp: new Date().toISOString(),
    kind: 'xp_reward',
    summary: `Shard Training (-${shardCost} Shards): +${xpGain} XP${
      nextLevel > prevLevel
        ? ` (Lv.${prevLevel} → Lv.${nextLevel}, +${upEarned} UP${
            acpEarned > 0 ? `, +${acpEarned} ACP` : ''
          }${tierPromoted ? ` — Promoted to ${nextTier.rankTitle}!` : ''})`
        : ''
    }.`,
  };

  const updated: CharacterDefinition = {
    ...card,
    xp: nextXp,
    level: nextLevel,
    upgradePoints: card.upgradePoints + upEarned,
    abilityCreationPoints: card.abilityCreationPoints + acpEarned,
    upgradeHistory: [tx, ...card.upgradeHistory].slice(0, 40),
  };

  return {
    ok: true,
    character: updated,
    shardsSpent: shardCost,
    xpGained: xpGain,
    previousLevel: prevLevel,
    newLevel: nextLevel,
    previousTier: prevTier.id,
    newTier: nextTier.id,
    tierPromoted,
  };
}

export function applyStatUpgrade(
  rawCard: CharacterDefinition,
  stat: UpgradableStatKey
): { ok: true; character: CharacterDefinition } | { ok: false; error: string } {
  const card = normalizeCharacterProgression(rawCard);

  if (card.upgradePoints < 1) {
    return {
      ok: false,
      error: 'No Upgrade Points available. Win battles to level up and earn Upgrade Points.',
    };
  }

  const currentRank = card.statUpgrades[stat];
  if (currentRank >= MAX_UPGRADES_PER_STAT) {
    return {
      ok: false,
      error: `${STAT_UPGRADE_INCREMENTS[stat].label} is already at maximum upgrade rank (${MAX_UPGRADES_PER_STAT}/${MAX_UPGRADES_PER_STAT}).`,
    };
  }

  const inc = STAT_UPGRADE_INCREMENTS[stat];
  const candidate: CharacterDefinition = {
    ...card,
    upgradePoints: card.upgradePoints - 1,
    statUpgrades: {
      ...card.statUpgrades,
      [stat]: currentRank + 1,
    },
    stats: {
      ...card.stats,
      [stat]: card.stats[stat] + inc.delta,
    },
    upgradeHistory: [
      {
        id: `tx-stat-${Date.now()}-${stat}`,
        timestamp: new Date().toISOString(),
        kind: 'stat_upgrade' as const,
        summary: `Invested 1 Upgrade Point into ${inc.label} (+${inc.delta} ${inc.unit}, Rank ${currentRank + 1}/${MAX_UPGRADES_PER_STAT}).`,
      },
      ...card.upgradeHistory,
    ].slice(0, 40),
  };

  const validation = validateCharacterBalance(candidate);
  if (!validation.valid) {
    return {
      ok: false,
      error:
        validation.issues[0]?.message ||
        'This stat upgrade exceeds the character progression budget for its current level.',
    };
  }

  return { ok: true, character: candidate };
}

/**
 * Unlocks a validated custom ability by spending 1 Ability Creation Point.
 * Automatically equips the ability if slot capacity permits.
 */
export function unlockCustomAbility(
  rawCard: CharacterDefinition,
  ability: AbilityDefinition
): { ok: true; character: CharacterDefinition } | { ok: false; error: string } {
  const card = normalizeCharacterProgression(rawCard);

  if (card.abilityCreationPoints < 1) {
    return {
      ok: false,
      error:
        'You need 1 Ability Creation Point (earned at Levels 2, 4, 6, 8, and 10) to unlock a new ability.',
    };
  }

  if (card.learnedAbilities.some((a) => a.id === ability.id)) {
    return { ok: false, error: 'This ability is already unlocked on this champion.' };
  }

  const nextLearned = [...card.learnedAbilities, ability];
  let nextSpecials = [...card.specialAbilities];
  let nextUltimate = card.ultimateAbility;

  const equippedCount =
    nextSpecials.length + (nextUltimate ? 1 : 0);

  if (ability.category === 'ultimate') {
    // Equip new ultimate automatically (previous remains in learnedAbilities!)
    nextUltimate = ability;
  } else if (
    ability.category === 'special' &&
    equippedCount < card.abilitySlotCapacity
  ) {
    nextSpecials = [...nextSpecials, ability];
  }

  const candidate: CharacterDefinition = {
    ...card,
    abilityCreationPoints: card.abilityCreationPoints - 1,
    specialAbilities: nextSpecials,
    ultimateAbility: nextUltimate,
    learnedAbilities: nextLearned,
    upgradeHistory: [
      {
        id: `tx-ab-${Date.now()}-${ability.id}`,
        timestamp: new Date().toISOString(),
        kind: 'ability_unlocked' as const,
        summary: `Unlocked new ${ability.category} ability "${ability.name}" (1 Ability Creation Point).`,
      },
      ...card.upgradeHistory,
    ].slice(0, 40),
  };

  const validation = validateCharacterBalance(candidate);
  if (!validation.valid) {
    return {
      ok: false,
      error:
        validation.issues[0]?.message ||
        'Unlocked ability failed universal balance validation.',
    };
  }

  return { ok: true, character: candidate };
}

/**
 * Toggles equipping/unequipping a learned ability within the 4-slot battle loadout.
 * Basic Attack and Tactical Guard remain separately available.
 */
export function toggleEquipLearnedAbility(
  rawCard: CharacterDefinition,
  abilityId: string
): { ok: true; character: CharacterDefinition } | { ok: false; error: string } {
  const card = normalizeCharacterProgression(rawCard);
  const target = card.learnedAbilities.find((a) => a.id === abilityId);
  if (!target) {
    return { ok: false, error: 'Ability not found in champion learned library.' };
  }

  if (target.category === 'ultimate') {
    const isCurrentlyEquipped = card.ultimateAbility?.id === abilityId;
    if (isCurrentlyEquipped) {
      // Allow unequipping only if at least 1 special remains equipped
      if (card.specialAbilities.length < 1) {
        return { ok: false, error: 'At least one special ability must remain equipped.' };
      }
      return {
        ok: true,
        character: { ...card, ultimateAbility: null },
      };
    }

    const specialCount = card.specialAbilities.length;
    if (specialCount >= card.abilitySlotCapacity) {
      return {
        ok: false,
        error: `All ${card.abilitySlotCapacity} ability slots are full. Unequip a special ability first.`,
      };
    }
    return {
      ok: true,
      character: { ...card, ultimateAbility: target },
    };
  }

  // Special ability toggle
  const isEquipped = card.specialAbilities.some((a) => a.id === abilityId);
  if (isEquipped) {
    if (card.specialAbilities.length <= 1) {
      return {
        ok: false,
        error: 'Champions must keep at least 1 special ability equipped for combat.',
      };
    }
    return {
      ok: true,
      character: {
        ...card,
        specialAbilities: card.specialAbilities.filter((a) => a.id !== abilityId),
      },
    };
  }

  const equippedCount =
    card.specialAbilities.length + (card.ultimateAbility ? 1 : 0);
  if (equippedCount >= card.abilitySlotCapacity) {
    return {
      ok: false,
      error: `Loadout full (${equippedCount}/${card.abilitySlotCapacity} slots). Unequip an ability before equipping "${target.name}".`,
    };
  }

  return {
    ok: true,
    character: {
      ...card,
      specialAbilities: [...card.specialAbilities, target],
    },
  };
}

/**
 * Evolves a character at Stage 1 (Level 3+) or Stage 2 (Level 5+),
 * preserving immutable ID, original creator attribution, and ranked balance compatibility.
 */
export function evolveCharacter(
  rawCard: CharacterDefinition,
  options: {
    newTitle: string;
    loreNote: string;
  }
): { ok: true; character: CharacterDefinition } | { ok: false; error: string } {
  const card = normalizeCharacterProgression(rawCard);
  const nextStage = (card.evolutionStage + 1) as 1 | 2;

  if (card.evolutionStage >= 2) {
    return { ok: false, error: 'This champion has reached maximum Evolution Stage II.' };
  }

  const req = EVOLUTION_REQUIREMENTS[nextStage];
  if (card.level < req.minLevel) {
    return {
      ok: false,
      error: `Evolution Stage ${nextStage} requires Level ${req.minLevel} (currently Level ${card.level}).`,
    };
  }

  const safeTitle = options.newTitle.trim().slice(0, 56) || card.title;
  const safeLore =
    options.loreNote.trim().slice(0, 220) ||
    `Awakened ${req.label}, expanding tactical mastery without forsaking original identity.`;
  const nowIso = new Date().toISOString();

  const evolved: CharacterDefinition = {
    ...card,
    title: safeTitle,
    rarity: nextStage === 2 ? 'Mythic' : 'Ascendant',
    evolutionStage: nextStage,
    stats: {
      ...card.stats,
      maxHp: card.stats.maxHp + req.hpBonus,
      attack: card.stats.attack + req.atkBonus,
      defense: card.stats.defense + req.defBonus,
    },
    // Permanent identity & creator attribution strictly preserved
    id: card.id,
    originalCreatorId: card.originalCreatorId,
    originalCreatorName: card.originalCreatorName,
    evolutionHistory: [
      ...card.evolutionHistory,
      {
        stage: nextStage,
        title: safeTitle,
        timestamp: nowIso,
        summary: safeLore,
      },
    ],
    upgradeHistory: [
      {
        id: `tx-evo-${Date.now()}-${nextStage}`,
        timestamp: nowIso,
        kind: 'evolution' as const,
        summary: `Evolved to ${req.label} ("${safeTitle}"): +${req.hpBonus} HP, +${req.atkBonus} ATK, +${req.defBonus} DEF.`,
      },
      ...card.upgradeHistory,
    ].slice(0, 40),
  };

  const validation = validateCharacterBalance(evolved);
  if (!validation.valid) {
    return {
      ok: false,
      error:
        validation.issues[0]?.message ||
        'Evolution would exceed ranked battle balance limits.',
    };
  }

  return { ok: true, character: evolved };
}
