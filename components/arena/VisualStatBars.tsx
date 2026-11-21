'use client';

import React from 'react';
import { Heart, Shield, Sparkles, Swords, Zap } from 'lucide-react';
import { getCardVisualStats, TraitDefinition } from '@/lib/game/traits';
import { CharacterDefinition } from '@/lib/game/types';

interface VisualStatBarsProps {
  character: CharacterDefinition;
  compact?: boolean;
  showTraits?: boolean;
  showCounters?: boolean;
}

function MeterRow({
  icon,
  label,
  filled,
  colorClass,
  rawValue,
  compact,
}: {
  icon: React.ReactNode;
  label: string;
  filled: number;
  colorClass: string;
  rawValue: number;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 w-16 shrink-0 text-[11px] font-medium text-[#C4C9D8]">
        {icon}
        <span>{label}</span>
      </span>
      <div
        className="flex-1 grid grid-cols-5 gap-1"
        aria-label={`${label}: ${filled} out of 5 (${rawValue})`}
      >
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={`block rounded-xs transition-all duration-150 ${
              compact ? 'h-1.5' : 'h-2'
            } ${step <= filled ? colorClass : 'bg-white/10'}`}
          />
        ))}
      </div>
      {!compact && (
        <span className="w-8 text-right font-mono tabular-nums text-[11px] text-[#9CA3B8]">
          {rawValue}
        </span>
      )}
    </div>
  );
}

/**
 * Simple, kid-friendly graphical stat readout:
 * - Big clear Overall Power score (PWR)
 * - 4 crisp 5-block visual meters (Power, Health, Armor, Speed)
 * - Plain-English Trait list + Auto-Counter highlight (zero dense numeric walls!)
 */
export function VisualStatBars({
  character,
  compact = false,
  showTraits = true,
  showCounters = true,
}: VisualStatBarsProps) {
  const visual = getCardVisualStats(character);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/10">
        <span className="text-[11px] font-medium text-[#9CA3B8]">
          Battle Power
        </span>
        <span className="font-mono tabular-nums text-sm font-bold text-[#F5DC8B]">
          {visual.powerRating} PWR
        </span>
      </div>

      <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
        <MeterRow
          icon={<Swords className="w-3 h-3 text-rose-300 shrink-0" />}
          label="Power"
          filled={visual.powerBars}
          colorClass="bg-rose-400"
          rawValue={character.stats.attack}
          compact={compact}
        />
        <MeterRow
          icon={<Heart className="w-3 h-3 text-emerald-300 shrink-0" />}
          label="Health"
          filled={visual.healthBars}
          colorClass="bg-emerald-400"
          rawValue={character.stats.maxHp}
          compact={compact}
        />
        <MeterRow
          icon={<Shield className="w-3 h-3 text-sky-300 shrink-0" />}
          label="Armor"
          filled={visual.armorBars}
          colorClass="bg-sky-400"
          rawValue={character.stats.defense}
          compact={compact}
        />
        <MeterRow
          icon={<Zap className="w-3 h-3 text-amber-300 shrink-0" />}
          label="Speed"
          filled={visual.speedBars}
          colorClass="bg-amber-400"
          rawValue={character.stats.speed}
          compact={compact}
        />
      </div>

      {showTraits && visual.traits.length > 0 && (
        <div className="pt-1.5 border-t border-white/10 space-y-1">
          <p className="text-[11px] text-[#D0D5E2] leading-snug">
            <span className="text-[#8F96AB] font-medium">Skills: </span>
            {visual.traits.map((t: TraitDefinition, idx: number) => (
              <React.Fragment key={t.id}>
                {idx > 0 && <span className="text-[#6B7287]"> · </span>}
                <span className="font-medium text-[#F5EFE0]">{t.name}</span>
              </React.Fragment>
            ))}
          </p>
          {showCounters && visual.counterHighlights.length > 0 && (
            <p className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>{visual.counterHighlights[0]}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
