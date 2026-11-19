'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpCircle,
  Check,
  Crown,
  History,
  Layers,
  Loader2,
  Shield,
  Sparkles,
  Swords,
  Zap,
} from 'lucide-react';
import { validateCharacterBalance } from '@/lib/game/balance';
import {
  ABILITY_POINT_MILESTONE_LEVELS,
  applyStatUpgrade,
  EVOLUTION_REQUIREMENTS,
  evolveCharacter,
  getXpForNextLevel,
  getXpProgressWithinLevel,
  MAX_CHARACTER_LEVEL,
  MAX_UPGRADES_PER_STAT,
  normalizeCharacterProgression,
  STAT_UPGRADE_INCREMENTS,
  toggleEquipLearnedAbility,
  unlockCustomAbility,
  UpgradableStatKey,
} from '@/lib/game/progression';
import { STANDARD_GUARD_ABILITY } from '@/lib/game/roster';
import { CharacterDefinition } from '@/lib/game/types';
import { CompiledSingleAbilityResult } from '@/lib/oracle/compiler';
import { AccountBar } from './AccountBar';
import { ELEMENT_STYLES, formatTargetLabel } from './ui-meta';

interface EvolutionChamberProps {
  characters: CharacterDefinition[];
  initialSelectedId?: string | null;
  selectedSquadIds: string[];
  onUpdateCharacter: (updated: CharacterDefinition) => void;
  onOpenCollection: () => void;
  onOpenStudio: () => void;
  onStartBattle: () => void;
  onBackToTitle: () => void;
}

type ChamberTab = 'attributes' | 'forge' | 'evolution';

const STAT_ORDER: UpgradableStatKey[] = [
  'maxHp',
  'attack',
  'defense',
  'speed',
  'healingPower',
];

const ABILITY_EXAMPLE_PROMPTS = [
  'A concentrated beam that pierces a single foe and inflicts Burn for 2 turns.',
  'An arcane bastion that shields all allies and grants Fortify for 2 turns.',
  'A temporal surge that empowers an ally, restores Energy, and trims cooldowns.',
];

export function EvolutionChamber({
  characters,
  initialSelectedId,
  selectedSquadIds,
  onUpdateCharacter,
  onOpenCollection,
  onOpenStudio,
  onStartBattle,
  onBackToTitle,
}: EvolutionChamberProps) {
  const normalizedRoster = useMemo(
    () => characters.map(normalizeCharacterProgression),
    [characters]
  );

  const [selectedId, setSelectedId] = useState<string>(() => {
    if (
      initialSelectedId &&
      normalizedRoster.some((c) => c.id === initialSelectedId)
    ) {
      return initialSelectedId;
    }
    const ready = normalizedRoster.find(
      (c) => c.upgradePoints > 0 || c.abilityCreationPoints > 0 || c.xp > 0
    );
    return ready?.id ?? normalizedRoster[0]?.id ?? '';
  });

  const [activeTab, setActiveTab] = useState<ChamberTab>('attributes');
  const [chamberFeedback, setChamberFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  // Ability Forge State
  const [abilityCategory, setAbilityCategory] = useState<'special' | 'ultimate'>(
    'special'
  );
  const [abilityPrompt, setAbilityPrompt] = useState('');
  const [isForging, setIsForging] = useState(false);
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [draftedAbility, setDraftedAbility] =
    useState<CompiledSingleAbilityResult | null>(null);

  // Evolution Form State
  const [evolveTitle, setEvolveTitle] = useState('');
  const [evolveLore, setEvolveLore] = useState('');

  const selected = useMemo(
    () =>
      normalizedRoster.find((c) => c.id === selectedId) ?? normalizedRoster[0],
    [normalizedRoster, selectedId]
  );

  if (!selected) return null;

  const xpProgress = getXpProgressWithinLevel(selected);
  const nextLevelXp = getXpForNextLevel(selected.level);
  const balance = validateCharacterBalance(selected);
  const elem = ELEMENT_STYLES[selected.element];
  const inSquad = selectedSquadIds.includes(selected.id);
  const equippedSlotsUsed =
    selected.specialAbilities.length + (selected.ultimateAbility ? 1 : 0);

  const nextEvoStage =
    selected.evolutionStage < 2
      ? ((selected.evolutionStage + 1) as 1 | 2)
      : null;
  const nextEvoReq = nextEvoStage ? EVOLUTION_REQUIREMENTS[nextEvoStage] : null;
  const canEvolveNow = Boolean(
    nextEvoReq && selected.level >= nextEvoReq.minLevel
  );

  const handleSelectChampion = (id: string) => {
    setSelectedId(id);
    setChamberFeedback(null);
    setForgeError(null);
    setDraftedAbility(null);
    setEvolveTitle('');
    setEvolveLore('');
  };

  const handleUpgradeStat = (stat: UpgradableStatKey) => {
    setChamberFeedback(null);
    const res = applyStatUpgrade(selected, stat);
    if (!res.ok) {
      setChamberFeedback({ tone: 'error', message: res.error });
      return;
    }
    onUpdateCharacter(res.character);
    const inc = STAT_UPGRADE_INCREMENTS[stat];
    setChamberFeedback({
      tone: 'success',
      message: `${selected.name} gained +${inc.delta} ${inc.unit} (${res.character.upgradePoints} UP remaining).`,
    });
  };

  const handleDraftAbility = async () => {
    setForgeError(null);
    setChamberFeedback(null);

    if (abilityPrompt.trim().length < 10) {
      setForgeError(
        'Describe your new ability in at least 10 characters before consulting The Oracle.'
      );
      return;
    }

    setIsForging(true);
    try {
      const response = await fetch('/api/oracle/ability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: selected.id,
          characterName: selected.name,
          characterRole: selected.role,
          characterElement: selected.element,
          characterLevel: selected.level,
          existingAbilityNames: [
            selected.basicAttack.name,
            ...selected.learnedAbilities.map((a) => a.name),
          ],
          abilityDescription: abilityPrompt.trim(),
          category: abilityCategory,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setForgeError(
          data?.error || 'The Oracle could not compile this ability.'
        );
        return;
      }

      setDraftedAbility(data as CompiledSingleAbilityResult);
    } catch {
      setForgeError(
        'Network error while consulting the Ability Forge. Please retry.'
      );
    } finally {
      setIsForging(false);
    }
  };

  const handleApproveAbility = () => {
    if (!draftedAbility) return;
    setForgeError(null);
    setChamberFeedback(null);

    const res = unlockCustomAbility(selected, draftedAbility.ability);
    if (!res.ok) {
      setForgeError(res.error);
      return;
    }

    onUpdateCharacter(res.character);
    const equippedNow =
      res.character.specialAbilities.some(
        (a) => a.id === draftedAbility.ability.id
      ) || res.character.ultimateAbility?.id === draftedAbility.ability.id;

    setChamberFeedback({
      tone: 'success',
      message: `Unlocked "${draftedAbility.ability.name}" on ${selected.name}${
        equippedNow
          ? ' and equipped it for battle.'
          : '. Open Loadout & Evolution to equip it.'
      }`,
    });
    setDraftedAbility(null);
    setAbilityPrompt('');
  };

  const handleToggleEquip = (abilityId: string) => {
    setChamberFeedback(null);
    const res = toggleEquipLearnedAbility(selected, abilityId);
    if (!res.ok) {
      setChamberFeedback({ tone: 'error', message: res.error });
      return;
    }
    onUpdateCharacter(res.character);
    setChamberFeedback({
      tone: 'success',
      message: `Updated ${selected.name}'s active battle loadout.`,
    });
  };

  const handleEvolve = () => {
    setChamberFeedback(null);
    const res = evolveCharacter(selected, {
      newTitle: evolveTitle.trim() || `${selected.title} Ascended`,
      loreNote: evolveLore.trim(),
    });
    if (!res.ok) {
      setChamberFeedback({ tone: 'error', message: res.error });
      return;
    }
    onUpdateCharacter(res.character);
    setEvolveTitle('');
    setEvolveLore('');
    setChamberFeedback({
      tone: 'success',
      message: `${selected.name} evolved to Stage ${res.character.evolutionStage} ("${res.character.title}"). Original creator attribution preserved.`,
    });
  };

  return (
    <main className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col">
      {/* Compact Game Shell Toolbar */}
      <div className="sticky top-0 z-20 bg-[#0D101A]/95 border-b border-white/10 px-4 sm:px-8 py-3.5">
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
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#F5DC8B] tracking-wide whitespace-nowrap">
              Evolution Chamber
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenStudio}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-violet-200 bg-violet-500/15 border border-violet-400/40 rounded-md hover:bg-violet-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Oracle Studio</span>
            </button>

            <button
              type="button"
              onClick={onOpenCollection}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-[#C4C9D8] hover:text-white border border-white/15 rounded-md hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>Collection</span>
            </button>

            <button
              type="button"
              data-start="true"
              onClick={onStartBattle}
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 text-xs sm:text-sm font-semibold rounded-md bg-[#D4AF37] text-[#0B0D13] hover:bg-[#E5C454] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Swords className="w-4 h-4 shrink-0" />
              <span>Enter Battle</span>
            </button>

            <AccountBar compact />
          </div>
        </div>
      </div>

      {/* Main Chamber Grid */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-[310px_1fr] gap-6 flex-1">
        {/* LEFT RAIL: CHAMPION SELECTOR */}
        <aside
          aria-label="Champions eligible for progression"
          className="bg-[#111521] border border-white/10 rounded-lg p-3.5 flex flex-col gap-2.5 self-start lg:sticky lg:top-20 max-h-[calc(100vh-7rem)] overflow-y-auto"
        >
          <div className="flex items-center justify-between px-1 pb-2 border-b border-white/10">
            <h2 className="font-display text-sm font-bold text-[#F5EFE0] tracking-wide">
              Your Champions
            </h2>
            <span className="text-[11px] font-mono tabular-nums text-[#8F96AB]">
              {normalizedRoster.length} Cards
            </span>
          </div>

          <div className="space-y-1.5">
            {normalizedRoster.map((card) => {
              const isSelected = card.id === selected.id;
              const prog = getXpProgressWithinLevel(card);
              const cardInSquad = selectedSquadIds.includes(card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleSelectChampion(card.id)}
                  className={`w-full text-left p-2 rounded-md border transition-all flex items-center gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[#1D1B14] border-[#D4AF37]/75'
                      : 'bg-[#0C0F18] border-white/8 hover:border-white/25 hover:bg-[#141927]'
                  }`}
                >
                  <div className="relative w-10 h-12 rounded-sm overflow-hidden border border-white/15 shrink-0 bg-[#141927]">
                    <Image
                      src={card.artworkUrl}
                      alt={card.name}
                      fill
                      sizes="40px"
                      referrerPolicy="no-referrer"
                      className="object-cover object-top"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="text-xs font-semibold text-[#F5EFE0] truncate">
                        {card.name}
                      </p>
                      <span className="text-[11px] font-mono tabular-nums text-[#F5DC8B] shrink-0">
                        Lv.{card.level}
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-sm bg-black/50 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#D4AF37]"
                        style={{ width: `${prog.percent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-[#8F96AB]">
                      <span>
                        {cardInSquad ? 'In Squad' : card.role}
                        {card.evolutionStage > 0
                          ? ` · Stage ${card.evolutionStage}`
                          : ''}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {card.upgradePoints > 0 && (
                          <span className="text-emerald-300 font-semibold">
                            {card.upgradePoints} UP
                          </span>
                        )}
                        {card.abilityCreationPoints > 0 && (
                          <span className="text-violet-300 font-semibold">
                            {card.abilityCreationPoints} ACP
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* RIGHT WORKSPACE */}
        <section className="space-y-5 min-w-0">
          {/* Selected Champion Hero Strip */}
          <div className="bg-[#111521] border border-[#D4AF37]/30 rounded-lg p-5 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="relative w-20 h-24 rounded-md overflow-hidden border border-[#D4AF37]/50 shrink-0 bg-[#0B0E17]">
              <Image
                src={selected.artworkUrl}
                alt={selected.name}
                fill
                priority
                sizes="80px"
                referrerPolicy="no-referrer"
                className="object-cover object-top"
              />
            </div>

            <div className="flex-1 min-w-0 space-y-2.5 w-full">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-2xl font-bold text-[#F5EFE0] truncate">
                    {selected.name}
                  </h2>
                  <p className="text-xs sm:text-sm text-[#9CA3B8]">
                    {selected.title} ·{' '}
                    <span className={elem.text}>
                      {selected.role} / {selected.element}
                    </span>{' '}
                    · {selected.rarity}
                    {selected.evolutionStage > 0
                      ? ` · Evolution Stage ${selected.evolutionStage}`
                      : ''}
                  </p>
                  <p className="text-[11px] font-mono text-[#7C849B] mt-0.5">
                    Creator: {selected.originalCreatorName} · Matches:{' '}
                    {selected.combatRecord.matchesPlayed} (
                    {selected.combatRecord.wins}W){' '}
                    {inSquad ? '· Active Squad' : ''}
                  </p>
                </div>

                {/* Live Resource Readouts */}
                <dl className="flex items-center gap-4 font-mono tabular-nums text-xs bg-[#0B0E17] border border-white/10 rounded-md px-3.5 py-2 shrink-0">
                  <div>
                    <dt className="text-[10px] text-[#8F96AB]">LEVEL</dt>
                    <dd className="text-base font-bold text-[#F5DC8B]">
                      {selected.level}
                      <span className="text-xs text-[#6B7287]">
                        /{MAX_CHARACTER_LEVEL}
                      </span>
                    </dd>
                  </div>
                  <div className="h-7 w-px bg-white/10" aria-hidden="true" />
                  <div>
                    <dt className="text-[10px] text-[#8F96AB]">UPGRADE PTS</dt>
                    <dd className="text-base font-bold text-emerald-300">
                      {selected.upgradePoints}
                    </dd>
                  </div>
                  <div className="h-7 w-px bg-white/10" aria-hidden="true" />
                  <div>
                    <dt className="text-[10px] text-[#8F96AB]">ABILITY PTS</dt>
                    <dd className="text-base font-bold text-violet-300">
                      {selected.abilityCreationPoints}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* XP Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#9CA3B8]">
                  <span>
                    Experience: {selected.xp} XP
                    {nextLevelXp !== null
                      ? ` (${nextLevelXp - selected.xp} XP to Level ${selected.level + 1})`
                      : ' (Max Level)'}
                  </span>
                  <span>
                    Budget {balance.statBudgetUsed}/{balance.statBudgetCap}
                  </span>
                </div>
                <div className="w-full h-2 rounded-sm bg-[#090B10] border border-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#8B5CF6] via-[#38BDF8] to-[#D4AF37] transition-all duration-300"
                    style={{ width: `${xpProgress.percent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Chamber Tabs */}
          <div
            role="tablist"
            aria-label="Evolution Chamber sections"
            className="flex flex-wrap items-center gap-1.5 p-1 bg-[#111521] border border-white/10 rounded-md w-fit"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'attributes'}
              onClick={() => setActiveTab('attributes')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium rounded transition-colors cursor-pointer ${
                activeTab === 'attributes'
                  ? 'bg-[#D4AF37] text-[#0B0D13] font-semibold'
                  : 'text-[#A6ADC2] hover:text-[#F5EFE0]'
              }`}
            >
              <ArrowUpCircle className="w-4 h-4 shrink-0" />
              <span>Attributes & Upgrades</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'forge'}
              onClick={() => setActiveTab('forge')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium rounded transition-colors cursor-pointer ${
                activeTab === 'forge'
                  ? 'bg-[#D4AF37] text-[#0B0D13] font-semibold'
                  : 'text-[#A6ADC2] hover:text-[#F5EFE0]'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                Forge New Ability
                {selected.abilityCreationPoints > 0
                  ? ` (${selected.abilityCreationPoints})`
                  : ''}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'evolution'}
              onClick={() => setActiveTab('evolution')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium rounded transition-colors cursor-pointer ${
                activeTab === 'evolution'
                  ? 'bg-[#D4AF37] text-[#0B0D13] font-semibold'
                  : 'text-[#A6ADC2] hover:text-[#F5EFE0]'
              }`}
            >
              <Crown className="w-4 h-4 shrink-0" />
              <span>Loadout & Evolution</span>
            </button>
          </div>

          {/* Feedback Banner */}
          {chamberFeedback && (
            <div
              role={chamberFeedback.tone === 'error' ? 'alert' : 'status'}
              className={`rounded-md px-4 py-3 text-xs sm:text-sm flex items-center gap-2.5 border ${
                chamberFeedback.tone === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-500/45 text-rose-200'
              }`}
            >
              {chamberFeedback.tone === 'success' ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{chamberFeedback.message}</span>
            </div>
          )}

          {/* TAB 1: ATTRIBUTES & UPGRADES */}
          {activeTab === 'attributes' && (
            <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.9fr] gap-5">
              <div className="bg-[#111521] border border-white/10 rounded-lg p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-[#F5EFE0]">
                      Attribute Progression
                    </h3>
                    <p className="text-xs text-[#9CA3B8]">
                      Earn +2 Upgrade Points every level and +1 Ability Point at
                      Levels {Array.from(ABILITY_POINT_MILESTONE_LEVELS).join(', ')}.
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-emerald-300 font-semibold">
                    {selected.upgradePoints} UP Available
                  </span>
                </div>

                <div className="divide-y divide-white/8">
                  {STAT_ORDER.map((statKey) => {
                    const meta = STAT_UPGRADE_INCREMENTS[statKey];
                    const currentVal = selected.stats[statKey];
                    const rank = selected.statUpgrades[statKey];
                    const maxed = rank >= MAX_UPGRADES_PER_STAT;
                    const disabled = selected.upgradePoints < 1 || maxed;

                    return (
                      <div
                        key={statKey}
                        className="py-3.5 flex flex-wrap items-center justify-between gap-4"
                      >
                        <div className="space-y-1 min-w-[170px]">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#F5EFE0]">
                              {meta.label}
                            </span>
                            <span className="text-xs font-mono tabular-nums text-[#8F96AB]">
                              Rank {rank}/{MAX_UPGRADES_PER_STAT}
                            </span>
                          </div>
                          {/* 5-pip rank bar */}
                          <div className="flex items-center gap-1">
                            {[0, 1, 2, 3, 4].map((pip) => (
                              <span
                                key={pip}
                                className={`h-1.5 w-6 rounded-xs ${
                                  pip < rank
                                    ? 'bg-[#D4AF37]'
                                    : 'bg-white/10'
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 font-mono tabular-nums">
                          <div className="text-right">
                            <p className="text-base font-bold text-[#ECEEF4]">
                              {currentVal}{' '}
                              <span className="text-xs font-normal text-[#8F96AB]">
                                {meta.unit}
                              </span>
                            </p>
                            {!maxed && (
                              <p className="text-[11px] text-emerald-300">
                                Next: {currentVal + meta.delta} (+{meta.delta})
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => handleUpgradeStat(statKey)}
                            className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                              disabled
                                ? 'bg-[#0B0E17] border border-white/10 text-[#6B7287] cursor-not-allowed'
                                : 'bg-[#D4AF37] text-[#0B0D13] hover:bg-[#E5C454] cursor-pointer'
                            }`}
                          >
                            {maxed ? 'Maxed' : `Upgrade (+${meta.delta})`}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Progression Ledger */}
              <div className="bg-[#111521] border border-white/10 rounded-lg p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[#D4AF37]" />
                    <h3 className="font-display text-base font-bold text-[#F5EFE0]">
                      Upgrade Ledger
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-[#8F96AB]">
                    {selected.upgradeHistory.length} records
                  </span>
                </div>

                {selected.upgradeHistory.length === 0 ? (
                  <p className="text-xs text-[#9CA3B8] leading-relaxed py-4">
                    No progression transactions recorded yet. Complete a 5v5
                    battle with {selected.name} to earn validated XP, Upgrade
                    Points, and Ability Creation Points.
                  </p>
                ) : (
                  <ol className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {selected.upgradeHistory.map((tx) => (
                      <li
                        key={tx.id}
                        className="p-2.5 rounded bg-[#0B0E17] border border-white/8 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-[#7C849B]">
                          <span className="uppercase tracking-wider text-[#D4AF37]">
                            {tx.kind.replace('_', ' ')}
                          </span>
                          <span>
                            {new Date(tx.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-[#D0D5E2] leading-snug">
                          {tx.summary}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: FORGE NEW ABILITY */}
          {activeTab === 'forge' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* Left Form */}
              <div className="bg-[#111521] border border-white/10 rounded-lg p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-[#F5EFE0]">
                      Describe a New Ability
                    </h3>
                    <p className="text-xs text-[#9CA3B8]">
                      The Oracle compiles your description into a balanced combat
                      ability using structured rules.
                    </p>
                  </div>
                  <span
                    className={`text-xs font-mono font-semibold ${
                      selected.abilityCreationPoints > 0
                        ? 'text-violet-300'
                        : 'text-amber-300'
                    }`}
                  >
                    {selected.abilityCreationPoints} ACP Available
                  </span>
                </div>

                {/* Category Selector */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-[#C4C9D8]">
                    Ability Category
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    {(['special', 'ultimate'] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setAbilityCategory(cat);
                          setDraftedAbility(null);
                        }}
                        className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                          abilityCategory === cat
                            ? 'bg-[#1D1830] border-violet-400/70 text-[#F5EFE0]'
                            : 'bg-[#0B0E17] border-white/10 text-[#9CA3B8] hover:border-white/25'
                        }`}
                      >
                        <p className="text-xs font-semibold capitalize">
                          {cat} Ability
                        </p>
                        <p className="text-[11px] text-[#8F96AB] mt-0.5">
                          {cat === 'special'
                            ? '25–45 EN · 2–3t CD · Tactical rotation'
                            : '60–76 EN · 4t CD · High-impact finisher'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prompt Textarea */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="ability-concept-input"
                    className="block text-xs font-medium text-[#C4C9D8]"
                  >
                    Natural-Language Ability Concept for {selected.name}
                  </label>
                  <textarea
                    id="ability-concept-input"
                    rows={4}
                    maxLength={600}
                    value={abilityPrompt}
                    onChange={(e) => setAbilityPrompt(e.target.value)}
                    placeholder={`Describe a new ${abilityCategory} move fitting ${selected.name} (${selected.element} ${selected.role})...`}
                    className="w-full rounded-md bg-[#090B10] border border-white/15 px-3.5 py-2.5 text-sm text-[#F5EFE0] placeholder:text-[#666E85] focus:outline-none focus:border-[#D4AF37]"
                  />
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] text-[#7C849B]">Ideas:</span>
                    {ABILITY_EXAMPLE_PROMPTS.map((sample, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAbilityPrompt(sample)}
                        className="text-[11px] text-[#A6ADC2] hover:text-[#F5DC8B] underline decoration-white/20 underline-offset-2 cursor-pointer"
                      >
                        Preset {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>

                {forgeError && (
                  <div
                    role="alert"
                    className="rounded-md bg-rose-950/60 border border-rose-500/45 px-3.5 py-2.5 text-xs text-rose-200 flex items-start gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{forgeError}</span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={isForging}
                  onClick={handleDraftAbility}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-sm hover:bg-[#E5C454] disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {isForging ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Consulting Oracle Ability Compiler...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Draft Ability with Oracle</span>
                    </>
                  )}
                </button>
              </div>

              {/* Right Preview & Approval */}
              <div className="bg-[#111521] border border-white/10 rounded-lg p-5 flex flex-col justify-between gap-4">
                {!draftedAbility ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4 space-y-2.5">
                    <Zap className="w-8 h-8 text-[#D4AF37]/60" />
                    <h4 className="font-display text-base font-bold text-[#F5EFE0]">
                      Ability Blueprint Preview
                    </h4>
                    <p className="text-xs text-[#9CA3B8] max-w-sm leading-relaxed">
                      Submit a description to inspect the compiled combat
                      numbers, status effects, energy cost, and Balance Compiler
                      audit before approving and unlocking.
                    </p>
                    {selected.abilityCreationPoints < 1 && (
                      <p className="text-xs text-amber-300 max-w-sm pt-2">
                        {selected.name} currently has 0 ACP. Win a battle to
                        reach Level 2 (+1 ACP), or draft a preview now.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
                        <div>
                          <p className="text-[11px] font-mono uppercase tracking-wider text-violet-300">
                            Compiled {draftedAbility.ability.category} Ability
                          </p>
                          <h4 className="font-display text-xl font-bold text-[#F5EFE0]">
                            {draftedAbility.ability.name}
                          </h4>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-emerald-300">
                          Budget {draftedAbility.budgetUsed}/
                          {draftedAbility.budgetCap}
                        </span>
                      </div>

                      <p className="text-sm text-[#D0D5E2] leading-relaxed">
                        {draftedAbility.ability.description}
                      </p>

                      <dl className="grid grid-cols-3 gap-2.5 text-center font-mono tabular-nums text-xs bg-[#0B0E17] border border-white/10 rounded-md p-3">
                        <div>
                          <dt className="text-[10px] text-[#8F96AB]">TARGET</dt>
                          <dd className="text-[#F5EFE0] font-semibold mt-0.5">
                            {formatTargetLabel(
                              draftedAbility.ability.targetType
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-[#8F96AB]">ENERGY</dt>
                          <dd className="text-violet-300 font-semibold mt-0.5">
                            {draftedAbility.ability.energyCost} EN
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-[#8F96AB]">
                            COOLDOWN
                          </dt>
                          <dd className="text-sky-300 font-semibold mt-0.5">
                            {draftedAbility.ability.cooldown} turns
                          </dd>
                        </div>
                      </dl>

                      {/* Mechanical Breakdown */}
                      <div className="text-xs font-mono tabular-nums text-[#C4C9D8] space-y-1 bg-[#0B0E17] border border-white/8 rounded-md p-3">
                        {draftedAbility.ability.damageMultiplier > 0 && (
                          <p>
                            Damage:{' '}
                            <span className="text-rose-300">
                              {Math.round(
                                draftedAbility.ability.damageMultiplier * 100
                              )}
                              % ATK + {draftedAbility.ability.flatDamage}
                            </span>
                          </p>
                        )}
                        {draftedAbility.ability.healMultiplier > 0 && (
                          <p>
                            Healing:{' '}
                            <span className="text-emerald-300">
                              {Math.round(
                                draftedAbility.ability.healMultiplier * 100
                              )}
                              % HEAL + {draftedAbility.ability.flatHeal}
                            </span>
                          </p>
                        )}
                        {draftedAbility.ability.shieldAmount > 0 && (
                          <p>
                            Shield:{' '}
                            <span className="text-sky-300">
                              +{draftedAbility.ability.shieldAmount} barrier
                            </span>
                          </p>
                        )}
                        {draftedAbility.ability.statuses.length > 0 && (
                          <p>
                            Effects:{' '}
                            <span className="text-amber-300">
                              {draftedAbility.ability.statuses
                                .map(
                                  (s) =>
                                    `${s.type} (${s.duration}t, ${Math.round(s.chance * 100)}%)`
                                )
                                .join(', ')}
                            </span>
                          </p>
                        )}
                        <p className="text-[#8F96AB] pt-1 font-sans">
                          Visual: {draftedAbility.ability.visualEffect}
                        </p>
                      </div>

                      {/* Balance Compiler Explanation */}
                      <div
                        className={`rounded-md p-3 text-xs border ${
                          draftedAbility.adjusted
                            ? 'bg-amber-950/35 border-amber-500/40 text-amber-200'
                            : 'bg-emerald-950/30 border-emerald-500/35 text-emerald-200'
                        }`}
                      >
                        {draftedAbility.explanation}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setDraftedAbility(null)}
                        className="px-4 py-2 text-xs font-medium text-[#9CA3B8] hover:text-white cursor-pointer"
                      >
                        Discard Draft
                      </button>
                      <button
                        type="button"
                        disabled={selected.abilityCreationPoints < 1}
                        onClick={handleApproveAbility}
                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                          selected.abilityCreationPoints >= 1
                            ? 'bg-emerald-500 text-[#090B10] hover:bg-emerald-400 cursor-pointer'
                            : 'bg-[#1A2030] text-[#7C849B] border border-white/10 cursor-not-allowed'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                        <span>
                          {selected.abilityCreationPoints >= 1
                            ? 'Approve & Unlock Ability (1 ACP)'
                            : 'Need 1 ACP (Reach Level 2)'}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: LOADOUT & EVOLUTION */}
          {activeTab === 'evolution' && (
            <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.95fr] gap-5">
              {/* Active Battle Loadout */}
              <div className="bg-[#111521] border border-white/10 rounded-lg p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-[#F5EFE0]">
                      Battle Ability Loadout
                    </h3>
                    <p className="text-xs text-[#9CA3B8]">
                      Equip up to {selected.abilitySlotCapacity} Special &
                      Ultimate abilities. Basic Attack & Tactical Guard are
                      always available.
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[#F5DC8B] font-semibold">
                    {equippedSlotsUsed}/{selected.abilitySlotCapacity} Slots
                    Used
                  </span>
                </div>

                {/* Permanent Staples */}
                <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded bg-[#0B0E17] border border-white/8">
                    <div className="flex items-center gap-1.5 text-[#D8DCE8] font-semibold">
                      <Swords className="w-3.5 h-3.5 text-violet-300" />
                      <span>{selected.basicAttack.name}</span>
                      <span className="text-[10px] font-mono text-[#7C849B] ml-auto">
                        Basic · Fixed
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded bg-[#0B0E17] border border-white/8">
                    <div className="flex items-center gap-1.5 text-[#D8DCE8] font-semibold">
                      <Shield className="w-3.5 h-3.5 text-sky-300" />
                      <span>{STANDARD_GUARD_ABILITY.name}</span>
                      <span className="text-[10px] font-mono text-[#7C849B] ml-auto">
                        Guard · Fixed
                      </span>
                    </div>
                  </div>
                </div>

                {/* Learned Ability Library */}
                <div className="space-y-2.5">
                  {selected.learnedAbilities.map((ability) => {
                    const isEquipped =
                      ability.category === 'ultimate'
                        ? selected.ultimateAbility?.id === ability.id
                        : selected.specialAbilities.some(
                            (a) => a.id === ability.id
                          );

                    return (
                      <div
                        key={ability.id}
                        className={`p-3.5 rounded-md border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isEquipped
                            ? 'bg-[#191B29] border-[#D4AF37]/45'
                            : 'bg-[#0B0E17] border-white/8'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-[#F5EFE0]">
                              {ability.name}
                            </span>
                            <span className="text-[11px] font-mono uppercase text-violet-300">
                              {ability.category}
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-[#8F96AB]">
                              {ability.energyCost} EN · {ability.cooldown}t CD ·{' '}
                              {formatTargetLabel(ability.targetType)}
                            </span>
                          </div>
                          <p className="text-xs text-[#9CA3B8] leading-snug">
                            {ability.description}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleEquip(ability.id)}
                          className={`px-3.5 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isEquipped
                              ? 'bg-[#D4AF37]/20 text-[#F5DC8B] border border-[#D4AF37]/50 hover:bg-[#D4AF37]/30'
                              : 'bg-[#182032] text-[#ECEEF4] border border-white/15 hover:bg-[#222C42]'
                          }`}
                        >
                          {isEquipped ? 'Equipped' : 'Equip'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Evolution Altar + Chronicle */}
              <div className="space-y-5">
                <div className="bg-[#111521] border border-[#D4AF37]/30 rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-[#F5DC8B]" />
                      <h3 className="font-display text-base font-bold text-[#F5EFE0]">
                        Evolution Altar
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-[#F5DC8B]">
                      Stage {selected.evolutionStage}/2
                    </span>
                  </div>

                  {nextEvoReq && nextEvoStage ? (
                    <div className="space-y-3.5">
                      <div className="p-3 rounded bg-[#0B0E17] border border-white/10 space-y-1 text-xs">
                        <p className="font-semibold text-[#F5EFE0]">
                          Next: {nextEvoReq.label}
                        </p>
                        <p className="text-[#9CA3B8]">
                          Requirement: Level {nextEvoReq.minLevel} (Current:
                          Level {selected.level})
                        </p>
                        <p className="font-mono text-emerald-300">
                          Grants: +{nextEvoReq.hpBonus} HP, +
                          {nextEvoReq.atkBonus} ATK, +{nextEvoReq.defBonus} DEF
                        </p>
                        <p className="text-[11px] text-[#7C849B]">
                          Immutable ID ({selected.id}) and Original Creator (
                          {selected.originalCreatorName}) remain permanently
                          preserved.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="evolve-title-input"
                          className="block text-xs font-medium text-[#C4C9D8]"
                        >
                          Evolved Title
                        </label>
                        <input
                          id="evolve-title-input"
                          type="text"
                          maxLength={56}
                          value={evolveTitle}
                          onChange={(e) => setEvolveTitle(e.target.value)}
                          placeholder={`${selected.title} Ascended`}
                          className="w-full rounded-md bg-[#090B10] border border-white/15 px-3 py-2 text-xs text-[#F5EFE0] placeholder:text-[#666E85] focus:outline-none focus:border-[#D4AF37]"
                        />
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="evolve-lore-input"
                          className="block text-xs font-medium text-[#C4C9D8]"
                        >
                          Evolution Chronicle Note (optional)
                        </label>
                        <textarea
                          id="evolve-lore-input"
                          rows={2}
                          maxLength={220}
                          value={evolveLore}
                          onChange={(e) => setEvolveLore(e.target.value)}
                          placeholder="Record how this champion grew through arena combat..."
                          className="w-full rounded-md bg-[#090B10] border border-white/15 px-3 py-2 text-xs text-[#F5EFE0] placeholder:text-[#666E85] focus:outline-none focus:border-[#D4AF37]"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={!canEvolveNow}
                        onClick={handleEvolve}
                        className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                          canEvolveNow
                            ? 'bg-[#D4AF37] text-[#0B0D13] hover:bg-[#E5C454] cursor-pointer'
                            : 'bg-[#181D2B] text-[#7C849B] border border-white/10 cursor-not-allowed'
                        }`}
                      >
                        <Crown className="w-4 h-4" />
                        <span>
                          {canEvolveNow
                            ? `Evolve to Stage ${nextEvoStage}`
                            : `Requires Level ${nextEvoReq.minLevel}`}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-300">
                      {selected.name} has reached Mythic Transcendence (Stage
                      II), the pinnacle evolution tier.
                    </p>
                  )}
                </div>

                {/* Evolution Chronicle */}
                <div className="bg-[#111521] border border-white/10 rounded-lg p-5 space-y-3">
                  <h4 className="font-display text-sm font-bold text-[#F5EFE0]">
                    Evolution Chronicle
                  </h4>
                  <ol className="space-y-2.5 text-xs">
                    {selected.evolutionHistory.map((ev, idx) => (
                      <li
                        key={`${ev.stage}-${idx}`}
                        className="p-2.5 rounded bg-[#0B0E17] border border-white/8 space-y-0.5"
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-[#F5DC8B] font-semibold">
                            Stage {ev.stage} · {ev.title}
                          </span>
                        </div>
                        <p className="text-[#9CA3B8] leading-snug">
                          {ev.summary}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
