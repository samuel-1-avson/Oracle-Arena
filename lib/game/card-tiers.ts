import { CharacterDefinition } from './types';

export type CardTierId = 'bronze' | 'silver' | 'gold' | 'diamond' | 'trump';

export interface CardTierMeta {
  id: CardTierId;
  name: string;
  shortLabel: string;
  badgeLabel: string;
  rankTitle: string;
  minLevel: number;
  maxLevel: number;
  /** Percentage bonus applied to ATK, DEF, and Max HP in 5v5 Arena combat */
  combatStatBonusPct: number;
  /** Bonus starting energy in 5v5 Arena combat (Legendary Trump Cards only) */
  startingEnergyBonus: number;
  /** Flat Battle Power bonus in 6v6 Blind Clash */
  blindClashPowerBonus: number;
  /** Whether this tier has Legendary Trump Card authority */
  isLegendaryTrump: boolean;
  perkSummary: string;
  /** Visual styling tokens aligned with Oracle Arena's Obsidian & Brushed Gold palette */
  accentHex: string;
  textClass: string;
  badgeBgClass: string;
  borderClass: string;
  cardFrameClass: string;
  glowClass: string;
  progressBarClass: string;
  /** CSS styling system classes defined in app/globals.css */
  frameCssClass: string;
  overlayCssClass: string;
  cornerAccentClass: string;
  finishLabel: string;
}

export const SHARD_TRAINING_COST = 25;
export const SHARD_TRAINING_XP = 120;

export const CARD_TIERS: CardTierMeta[] = [
  {
    id: 'bronze',
    name: 'Bronze',
    shortLabel: 'BRZ',
    badgeLabel: 'BRONZE',
    rankTitle: 'Bronze Tier',
    minLevel: 1,
    maxLevel: 2,
    combatStatBonusPct: 0,
    startingEnergyBonus: 0,
    blindClashPowerBonus: 0,
    isLegendaryTrump: false,
    perkSummary: 'Foundation Tier · Base Arena stats',
    accentHex: '#CD7F32',
    textClass: 'text-[#E3A869]',
    badgeBgClass: 'bg-[#CD7F32]/20 border-[#CD7F32]/55 text-[#F0C18E]',
    borderClass: 'border-[#CD7F32]/45',
    cardFrameClass: 'border-[#CD7F32]/40 hover:border-[#E3A869]/70',
    glowClass: 'shadow-[0_0_20px_rgba(205,127,50,0.16)]',
    progressBarClass: 'from-[#9A5B20] to-[#E3A869]',
    frameCssClass: 'card-tier-frame card-tier-bronze',
    overlayCssClass: 'card-tier-overlay card-tier-overlay-bronze',
    cornerAccentClass: 'border-[#E3A869]/65',
    finishLabel: 'Burnished Forged Bronze',
  },
  {
    id: 'silver',
    name: 'Silver',
    shortLabel: 'SLV',
    badgeLabel: 'SILVER',
    rankTitle: 'Silver Tier',
    minLevel: 3,
    maxLevel: 4,
    combatStatBonusPct: 3,
    startingEnergyBonus: 0,
    blindClashPowerBonus: 3,
    isLegendaryTrump: false,
    perkSummary: '+3% Arena ATK/DEF/HP · +3 Blind Clash PWR',
    accentHex: '#CBD5E1',
    textClass: 'text-slate-200',
    badgeBgClass: 'bg-slate-300/18 border-slate-300/55 text-slate-100',
    borderClass: 'border-slate-300/50',
    cardFrameClass: 'border-slate-300/45 hover:border-slate-200/80',
    glowClass: 'shadow-[0_0_22px_rgba(203,213,225,0.20)]',
    progressBarClass: 'from-slate-400 to-slate-100',
    frameCssClass: 'card-tier-frame card-tier-silver',
    overlayCssClass: 'card-tier-overlay card-tier-overlay-silver',
    cornerAccentClass: 'border-slate-200/80',
    finishLabel: 'Brushed Chrome Silver',
  },
  {
    id: 'gold',
    name: 'Gold',
    shortLabel: 'GLD',
    badgeLabel: 'GOLD',
    rankTitle: 'Gold Tier',
    minLevel: 5,
    maxLevel: 6,
    combatStatBonusPct: 6,
    startingEnergyBonus: 0,
    blindClashPowerBonus: 6,
    isLegendaryTrump: false,
    perkSummary: '+6% Arena ATK/DEF/HP · +6 Blind Clash PWR',
    accentHex: '#D4AF37',
    textClass: 'text-[#F5DC8B]',
    badgeBgClass: 'bg-[#D4AF37]/22 border-[#E5C158]/65 text-[#FCE8A8]',
    borderClass: 'border-[#D4AF37]/60',
    cardFrameClass: 'border-[#D4AF37]/55 hover:border-[#F5DC8B]/85',
    glowClass: 'shadow-[0_0_26px_rgba(212,175,55,0.28)]',
    progressBarClass: 'from-[#B8860B] to-[#F5DC8B]',
    frameCssClass: 'card-tier-frame card-tier-gold',
    overlayCssClass: 'card-tier-overlay card-tier-overlay-gold',
    cornerAccentClass: 'border-[#FFF1B8]/85',
    finishLabel: 'Metallic 24K Gold Foil',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    shortLabel: 'DMD',
    badgeLabel: 'DIAMOND',
    rankTitle: 'Diamond Tier',
    minLevel: 7,
    maxLevel: 8,
    combatStatBonusPct: 10,
    startingEnergyBonus: 0,
    blindClashPowerBonus: 10,
    isLegendaryTrump: false,
    perkSummary: '+10% Arena ATK/DEF/HP · +10 Blind Clash PWR',
    accentHex: '#38BDF8',
    textClass: 'text-cyan-200',
    badgeBgClass: 'bg-cyan-400/20 border-cyan-300/65 text-cyan-100',
    borderClass: 'border-cyan-400/60',
    cardFrameClass: 'border-cyan-400/55 hover:border-cyan-200/90',
    glowClass: 'shadow-[0_0_28px_rgba(56,189,248,0.30)]',
    progressBarClass: 'from-sky-500 via-cyan-300 to-white',
    frameCssClass: 'card-tier-frame card-tier-diamond',
    overlayCssClass: 'card-tier-overlay card-tier-overlay-diamond',
    cornerAccentClass: 'border-cyan-200/95',
    finishLabel: 'Glowing Crystalline Diamond',
  },
  {
    id: 'trump',
    name: 'Trump Card',
    shortLabel: 'TRUMP',
    badgeLabel: 'TRUMP CARD',
    rankTitle: 'Legendary Trump Card',
    minLevel: 9,
    maxLevel: 10,
    combatStatBonusPct: 15,
    startingEnergyBonus: 15,
    blindClashPowerBonus: 15,
    isLegendaryTrump: true,
    perkSummary:
      'Legendary Authority · +15% Arena Stats · +15 Starting EN · +15 Clash PWR & Trump Tie-Override',
    accentHex: '#F43F5E',
    textClass: 'text-amber-200',
    badgeBgClass:
      'bg-gradient-to-r from-[#D4AF37]/30 via-rose-500/30 to-violet-500/30 border-[#F5DC8B]/80 text-[#FFF4CC]',
    borderClass: 'border-[#F5DC8B]/80',
    cardFrameClass:
      'border-[#F5DC8B]/75 ring-1 ring-rose-400/45 hover:border-[#FFF4CC]',
    glowClass: 'shadow-[0_0_32px_rgba(244,63,94,0.32)]',
    progressBarClass: 'from-[#D4AF37] via-rose-400 to-violet-400',
    frameCssClass: 'card-tier-frame card-tier-trump',
    overlayCssClass: 'card-tier-overlay card-tier-overlay-trump',
    cornerAccentClass: 'border-[#FFF4CC]',
    finishLabel: 'Prismatic Imperial Foil',
  },
];

export const CARD_TIER_MAP: Record<CardTierId, CardTierMeta> = {
  bronze: CARD_TIERS[0],
  silver: CARD_TIERS[1],
  gold: CARD_TIERS[2],
  diamond: CARD_TIERS[3],
  trump: CARD_TIERS[4],
};

/**
 * Resolves the canonical Card Level Tier from a champion's numeric level (1..10).
 * - Lv. 1–2: Bronze
 * - Lv. 3–4: Silver
 * - Lv. 5–6: Gold
 * - Lv. 7–8: Diamond
 * - Lv. 9–10: Legendary Trump Card
 */
export function getCardTierForLevel(level: number): CardTierMeta {
  const safeLevel = Math.max(1, Math.floor(level || 1));
  if (safeLevel >= 9) return CARD_TIER_MAP.trump;
  if (safeLevel >= 7) return CARD_TIER_MAP.diamond;
  if (safeLevel >= 5) return CARD_TIER_MAP.gold;
  if (safeLevel >= 3) return CARD_TIER_MAP.silver;
  return CARD_TIER_MAP.bronze;
}

export function getCardTier(
  card: Pick<CharacterDefinition, 'level'>
): CardTierMeta {
  return getCardTierForLevel(card.level);
}

export function isTrumpCard(
  cardOrLevel: Pick<CharacterDefinition, 'level'> | number
): boolean {
  const lvl =
    typeof cardOrLevel === 'number' ? cardOrLevel : cardOrLevel.level;
  return getCardTierForLevel(lvl).isLegendaryTrump;
}

export function getNextCardTier(level: number): CardTierMeta | null {
  const current = getCardTierForLevel(level);
  const idx = CARD_TIERS.findIndex((t) => t.id === current.id);
  if (idx < 0 || idx >= CARD_TIERS.length - 1) return null;
  return CARD_TIERS[idx + 1];
}

export function formatTierLevelLabel(level: number): string {
  const tier = getCardTierForLevel(level);
  return `${tier.badgeLabel} · Lv.${Math.max(1, Math.floor(level || 1))}`;
}

export function getCardTierVisualClasses(level: number): {
  tierId: CardTierId;
  frameClass: string;
  overlayClass: string;
  cornerAccentClass: string;
  finishLabel: string;
  showCornerFiligree: boolean;
} {
  const tier = getCardTierForLevel(level);
  return {
    tierId: tier.id,
    frameClass: tier.frameCssClass,
    overlayClass: tier.overlayCssClass,
    cornerAccentClass: tier.cornerAccentClass,
    finishLabel: tier.finishLabel,
    showCornerFiligree:
      tier.id === 'gold' || tier.id === 'diamond' || tier.id === 'trump',
  };
}

export function countCardsByTier(
  cards: Array<Pick<CharacterDefinition, 'level'>>
): Record<CardTierId, number> {
  const counts: Record<CardTierId, number> = {
    bronze: 0,
    silver: 0,
    gold: 0,
    diamond: 0,
    trump: 0,
  };
  for (const card of cards) {
    counts[getCardTierForLevel(card.level).id] += 1;
  }
  return counts;
}
