import { CombatRole, ElementAffinity } from './types';

/**
 * Soft Elemental Resonance Rings (all 8 Oracle Arena elements):
 * - Cosmic Ring: Solar -> Void -> Aether -> Cyber -> Solar
 * - Primal Ring: Ember -> Frost -> Storm -> Iron -> Ember
 *
 * Advantage grants +12% damage ("Resonant"), disadvantage applies -6% ("Dampened"),
 * rewarding tactical target selection without harsh rock-paper-scissors lockouts.
 */
export const ELEMENTAL_COUNTER_MAP: Record<ElementAffinity, ElementAffinity> = {
  Solar: 'Void',
  Void: 'Aether',
  Aether: 'Cyber',
  Cyber: 'Solar',
  Ember: 'Frost',
  Frost: 'Storm',
  Storm: 'Iron',
  Iron: 'Ember',
};

export interface ElementalMatchupResult {
  relation: 'advantage' | 'disadvantage' | 'neutral';
  multiplier: number;
  label: string;
}

export function getElementalMatchup(
  attacker: ElementAffinity,
  defender: ElementAffinity
): ElementalMatchupResult {
  if (ELEMENTAL_COUNTER_MAP[attacker] === defender) {
    return {
      relation: 'advantage',
      multiplier: 1.12,
      label: 'Resonant (+12%)',
    };
  }
  if (ELEMENTAL_COUNTER_MAP[defender] === attacker) {
    return {
      relation: 'disadvantage',
      multiplier: 0.94,
      label: 'Dampened (-6%)',
    };
  }
  return {
    relation: 'neutral',
    multiplier: 1.0,
    label: 'Neutral',
  };
}

export interface ActiveSquadSynergy {
  id: string;
  name: string;
  kind: 'elemental' | 'formation';
  element?: ElementAffinity;
  count: number;
  description: string;
  attackPct: number;
  defensePct: number;
  speedFlat: number;
  healingPct: number;
}

export interface SquadSynergyProfile {
  synergies: ActiveSquadSynergy[];
  totalAttackPct: number;
  totalDefensePct: number;
  totalSpeedFlat: number;
  totalHealingPct: number;
}

const ELEMENT_RESONANCE_DEFINITIONS: Record<
  ElementAffinity,
  {
    name: string;
    description: string;
    attackPct: number;
    defensePct: number;
    speedFlat: number;
    healingPct: number;
  }
> = {
  Solar: {
    name: 'Solar Phalanx',
    description: '+8% Defense & +10% Healing Power',
    attackPct: 0,
    defensePct: 8,
    speedFlat: 0,
    healingPct: 10,
  },
  Void: {
    name: 'Void Convergence',
    description: '+9% Attack Power',
    attackPct: 9,
    defensePct: 0,
    speedFlat: 0,
    healingPct: 0,
  },
  Storm: {
    name: 'Tempest Velocity',
    description: '+5 Speed & +4% Attack Power',
    attackPct: 4,
    defensePct: 0,
    speedFlat: 5,
    healingPct: 0,
  },
  Aether: {
    name: 'Aether Conduit',
    description: '+14% Healing Power & +4% Defense',
    attackPct: 0,
    defensePct: 4,
    speedFlat: 0,
    healingPct: 14,
  },
  Cyber: {
    name: 'Neural Mesh',
    description: '+4 Speed & +5% Attack Power',
    attackPct: 5,
    defensePct: 0,
    speedFlat: 4,
    healingPct: 0,
  },
  Iron: {
    name: 'Iron Bastion',
    description: '+11% Defense',
    attackPct: 0,
    defensePct: 11,
    speedFlat: 0,
    healingPct: 0,
  },
  Ember: {
    name: 'Pyroclasm Pact',
    description: '+9% Attack Power',
    attackPct: 9,
    defensePct: 0,
    speedFlat: 0,
    healingPct: 0,
  },
  Frost: {
    name: 'Glacial Ward',
    description: '+8% Defense & +8% Healing Power',
    attackPct: 0,
    defensePct: 8,
    speedFlat: 0,
    healingPct: 8,
  },
};

/**
 * Evaluates active Role Formation and Elemental Resonance bonuses for a 5-champion squad.
 */
export function computeSquadSynergies(
  squad: Array<{ role: CombatRole; element: ElementAffinity }>
): SquadSynergyProfile {
  const synergies: ActiveSquadSynergy[] = [];
  if (squad.length === 0) {
    return {
      synergies,
      totalAttackPct: 0,
      totalDefensePct: 0,
      totalSpeedFlat: 0,
      totalHealingPct: 0,
    };
  }

  // 1. Role Formation Bonuses
  const distinctRoles = new Set(squad.map((c) => c.role)).size;
  if (distinctRoles >= 5) {
    synergies.push({
      id: 'formation-full-spectrum',
      name: 'Full-Spectrum Formation',
      kind: 'formation',
      count: distinctRoles,
      description: 'All 5 roles deployed: +6% Attack & +6% Defense',
      attackPct: 6,
      defensePct: 6,
      speedFlat: 0,
      healingPct: 0,
    });
  } else if (distinctRoles >= 3) {
    synergies.push({
      id: 'formation-triad',
      name: 'Tactical Triad',
      kind: 'formation',
      count: distinctRoles,
      description: `${distinctRoles} distinct roles: +3% Attack & +3% Defense`,
      attackPct: 3,
      defensePct: 3,
      speedFlat: 0,
      healingPct: 0,
    });
  }

  // 2. Elemental Resonance Pairs (2+ champions sharing an element)
  const elementCounts = new Map<ElementAffinity, number>();
  for (const unit of squad) {
    elementCounts.set(unit.element, (elementCounts.get(unit.element) ?? 0) + 1);
  }

  for (const [element, count] of elementCounts.entries()) {
    if (count >= 2) {
      const def = ELEMENT_RESONANCE_DEFINITIONS[element];
      const tierMult = count >= 3 ? 1.5 : 1;
      const attackPct = Math.round(def.attackPct * tierMult);
      const defensePct = Math.round(def.defensePct * tierMult);
      const speedFlat = Math.round(def.speedFlat * tierMult);
      const healingPct = Math.round(def.healingPct * tierMult);

      synergies.push({
        id: `resonance-${element.toLowerCase()}`,
        name: count >= 3 ? `${def.name} II` : def.name,
        kind: 'elemental',
        element,
        count,
        description: `${count}× ${element}: ${def.description}${
          count >= 3 ? ' (1.5× Amplified)' : ''
        }`,
        attackPct,
        defensePct,
        speedFlat,
        healingPct,
      });
    }
  }

  const totalAttackPct = synergies.reduce((s, x) => s + x.attackPct, 0);
  const totalDefensePct = synergies.reduce((s, x) => s + x.defensePct, 0);
  const totalSpeedFlat = synergies.reduce((s, x) => s + x.speedFlat, 0);
  const totalHealingPct = synergies.reduce((s, x) => s + x.healingPct, 0);

  return {
    synergies,
    totalAttackPct,
    totalDefensePct,
    totalSpeedFlat,
    totalHealingPct,
  };
}
