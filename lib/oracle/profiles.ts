import { ElementAffinity, OracleProfile } from '../game/types';

export interface OracleProfileSpec {
  id: OracleProfile;
  tagline: string;
  creativeDirective: string;
  recommendedElements: ElementAffinity[];
  samplePrompt: string;
}

export const ORACLE_PROFILES: OracleProfileSpec[] = [
  {
    id: 'Universal Oracle',
    tagline: 'Balanced interpretation for any original hero or villain concept.',
    creativeDirective:
      'Translate the player concept faithfully into balanced, cohesive 5v5 abilities with clear tactical identity and crisp fantasy-sci-fi flavor.',
    recommendedElements: ['Solar', 'Aether', 'Iron', 'Storm'],
    samplePrompt:
      'A wandering eclipse knight who wields a fractured astral greatsword, trades speed for heavy barriers, and punishes weakened enemies.',
  },
  {
    id: 'Elemental Oracle',
    tagline: 'Specializes in fire, frost, storm, and primal elemental forces.',
    creativeDirective:
      'Emphasize vivid elemental synergies such as Burn attrition, Frost crowd-control stuns, and storm chain disruption while honoring universal balance caps.',
    recommendedElements: ['Ember', 'Frost', 'Storm', 'Solar'],
    samplePrompt:
      'A glacial alchemist who seals allies inside crystalline ice barriers and freezes enemy strikers with shards of arctic glass.',
  },
  {
    id: 'Arcane Oracle',
    tagline: 'Crafts spellcasters, void weavers, and supernatural mystics.',
    creativeDirective:
      'Highlight high-skill arcane casting, multi-target cosmic waves, Vulnerability debuffs, and fragile-but-potent spell kits.',
    recommendedElements: ['Void', 'Aether', 'Solar'],
    samplePrompt:
      'A blind star-cartographer who bends gravity wells to weaken opposing frontlines and detonates collapsing nebulae across the arena.',
  },
  {
    id: 'Cyber Oracle',
    tagline: 'Designs augmented duelists, artificers, and tactical constructs.',
    creativeDirective:
      'Frame powers as kinetic conduits, drone arrays, energy capacitors, overclocked speed buffs, and precision tactical debuffs.',
    recommendedElements: ['Cyber', 'Storm', 'Iron'],
    samplePrompt:
      'A rogue clockwork medic deploying brass nanite drones that patch squad armor, restore ally energy, and disrupt hostile shields.',
  },
  {
    id: 'Mythic Oracle',
    tagline: 'Forges ancient legends, celestials, and towering champions.',
    creativeDirective:
      'Give the character grand mythic lore, heroic frontline presence or iconic ultimate payoffs—strictly balanced within standard Level 1 power budgets.',
    recommendedElements: ['Solar', 'Iron', 'Aether', 'Void'],
    samplePrompt:
      'An ancient phoenix sentinel forged from obsidian temple stone who shields fallen comrades and scorches attackers with golden embers.',
  },
  {
    id: 'Tactical Oracle',
    tagline: 'Focuses on combo enablers, tempo control, and squad synergy.',
    creativeDirective:
      'Prioritize clever cooldown reduction, Haste speed manipulation, Empower/Weaken swings, and Energy transfer abilities that reward team strategy.',
    recommendedElements: ['Cyber', 'Aether', 'Storm', 'Frost'],
    samplePrompt:
      'An ex-colosseum marshal carrying a holographic war banner who accelerates ally cooldowns and exposes armor seams on priority targets.',
  },
];

export const PORTRAIT_GALLERY: Array<{
  url: string;
  label: string;
  element: ElementAffinity;
}> = [
  { url: '/images/card_kaelen_solaris.jpg', label: 'Solar Paladin', element: 'Solar' },
  { url: '/images/card_lyra_voidweaver.jpg', label: 'Astral Sorceress', element: 'Void' },
  { url: '/images/card_vex_chronostriker.jpg', label: 'Storm Duelist', element: 'Storm' },
  { url: '/images/card_seraphina_aether.jpg', label: 'Aether Warden', element: 'Aether' },
  { url: '/images/card_orion_tactician.jpg', label: 'Cyber Tactician', element: 'Cyber' },
  { url: '/images/card_malakor_dreadguard.jpg', label: 'Iron Juggernaut', element: 'Iron' },
  { url: '/images/card_nyx_shadowblade.jpg', label: 'Eclipse Assassin', element: 'Void' },
  { url: '/images/card_ignis_pyromancer.jpg', label: 'Ember Archon', element: 'Ember' },
  { url: '/images/card_freya_frostbinder.jpg', label: 'Frost Oracle', element: 'Frost' },
  { url: '/images/card_kora_hexsmith.jpg', label: 'Storm Artificer', element: 'Storm' },
];

export function getOracleProfileSpec(profile: OracleProfile): OracleProfileSpec {
  return (
    ORACLE_PROFILES.find((p) => p.id === profile) ?? ORACLE_PROFILES[0]
  );
}

export function pickDefaultArtworkForElement(element: ElementAffinity): string {
  const match = PORTRAIT_GALLERY.find((p) => p.element === element);
  return match?.url ?? PORTRAIT_GALLERY[0].url;
}
