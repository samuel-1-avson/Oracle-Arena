'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpCircle,
  Check,
  Eye,
  PackageOpen,
  RotateCcw,
  Sparkles,
  Store,
  Swords,
  Trash2,
  X,
} from 'lucide-react';
import { computeCharacterStatBudget } from '@/lib/game/balance';
import { DEFAULT_PLAYER_SQUAD_IDS } from '@/lib/game/roster';
import { computeSquadSynergies } from '@/lib/game/synergy';
import { CharacterDefinition, CombatRole } from '@/lib/game/types';
import { AccountBar } from './AccountBar';
import { CharacterDetailModal } from './CharacterDetailModal';
import { ELEMENT_STYLES } from './ui-meta';
import { VisualStatBars } from './VisualStatBars';

interface CollectionViewProps {
  characters: CharacterDefinition[];
  selectedSquadIds: string[];
  onChangeSquad: (ids: string[]) => void;
  onDeleteCustomCard: (cardId: string) => void;
  onOpenPackVault?: () => void;
  onOpenBlindClash?: () => void;
  onOpenStudio: () => void;
  onOpenEvolutionChamber: (focusDefId?: string) => void;
  onOpenMarketplace: () => void;
  onOpenTradingHub: () => void;
  onStartBattle: () => void;
  onBackToTitle: () => void;
}

const ROLE_FILTERS: Array<'All' | 'Custom' | CombatRole> = [
  'All',
  'Custom',
  'Vanguard',
  'Striker',
  'Arcanist',
  'Warden',
  'Tactician',
];

export function CollectionView({
  characters,
  selectedSquadIds,
  onChangeSquad,
  onDeleteCustomCard,
  onOpenPackVault,
  onOpenBlindClash,
  onOpenStudio,
  onOpenEvolutionChamber,
  onOpenMarketplace,
  onOpenTradingHub,
  onStartBattle,
  onBackToTitle,
}: CollectionViewProps) {
  const [roleFilter, setRoleFilter] = useState<'All' | 'Custom' | CombatRole>(
    'All'
  );
  const [inspectCard, setInspectCard] = useState<CharacterDefinition | null>(
    null
  );
  const [squadNotice, setSquadNotice] = useState<string | null>(null);

  const filteredCharacters = useMemo(() => {
    if (roleFilter === 'All') return characters;
    if (roleFilter === 'Custom') {
      return characters.filter((c) => c.id.startsWith('chr-custom-'));
    }
    return characters.filter((c) => c.role === roleFilter);
  }, [characters, roleFilter]);

  const squadCharacters = useMemo(() => {
    return selectedSquadIds
      .map((id) => characters.find((c) => c.id === id))
      .filter((c): c is CharacterDefinition => Boolean(c));
  }, [characters, selectedSquadIds]);

  const totalBudget = useMemo(
    () =>
      squadCharacters.reduce(
        (sum, c) => sum + computeCharacterStatBudget(c),
        0
      ),
    [squadCharacters]
  );

  const squadSynergies = useMemo(
    () => computeSquadSynergies(squadCharacters),
    [squadCharacters]
  );

  const toggleInSquad = (id: string) => {
    setSquadNotice(null);
    if (selectedSquadIds.includes(id)) {
      onChangeSquad(selectedSquadIds.filter((item) => item !== id));
    } else if (selectedSquadIds.length < 5) {
      onChangeSquad([...selectedSquadIds, id]);
    } else {
      setSquadNotice(
        'Your active squad holds 5 champions. Remove one before adding another.'
      );
    }
  };

  const handleLaunch = () => {
    if (selectedSquadIds.length !== 5) {
      setSquadNotice(
        `Select ${5 - selectedSquadIds.length} more champion${
          5 - selectedSquadIds.length === 1 ? '' : 's'
        } to complete a 5-card battle squad.`
      );
      return;
    }
    onStartBattle();
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
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#F5EFE0] tracking-wide whitespace-nowrap">
              Card Collection & Squad
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenPackVault && (
              <button
                type="button"
                onClick={onOpenPackVault}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-[#F5DC8B] bg-[#D4AF37]/15 border border-[#D4AF37]/40 rounded-md hover:bg-[#D4AF37]/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <PackageOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Packs</span>
              </button>
            )}

            {onOpenBlindClash && (
              <button
                type="button"
                onClick={onOpenBlindClash}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-amber-200 bg-amber-500/15 border border-amber-400/40 rounded-md hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Swords className="w-3.5 h-3.5 shrink-0" />
                <span>Blind Clash</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenMarketplace}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-[#F5DC8B] bg-[#D4AF37]/15 border border-[#D4AF37]/40 rounded-md hover:bg-[#D4AF37]/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Store className="w-3.5 h-3.5 shrink-0" />
              <span>Marketplace</span>
            </button>

            <button
              type="button"
              onClick={onOpenTradingHub}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-sky-200 bg-sky-500/15 border border-sky-400/40 rounded-md hover:bg-sky-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
              <span>Friends Trade</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenEvolutionChamber()}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-emerald-200 bg-emerald-500/15 border border-emerald-400/35 rounded-md hover:bg-emerald-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Evolution</span>
            </button>

            <button
              type="button"
              onClick={onOpenStudio}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-violet-200 bg-violet-500/15 border border-violet-400/40 rounded-md hover:bg-violet-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Oracle Studio</span>
            </button>

            <button
              type="button"
              data-start="true"
              onClick={handleLaunch}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedSquadIds.length === 5
                  ? 'bg-[#D4AF37] text-[#0B0D13] hover:bg-[#E5C454]'
                  : 'bg-[#1D2232] text-[#8F96AB] border border-white/15'
              }`}
            >
              <Swords className="w-3.5 h-3.5 shrink-0" />
              <span>Battle ({selectedSquadIds.length}/5)</span>
            </button>

            <AccountBar compact />
          </div>
        </div>
      </div>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6 flex-1">
        {/* Active 5-Card Squad Tray */}
        <section
          aria-label="Active Battle Squad"
          className="bg-[#111521] border border-[#D4AF37]/30 rounded-lg p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-[#F5EFE0]">
                Active Battle Formation ({selectedSquadIds.length} of 5)
              </h2>
              <p className="text-xs text-[#9CA3B8]">
                Unselected champions automatically form the rival 5-card AI
                squad.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono tabular-nums text-[#A6ADC2]">
                Squad Power Budget: {totalBudget}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSquadNotice(null);
                  onChangeSquad([...DEFAULT_PLAYER_SQUAD_IDS]);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#C4C9D8] hover:text-white border border-white/15 rounded hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 shrink-0" />
                <span>Reset Default</span>
              </button>
            </div>
          </div>

          {squadNotice && (
            <p
              role="alert"
              className="text-xs sm:text-sm text-amber-300 font-medium"
            >
              {squadNotice}
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[0, 1, 2, 3, 4].map((slotIdx) => {
              const card = squadCharacters[slotIdx];
              if (!card) {
                return (
                  <div
                    key={slotIdx}
                    className="h-16 rounded-md border border-dashed border-white/15 bg-[#0B0E17] flex items-center justify-center text-xs text-[#6B7287]"
                  >
                    Empty Slot {slotIdx + 1}
                  </div>
                );
              }
              return (
                <div
                  key={card.id}
                  className="h-16 rounded-md border border-[#D4AF37]/35 bg-[#161C2C] px-2.5 flex items-center gap-2.5 overflow-hidden"
                >
                  <div className="relative w-10 h-12 rounded-sm overflow-hidden shrink-0 border border-white/15 bg-gradient-to-b from-[#1C2338] to-[#0B0E17]">
                    <Image
                      src={card.artworkUrl}
                      alt={card.name}
                      fill
                      priority
                      sizes="40px"
                      referrerPolicy="no-referrer"
                      className="object-cover object-top"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#F5EFE0] truncate">
                      {card.name}
                    </p>
                    <p className="text-[11px] text-[#9CA3B8] truncate">
                      {card.role} · {card.element}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${card.name} from squad`}
                    onClick={() => toggleInSquad(card.id)}
                    className="p-1.5 rounded text-[#9CA3B8] hover:text-rose-300 hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Squad Synergies & Elemental Resonance Readout */}
          <div
            data-testid="collection-synergy-panel"
            className="pt-3 border-t border-white/10 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-3 items-start"
          >
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-[#F5DC8B]">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Active Squad Synergies</span>
                </span>
                {(squadSynergies.totalAttackPct > 0 ||
                  squadSynergies.totalDefensePct > 0 ||
                  squadSynergies.totalSpeedFlat > 0 ||
                  squadSynergies.totalHealingPct > 0) && (
                  <span className="text-[11px] font-mono tabular-nums text-emerald-300">
                    {squadSynergies.totalAttackPct > 0
                      ? `+${squadSynergies.totalAttackPct}% ATK `
                      : ''}
                    {squadSynergies.totalDefensePct > 0
                      ? `+${squadSynergies.totalDefensePct}% DEF `
                      : ''}
                    {squadSynergies.totalSpeedFlat > 0
                      ? `+${squadSynergies.totalSpeedFlat} SPD `
                      : ''}
                    {squadSynergies.totalHealingPct > 0
                      ? `+${squadSynergies.totalHealingPct}% HEAL`
                      : ''}
                  </span>
                )}
              </div>

              {squadSynergies.synergies.length === 0 ? (
                <p className="text-xs text-[#8F96AB]">
                  Deploy 3–5 distinct roles or 2+ champions sharing an Element to
                  activate passive combat bonuses.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {squadSynergies.synergies.map((syn) => (
                    <div
                      key={syn.id}
                      className={`rounded-md px-2.5 py-1.5 border text-xs ${
                        syn.kind === 'formation'
                          ? 'bg-[#D4AF37]/12 border-[#D4AF37]/40 text-[#F5EFE0]'
                          : 'bg-sky-500/12 border-sky-400/35 text-sky-100'
                      }`}
                    >
                      <span className="font-semibold">{syn.name}</span>
                      <span className="text-[#9CA3B8] ml-1.5 text-[11px]">
                        {syn.description}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md bg-[#0B0E17] border border-white/10 px-3 py-2 space-y-1 text-[11px]">
              <p className="font-mono uppercase tracking-wider text-sky-300">
                Elemental Resonance (+12% Resonant / -6% Dampened)
              </p>
              <p className="font-mono text-[#C4C9D8]">
                Cosmic: Solar → Void → Aether → Cyber → Solar
              </p>
              <p className="font-mono text-[#C4C9D8]">
                Primal: Ember → Frost → Storm → Iron → Ember
              </p>
            </div>
          </div>
        </section>

        {/* Role Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div
            role="tablist"
            aria-label="Filter champions by role"
            className="flex flex-wrap items-center gap-1.5 p-1 bg-[#111521] border border-white/10 rounded-md"
          >
            {ROLE_FILTERS.map((role) => {
              const active = roleFilter === role;
              return (
                <button
                  key={role}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setRoleFilter(role)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#D4AF37] text-[#0B0D13] font-semibold'
                      : 'text-[#A6ADC2] hover:text-[#F5EFE0]'
                  }`}
                >
                  {role}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-[#8F96AB] font-mono tabular-nums">
            Showing {filteredCharacters.length} of {characters.length} Champions
          </p>
        </div>

        {/* Empty State for Custom Filter */}
        {filteredCharacters.length === 0 ? (
          <div className="rounded-lg bg-[#111521] border border-white/10 p-10 text-center space-y-3">
            <p className="font-display text-lg font-bold text-[#F5EFE0]">
              No Custom Champions Yet
            </p>
            <p className="text-sm text-[#9CA3B8] max-w-md mx-auto">
              Visit Oracle Studio to describe an original character and register
              it to your playable collection.
            </p>
            <button
              type="button"
              onClick={onOpenStudio}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#D4AF37] text-[#0B0D13] text-sm font-semibold hover:bg-[#E5C454] transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Open Oracle Studio</span>
            </button>
          </div>
        ) : (
        <section
          aria-label="Champion Roster"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
        >
          {filteredCharacters.map((card) => {
            const inSquad = selectedSquadIds.includes(card.id);
            const isCustom = card.id.startsWith('chr-custom-');
            const elem = ELEMENT_STYLES[card.element];
            return (
              <article
                key={card.id}
                className={`flex flex-col rounded-lg overflow-hidden bg-[#121622] border transition-all duration-150 ${
                  inSquad
                    ? 'border-[#D4AF37]/70 shadow-[0_0_24px_rgba(212,175,55,0.16)]'
                    : 'border-white/12 hover:border-white/25'
                }`}
              >
                {/* Portrait */}
                <div className="relative w-full aspect-[4/4] bg-gradient-to-b from-[#1A2133] to-[#0B0E17] overflow-hidden">
                  <Image
                    src={card.artworkUrl}
                    alt={card.name}
                    fill
                    priority
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 20vw"
                    referrerPolicy="no-referrer"
                    className="object-cover object-top"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(9,11,16,0.25) 0%, rgba(9,11,16,0) 40%, rgba(9,11,16,0.92) 100%)',
                    }}
                  />
                  <div className="absolute bottom-2 inset-x-3">
                    <p className={`text-[11px] font-medium ${elem.text}`}>
                      {card.role} · {card.element} · Lv.{card.level}
                      {card.evolutionStage > 0 ? ` · S${card.evolutionStage}` : ''}
                    </p>
                    <h3 className="font-display text-base font-bold text-[#F5EFE0] truncate">
                      {card.name}
                    </h3>
                  </div>
                </div>

                {/* Simplified Visual Stats + Actions */}
                <div className="p-3 flex-1 flex flex-col justify-between gap-3">
                  <VisualStatBars character={card} compact />

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => toggleInSquad(card.id)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        inSquad
                          ? 'bg-[#D4AF37]/20 text-[#F5DC8B] border border-[#D4AF37]/50 hover:bg-[#D4AF37]/30'
                          : 'bg-[#1A2030] text-[#ECEEF4] border border-white/15 hover:bg-[#242C40]'
                      }`}
                    >
                      {inSquad && <Check className="w-3.5 h-3.5 shrink-0" />}
                      <span>{inSquad ? 'In Squad' : 'Add to Squad'}</span>
                    </button>

                    <button
                      type="button"
                      aria-label={`Inspect ${card.name}`}
                      onClick={() => setInspectCard(card)}
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-medium rounded-md border border-white/15 text-[#C4C9D8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5 shrink-0" />
                      <span>Inspect</span>
                    </button>

                    {isCustom && (
                      <button
                        type="button"
                        aria-label={`Delete custom card ${card.name}`}
                        onClick={() => onDeleteCustomCard(card.id)}
                        className="p-2 rounded-md border border-white/12 text-[#8F96AB] hover:text-rose-300 hover:border-rose-400/40 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
        )}
      </div>

      {/* Character Detail Modal */}
      <CharacterDetailModal
        character={inspectCard}
        onClose={() => setInspectCard(null)}
        secondaryActionLabel="Open in Evolution Chamber"
        onSecondaryAction={
          inspectCard
            ? () => {
                const targetId = inspectCard.id;
                setInspectCard(null);
                onOpenEvolutionChamber(targetId);
              }
            : undefined
        }
        actionLabel={
          inspectCard
            ? selectedSquadIds.includes(inspectCard.id)
              ? 'Remove from Squad'
              : 'Add to Squad'
            : undefined
        }
        onAction={
          inspectCard
            ? () => {
                toggleInSquad(inspectCard.id);
                setInspectCard(null);
              }
            : undefined
        }
      />
    </main>
  );
}
