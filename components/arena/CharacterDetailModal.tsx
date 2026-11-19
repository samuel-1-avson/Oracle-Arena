'use client';

import React, { useEffect } from 'react';
import Image from 'next/image';
import { Shield, Swords, X, Zap } from 'lucide-react';
import { validateCharacterBalance } from '@/lib/game/balance';
import { STANDARD_GUARD_ABILITY } from '@/lib/game/roster';
import { CharacterDefinition } from '@/lib/game/types';
import { ELEMENT_STYLES, formatTargetLabel } from './ui-meta';

interface CharacterDetailModalProps {
  character: CharacterDefinition | null;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function CharacterDetailModal({
  character,
  onClose,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: CharacterDetailModalProps) {
  useEffect(() => {
    if (!character) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [character, onClose]);

  if (!character) return null;

  const elem = ELEMENT_STYLES[character.element];
  const balance = validateCharacterBalance(character);
  const allAbilities = [
    character.basicAttack,
    STANDARD_GUARD_ABILITY,
    ...character.specialAbilities,
    ...(character.ultimateAbility ? [character.ultimateAbility] : []),
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="character-detail-title"
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#111521] border border-[#D4AF37]/35 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 bg-[#111521] border-b border-white/10">
          <div className="min-w-0">
            <h2
              id="character-detail-title"
              className="font-display text-xl sm:text-2xl font-bold text-[#F5EFE0] truncate"
            >
              {character.name}
            </h2>
            <p className="text-xs sm:text-sm text-[#9CA3B8]">
              {character.title} ·{' '}
              <span className={elem.text}>
                {character.role} / {character.element}
              </span>{' '}
              · {character.rarity} · Level {character.level}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close character details"
            onClick={onClose}
            className="p-2 rounded-md text-[#9CA3B8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 grid md:grid-cols-[260px_1fr] gap-6">
          {/* Left Column: Portrait + Provenance + Stats */}
          <div className="space-y-5">
            <div className="relative w-full aspect-[3/4] rounded-md overflow-hidden border border-[#D4AF37]/30 bg-[#090B10]">
              <Image
                src={character.artworkUrl}
                alt={character.name}
                fill
                sizes="260px"
                referrerPolicy="no-referrer"
                className="object-cover object-top"
              />
            </div>

            {/* Core Stats */}
            <div className="space-y-2.5 pt-1 border-t border-white/10">
              <div className="flex items-center justify-between text-xs text-[#9CA3B8]">
                <span className="font-semibold text-[#ECEEF4]">
                  Combat Attributes
                </span>
                <span className="font-mono tabular-nums">
                  Budget {balance.statBudgetUsed}/{balance.statBudgetCap}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono tabular-nums">
                <div className="flex justify-between">
                  <dt className="text-[#8F96AB]">Max HP</dt>
                  <dd className="text-emerald-300 font-semibold">
                    {character.stats.maxHp}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8F96AB]">Attack</dt>
                  <dd className="text-rose-300 font-semibold">
                    {character.stats.attack}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8F96AB]">Defense</dt>
                  <dd className="text-sky-300 font-semibold">
                    {character.stats.defense}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8F96AB]">Speed</dt>
                  <dd className="text-amber-300 font-semibold">
                    {character.stats.speed}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8F96AB]">Energy</dt>
                  <dd className="text-violet-300 font-semibold">
                    {character.stats.startingEnergy}/{character.stats.maxEnergy}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8F96AB]">Healing</dt>
                  <dd className="text-yellow-200 font-semibold">
                    {character.stats.healingPower}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Immutable Ownership & Progression Summary */}
            <div className="space-y-1.5 pt-3 border-t border-white/10 text-xs text-[#9CA3B8]">
              <p className="font-semibold text-[#ECEEF4]">
                Identity & Progression
              </p>
              <p className="font-mono text-[11px] truncate">
                ID: {character.id}
              </p>
              <p>Original Creator: {character.originalCreatorName}</p>
              <p>Oracle Profile: {character.oracleProfile}</p>
              <p className="font-mono tabular-nums text-[#C4C9D8]">
                Lv.{character.level} · {character.xp} XP · Stage{' '}
                {character.evolutionStage ?? 0}/2
              </p>
              {(character.upgradePoints > 0 ||
                character.abilityCreationPoints > 0) && (
                <p className="font-mono tabular-nums text-emerald-300">
                  {character.upgradePoints} UP ·{' '}
                  {character.abilityCreationPoints} ACP available
                </p>
              )}
              <p>
                Ruleset {character.rulesetVersion} · Schema{' '}
                {character.contentSchemaVersion}
              </p>
            </div>
          </div>

          {/* Right Column: Lore, Strengths/Weaknesses, Complete Ability Kit */}
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-[#F5DC8B] tracking-wide">
                Backstory & Temperament
              </h3>
              <p className="text-sm text-[#D0D5E2] leading-relaxed">
                {character.backstory}
              </p>
              <p className="text-xs text-[#9CA3B8]">
                Personality: {character.personality}
              </p>
            </section>

            <section className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-white/10 text-xs">
              <div className="space-y-1">
                <h4 className="font-semibold text-emerald-300">Strengths</h4>
                <ul className="space-y-1 text-[#C4C9D8]">
                  {character.strengths.map((s) => (
                    <li key={s}>· {s}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-rose-300">Weaknesses</h4>
                <ul className="space-y-1 text-[#C4C9D8]">
                  {character.weaknesses.map((w) => (
                    <li key={w}>· {w}</li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Abilities */}
            <section className="space-y-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#F5DC8B] tracking-wide">
                  Equipped Ability Kit ({character.abilitySlotCapacity} Slots +
                  Basic & Guard)
                </h3>
              </div>

              <div className="divide-y divide-white/10 border border-white/10 rounded-md bg-[#0D101A]">
                {allAbilities.map((ability) => (
                  <div key={ability.id} className="p-3.5 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {ability.category === 'guard' ? (
                          <Shield className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                        ) : ability.category === 'ultimate' ? (
                          <Zap className="w-3.5 h-3.5 text-[#E5C158] shrink-0" />
                        ) : (
                          <Swords className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                        )}
                        <span className="font-semibold text-sm text-[#F5EFE0]">
                          {ability.name}
                        </span>
                        <span className="text-xs text-[#8F96AB] capitalize">
                          {ability.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 text-xs font-mono tabular-nums text-[#A6ADC2]">
                        <span>{formatTargetLabel(ability.targetType)}</span>
                        <span aria-hidden="true">·</span>
                        {ability.energyCost > 0 ? (
                          <span className="text-violet-300">
                            {ability.energyCost} EN
                          </span>
                        ) : (
                          <span className="text-emerald-300">
                            +{ability.energyGain} EN
                          </span>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>
                          {ability.cooldown > 0
                            ? `${ability.cooldown}t CD`
                            : 'No CD'}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-[#C4C9D8] leading-relaxed">
                      {ability.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Evolution & Progression Chronicle */}
            {((character.evolutionHistory?.length ?? 0) > 0 ||
              (character.upgradeHistory?.length ?? 0) > 0) && (
              <section className="space-y-2.5 pt-3 border-t border-white/10">
                <h3 className="text-sm font-semibold text-[#F5DC8B] tracking-wide">
                  Evolution & Upgrade History
                </h3>
                <ul className="space-y-1.5 text-xs text-[#C4C9D8]">
                  {character.evolutionHistory.map((ev, idx) => (
                    <li key={`ev-${ev.stage}-${idx}`}>
                      <span className="font-mono text-[#F5DC8B]">
                        Stage {ev.stage} ({ev.title}):
                      </span>{' '}
                      {ev.summary}
                    </li>
                  ))}
                  {(character.upgradeHistory ?? []).slice(0, 4).map((tx) => (
                    <li key={tx.id} className="text-[#9CA3B8]">
                      · {tx.summary}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Footer Action */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[#C4C9D8] hover:text-white rounded-md hover:bg-white/5 transition-colors cursor-pointer"
              >
                Close
              </button>
              {secondaryActionLabel && onSecondaryAction && (
                <button
                  type="button"
                  onClick={onSecondaryAction}
                  className="px-4 py-2 text-sm font-semibold rounded-md bg-violet-500/20 border border-violet-400/45 text-violet-100 hover:bg-violet-500/30 transition-colors cursor-pointer"
                >
                  {secondaryActionLabel}
                </button>
              )}
              {actionLabel && onAction && (
                <button
                  type="button"
                  onClick={onAction}
                  className="px-5 py-2 text-sm font-semibold rounded-md bg-[#D4AF37] text-[#0B0D13] hover:bg-[#E5C454] transition-colors cursor-pointer"
                >
                  {actionLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
