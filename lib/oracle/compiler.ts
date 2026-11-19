import { z } from 'zod';
import {
  ABILITY_BUDGET_CAPS,
  BalanceValidationResult,
  computeAbilityPowerBudget,
  computeCharacterStatBudget,
  STAT_BUDGET_CAP_BASE,
  validateCharacterBalance,
} from '../game/balance';
import {
  AbilityCategory,
  AbilityDefinition,
  CharacterDefinition,
  CombatRoleSchema,
  CONTENT_SCHEMA_VERSION,
  ElementAffinitySchema,
  OracleProfile,
  RULESET_VERSION,
  StatusEffectTypeSchema,
  TargetTypeSchema,
} from '../game/types';
import { pickDefaultArtworkForElement } from './profiles';

export const RawOracleStatusSchema = z.object({
  type: StatusEffectTypeSchema,
  duration: z.number().min(1).max(5).default(2),
  potency: z.number().min(0).max(100).optional(),
  chance: z.number().min(0.1).max(1).default(1),
});

export const RawOracleAbilitySchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(4).max(600),
  targetType: TargetTypeSchema,
  damageMultiplier: z.number().min(0).max(5.0).default(0),
  flatDamage: z.number().min(0).max(250).default(0),
  healMultiplier: z.number().min(0).max(4.0).default(0),
  flatHeal: z.number().min(0).max(250).default(0),
  shieldAmount: z.number().min(0).max(300).default(0),
  energyCost: z.number().min(0).max(120).default(0),
  energyGain: z.number().min(0).max(60).default(0),
  cooldown: z.number().min(0).max(8).default(0),
  cooldownReduction: z.number().min(0).max(4).default(0),
  statuses: z.array(RawOracleStatusSchema).max(4).default([]),
  visualEffect: z.string().min(2).max(400).default('Arcane energy erupts across the target.'),
});

export const RawOracleDraftSchema = z.object({
  name: z.string().min(2).max(100),
  title: z.string().min(2).max(120),
  role: CombatRoleSchema,
  element: ElementAffinitySchema,
  appearance: z.string().min(6).max(800),
  backstory: z.string().min(6).max(1000),
  personality: z.string().min(4).max(400),
  strengths: z.array(z.string().min(2).max(160)).min(1).max(6),
  weaknesses: z.array(z.string().min(2).max(160)).min(1).max(6),
  stats: z.object({
    maxHp: z.number().min(150).max(600),
    attack: z.number().min(20).max(150),
    defense: z.number().min(15).max(120),
    speed: z.number().min(40).max(150),
    startingEnergy: z.number().min(10).max(80).default(40),
    healingPower: z.number().min(0).max(150).default(0),
  }),
  basicAttack: RawOracleAbilitySchema,
  specialAbilities: z.array(RawOracleAbilitySchema).min(2).max(3),
  ultimateAbility: RawOracleAbilitySchema,
  clarifyingQuestions: z.array(z.string().min(4).max(320)).max(4).default([]),
  oracleCommentary: z.string().min(4).max(600).default('Balanced for Level 1 5v5 arena combat.'),
});

export type RawOracleDraft = z.infer<typeof RawOracleDraftSchema>;

export interface BalanceAdjustmentNote {
  scope: 'stats' | 'ability';
  label: string;
  explanation: string;
}

export interface OriginalityReport {
  similarityPercent: number;
  closestMatchName: string | null;
  status: 'distinct' | 'similar' | 'near_duplicate';
  note: string;
}

export interface CompiledOracleResult {
  character: CharacterDefinition;
  validation: BalanceValidationResult;
  adjustments: BalanceAdjustmentNote[];
  clarifyingQuestions: string[];
  oracleCommentary: string;
  originality: OriginalityReport;
}

function sanitizeText(text: string, maxLen: number): string {
  return text
    .replace(/[<>{}`$]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function slugifyId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return base || 'champion';
}

function clampNum(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Deterministically compiles and balances a single ability against ABILITY_BUDGET_CAPS.
 * If an AI-drafted power exceeds its category budget, scales multipliers/potency
 * or raises energy/cooldown and emits an explicit player-facing explanation.
 */
function compileAndBalanceAbility(
  raw: z.infer<typeof RawOracleAbilitySchema>,
  category: AbilityCategory,
  idPrefix: string,
  adjustments: BalanceAdjustmentNote[]
): AbilityDefinition {
  const name = sanitizeText(raw.name, 48) || 'Arcane Strike';
  const description = sanitizeText(raw.description, 240);
  const visualEffect = sanitizeText(raw.visualEffect, 140);

  // Enforce category baseline rules
  let energyCost = Math.round(clampNum(raw.energyCost, 0, 100));
  let cooldown = Math.round(clampNum(raw.cooldown, 0, 5));
  let energyGain = Math.round(clampNum(raw.energyGain, 0, 35));
  let damageMultiplier = Number(clampNum(raw.damageMultiplier, 0, 2.3).toFixed(2));
  let flatDamage = Math.round(clampNum(raw.flatDamage, 0, 60));
  let healMultiplier = Number(clampNum(raw.healMultiplier, 0, 1.7).toFixed(2));
  let flatHeal = Math.round(clampNum(raw.flatHeal, 0, 80));
  let shieldAmount = Math.round(clampNum(raw.shieldAmount, 0, 120));
  let cooldownReduction = Math.round(clampNum(raw.cooldownReduction, 0, 1));
  let targetType = raw.targetType;

  if (category === 'basic') {
    energyCost = 0;
    cooldown = 0;
    energyGain = clampNum(energyGain || 18, 12, 20);
    targetType = 'single_enemy';
    damageMultiplier = clampNum(damageMultiplier || 1.0, 0.85, 1.08);
    flatDamage = clampNum(flatDamage, 0, 12);
    healMultiplier = 0;
    flatHeal = 0;
    shieldAmount = 0;
    cooldownReduction = 0;
  } else if (category === 'special') {
    energyCost = clampNum(energyCost || 32, 20, 50);
    cooldown = clampNum(cooldown || 2, 1, 4);
  } else if (category === 'ultimate') {
    energyCost = clampNum(energyCost || 68, 58, 85);
    cooldown = clampNum(cooldown || 4, 3, 5);
  }

  const statuses =
    category === 'basic'
      ? []
      : raw.statuses.slice(0, 2).map((s) => ({
          type: s.type,
          duration: Math.round(clampNum(s.duration, 1, s.type === 'stun' ? 1 : 2)),
          potency:
            s.type === 'burn' || s.type === 'bleed'
              ? Math.round(clampNum(s.potency ?? 20, 12, 26))
              : s.type === 'fortify' || s.type === 'vulnerable'
                ? 25
                : s.type === 'weaken' || s.type === 'empower'
                  ? 20
                  : s.type === 'haste'
                    ? 18
                    : 1,
          chance: Number(
            clampNum(
              s.type === 'stun' ? Math.min(s.chance ?? 0.75, 0.8) : s.chance ?? 1,
              0.3,
              1
            ).toFixed(2)
          ),
        }));

  const ability: AbilityDefinition = {
    id: `${idPrefix}-${slugifyId(name)}`,
    name,
    description,
    category,
    targetType,
    damageMultiplier,
    flatDamage,
    healMultiplier,
    flatHeal,
    shieldAmount,
    energyCost,
    energyGain,
    cooldown,
    cooldownReduction,
    statuses,
    prerequisites: { minLevel: 1 },
    rulesetVersion: RULESET_VERSION,
    visualEffect,
    powerBudgetCost: 0,
  };

  const cap = ABILITY_BUDGET_CAPS[category];
  const initialBudget = computeAbilityPowerBudget(ability);

  if (initialBudget > cap) {
    // Deterministically tune down until strictly <= cap
    let guard = 0;
    while (computeAbilityPowerBudget(ability) > cap && guard < 24) {
      guard += 1;
      if (category !== 'basic' && ability.energyCost < (category === 'ultimate' ? 85 : 52)) {
        ability.energyCost = Math.min(category === 'ultimate' ? 85 : 52, ability.energyCost + 4);
      }
      if (category !== 'basic' && ability.cooldown < (category === 'ultimate' ? 5 : 4)) {
        ability.cooldown += 1;
      }
      if (ability.damageMultiplier > 0.5) {
        ability.damageMultiplier = Number((ability.damageMultiplier * 0.91).toFixed(2));
      }
      if (ability.flatDamage > 6) {
        ability.flatDamage = Math.floor(ability.flatDamage * 0.85);
      }
      if (ability.healMultiplier > 0.4) {
        ability.healMultiplier = Number((ability.healMultiplier * 0.91).toFixed(2));
      }
      if (ability.flatHeal > 8) {
        ability.flatHeal = Math.floor(ability.flatHeal * 0.85);
      }
      if (ability.shieldAmount > 20) {
        ability.shieldAmount = Math.floor(ability.shieldAmount * 0.88);
      }
      if (guard > 12 && ability.statuses.length > 1) {
        ability.statuses = ability.statuses.slice(0, 1);
      }
    }

    const finalBudget = computeAbilityPowerBudget(ability);
    adjustments.push({
      scope: 'ability',
      label: ability.name,
      explanation: `"${ability.name}" exceeded the ${category} ability budget (${initialBudget}/${cap}). The Balance Compiler scaled its output/cost to ${finalBudget}/${cap} (${ability.energyCost} EN, ${ability.cooldown}t CD) for fair 5v5 play.`,
    });
  }

  ability.powerBudgetCost = computeAbilityPowerBudget(ability);
  return ability;
}

export interface CompiledSingleAbilityResult {
  ability: AbilityDefinition;
  budgetUsed: number;
  budgetCap: number;
  adjusted: boolean;
  explanation: string;
}

/**
 * Compiles and validates a single newly invented player ability (Phase 3).
 * Respects universal ability budget caps (with modest level scaling).
 */
export function compileSingleOracleAbility(
  rawInput: unknown,
  options: {
    category: 'special' | 'ultimate';
    characterId: string;
    characterLevel: number;
    uniqueSuffix?: string;
  }
): CompiledSingleAbilityResult {
  const parsed = RawOracleAbilitySchema.parse(rawInput);
  const adjustments: BalanceAdjustmentNote[] = [];
  const suffix =
    options.uniqueSuffix ?? Math.random().toString(36).slice(2, 7);
  const ability = compileAndBalanceAbility(
    parsed,
    options.category,
    `${options.characterId}-custom-${suffix}`,
    adjustments
  );

  const levelBonus = Math.min(24, Math.max(0, options.characterLevel - 1) * 4);
  const budgetCap = ABILITY_BUDGET_CAPS[options.category] + levelBonus;
  const budgetUsed = computeAbilityPowerBudget(ability);

  return {
    ability,
    budgetUsed,
    budgetCap,
    adjusted: adjustments.length > 0,
    explanation:
      adjustments[0]?.explanation ??
      `"${ability.name}" fits cleanly within your character's ${options.category} ability budget (${budgetUsed}/${budgetCap}).`,
  };
}

/**
 * Checks similarity against the local arena collection to discourage direct copies.
 * Explicitly scopes its statement to the local roster without claiming global IP uniqueness.
 */
export function checkOriginality(
  candidate: Pick<CharacterDefinition, 'name' | 'title' | 'role' | 'element' | 'backstory'>,
  existingRoster: CharacterDefinition[]
): OriginalityReport {
  if (existingRoster.length === 0) {
    return {
      similarityPercent: 0,
      closestMatchName: null,
      status: 'distinct',
      note: 'Distinct against all cards currently in your arena collection.',
    };
  }

  const normTokens = (str: string) =>
    new Set(
      str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3)
    );

  const candName = candidate.name.toLowerCase().trim();
  const candTokens = normTokens(
    `${candidate.name} ${candidate.title} ${candidate.backstory}`
  );

  let highestScore = 0;
  let closestName: string | null = null;

  for (const existing of existingRoster) {
    let score = 0;
    const existName = existing.name.toLowerCase().trim();

    if (candName === existName) {
      score += 65;
    } else if (candName.includes(existName) || existName.includes(candName)) {
      score += 38;
    }

    if (candidate.role === existing.role) score += 14;
    if (candidate.element === existing.element) score += 14;

    const existTokens = normTokens(
      `${existing.name} ${existing.title} ${existing.backstory}`
    );
    let overlap = 0;
    for (const token of candTokens) {
      if (existTokens.has(token)) overlap += 1;
    }
    const union = Math.max(1, candTokens.size + existTokens.size - overlap);
    score += Math.round((overlap / union) * 40);

    const clamped = Math.min(100, score);
    if (clamped > highestScore) {
      highestScore = clamped;
      closestName = existing.name;
    }
  }

  if (highestScore >= 68) {
    return {
      similarityPercent: highestScore,
      closestMatchName: closestName,
      status: 'near_duplicate',
      note: `High overlap with "${closestName}" in your local collection. Consider refining the name, backstory, or element to make this champion more original.`,
    };
  }

  if (highestScore >= 42) {
    return {
      similarityPercent: highestScore,
      closestMatchName: closestName,
      status: 'similar',
      note: `Moderate tactical overlap with "${closestName}" (${highestScore}%). Checked against your current arena collection only.`,
    };
  }

  return {
    similarityPercent: highestScore,
    closestMatchName: closestName,
    status: 'distinct',
    note: `Distinct concept (${highestScore}% max overlap with local roster). Originality checks apply only to cards registered in this arena.`,
  };
}

export function compileOracleDraft(
  rawInput: unknown,
  options: {
    oracleProfile: OracleProfile;
    creatorId: string;
    creatorName: string;
    artworkUrl?: string;
    existingRoster: CharacterDefinition[];
    nowIso?: string;
    uniqueSuffix?: string;
  }
): CompiledOracleResult {
  const parsed = RawOracleDraftSchema.parse(rawInput);
  const adjustments: BalanceAdjustmentNote[] = [];

  const safeName = sanitizeText(parsed.name, 42) || 'Unnamed Champion';
  const safeTitle = sanitizeText(parsed.title, 56) || 'Oracle Creation';
  const suffix =
    options.uniqueSuffix ?? Math.random().toString(36).slice(2, 8);
  const cardId = `chr-custom-${slugifyId(safeName)}-${suffix}`;
  const nowIso = options.nowIso ?? new Date().toISOString();

  // Clamp and normalize stats to universal Level 1 stat budget cap (620)
  const stats = {
    maxHp: Math.round(clampNum(parsed.stats.maxHp, 210, 420)),
    attack: Math.round(clampNum(parsed.stats.attack, 38, 105)),
    defense: Math.round(clampNum(parsed.stats.defense, 28, 84)),
    speed: Math.round(clampNum(parsed.stats.speed, 58, 120)),
    maxEnergy: 100,
    startingEnergy: Math.round(clampNum(parsed.stats.startingEnergy ?? 40, 30, 50)),
    healingPower: Math.round(clampNum(parsed.stats.healingPower ?? 0, 0, 98)),
  };

  const statProbe = { stats } as CharacterDefinition;
  const rawStatBudget = computeCharacterStatBudget(statProbe);
  if (rawStatBudget > STAT_BUDGET_CAP_BASE) {
    const scale = (STAT_BUDGET_CAP_BASE - 8) / rawStatBudget;
    stats.maxHp = Math.max(210, Math.round(stats.maxHp * scale));
    stats.attack = Math.max(38, Math.round(stats.attack * scale));
    stats.defense = Math.max(28, Math.round(stats.defense * scale));
    stats.speed = Math.max(58, Math.round(stats.speed * scale));
    if (stats.healingPower > 0) {
      stats.healingPower = Math.max(15, Math.round(stats.healingPower * scale));
    }

    // Final safety shave if rounding nudged over cap
    let guard = 0;
    while (
      computeCharacterStatBudget({ stats } as CharacterDefinition) >
        STAT_BUDGET_CAP_BASE &&
      guard < 20
    ) {
      guard += 1;
      if (stats.maxHp > 220) stats.maxHp -= 10;
      else if (stats.attack > 40) stats.attack -= 2;
      else if (stats.defense > 30) stats.defense -= 2;
      else if (stats.speed > 60) stats.speed -= 2;
    }

    const newBudget = computeCharacterStatBudget({ stats } as CharacterDefinition);
    adjustments.push({
      scope: 'stats',
      label: 'Base Attributes',
      explanation: `Proposed stats (${rawStatBudget}) exceeded the universal Level 1 budget (${STAT_BUDGET_CAP_BASE}). Attributes were proportionally balanced to ${newBudget}/${STAT_BUDGET_CAP_BASE}.`,
    });
  }

  const basicAttack = compileAndBalanceAbility(
    parsed.basicAttack,
    'basic',
    `${cardId}-b`,
    adjustments
  );
  const specialAbilities = parsed.specialAbilities
    .slice(0, 2)
    .map((ab, i) =>
      compileAndBalanceAbility(ab, 'special', `${cardId}-s${i + 1}`, adjustments)
    );
  const ultimateAbility = compileAndBalanceAbility(
    parsed.ultimateAbility,
    'ultimate',
    `${cardId}-u`,
    adjustments
  );

  const character: CharacterDefinition = {
    id: cardId,
    name: safeName,
    title: safeTitle,
    originalCreatorId: options.creatorId,
    originalCreatorName: sanitizeText(options.creatorName, 36) || 'Arena Architect',
    currentOwnerId: options.creatorId,
    oracleProfile: options.oracleProfile,
    appearance: sanitizeText(parsed.appearance, 360),
    artworkUrl: options.artworkUrl || pickDefaultArtworkForElement(parsed.element),
    backstory: sanitizeText(parsed.backstory, 480),
    personality: sanitizeText(parsed.personality, 180),
    role: parsed.role,
    element: parsed.element,
    rarity: 'Ascendant',
    level: 1,
    xp: 0,
    upgradePoints: 0,
    abilityCreationPoints: 0,
    evolutionStage: 0,
    statUpgrades: {
      maxHp: 0,
      attack: 0,
      defense: 0,
      speed: 0,
      healingPower: 0,
    },
    stats,
    strengths: parsed.strengths.slice(0, 4).map((s) => sanitizeText(s, 80)),
    weaknesses: parsed.weaknesses.slice(0, 4).map((w) => sanitizeText(w, 80)),
    basicAttack,
    specialAbilities,
    ultimateAbility,
    learnedAbilities: [...specialAbilities, ultimateAbility],
    abilitySlotCapacity: 4,
    evolutionHistory: [
      {
        stage: 0,
        title: `Forged via ${options.oracleProfile}`,
        timestamp: nowIso,
        summary: `Created by ${sanitizeText(options.creatorName, 36) || 'Arena Architect'} and validated under Ruleset ${RULESET_VERSION}.`,
      },
    ],
    upgradeHistory: [],
    combatRecord: {
      matchesPlayed: 0,
      wins: 0,
      totalDamageDealt: 0,
      totalHealingDone: 0,
    },
    ownershipHistory: [
      {
        fromUserId: null,
        toUserId: options.creatorId,
        timestamp: nowIso,
        reason: 'genesis',
      },
    ],
    rulesetVersion: RULESET_VERSION,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
  };

  const validation = validateCharacterBalance(character);
  const originality = checkOriginality(character, options.existingRoster);

  return {
    character,
    validation,
    adjustments,
    clarifyingQuestions: parsed.clarifyingQuestions
      .slice(0, 3)
      .map((q) => sanitizeText(q, 180)),
    oracleCommentary: sanitizeText(parsed.oracleCommentary, 320),
    originality,
  };
}
