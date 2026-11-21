'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  CheckCircle2,
  Crown,
  Flame,
  Layers,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  GAUNTLET_ENCOUNTERS,
  GauntletBossEncounter,
  GauntletProgressRecord,
} from '@/lib/game/gauntlet';
import { getCharacterById, STARTER_CHARACTERS } from '@/lib/game/roster';
import { computeSquadSynergies } from '@/lib/game/synergy';
import { CharacterDefinition } from '@/lib/game/types';
import { AccountBar } from './AccountBar';

interface GauntletViewProps {
  activeSquad: CharacterDefinition[];
  progress: GauntletProgressRecord;
  syncingCloud?: boolean;
  onChallengeBoss: (encounter: GauntletBossEncounter) => void;
  onOpenCollection: () => void;
  onStartStandardBattle: () => void;
  onBackToTitle: () => void;
}

const DIFFICULTY_STYLES: Record<
  GauntletBossEncounter['difficulty'],
  string
> = {
  Veteran: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10',
  Elite: 'text-sky-300 border-sky-400/40 bg-sky-500/10',
  Master: 'text-amber-300 border-amber-400/45 bg-amber-500/10',
  'Mythic Boss': 'text-rose-300 border-rose-400/50 bg-rose-500/15',
};

export function GauntletView({
  activeSquad,
  progress,
  syncingCloud = false,
  onChallengeBoss,
  onOpenCollection,
  onStartStandardBattle,
  onBackToTitle,
}: GauntletViewProps) {
  const clearedSet = useMemo(
    () => new Set(progress.clearedEncounterIds),
    [progress.clearedEncounterIds]
  );

  const playerSynergies = useMemo(
    () => computeSquadSynergies(activeSquad),
    [activeSquad]
  );

  const clearedCount = GAUNTLET_ENCOUNTERS.filter((e) =>
    clearedSet.has(e.id)
  ).length;

  return (
    <main className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col">
      {/* Top Shell Toolbar */}
      <header className="sticky top-0 z-20 bg-[#0D101A]/95 border-b border-white/10 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBackToTitle}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C4C9D8] hover:text-[#F5EFE0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>Title</span>
            </button>
            <div className="h-4 w-px bg-white/15" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <h1 className="font-display text-lg sm:text-xl font-bold text-[#F5DC8B] tracking-wide whitespace-nowrap">
                PvE Boss Gauntlet
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenCollection}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-[#C4C9D8] hover:text-white border border-white/15 rounded-md hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>Edit Squad</span>
            </button>
            <button
              type="button"
              onClick={onStartStandardBattle}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-sky-200 bg-sky-500/15 border border-sky-400/40 rounded-md hover:bg-sky-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Swords className="w-3.5 h-3.5 shrink-0" />
              <span>Standard Skirmish</span>
            </button>
            <AccountBar syncingCloud={syncingCloud} compact />
          </div>
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 flex-1 space-y-6">
        {/* Campaign Overview & Active Squad Synergy Readiness */}
        <section
          aria-label="Gauntlet Campaign Readiness"
          className="rounded-lg bg-[#111521] border border-[#D4AF37]/30 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
        >
          <div className="space-y-1.5 max-w-2xl">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#D4AF37]">
              Solo Progression · Escalating Boss Mechanics
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F5EFE0]">
              Conquer Four Apex Arena Wardens
            </h2>
            <p className="text-xs sm:text-sm text-[#9CA3B8] leading-relaxed">
              Each Boss commands a scaled 5-champion formation backed by a unique
              passive battlefield rule. Optimize your squad synergies and
              elemental counters to clear every tier.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 shrink-0">
            <div className="rounded-md bg-[#0B0E17] border border-white/10 px-4 py-2.5 text-center min-w-[132px]">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[#8F96AB]">
                Campaign Clear
              </p>
              <p className="font-mono tabular-nums text-xl font-bold text-[#F5DC8B] mt-0.5">
                {clearedCount} / {GAUNTLET_ENCOUNTERS.length}
              </p>
            </div>

            <div className="rounded-md bg-[#0B0E17] border border-white/10 px-4 py-2.5 space-y-1 max-w-xs">
              <p className="text-[10px] font-mono uppercase tracking-wider text-sky-300">
                Your Active Synergies
              </p>
              {playerSynergies.synergies.length > 0 ? (
                <p className="text-xs text-[#ECEEF4] font-medium leading-snug">
                  {playerSynergies.synergies.map((s) => s.name).join(' · ')}
                </p>
              ) : (
                <p className="text-xs text-[#8F96AB]">
                  No squad synergies active — edit formation for bonuses.
                </p>
              )}
              <p className="text-[11px] font-mono tabular-nums text-[#9CA3B8]">
                {playerSynergies.totalAttackPct > 0
                  ? `+${playerSynergies.totalAttackPct}% ATK `
                  : ''}
                {playerSynergies.totalDefensePct > 0
                  ? `+${playerSynergies.totalDefensePct}% DEF `
                  : ''}
                {playerSynergies.totalSpeedFlat > 0
                  ? `+${playerSynergies.totalSpeedFlat} SPD `
                  : ''}
                {playerSynergies.totalHealingPct > 0
                  ? `+${playerSynergies.totalHealingPct}% HEAL`
                  : ''}
              </p>
            </div>
          </div>
        </section>

        {/* 4 Escalating Boss Encounter Cards */}
        <section
          aria-label="Boss Encounters"
          className="grid grid-cols-1 lg:grid-cols-2 gap-5"
        >
          {GAUNTLET_ENCOUNTERS.map((encounter) => {
            const isCleared = clearedSet.has(encounter.id);
            const bestTurns = progress.bestTurnsByEncounter[encounter.id];
            const clearCount = progress.clearCounts[encounter.id] ?? 0;

            const squadNames = encounter.enemySquadIds.map((id, idx) => {
              const card = getCharacterById(id, STARTER_CHARACTERS);
              const label = card?.name ?? id;
              return idx === encounter.bossSlotIndex ? `${label} (Boss)` : label;
            });

            return (
              <article
                key={encounter.id}
                data-testid={`gauntlet-stage-${encounter.stage}`}
                className={`rounded-lg bg-[#121622] border overflow-hidden flex flex-col justify-between transition-colors ${
                  isCleared
                    ? 'border-emerald-400/45 shadow-[0_0_24px_rgba(16,185,129,0.1)]'
                    : encounter.stage === 4
                      ? 'border-rose-400/45 shadow-[0_0_26px_rgba(244,63,94,0.12)]'
                      : 'border-white/12 hover:border-[#D4AF37]/45'
                }`}
              >
                <div>
                  {/* Boss Header Banner */}
                  <div className="relative h-40 w-full bg-[#0B0E17] overflow-hidden">
                    <Image
                      src={encounter.bossArtworkUrl}
                      alt={encounter.bossName}
                      fill
                      priority={encounter.stage <= 2}
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      referrerPolicy="no-referrer"
                      className="object-cover object-top"
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          'linear-gradient(90deg, rgba(9,11,16,0.92) 0%, rgba(9,11,16,0.68) 55%, rgba(9,11,16,0.35) 100%)',
                      }}
                    />
                    <div className="absolute inset-0 p-4 sm:p-5 flex flex-col justify-between">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded border text-[11px] font-mono font-semibold ${
                            DIFFICULTY_STYLES[encounter.difficulty]
                          }`}
                        >
                          <Crown className="w-3 h-3 shrink-0" />
                          <span>{encounter.difficulty}</span>
                        </span>

                        {isCleared && (
                          <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-emerald-300 bg-[#090B10]/85 px-2.5 py-0.5 rounded border border-emerald-400/40">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Cleared{bestTurns ? ` · Best ${bestTurns}t` : ''}
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="space-y-0.5 max-w-md">
                        <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#F5DC8B]">
                          {encounter.title}
                        </p>
                        <h3 className="font-display text-xl sm:text-2xl font-bold text-[#F5EFE0] leading-tight">
                          {encounter.bossName}
                        </h3>
                        <p className="text-xs text-[#C4C9D8]">
                          {encounter.bossTitle} · Boss HP +
                          {Math.round(encounter.bossHpBonusPct * 100)}% · Enemy
                          Scale {Math.round(encounter.statScale * 100)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Encounter Details & Unique Boss Passive */}
                  <div className="p-4 sm:p-5 space-y-3.5">
                    <p className="text-xs sm:text-sm text-[#B8BFD2] leading-relaxed">
                      {encounter.subtitle}
                    </p>

                    <div className="rounded-md bg-[#0B0E17] border border-amber-400/30 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F5DC8B]">
                        {encounter.bossPassiveId === 'iron_bulwark' ? (
                          <Shield className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                        ) : encounter.bossPassiveId === 'ember_nova' ? (
                          <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                        ) : encounter.bossPassiveId === 'singularity_core' ? (
                          <Zap className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-fuchsia-300 shrink-0" />
                        )}
                        <span>Boss Passive: {encounter.bossPassiveName}</span>
                      </div>
                      <p className="text-xs text-[#C4C9D8] leading-relaxed">
                        {encounter.bossPassiveDescription}
                      </p>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      <p className="font-mono uppercase tracking-wider text-[#7C849B]">
                        Enemy 5-Champion Lineup
                      </p>
                      <p className="text-[#C4C9D8] leading-relaxed">
                        {squadNames.join(' · ')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer Rewards + Challenge CTA */}
                <div className="px-4 sm:px-5 py-3.5 bg-[#0D101A] border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-[#A6ADC2]">
                    <span className="inline-flex items-center gap-1 text-[#F5DC8B]">
                      <Trophy className="w-3.5 h-3.5 shrink-0" />
                      <span>+{encounter.rewardXpBonusPct}% XP</span>
                    </span>
                    <span className="text-white/20">·</span>
                    <span className="text-sky-300">
                      +{encounter.rewardShards} Shards
                    </span>
                    {clearCount > 0 && (
                      <>
                        <span className="text-white/20">·</span>
                        <span className="text-emerald-300">
                          {clearCount}× Cleared
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onChallengeBoss(encounter)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D4AF37] text-[#0B0D13] text-xs sm:text-sm font-semibold hover:bg-[#E5C454] active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Swords className="w-4 h-4 shrink-0" />
                    <span>
                      {isCleared ? 'Rematch Boss' : `Challenge Stage ${encounter.stage}`}
                    </span>
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
