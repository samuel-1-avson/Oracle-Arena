import { ElementAffinity, StatusEffectType } from '@/lib/game/types';

export interface ElementStyle {
  text: string;
  border: string;
  accentHex: string;
  subtleBg: string;
}

export const ELEMENT_STYLES: Record<ElementAffinity, ElementStyle> = {
  Solar: {
    text: 'text-amber-300',
    border: 'border-amber-500/40',
    accentHex: '#F59E0B',
    subtleBg: 'bg-amber-500/10',
  },
  Void: {
    text: 'text-violet-300',
    border: 'border-violet-500/40',
    accentHex: '#8B5CF6',
    subtleBg: 'bg-violet-500/10',
  },
  Storm: {
    text: 'text-sky-300',
    border: 'border-sky-400/40',
    accentHex: '#38BDF8',
    subtleBg: 'bg-sky-500/10',
  },
  Aether: {
    text: 'text-yellow-200',
    border: 'border-yellow-400/40',
    accentHex: '#E5C158',
    subtleBg: 'bg-yellow-400/10',
  },
  Cyber: {
    text: 'text-cyan-300',
    border: 'border-cyan-400/40',
    accentHex: '#22D3EE',
    subtleBg: 'bg-cyan-500/10',
  },
  Iron: {
    text: 'text-orange-300',
    border: 'border-orange-500/40',
    accentHex: '#EA580C',
    subtleBg: 'bg-orange-500/10',
  },
  Ember: {
    text: 'text-rose-300',
    border: 'border-rose-500/40',
    accentHex: '#F43F5E',
    subtleBg: 'bg-rose-500/10',
  },
  Frost: {
    text: 'text-blue-200',
    border: 'border-blue-400/40',
    accentHex: '#60A5FA',
    subtleBg: 'bg-blue-400/10',
  },
};

export const STATUS_META: Record<
  StatusEffectType,
  { label: string; short: string; tone: string; description: string }
> = {
  burn: {
    label: 'Burn',
    short: 'BRN',
    tone: 'text-orange-300',
    description: 'Takes fire damage at the start of each turn.',
  },
  bleed: {
    label: 'Bleed',
    short: 'BLD',
    tone: 'text-rose-300',
    description: 'Takes physical bleed damage at the start of each turn.',
  },
  stun: {
    label: 'Stun',
    short: 'STN',
    tone: 'text-amber-300',
    description: 'Cannot act on their next turn.',
  },
  fortify: {
    label: 'Fortify',
    short: 'DEF+',
    tone: 'text-sky-300',
    description: '+25% Defense against incoming attacks.',
  },
  vulnerable: {
    label: 'Vulnerable',
    short: 'VULN',
    tone: 'text-rose-300',
    description: '+25% incoming damage taken.',
  },
  weaken: {
    label: 'Weaken',
    short: 'ATK-',
    tone: 'text-violet-300',
    description: '-20% outgoing attack damage.',
  },
  empower: {
    label: 'Empower',
    short: 'ATK+',
    tone: 'text-amber-200',
    description: '+20% outgoing attack damage.',
  },
  haste: {
    label: 'Haste',
    short: 'SPD+',
    tone: 'text-cyan-300',
    description: '+18 Speed in turn order calculations.',
  },
  guarding: {
    label: 'Guard',
    short: 'GRD',
    tone: 'text-amber-300',
    description: '-40% incoming damage until next turn.',
  },
};

export function formatTargetLabel(
  targetType:
    | 'single_enemy'
    | 'all_enemies'
    | 'single_ally'
    | 'all_allies'
    | 'self'
): string {
  switch (targetType) {
    case 'single_enemy':
      return 'Single Enemy';
    case 'all_enemies':
      return 'All Enemies';
    case 'single_ally':
      return 'Single Ally';
    case 'all_allies':
      return 'All Allies';
    case 'self':
      return 'Self';
  }
}
