import {
  getActiveUnit,
  getLegalAbilities,
  getValidTargets,
} from './engine';
import { AbilityDefinition, BattleAction, BattleState, BattleUnit } from './types';

/**
 * Fair Tactical AI Controller.
 * Used identically for both the Enemy AI and optional Player Auto Battle.
 * Strictly queries getLegalAbilities() and getValidTargets() — zero hidden bonuses.
 */
export function chooseTacticalAction(state: BattleState): BattleAction | null {
  const actor = getActiveUnit(state);
  if (!actor || state.phase !== 'active') return null;

  const legalAbilities = getLegalAbilities(state, actor.instanceId);
  if (legalAbilities.length === 0) return null;

  const allies = state.units.filter((u) => u.alive && u.side === actor.side);
  const enemies = state.units.filter((u) => u.alive && u.side !== actor.side);
  if (enemies.length === 0) return null;

  let bestScore = -Infinity;
  let bestAction: BattleAction | null = null;

  for (const ability of legalAbilities) {
    const validTargets = getValidTargets(state, actor.instanceId, ability.id);
    if (validTargets.length === 0) continue;

    if (
      ability.targetType === 'all_enemies' ||
      ability.targetType === 'all_allies' ||
      ability.targetType === 'self'
    ) {
      const score = scoreAbilityUse(actor, ability, validTargets, allies, enemies);
      if (score > bestScore) {
        bestScore = score;
        bestAction = {
          actorId: actor.instanceId,
          abilityId: ability.id,
          targetIds: validTargets.map((t) => t.instanceId),
        };
      }
    } else {
      for (const target of validTargets) {
        const score = scoreAbilityUse(actor, ability, [target], allies, enemies);
        if (score > bestScore) {
          bestScore = score;
          bestAction = {
            actorId: actor.instanceId,
            abilityId: ability.id,
            targetIds: [target.instanceId],
          };
        }
      }
    }
  }

  return bestAction;
}

function scoreAbilityUse(
  actor: BattleUnit,
  ability: AbilityDefinition,
  targets: BattleUnit[],
  allies: BattleUnit[],
  enemies: BattleUnit[]
): number {
  let score = 0;

  // 1. Offensive scoring
  if (ability.damageMultiplier > 0 || ability.flatDamage > 0) {
    for (const enemy of targets) {
      const approxDmg =
        (actor.attack * ability.damageMultiplier + ability.flatDamage) *
        (100 / (100 + enemy.defense * 0.95));
      const effectivePool = enemy.currentHp + enemy.shield;

      score += approxDmg * 1.1;

      // High priority to eliminate low-HP targets
      if (approxDmg >= effectivePool * 0.92) {
        score += 125;
      } else if (enemy.currentHp / enemy.maxHp < 0.35) {
        score += 42;
      }

      // Focus healers and high-attack casters slightly higher
      if (enemy.role === 'Warden') score += 20;
      if (enemy.role === 'Striker' || enemy.role === 'Arcanist') score += 14;
      if (enemy.statuses.some((s) => s.type === 'vulnerable')) score += 18;
    }

    // AoE scales nicely when multiple enemies are alive
    if (ability.targetType === 'all_enemies' && enemies.length >= 3) {
      score += 24;
    }
  }

  // 2. Healing scoring
  if (ability.healMultiplier > 0 || ability.flatHeal > 0) {
    const estHeal = Math.max(actor.healingPower, 30) * ability.healMultiplier + ability.flatHeal;
    let totalMissingValue = 0;

    for (const ally of targets) {
      const missing = ally.maxHp - ally.currentHp;
      if (missing <= 10) continue;
      const effectiveHeal = Math.min(missing, estHeal);
      const hpRatio = ally.currentHp / ally.maxHp;
      const urgency = hpRatio < 0.35 ? 2.4 : hpRatio < 0.65 ? 1.55 : 0.7;
      totalMissingValue += effectiveHeal * urgency;
    }

    if (totalMissingValue === 0) {
      score -= 80; // Don't waste heal on full-HP allies
    } else {
      score += totalMissingValue;
    }
  }

  // 3. Shield scoring
  if (ability.shieldAmount > 0) {
    for (const ally of targets) {
      const hpRatio = ally.currentHp / ally.maxHp;
      const needsShield = ally.shield < 30 ? 1.2 : 0.45;
      const urgency = hpRatio < 0.5 ? 1.5 : 1.0;
      score += ability.shieldAmount * 0.85 * needsShield * urgency;
    }
  }

  // 4. Status & Utility scoring
  for (const status of ability.statuses) {
    for (const t of targets) {
      const alreadyHas = t.statuses.some((s) => s.type === status.type);
      if (alreadyHas) continue;

      if (status.type === 'stun') {
        score += t.role === 'Striker' || t.role === 'Warden' ? 68 : 50;
      } else if (status.type === 'vulnerable' || status.type === 'weaken') {
        score += 32;
      } else if (status.type === 'burn' || status.type === 'bleed') {
        score += (status.potency ?? 20) * status.duration * 0.75;
      } else if (status.type === 'empower' || status.type === 'haste') {
        score += t.role === 'Striker' || t.role === 'Arcanist' ? 48 : 30;
      } else if (status.type === 'fortify') {
        score += 24;
      }
    }
  }

  if (ability.cooldownReduction > 0) {
    for (const t of targets) {
      const activeCds = Object.values(t.cooldowns).filter((v) => v > 0).length;
      score += activeCds * 28;
    }
  }

  if (ability.energyGain > 0 && ability.category === 'special') {
    for (const t of targets) {
      if (t.currentEnergy < 65) score += 22;
    }
  }

  // 5. Guard tactical evaluation
  if (ability.category === 'guard') {
    const hpRatio = actor.currentHp / actor.maxHp;
    if (hpRatio < 0.35 && actor.shield < 20) {
      score += 55;
    } else if (actor.currentEnergy < 30 && allies.length >= 2) {
      score += 18;
    } else {
      score -= 12; // Prefer proactive pressure when healthy
    }
  }

  // Mild preference for ultimates & specials over basic attack when situationally good
  if (ability.category === 'ultimate') score += 16;
  if (ability.category === 'special') score += 8;

  return score;
}
