'use client';

import React from 'react';
import Image from 'next/image';
import {
  Flame,
  Heart,
  Info,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { BattleUnit } from '@/lib/game/types';
import { ELEMENT_STYLES, STATUS_META } from './ui-meta';

export interface FloatingCallout {
  id: string;
  unitId: string;
  text: string;
  tone: 'damage' | 'heal' | 'shield' | 'status' | 'ko';
}

interface BattleCardProps {
  unit: BattleUnit;
  isActive: boolean;
  isTargetable: boolean;
  isSelectedTarget: boolean;
  hitFlash: 'damage' | 'heal' | 'shield' | null;
  callouts: FloatingCallout[];
  onSelectTarget: (unitId: string) => void;
  onInspect: (definitionId: string) => void;
}

export function BattleCard({
  unit,
  isActive,
  isTargetable,
  isSelectedTarget,
  hitFlash,
  callouts,
  onSelectTarget,
  onInspect,
}: BattleCardProps) {
  const elem = ELEMENT_STYLES[unit.element];
  const hpPct = Math.max(0, Math.min(100, (unit.currentHp / unit.maxHp) * 100));
  const shieldPct = Math.max(
    0,
    Math.min(100, (unit.shield / unit.maxHp) * 100)
  );
  const energyPct = Math.max(
    0,
    Math.min(100, (unit.currentEnergy / unit.maxEnergy) * 100)
  );

  const hpBarColor =
    hpPct > 55
      ? 'bg-emerald-500'
      : hpPct > 28
        ? 'bg-amber-400'
        : 'bg-rose-500';

  const frameClasses = !unit.alive
    ? 'border-white/10 opacity-45 grayscale'
    : isTargetable
      ? unit.side === 'enemy'
        ? 'border-rose-400 shadow-[0_0_24px_rgba(244,63,94,0.38)] ring-2 ring-rose-400/50 -translate-y-1'
        : 'border-sky-400 shadow-[0_0_24px_rgba(56,189,248,0.38)] ring-2 ring-sky-400/50 -translate-y-1'
      : isActive
        ? 'border-[#E5C158] shadow-[0_0_28px_rgba(212,175,55,0.36)] ring-2 ring-[#D4AF37]/45 -translate-y-1.5'
        : isSelectedTarget
          ? 'border-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.3)]'
          : 'border-white/15 hover:border-white/30';

  const flashOverlay =
    hitFlash === 'damage'
      ? 'bg-rose-500/35'
      : hitFlash === 'heal'
        ? 'bg-emerald-400/30'
        : hitFlash === 'shield'
          ? 'bg-sky-400/30'
          : '';

  return (
    <div
      data-testid={`battle-unit-${unit.instanceId}`}
      data-side={unit.side}
      data-alive={unit.alive ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
      className={`relative flex flex-col rounded-lg bg-[#121622] border transition-all duration-200 select-none ${frameClasses}`}
    >
      {/* Floating Combat Delta Callouts */}
      {callouts.length > 0 && (
        <div
          className="pointer-events-none absolute -top-3 inset-x-0 z-30 flex flex-col items-center gap-0.5"
          aria-live="polite"
        >
          {callouts.map((c) => (
            <span
              key={c.id}
              className={`font-mono tabular-nums font-bold text-sm sm:text-base px-2 py-0.5 rounded bg-[#090B10]/90 border border-white/15 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                c.tone === 'damage'
                  ? 'text-rose-400'
                  : c.tone === 'heal'
                    ? 'text-emerald-300'
                    : c.tone === 'shield'
                      ? 'text-sky-300'
                      : c.tone === 'ko'
                        ? 'text-amber-300'
                        : 'text-violet-300'
              }`}
            >
              {c.text}
            </span>
          ))}
        </div>
      )}

      {/* Main Clickable Card Surface for Targeting */}
      <button
        type="button"
        disabled={!isTargetable}
        onClick={() => {
          if (isTargetable) onSelectTarget(unit.instanceId);
        }}
        aria-label={
          isTargetable
            ? `Target ${unit.name} (${unit.currentHp} of ${unit.maxHp} HP)`
            : `${unit.name} — ${unit.alive ? `${unit.currentHp} of ${unit.maxHp} HP` : 'Defeated'}`
        }
        className={`relative w-full text-left flex flex-col rounded-lg overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] ${
          isTargetable ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        {/* Portrait Art Container */}
        <div className="relative w-full aspect-[4/3] md:aspect-[16/10] bg-gradient-to-b from-[#1A2133] to-[#0B0E17] overflow-hidden">
          <Image
            src={unit.artworkUrl}
            alt={unit.name}
            fill
            priority
            sizes="(max-width: 768px) 45vw, 18vw"
            referrerPolicy="no-referrer"
            className="object-cover object-top transition-transform duration-300"
          />

          {/* Contrast Scrim */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(9,11,16,0.48) 0%, rgba(9,11,16,0.05) 36%, rgba(9,11,16,0.88) 100%)',
            }}
          />

          {/* Impact Hit Flash */}
          {flashOverlay && (
            <div
              className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-200 ${flashOverlay}`}
            />
          )}

          {/* Top Left Active / Target Indicator (Explicit Text, Never Hue-Only) */}
          <div className="absolute top-1.5 left-2 right-8 z-10 flex items-center justify-between gap-1 text-[11px] font-medium">
            {isActive && unit.alive ? (
              <span className="font-mono font-semibold text-[#F5DC8B] tracking-wide drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                ACTIVE TURN
              </span>
            ) : isTargetable ? (
              <span
                className={`font-mono font-semibold tracking-wide drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] ${
                  unit.side === 'enemy' ? 'text-rose-300' : 'text-sky-300'
                }`}
              >
                SELECT TARGET
              </span>
            ) : !unit.alive ? (
              <span className="font-mono font-semibold text-zinc-400 tracking-wide">
                DEFEATED
              </span>
            ) : (
              <span className={`truncate drop-shadow ${elem.text}`}>
                {unit.role} · {unit.element}
              </span>
            )}
          </div>

          {/* Bottom Name Overlay over Scrim */}
          <div className="absolute bottom-1 inset-x-2 z-10">
            <p className="font-display font-bold text-xs sm:text-sm text-[#F5EFE0] truncate leading-tight">
              {unit.name}
            </p>
          </div>
        </div>

        {/* Stat Bars & Status Footer */}
        <div className="px-2 py-1.5 sm:px-2.5 sm:py-2 space-y-1 bg-[#121622]">
          {/* HP Bar + Trailing Ghost */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
              <span className="inline-flex items-center gap-1 text-[#D8DCE8]">
                <Heart className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>
                  {unit.currentHp}/{unit.maxHp}
                </span>
              </span>
              {unit.shield > 0 && (
                <span className="inline-flex items-center gap-0.5 text-sky-300 font-semibold">
                  <Shield className="w-3 h-3 shrink-0" />
                  <span>+{unit.shield}</span>
                </span>
              )}
            </div>
            <div className="relative h-2 w-full rounded-sm bg-[#090B10] overflow-hidden border border-white/10">
              {/* Delayed drain ghost */}
              <div
                className="absolute inset-y-0 left-0 bg-white/30 transition-all duration-700 ease-out"
                style={{ width: `${hpPct}%` }}
              />
              {/* Actual HP fill */}
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-200 ease-out ${hpBarColor}`}
                style={{ width: `${hpPct}%` }}
              />
              {/* Shield overlay bar */}
              {unit.shield > 0 && (
                <div
                  className="absolute inset-y-0 right-0 bg-sky-400/80 transition-all duration-200"
                  style={{ width: `${Math.min(100, shieldPct)}%` }}
                />
              )}
            </div>
          </div>

          {/* Energy Bar */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#A6ADC2]">
              <span className="inline-flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 text-violet-400 shrink-0" />
                <span>EN {unit.currentEnergy}</span>
              </span>
              <span>SPD {unit.speed}</span>
            </div>
            <div className="h-1.5 w-full rounded-sm bg-[#090B10] overflow-hidden border border-white/10">
              <div
                className="h-full bg-violet-500 transition-all duration-200"
                style={{ width: `${energyPct}%` }}
              />
            </div>
          </div>

          {/* Active Statuses (Clean Unboxed Icon + Text, Zero Pill Clutter) */}
          <div className="min-h-[16px] flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono">
            {unit.statuses.length === 0 ? (
              <span className="text-[#6B7287] truncate">{unit.title}</span>
            ) : (
              unit.statuses.map((s) => {
                const meta = STATUS_META[s.type];
                return (
                  <span
                    key={s.id}
                    title={`${meta.label} (${s.remainingTurns}t): ${meta.description}`}
                    className={`inline-flex items-center gap-0.5 font-semibold ${meta.tone}`}
                  >
                    {s.type === 'burn' || s.type === 'bleed' ? (
                      <Flame className="w-2.5 h-2.5 shrink-0" />
                    ) : (
                      <Sparkles className="w-2.5 h-2.5 shrink-0" />
                    )}
                    <span>
                      {meta.short} {s.remainingTurns}t
                    </span>
                  </span>
                );
              })
            )}
          </div>
        </div>
      </button>

      {/* Inspect Button (Independent from Target Click) */}
      <button
        type="button"
        aria-label={`Inspect ${unit.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onInspect(unit.definitionId);
        }}
        className="absolute top-1.5 right-1.5 z-20 p-1 rounded bg-[#090B10]/80 text-[#C4C9D8] hover:text-[#F5DC8B] hover:bg-[#090B10] border border-white/15 transition-colors cursor-pointer"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
