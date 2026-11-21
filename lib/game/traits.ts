import {
  computeAbilityPowerBudget,
  computeCharacterStatBudget,
  validateCharacterBalance,
} from './balance';
import {
  AbilityDefinition,
  CharacterDefinition,
  CombatRole,
  CONTENT_SCHEMA_VERSION,
  ElementAffinity,
  RULESET_VERSION,
  StatusApplication,
} from './types';

export type TraitId =
  | 'super_strength'
  | 'titan_blood'
  | 'armor_pierce'
  | 'heavy_impact'
  | 'shadow_step'
  | 'lightning_reflex'
  | 'true_sight'
  | 'phase_blink'
  | 'telekinesis'
  | 'ember_surge'
  | 'frost_barrier'
  | 'storm_surge'
  | 'venom_fangs'
  | 'venom_immunity'
  | 'iron_hide'
  | 'healing_aura';

export type TraitBranch = 'might' | 'agility' | 'arcane' | 'resilience';

export type UltimateTreeId =
  | 'meteor_breaker'
  | 'venom_cataclysm'
  | 'psychic_singularity'
  | 'phantom_barrage'
  | 'aegis_sanctuary'
  | 'solar_nova';

export interface TraitDefinition {
  id: TraitId;
  name: string;
  branch: TraitBranch;
  tier: 1 | 2;
  shortDesc: string;
  proLabel: string;
  conLabel: string;
  /** Plain-English tag for what this trait automatically counters in Blind Clash */
  countersTraitId?: TraitId;
  countersLabel?: string;
  statDeltas: {
    maxHp: number;
    attack: number;
    defense: number;
    speed: number;
    healingPower: number;
  };
  /** Visual flavor & combat keywords */
  combatEffect: {
    status?: StatusApplication;
    bonusFlatDamage?: number;
    bonusShield?: number;
    bonusHeal?: number;
  };
}

export interface UltimateTreeDefinition {
  id: UltimateTreeId;
  name: string;
  shortDesc: string;
  proLabel: string;
  conLabel: string;
  preferredElement: ElementAffinity;
  ability: AbilityDefinition;
}

export const MAX_CORE_TRAITS = 4;

export const TRAIT_BRANCH_META: Record<
  TraitBranch,
  {
    id: TraitBranch;
    name: string;
    subtitle: string;
    accentText: string;
    accentBg: string;
    accentBorder: string;
  }
> = {
  might: {
    id: 'might',
    name: 'Might & Force',
    subtitle: 'Heavy hits & armor crushing',
    accentText: 'text-rose-300',
    accentBg: 'bg-rose-500/12',
    accentBorder: 'border-rose-400/40',
  },
  agility: {
    id: 'agility',
    name: 'Speed & Stealth',
    subtitle: 'First strikes & keen senses',
    accentText: 'text-amber-300',
    accentBg: 'bg-amber-500/12',
    accentBorder: 'border-amber-400/40',
  },
  arcane: {
    id: 'arcane',
    name: 'Mind & Elements',
    subtitle: 'Telekinesis, fire, ice & storms',
    accentText: 'text-violet-300',
    accentBg: 'bg-violet-500/12',
    accentBorder: 'border-violet-400/40',
  },
  resilience: {
    id: 'resilience',
    name: 'Toxins & Armor',
    subtitle: 'Venom, immunities, shields & heals',
    accentText: 'text-emerald-300',
    accentBg: 'bg-emerald-500/12',
    accentBorder: 'border-emerald-400/40',
  },
};

export const TRAIT_CATALOG: TraitDefinition[] = [
  // === MIGHT BRANCH ===
  {
    id: 'super_strength',
    name: 'Super Strength',
    branch: 'might',
    tier: 1,
    shortDesc: 'Crushes foes with raw titanic power.',
    proLabel: '+18 Power, +15 Health',
    conLabel: '-10 Speed',
    statDeltas: { maxHp: 15, attack: 18, defense: 0, speed: -10, healingPower: 0 },
    combatEffect: { bonusFlatDamage: 14 },
  },
  {
    id: 'armor_pierce',
    name: 'Armor Breaker',
    branch: 'might',
    tier: 1,
    shortDesc: 'Shatters heavy metal plating on impact.',
    proLabel: '+14 Power · Auto-Beats Iron Hide',
    conLabel: '-10 Armor',
    countersTraitId: 'iron_hide',
    countersLabel: 'Auto-Wins vs Iron Hide',
    statDeltas: { maxHp: 0, attack: 14, defense: -10, speed: 2, healingPower: 0 },
    combatEffect: {
      status: { type: 'vulnerable', duration: 2, chance: 0.9 },
    },
  },
  {
    id: 'titan_blood',
    name: 'Titan Heart',
    branch: 'might',
    tier: 2,
    shortDesc: 'Massive vitality built to outlast brawls.',
    proLabel: '+45 Health, +6 Armor',
    conLabel: '-8 Speed, -4 Power',
    statDeltas: { maxHp: 45, attack: -4, defense: 6, speed: -8, healingPower: 0 },
    combatEffect: { bonusShield: 28 },
  },
  {
    id: 'heavy_impact',
    name: 'Shockwave Slam',
    branch: 'might',
    tier: 2,
    shortDesc: 'Dazes rivals with concussive strikes.',
    proLabel: '+10 Power · Chance to Stun',
    conLabel: '-8 Speed, -6 Armor',
    statDeltas: { maxHp: 5, attack: 10, defense: -6, speed: -8, healingPower: 0 },
    combatEffect: {
      status: { type: 'stun', duration: 1, chance: 0.55 },
    },
  },

  // === AGILITY BRANCH ===
  {
    id: 'shadow_step',
    name: 'Shadow Step',
    branch: 'agility',
    tier: 1,
    shortDesc: 'Vanishes into smoke and ambushes fast.',
    proLabel: '+16 Speed, +10 Power',
    conLabel: '-25 Health',
    statDeltas: { maxHp: -25, attack: 10, defense: -4, speed: 16, healingPower: 0 },
    combatEffect: {
      status: { type: 'haste', duration: 2, chance: 1 },
    },
  },
  {
    id: 'true_sight',
    name: 'Oracle Sight',
    branch: 'agility',
    tier: 1,
    shortDesc: 'Spots stealth ambushes before they land.',
    proLabel: '+10 Speed, +8 Armor · Auto-Beats Shadow Step',
    conLabel: '-6 Power',
    countersTraitId: 'shadow_step',
    countersLabel: 'Auto-Wins vs Shadow Step',
    statDeltas: { maxHp: 5, attack: -6, defense: 8, speed: 10, healingPower: 0 },
    combatEffect: {
      status: { type: 'empower', duration: 2, chance: 1 },
    },
  },
  {
    id: 'lightning_reflex',
    name: 'Quick Reflex',
    branch: 'agility',
    tier: 2,
    shortDesc: 'Acts first almost every round.',
    proLabel: '+18 Speed',
    conLabel: '-10 Armor',
    statDeltas: { maxHp: -5, attack: 2, defense: -10, speed: 18, healingPower: 0 },
    combatEffect: { bonusFlatDamage: 8 },
  },
  {
    id: 'phase_blink',
    name: 'Phase Blink',
    branch: 'agility',
    tier: 2,
    shortDesc: 'Teleports around heavy ranged spells.',
    proLabel: '+10 Speed, +10 Power · Auto-Beats Telekinesis',
    conLabel: '-20 Health',
    countersTraitId: 'telekinesis',
    countersLabel: 'Auto-Wins vs Telekinesis',
    statDeltas: { maxHp: -20, attack: 10, defense: 0, speed: 10, healingPower: 0 },
    combatEffect: { bonusFlatDamage: 10 },
  },

  // === ARCANE BRANCH ===
  {
    id: 'telekinesis',
    name: 'Telekinesis',
    branch: 'arcane',
    tier: 1,
    shortDesc: 'Lifts and flings brawlers from afar.',
    proLabel: '+14 Power, +6 Speed · Auto-Beats Super Strength',
    conLabel: '-22 Health',
    countersTraitId: 'super_strength',
    countersLabel: 'Auto-Wins vs Super Strength',
    statDeltas: { maxHp: -22, attack: 14, defense: -2, speed: 6, healingPower: 0 },
    combatEffect: {
      status: { type: 'weaken', duration: 2, chance: 0.85 },
    },
  },
  {
    id: 'ember_surge',
    name: 'Flame Core',
    branch: 'arcane',
    tier: 1,
    shortDesc: 'Ignites enemies and melts ice shields.',
    proLabel: '+14 Power, Burn · Auto-Beats Frost Ward',
    conLabel: '-10 Armor',
    countersTraitId: 'frost_barrier',
    countersLabel: 'Auto-Wins vs Frost Ward',
    statDeltas: { maxHp: -5, attack: 14, defense: -10, speed: 4, healingPower: 0 },
    combatEffect: {
      status: { type: 'burn', duration: 2, potency: 18, chance: 0.9 },
    },
  },
  {
    id: 'frost_barrier',
    name: 'Frost Ward',
    branch: 'arcane',
    tier: 2,
    shortDesc: 'Freezes incoming blows with glacial armor.',
    proLabel: '+14 Armor, +15 Health · Auto-Beats Storm Surge',
    conLabel: '-8 Speed',
    countersTraitId: 'storm_surge',
    countersLabel: 'Auto-Wins vs Storm Surge',
    statDeltas: { maxHp: 15, attack: -2, defense: 14, speed: -8, healingPower: 0 },
    combatEffect: { bonusShield: 42 },
  },
  {
    id: 'storm_surge',
    name: 'Storm Surge',
    branch: 'arcane',
    tier: 2,
    shortDesc: 'Calls rapid arcs of chain lightning.',
    proLabel: '+12 Power, +10 Speed',
    conLabel: '-18 Health, -6 Armor',
    statDeltas: { maxHp: -18, attack: 12, defense: -6, speed: 10, healingPower: 0 },
    combatEffect: { bonusFlatDamage: 12 },
  },

  // === RESILIENCE & TOXINS BRANCH ===
  {
    id: 'venom_fangs',
    name: 'Venom Touch',
    branch: 'resilience',
    tier: 1,
    shortDesc: 'Coats strikes in corrosive poison.',
    proLabel: '+12 Power · Poison Damage Over Time',
    conLabel: '-10 Armor',
    statDeltas: { maxHp: -5, attack: 12, defense: -10, speed: 4, healingPower: 0 },
    combatEffect: {
      status: { type: 'bleed', duration: 2, potency: 22, chance: 0.95 },
    },
  },
  {
    id: 'venom_immunity',
    name: 'Venom Resistant',
    branch: 'resilience',
    tier: 1,
    shortDesc: 'Neutralizes all poisons and toxic fumes.',
    proLabel: '+12 Armor, +15 Health · Auto-Beats Venom Touch',
    conLabel: '-6 Power',
    countersTraitId: 'venom_fangs',
    countersLabel: 'Auto-Wins vs Venom Touch',
    statDeltas: { maxHp: 15, attack: -6, defense: 12, speed: 0, healingPower: 8 },
    combatEffect: {
      status: { type: 'fortify', duration: 2, chance: 1 },
    },
  },
  {
    id: 'iron_hide',
    name: 'Iron Hide',
    branch: 'resilience',
    tier: 2,
    shortDesc: 'Turns skin to unbreakable fortress steel.',
    proLabel: '+18 Armor, +25 Health',
    conLabel: '-12 Speed',
    statDeltas: { maxHp: 25, attack: -2, defense: 18, speed: -12, healingPower: 0 },
    combatEffect: { bonusShield: 46 },
  },
  {
    id: 'healing_aura',
    name: 'Mending Light',
    branch: 'resilience',
    tier: 2,
    shortDesc: 'Restores health for yourself and allies.',
    proLabel: '+34 Healing, +15 Health',
    conLabel: '-10 Power',
    statDeltas: { maxHp: 15, attack: -10, defense: 4, speed: 0, healingPower: 34 },
    combatEffect: { bonusHeal: 42 },
  },
];

export const TRAIT_MAP: Record<TraitId, TraitDefinition> = TRAIT_CATALOG.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<TraitId, TraitDefinition>
);

export const ULTIMATE_TREE_CATALOG: UltimateTreeDefinition[] = [
  {
    id: 'meteor_breaker',
    name: 'Titan Meteor Smash',
    shortDesc: 'Drops a seismic finishing blow on one enemy.',
    proLabel: 'Huge Single-Target Damage',
    conLabel: 'High Energy Cost (68 EN)',
    preferredElement: 'Iron',
    ability: {
      id: 'ult-tree-meteor',
      name: 'Titan Meteor Smash',
      description: 'Crashes down on one rival for massive impact damage and Vulnerable.',
      category: 'ultimate',
      targetType: 'single_enemy',
      damageMultiplier: 1.9,
      flatDamage: 24,
      healMultiplier: 0,
      flatHeal: 0,
      shieldAmount: 0,
      energyCost: 68,
      energyGain: 0,
      cooldown: 4,
      cooldownReduction: 0,
      statuses: [{ type: 'vulnerable', duration: 2, chance: 1 }],
      prerequisites: { minLevel: 1 },
      rulesetVersion: RULESET_VERSION,
      visualEffect: 'Golden seismic shockwave slams the target.',
      powerBudgetCost: 0,
    },
  },
  {
    id: 'venom_cataclysm',
    name: 'Venom Cloud Burst',
    shortDesc: 'Blankets every rival in toxic mist.',
    proLabel: 'Hits All Enemies + Poison',
    conLabel: 'Lower Direct Hit Damage',
    preferredElement: 'Void',
    ability: {
      id: 'ult-tree-venom',
      name: 'Venom Cloud Burst',
      description: 'Releases corrosive venom across all foes, dealing damage and Poison over time.',
      category: 'ultimate',
      targetType: 'all_enemies',
      damageMultiplier: 0.88,
      flatDamage: 12,
      healMultiplier: 0,
      flatHeal: 0,
      shieldAmount: 0,
      energyCost: 70,
      energyGain: 0,
      cooldown: 4,
      cooldownReduction: 0,
      statuses: [{ type: 'bleed', duration: 2, potency: 16, chance: 0.85 }],
      prerequisites: { minLevel: 1 },
      rulesetVersion: RULESET_VERSION,
      visualEffect: 'Emerald toxic mist erupts across the arena.',
      powerBudgetCost: 0,
    },
  },
  {
    id: 'psychic_singularity',
    name: 'Mind Crush Wave',
    shortDesc: 'Telekinetic shockwave that weakens all enemies.',
    proLabel: 'Hits All Enemies + Weaken',
    conLabel: 'Long 4-Turn Cooldown',
    preferredElement: 'Aether',
    ability: {
      id: 'ult-tree-psychic',
      name: 'Mind Crush Wave',
      description: 'Sends a telekinetic pulse through all enemies, dealing damage and weakening their attacks.',
      category: 'ultimate',
      targetType: 'all_enemies',
      damageMultiplier: 0.94,
      flatDamage: 14,
      healMultiplier: 0,
      flatHeal: 0,
      shieldAmount: 0,
      energyCost: 68,
      energyGain: 0,
      cooldown: 4,
      cooldownReduction: 0,
      statuses: [{ type: 'weaken', duration: 2, chance: 0.9 }],
      prerequisites: { minLevel: 1 },
      rulesetVersion: RULESET_VERSION,
      visualEffect: 'Violet psychic rings ripple across every rival.',
      powerBudgetCost: 0,
    },
  },
  {
    id: 'phantom_barrage',
    name: 'Shadow Flash Blitz',
    shortDesc: 'Blinding multi-slash strike + self Haste.',
    proLabel: 'High Speed Burst + Haste',
    conLabel: 'Single Target Only',
    preferredElement: 'Storm',
    ability: {
      id: 'ult-tree-phantom',
      name: 'Shadow Flash Blitz',
      description: 'Strikes a single enemy at lightning speed and grants Haste.',
      category: 'ultimate',
      targetType: 'single_enemy',
      damageMultiplier: 1.85,
      flatDamage: 22,
      healMultiplier: 0,
      flatHeal: 0,
      shieldAmount: 24,
      energyCost: 65,
      energyGain: 0,
      cooldown: 4,
      cooldownReduction: 0,
      statuses: [{ type: 'haste', duration: 2, chance: 1 }],
      prerequisites: { minLevel: 1 },
      rulesetVersion: RULESET_VERSION,
      visualEffect: 'Twin afterimages slash across the target.',
      powerBudgetCost: 0,
    },
  },
  {
    id: 'aegis_sanctuary',
    name: 'Golden Shield Dome',
    shortDesc: 'Protects and heals your entire squad.',
    proLabel: 'Team Shield + Team Heal',
    conLabel: 'Deals Zero Damage',
    preferredElement: 'Solar',
    ability: {
      id: 'ult-tree-aegis',
      name: 'Golden Shield Dome',
      description: 'Wraps all allies in a glowing barrier and restores health across the squad.',
      category: 'ultimate',
      targetType: 'all_allies',
      damageMultiplier: 0,
      flatDamage: 0,
      healMultiplier: 0.65,
      flatHeal: 36,
      shieldAmount: 55,
      energyCost: 68,
      energyGain: 0,
      cooldown: 4,
      cooldownReduction: 0,
      statuses: [{ type: 'fortify', duration: 2, chance: 1 }],
      prerequisites: { minLevel: 1 },
      rulesetVersion: RULESET_VERSION,
      visualEffect: 'Radiant golden dome shields the entire squad.',
      powerBudgetCost: 0,
    },
  },
  {
    id: 'solar_nova',
    name: 'Starfire Nova',
    shortDesc: 'Scorching starburst across all enemies.',
    proLabel: 'All-Enemy Fire Burst + Burn',
    conLabel: 'High Energy Cost (72 EN)',
    preferredElement: 'Ember',
    ability: {
      id: 'ult-tree-nova',
      name: 'Starfire Nova',
      description: 'Unleashes an exploding star across all foes, scorching them with Burn.',
      category: 'ultimate',
      targetType: 'all_enemies',
      damageMultiplier: 0.96,
      flatDamage: 14,
      healMultiplier: 0,
      flatHeal: 0,
      shieldAmount: 0,
      energyCost: 72,
      energyGain: 0,
      cooldown: 4,
      cooldownReduction: 0,
      statuses: [{ type: 'burn', duration: 2, potency: 16, chance: 0.9 }],
      prerequisites: { minLevel: 1 },
      rulesetVersion: RULESET_VERSION,
      visualEffect: 'Blazing solar ring detonates over the enemy formation.',
      powerBudgetCost: 0,
    },
  },
];

// Deterministic default traits for every built-in starter champion so ALL cards
// work seamlessly with Blind Clash Counters, Visual Bars, and Friend Wish-Trades!
const STARTER_TRAIT_ASSIGNMENTS: Record<string, TraitId[]> = {
  'chr-kaelen': ['iron_hide', 'venom_immunity', 'titan_blood'],
  'chr-lyra': ['telekinesis', 'venom_fangs', 'storm_surge'],
  'chr-vex': ['shadow_step', 'lightning_reflex', 'phase_blink'],
  'chr-seraphina': ['healing_aura', 'venom_immunity', 'frost_barrier'],
  'chr-orion': ['true_sight', 'armor_pierce', 'lightning_reflex'],
  'chr-malakor': ['super_strength', 'iron_hide', 'heavy_impact'],
  'chr-nyx': ['shadow_step', 'venom_fangs', 'armor_pierce'],
  'chr-ignis': ['ember_surge', 'super_strength', 'storm_surge'],
  'chr-freya': ['frost_barrier', 'telekinesis', 'healing_aura'],
  'chr-kora': ['venom_fangs', 'true_sight', 'phase_blink'],
};

const TRAIT_NAME_LOOKUP = new Map<string, TraitId>(
  TRAIT_CATALOG.map((t) => [t.name.toLowerCase(), t.id])
);

/**
 * Extracts or deterministically infers the TraitIds belonging to any CharacterDefinition
 * (custom Trait-Tree cards, AI-crafted cards, Booster Pack cards, or Starters).
 */
export function getCardTraits(card: CharacterDefinition): TraitId[] {
  const mappedStarter = STARTER_TRAIT_ASSIGNMENTS[card.id];
  if (mappedStarter) return mappedStarter;

  const found: TraitId[] = [];
  const pushUnique = (id: TraitId) => {
    if (!found.includes(id) && found.length < MAX_CORE_TRAITS) {
      found.push(id);
    }
  };

  // 1. Check explicit trait names stored in strengths (e.g., "Trait: Super Strength")
  for (const s of card.strengths) {
    const cleaned = s.replace(/^trait:\s*/i, '').trim().toLowerCase();
    const exact = TRAIT_NAME_LOOKUP.get(cleaned);
    if (exact) {
      pushUnique(exact);
      continue;
    }
    for (const [label, tid] of TRAIT_NAME_LOOKUP.entries()) {
      if (cleaned.includes(label)) {
        pushUnique(tid);
      }
    }
  }

  // 2. Keyword inference from backstory / abilities if custom AI card had fewer than 2 traits
  if (found.length < 2) {
    const corpus = [
      card.name,
      card.title,
      card.backstory,
      ...card.specialAbilities.map((a) => `${a.name} ${a.description}`),
      card.ultimateAbility?.name ?? '',
    ]
      .join(' ')
      .toLowerCase();

    if (/antidote|immune|purif|cleanse|resist/.test(corpus)) pushUnique('venom_immunity');
    if (/venom|poison|toxic|plague|acid|bleed/.test(corpus)) pushUnique('venom_fangs');
    if (/telekin|psychic|mind|gravity|psionic/.test(corpus)) pushUnique('telekinesis');
    if (/shadow|stealth|assassin|ninja|cloak|phantom/.test(corpus)) pushUnique('shadow_step');
    if (/sight|oracle|scanner|scout|vision|tactician/.test(corpus)) pushUnique('true_sight');
    if (/strength|titan|smash|giant|brute|crusher/.test(corpus)) pushUnique('super_strength');
    if (/pierce|shatter|breaker|lance|rend/.test(corpus)) pushUnique('armor_pierce');
    if (/iron|steel|fortress|aegis|shield|armor/.test(corpus)) pushUnique('iron_hide');
    if (/flame|fire|pyro|ember|solar|burn/.test(corpus)) pushUnique('ember_surge');
    if (/frost|ice|cryo|glacier|freeze/.test(corpus)) pushUnique('frost_barrier');
    if (/storm|thunder|lightning|volt|spark/.test(corpus)) pushUnique('storm_surge');
    if (/heal|mend|radiant|saint|cleric|restore/.test(corpus)) pushUnique('healing_aura');
    if (/blink|teleport|phase|warp|chrono/.test(corpus)) pushUnique('phase_blink');
  }

  // 3. Stat-based fallback so every champion always has at least 2 clear traits
  if (found.length < 2) {
    if (card.stats.attack >= 82) pushUnique('super_strength');
    if (card.stats.speed >= 96) pushUnique('lightning_reflex');
    if (card.stats.defense >= 60) pushUnique('iron_hide');
    if (card.stats.healingPower >= 40) pushUnique('healing_aura');
    if (card.stats.maxHp >= 340) pushUnique('titan_blood');
    if (found.length < 2) pushUnique('true_sight');
  }

  return found.slice(0, MAX_CORE_TRAITS);
}

/**
 * Simplified, Kid-Friendly Visual Stat Model (1–5 bars + single Overall Power Rating).
 */
export interface CardVisualStats {
  powerRating: number; // Friendly 1..100+ headline power score
  powerBars: number; // 1..5
  healthBars: number; // 1..5
  armorBars: number; // 1..5
  speedBars: number; // 1..5
  healBars: number; // 0..5
  traits: TraitDefinition[];
  counterHighlights: string[];
}

function toFiveBarScale(value: number, min: number, max: number): number {
  const ratio = (value - min) / Math.max(1, max - min);
  const scaled = Math.round(1 + ratio * 4);
  return Math.max(1, Math.min(5, scaled));
}

export function getCardVisualStats(card: CharacterDefinition): CardVisualStats {
  const s = card.stats;
  const traits = getCardTraits(card).map((id) => TRAIT_MAP[id]);
  const levelBonus = (card.level - 1) * 4 + (card.evolutionStage ?? 0) * 5;
  const rawPower =
    s.attack * 0.44 +
    s.maxHp * 0.08 +
    s.defense * 0.28 +
    s.speed * 0.2 +
    s.healingPower * 0.16 +
    levelBonus;

  const powerRating = Math.max(45, Math.min(140, Math.round(rawPower)));

  const counterHighlights = traits
    .filter((t) => Boolean(t.countersLabel))
    .map((t) => t.countersLabel as string);

  return {
    powerRating,
    powerBars: toFiveBarScale(s.attack, 44, 98),
    healthBars: toFiveBarScale(s.maxHp, 240, 410),
    armorBars: toFiveBarScale(s.defense, 32, 78),
    speedBars: toFiveBarScale(s.speed, 62, 118),
    healBars: s.healingPower > 10 ? toFiveBarScale(s.healingPower, 15, 95) : 0,
    traits,
    counterHighlights,
  };
}

export interface TraitCounterResolution {
  winner: 'player' | 'enemy' | 'none';
  playerCounteredEnemy: Array<{ myTrait: TraitDefinition; enemyTrait: TraitDefinition }>;
  enemyCounteredPlayer: Array<{ enemyTrait: TraitDefinition; myTrait: TraitDefinition }>;
  headline: string;
}

/**
 * Checks hard skill-counter matchups between two champions (e.g., Venom Resistant auto-beats Venom Touch!).
 */
export function resolveTraitCounter(
  playerTraitIds: TraitId[],
  enemyTraitIds: TraitId[]
): TraitCounterResolution {
  const playerCounteredEnemy: Array<{
    myTrait: TraitDefinition;
    enemyTrait: TraitDefinition;
  }> = [];
  const enemyCounteredPlayer: Array<{
    enemyTrait: TraitDefinition;
    myTrait: TraitDefinition;
  }> = [];

  for (const pId of playerTraitIds) {
    const pTrait = TRAIT_MAP[pId];
    if (pTrait?.countersTraitId && enemyTraitIds.includes(pTrait.countersTraitId)) {
      playerCounteredEnemy.push({
        myTrait: pTrait,
        enemyTrait: TRAIT_MAP[pTrait.countersTraitId],
      });
    }
  }

  for (const eId of enemyTraitIds) {
    const eTrait = TRAIT_MAP[eId];
    if (eTrait?.countersTraitId && playerTraitIds.includes(eTrait.countersTraitId)) {
      enemyCounteredPlayer.push({
        enemyTrait: eTrait,
        myTrait: TRAIT_MAP[eTrait.countersTraitId],
      });
    }
  }

  if (playerCounteredEnemy.length > enemyCounteredPlayer.length) {
    const first = playerCounteredEnemy[0];
    return {
      winner: 'player',
      playerCounteredEnemy,
      enemyCounteredPlayer,
      headline: `COUNTER WIN! Your ${first.myTrait.name} automatically beats ${first.enemyTrait.name}!`,
    };
  }

  if (enemyCounteredPlayer.length > playerCounteredEnemy.length) {
    const first = enemyCounteredPlayer[0];
    return {
      winner: 'enemy',
      playerCounteredEnemy,
      enemyCounteredPlayer,
      headline: `COUNTERED! Rival's ${first.enemyTrait.name} automatically beats your ${first.myTrait.name}!`,
    };
  }

  return {
    winner: 'none',
    playerCounteredEnemy,
    enemyCounteredPlayer,
    headline:
      playerCounteredEnemy.length > 0
        ? 'Both champions countered each other — Power decides the clash!'
        : 'Pure power clash — highest Power + Element wins!',
  };
}

export interface TraitTreeBuildInput {
  name: string;
  title?: string;
  lore: string;
  element: ElementAffinity;
  artworkUrl: string;
  creatorId: string;
  creatorName: string;
  traitIds: TraitId[];
  ultimateId: UltimateTreeId;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

function inferRoleFromTraits(
  stats: CharacterDefinition['stats'],
  traitIds: TraitId[]
): CombatRole {
  if (stats.healingPower >= 30 || traitIds.includes('healing_aura')) return 'Warden';
  if (stats.defense >= 58 || stats.maxHp >= 345) return 'Vanguard';
  if (stats.speed >= 96 && stats.attack >= 72) return 'Striker';
  if (
    traitIds.includes('telekinesis') ||
    traitIds.includes('ember_surge') ||
    traitIds.includes('storm_surge') ||
    traitIds.includes('frost_barrier')
  ) {
    return 'Arcanist';
  }
  if (traitIds.includes('true_sight') || traitIds.includes('venom_immunity')) {
    return 'Tactician';
  }
  return stats.attack >= 76 ? 'Striker' : 'Tactician';
}

/**
 * Preview stats instantaneously for the Visual Skill Tree builder before minting.
 */
export function computeTraitTreePreviewStats(traitIds: TraitId[]): {
  stats: CharacterDefinition['stats'];
  role: CombatRole;
  budgetUsed: number;
  budgetCap: number;
} {
  const uniqueIds = Array.from(new Set(traitIds)).slice(0, MAX_CORE_TRAITS);
  let maxHp = 305;
  let attack = 70;
  let defense = 48;
  let speed = 84;
  let healingPower = 0;

  for (const tid of uniqueIds) {
    const def = TRAIT_MAP[tid];
    if (!def) continue;
    maxHp += def.statDeltas.maxHp;
    attack += def.statDeltas.attack;
    defense += def.statDeltas.defense;
    speed += def.statDeltas.speed;
    healingPower += def.statDeltas.healingPower;
  }

  let stats: CharacterDefinition['stats'] = {
    maxHp: clamp(maxHp, 220, 410),
    attack: clamp(attack, 44, 102),
    defense: clamp(defense, 28, 78),
    speed: clamp(speed, 56, 120),
    maxEnergy: 100,
    startingEnergy: 40,
    healingPower: clamp(healingPower, 0, 95),
  };

  // Guarantee legal Level-1 stat budget (<= 605) via gentle proportional trim if needed
  const calcBudget = (st: CharacterDefinition['stats']) =>
    Math.round(
      st.maxHp * 0.55 +
        st.attack * 2.1 +
        st.defense * 1.9 +
        st.speed * 1.45 +
        st.healingPower * 1.15
    );

  let budget = calcBudget(stats);
  let guard = 0;
  while (budget > 602 && guard < 12) {
    guard += 1;
    const scale = 596 / budget;
    stats = {
      ...stats,
      maxHp: clamp(stats.maxHp * scale, 220, 410),
      attack: clamp(stats.attack * scale, 44, 102),
      defense: clamp(stats.defense * scale, 28, 78),
      speed: clamp(stats.speed * scale, 56, 120),
      healingPower: clamp(stats.healingPower * scale, 0, 95),
    };
    budget = calcBudget(stats);
  }

  const role = inferRoleFromTraits(stats, uniqueIds);
  return {
    stats,
    role,
    budgetUsed: budget,
    budgetCap: 620,
  };
}

function buildSpecialFromTraits(
  slotIndex: 1 | 2,
  traits: TraitDefinition[],
  cardId: string
): AbilityDefinition {
  const primary = traits[slotIndex - 1] ?? traits[0];
  const secondary = traits[slotIndex + 1];

  if (primary?.id === 'healing_aura') {
    const ab: AbilityDefinition = {
      id: `${cardId}-sp${slotIndex}`,
      name: 'Mending Pulse',
      description: 'Restores health to an ally and grants a gentle protective barrier.',
      category: 'special',
      targetType: 'single_ally',
      damageMultiplier: 0,
      flatDamage: 0,
      healMultiplier: 1.0,
      flatHeal: 28,
      shieldAmount: 24,
      energyCost: 32,
      energyGain: 0,
      cooldown: 2,
      cooldownReduction: 0,
      statuses: [],
      prerequisites: { minLevel: 1 },
      rulesetVersion: RULESET_VERSION,
      visualEffect: 'Warm golden light knits wounds closed.',
      powerBudgetCost: 0,
    };
    ab.powerBudgetCost = computeAbilityPowerBudget(ab);
    return ab;
  }

  if (primary?.id === 'iron_hide' || primary?.id === 'frost_barrier' || primary?.id === 'venom_immunity') {
    const ab: AbilityDefinition = {
      id: `${cardId}-sp${slotIndex}`,
      name:
        primary.id === 'frost_barrier'
          ? 'Glacial Barrier'
          : primary.id === 'venom_immunity'
            ? 'Antidote Ward'
            : 'Fortress Plate',
      description: `Raises a strong barrier (${primary.proLabel}) and fortifies defenses.`,
      category: 'special',
      targetType: 'self',
      damageMultiplier: 0,
      flatDamage: 0,
      healMultiplier: 0,
      flatHeal: 0,
      shieldAmount: 68,
      energyCost: 28,
      energyGain: 0,
      cooldown: 2,
      cooldownReduction: 0,
      statuses: [{ type: 'fortify', duration: 2, chance: 1 }],
      prerequisites: { minLevel: 1 },
      rulesetVersion: RULESET_VERSION,
      visualEffect: 'Reinforced crystalline plating locks around the champion.',
      powerBudgetCost: 0,
    };
    ab.powerBudgetCost = computeAbilityPowerBudget(ab);
    return ab;
  }

  const statuses: StatusApplication[] = [];
  if (primary?.combatEffect.status) {
    statuses.push(primary.combatEffect.status);
  } else if (secondary?.combatEffect.status) {
    statuses.push(secondary.combatEffect.status);
  }

  const ab: AbilityDefinition = {
    id: `${cardId}-sp${slotIndex}`,
    name: primary ? `${primary.name} Strike` : `Signature Strike ${slotIndex}`,
    description: primary
      ? `Channels ${primary.name}: ${primary.shortDesc}`
      : 'A focused tactical attack against a single rival.',
    category: 'special',
    targetType: 'single_enemy',
    damageMultiplier: statuses.some((s) => s.type === 'stun') ? 1.15 : 1.32,
    flatDamage: 12 + (primary?.combatEffect.bonusFlatDamage ?? 0),
    healMultiplier: 0,
    flatHeal: 0,
    shieldAmount: 0,
    energyCost: 32,
    energyGain: 0,
    cooldown: 2,
    cooldownReduction: 0,
    statuses,
    prerequisites: { minLevel: 1 },
    rulesetVersion: RULESET_VERSION,
    visualEffect: 'Focused burst of signature trait energy hits the rival.',
    powerBudgetCost: 0,
  };
  ab.powerBudgetCost = computeAbilityPowerBudget(ab);
  return ab;
}

/**
 * Compiles a Visual Skill-Tree build (1–4 Core Traits + 1 Signature Ultimate)
 * into a 100% legal, balanced Level 1 CharacterDefinition.
 */
export function compileTraitTreeCharacter(input: TraitTreeBuildInput): {
  character: CharacterDefinition;
  validation: ReturnType<typeof validateCharacterBalance>;
} {
  const cleanName = input.name.trim().slice(0, 38) || 'Arena Challenger';
  const cleanLore =
    input.lore.trim().length >= 12
      ? input.lore.trim().slice(0, 420)
      : `${cleanName} entered the Oracle Arena armed with hand-picked tactical skills and unbreakable resolve.`;

  const uniqueTraitIds = Array.from(new Set(input.traitIds)).slice(0, MAX_CORE_TRAITS);
  const chosenTraits =
    uniqueTraitIds.length > 0
      ? uniqueTraitIds.map((id) => TRAIT_MAP[id]).filter(Boolean)
      : [TRAIT_MAP.super_strength, TRAIT_MAP.iron_hide];

  const ultimateSpec =
    ULTIMATE_TREE_CATALOG.find((u) => u.id === input.ultimateId) ??
    ULTIMATE_TREE_CATALOG[0];

  const preview = computeTraitTreePreviewStats(chosenTraits.map((t) => t.id));
  const slug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18);
  const cardId = `chr-custom-${slug || 'hero'}-${Date.now().toString(36).slice(-5)}`;

  const basicAttack: AbilityDefinition = {
    id: `${cardId}-basic`,
    name: `${input.element} Strike`,
    description: 'Reliable primary attack that deals steady damage and builds +18 Energy.',
    category: 'basic',
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
    prerequisites: { minLevel: 1 },
    rulesetVersion: RULESET_VERSION,
    visualEffect: 'Clean elemental slash flashes across the enemy.',
    powerBudgetCost: 0,
  };
  basicAttack.powerBudgetCost = computeAbilityPowerBudget(basicAttack);

  const sp1 = buildSpecialFromTraits(1, chosenTraits, cardId);
  const sp2 = buildSpecialFromTraits(2, chosenTraits, cardId);

  const ultimateAbility: AbilityDefinition = {
    ...ultimateSpec.ability,
    id: `${cardId}-ult`,
  };
  ultimateAbility.powerBudgetCost = computeAbilityPowerBudget(ultimateAbility);

  const strengths = chosenTraits
    .slice(0, 4)
    .map((t) => `Trait: ${t.name} (${t.proLabel})`);

  const weaknesses = chosenTraits
    .slice(0, 4)
    .map((t) => `${t.name} Trade-off: ${t.conLabel}`);

  const cleanTitle =
    input.title?.trim().slice(0, 52) ||
    `${input.element} ${preview.role} of ${chosenTraits[0].name}`;

  const character: CharacterDefinition = {
    id: cardId,
    name: cleanName,
    title: cleanTitle,
    originalCreatorId: input.creatorId || 'local-player',
    originalCreatorName: input.creatorName || 'Arena Architect',
    currentOwnerId: input.creatorId || 'local-player',
    oracleProfile: 'Universal Oracle',
    appearance: `${cleanName} channels ${input.element} energy shaped by ${chosenTraits
      .map((t) => t.name)
      .join(', ')}.`,
    artworkUrl: input.artworkUrl || '/images/card_kaelen_solaris.jpg',
    backstory: cleanLore,
    personality: `Driven by ${chosenTraits[0].name}`,
    role: preview.role,
    element: input.element,
    rarity: 'Rare',
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
    stats: preview.stats,
    strengths: strengths.length > 0 ? strengths : ['Balanced Trait Build'],
    weaknesses: weaknesses.length > 0 ? weaknesses : ['Balanced trade-offs across stats'],
    basicAttack,
    specialAbilities: [sp1, sp2],
    ultimateAbility,
    learnedAbilities: [],
    abilitySlotCapacity: 4,
    evolutionHistory: [],
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
        toUserId: input.creatorId || 'local-player',
        timestamp: new Date().toISOString(),
        reason: 'genesis',
      },
    ],
    rulesetVersion: RULESET_VERSION,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
  };

  // Sanity safety check against universal budget
  const statBudget = computeCharacterStatBudget(character);
  if (statBudget > 620) {
    character.stats.maxHp = Math.max(220, character.stats.maxHp - Math.ceil((statBudget - 605) / 0.55));
  }

  const validation = validateCharacterBalance(character);
  return { character, validation };
}
