'use client';

import React from 'react';
import { Award, Check, Crown, Gem, Shield } from 'lucide-react';
import {
  CARD_TIERS,
  CardTierId,
  getCardTierForLevel,
} from '@/lib/game/card-tiers';

function TierIcon({
  tierId,
  className = 'w-3 h-3 shrink-0',
}: {
  tierId: CardTierId;
  className?: string;
}) {
  switch (tierId) {
    case 'trump':
      return <Crown className={className} />;
    case 'diamond':
      return <Gem className={className} />;
    case 'gold':
      return <Award className={className} />;
    case 'silver':
      return <Shield className={className} />;
    case 'bronze':
    default:
      return <Shield className={className} />;
  }
}

interface CardTierBadgeProps {
  level: number;
  compact?: boolean;
  showLevel?: boolean;
  className?: string;
}

export function CardTierBadge({
  level,
  compact = false,
  showLevel = false,
  className = '',
}: CardTierBadgeProps) {
  const safeLevel = Math.max(1, Math.floor(level || 1));
  const tier = getCardTierForLevel(safeLevel);

  return (
    <span
      data-testid={`card-tier-badge-${tier.id}`}
      title={`${tier.rankTitle} (Lv.${tier.minLevel}–${tier.maxLevel}): ${tier.perkSummary}`}
      className={`inline-flex items-center gap-1 rounded border font-mono uppercase tracking-wider font-bold whitespace-nowrap shrink-0 ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      } ${tier.badgeBgClass} ${className}`}
    >
      <TierIcon
        tierId={tier.id}
        className={compact ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'}
      />
      <span>{compact ? tier.shortLabel : tier.badgeLabel}</span>
      {showLevel && <span className="opacity-85">· Lv.{safeLevel}</span>}
    </span>
  );
}

interface CardTierOverlayProps {
  level: number;
  compact?: boolean;
  className?: string;
}

/**
 * Non-interactive optical finish overlay for card portraits:
 * - Bronze: warm forged copper sheen
 * - Silver: brushed chrome specular sweep on hover
 * - Gold: 24K metallic foil sweep + etched corner brackets
 * - Diamond: faceted crystalline refraction + luminous glint + ice corner brackets
 * - Legendary Trump Card: prismatic holographic foil + royal gilded corner brackets
 */
export function CardTierOverlay({
  level,
  compact = false,
  className = '',
}: CardTierOverlayProps) {
  const tier = getCardTierForLevel(level);
  const showCorners =
    tier.id === 'gold' || tier.id === 'diamond' || tier.id === 'trump';
  const cornerSize = compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';

  return (
    <div
      aria-hidden="true"
      data-tier-overlay={tier.id}
      className={`${tier.overlayCssClass} ${className}`}
    >
      {showCorners && (
        <>
          <span
            className={`absolute top-1.5 left-1.5 ${cornerSize} border-t-2 border-l-2 rounded-tl-[2px] ${tier.cornerAccentClass} opacity-85`}
          />
          <span
            className={`absolute top-1.5 right-1.5 ${cornerSize} border-t-2 border-r-2 rounded-tr-[2px] ${tier.cornerAccentClass} opacity-85`}
          />
          <span
            className={`absolute bottom-1.5 left-1.5 ${cornerSize} border-b-2 border-l-2 rounded-bl-[2px] ${tier.cornerAccentClass} opacity-85`}
          />
          <span
            className={`absolute bottom-1.5 right-1.5 ${cornerSize} border-b-2 border-r-2 rounded-br-[2px] ${tier.cornerAccentClass} opacity-85`}
          />
        </>
      )}
    </div>
  );
}

interface CardTierRoadmapProps {
  currentLevel: number;
  className?: string;
}

/**
 * 5-Tier visual ladder for the Evolution Chamber & Detail Modal:
 * Bronze (1-2) -> Silver (3-4) -> Gold (5-6) -> Diamond (7-8) -> Legendary Trump Card (9-10)
 */
export function CardTierRoadmap({
  currentLevel,
  className = '',
}: CardTierRoadmapProps) {
  const activeTier = getCardTierForLevel(currentLevel);
  const activeIdx = CARD_TIERS.findIndex((t) => t.id === activeTier.id);

  return (
    <div
      data-testid="card-tier-roadmap"
      className={`rounded-md bg-[#0B0E17] border border-white/10 p-3 space-y-2.5 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#9CA3B8]">
            Card Level Tier Ladder
          </span>
          <CardTierBadge level={currentLevel} showLevel />
        </div>
        <span className={`text-[11px] font-medium ${activeTier.textClass}`}>
          {activeTier.perkSummary}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {CARD_TIERS.map((tier, idx) => {
          const isCurrent = idx === activeIdx;
          const isUnlocked = idx <= activeIdx;
          return (
            <div
              key={tier.id}
              data-tier-step={tier.id}
              data-active={isCurrent ? 'true' : 'false'}
              className={`relative overflow-hidden rounded-md px-2.5 py-2 transition-all ${
                isCurrent
                  ? `${tier.frameCssClass} text-[#F5EFE0]`
                  : isUnlocked
                    ? `${tier.frameCssClass} opacity-90 text-[#D8DCE8]`
                    : 'border border-white/10 bg-[#0D101A] text-[#7A8299]'
              }`}
            >
              {isCurrent && (
                <div
                  aria-hidden="true"
                  className={`${tier.overlayCssClass} opacity-65`}
                />
              )}
              <div className="relative z-10">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold uppercase tracking-wide ${
                      isUnlocked ? tier.textClass : ''
                    }`}
                  >
                    <TierIcon tierId={tier.id} className="w-3 h-3 shrink-0" />
                    <span>{tier.id === 'trump' ? 'Trump Card' : tier.name}</span>
                  </span>
                  {isUnlocked && !isCurrent && (
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                  )}
                </div>
                <p className="text-[10px] font-mono opacity-80 mt-0.5">
                  Lv.{tier.minLevel}–{tier.maxLevel}
                  {tier.isLegendaryTrump ? ' · Legendary' : ''}
                </p>
                <p className="text-[10px] mt-1 leading-tight opacity-85">
                  {tier.combatStatBonusPct > 0
                    ? `+${tier.combatStatBonusPct}% Combat`
                    : 'Base Stats'}
                  {tier.startingEnergyBonus > 0
                    ? ` · +${tier.startingEnergyBonus} EN`
                    : ''}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
