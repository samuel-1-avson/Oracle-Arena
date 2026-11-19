import {
  AbilityDefinition,
  CharacterDefinition,
  CharacterDefinitionSchema,
} from './types';

export interface BalanceValidationIssue {
  field: string;
  severity: 'error' | 'warning';
  message: string;
  suggestion?: string;
}

export interface BalanceValidationResult {
  valid: boolean;
  statBudgetUsed: number;
  statBudgetCap: number;
  abilityBudgets: Record<string, { computed: number; cap: number }>;
  issues: BalanceValidationIssue[];
}

export const STAT_BUDGET_CAP_BASE = 620;

export const ABILITY_BUDGET_CAPS: Record<AbilityDefinition['category'], number> = {
  basic: 48,
  guard: 48,
  special: 96,
  ultimate: 145,
};

/**
 * Deterministic Ability Compiler & Power-Budget Calculator.
 * Translates structured ability fields into a transparent balance score.
 * Never executes dynamic code.
 */
export function computeAbilityPowerBudget(ability: AbilityDefinition): number {
  const isAoe =
    ability.targetType === 'all_enemies' || ability.targetType === 'all_allies';
  const targetFactor = isAoe ? 2.15 : 1.0;

  let score = 0;

  // Offensive contribution
  score += ability.damageMultiplier * 32 * targetFactor;
  score += ability.flatDamage * 0.42 * targetFactor;

  // Healing & Shield contribution
  score += ability.healMultiplier * 30 * targetFactor;
  score += ability.flatHeal * 0.36 * targetFactor;
  score += ability.shieldAmount * 0.38 * targetFactor;

  // Utility contribution
  score += ability.energyGain * 0.55;
  score += ability.cooldownReduction * 18 * (isAoe ? 1.5 : 1);

  // Status effects contribution
  for (const status of ability.statuses) {
    const chanceWeight = status.chance ?? 1;
    let statusWeight = 10;
    if (status.type === 'stun') {
      statusWeight = 28;
    } else if (status.type === 'burn' || status.type === 'bleed') {
      statusWeight = 8 + (status.potency ?? 20) * 0.35;
    } else if (status.type === 'vulnerable' || status.type === 'weaken') {
      statusWeight = 12;
    } else if (status.type === 'fortify' || status.type === 'empower' || status.type === 'haste') {
      statusWeight = 11;
    } else if (status.type === 'guarding') {
      statusWeight = 14;
    }
    score += statusWeight * status.duration * chanceWeight * (isAoe ? 1.45 : 1);
  }

  // Cost & Cooldown discounts (expensive abilities with cooldowns can be stronger)
  const energyDiscount = ability.energyCost * 0.52;
  const cooldownDiscount = ability.cooldown * 6.5;

  return Math.max(0, Math.round(score - energyDiscount - cooldownDiscount));
}

export function computeCharacterStatBudget(character: CharacterDefinition): number {
  const s = character.stats;
  // Weighted stat formula reflecting combat impact in 5v5
  return Math.round(
    s.maxHp * 0.55 +
      s.attack * 2.1 +
      s.defense * 1.9 +
      s.speed * 1.45 +
      s.healingPower * 1.15
  );
}

/**
 * Validates both schema compliance and universal balance rules.
 * Every Oracle profile and starter card obeys the exact same limits.
 */
export function validateCharacterBalance(
  character: CharacterDefinition
): BalanceValidationResult {
  const issues: BalanceValidationIssue[] = [];
  const parsed = CharacterDefinitionSchema.safeParse(character);
  if (!parsed.success) {
    for (const err of parsed.error.issues) {
      issues.push({
        field: err.path.join('.'),
        severity: 'error',
        message: err.message,
      });
    }
  }

  const statBudgetUsed = computeCharacterStatBudget(character);
  const evolutionStage = character.evolutionStage ?? 0;
  const statBudgetCap =
    STAT_BUDGET_CAP_BASE +
    (character.level - 1) * 32 +
    evolutionStage * 26;

  if (statBudgetUsed > statBudgetCap) {
    issues.push({
      field: 'stats',
      severity: 'error',
      message: `Character stat budget (${statBudgetUsed}) exceeds the universal cap (${statBudgetCap}) for Level ${character.level}.`,
      suggestion:
        'Reduce Health, Attack, Defense, or Speed slightly to remain eligible for balanced 5v5 play.',
    });
  }

  const allAbilities: AbilityDefinition[] = [
    character.basicAttack,
    ...character.specialAbilities,
    ...(character.ultimateAbility ? [character.ultimateAbility] : []),
  ];

  const abilityBudgets: Record<string, { computed: number; cap: number }> = {};
  const levelAbilityBonus = Math.min(24, (character.level - 1) * 4);

  for (const ability of allAbilities) {
    const computed = computeAbilityPowerBudget(ability);
    const cap =
      ABILITY_BUDGET_CAPS[ability.category] +
      (ability.category === 'special' || ability.category === 'ultimate'
        ? levelAbilityBonus
        : 0);
    abilityBudgets[ability.id] = { computed, cap };

    if (computed > cap) {
      issues.push({
        field: `ability.${ability.id}`,
        severity: 'error',
        message: `"${ability.name}" exceeds the ${ability.category} ability budget (${computed}/${cap}).`,
        suggestion:
          'Reduce its damage or multi-target multiplier, increase its energy cost, or add a longer cooldown.',
      });
    }

    if (ability.category === 'ultimate' && ability.energyCost < 55) {
      issues.push({
        field: `ability.${ability.id}.energyCost`,
        severity: 'error',
        message: `Ultimate "${ability.name}" must cost at least 55 Energy.`,
        suggestion: 'Increase energy cost to 60 or higher.',
      });
    }
  }

  return {
    valid: issues.every((i) => i.severity !== 'error'),
    statBudgetUsed,
    statBudgetCap,
    abilityBudgets,
    issues,
  };
}
