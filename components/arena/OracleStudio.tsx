'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Layers,
  Loader2,
  RefreshCw,
  Shield,
  Sparkles,
  Swords,
  Zap,
} from 'lucide-react';
import {
  CharacterDefinition,
  CombatRole,
  ElementAffinity,
  OracleProfile,
} from '@/lib/game/types';
import {
  checkOriginality,
  CompiledOracleResult,
} from '@/lib/oracle/compiler';
import {
  getOracleProfileSpec,
  ORACLE_PROFILES,
  PORTRAIT_GALLERY,
} from '@/lib/oracle/profiles';
import { ELEMENT_STYLES, formatTargetLabel } from './ui-meta';

interface OracleStudioProps {
  existingCollection: CharacterDefinition[];
  onApproveCard: (card: CharacterDefinition, deployAndBattle: boolean) => void;
  onOpenCollection: () => void;
  onBackToTitle: () => void;
}

const ROLE_OPTIONS: Array<'Auto' | CombatRole> = [
  'Auto',
  'Vanguard',
  'Striker',
  'Arcanist',
  'Warden',
  'Tactician',
];

const ELEMENT_OPTIONS: Array<'Auto' | ElementAffinity> = [
  'Auto',
  'Solar',
  'Void',
  'Storm',
  'Aether',
  'Cyber',
  'Iron',
  'Ember',
  'Frost',
];

export function OracleStudio({
  existingCollection,
  onApproveCard,
  onOpenCollection,
  onBackToTitle,
}: OracleStudioProps) {
  const [selectedProfile, setSelectedProfile] =
    useState<OracleProfile>('Universal Oracle');
  const [creatorName, setCreatorName] = useState('Arena Architect');
  const [description, setDescription] = useState('');
  const [preferredRole, setPreferredRole] = useState<'Auto' | CombatRole>('Auto');
  const [preferredElement, setPreferredElement] = useState<
    'Auto' | ElementAffinity
  >('Auto');

  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [compiled, setCompiled] = useState<CompiledOracleResult | null>(null);
  const [refinementNote, setRefinementNote] = useState('');
  const [registeredNotice, setRegisteredNotice] = useState<string | null>(null);

  // Local customization fields for the active draft
  const [customName, setCustomName] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customArtwork, setCustomArtwork] = useState('');

  const profileSpec = useMemo(
    () => getOracleProfileSpec(selectedProfile),
    [selectedProfile]
  );

  // Live merged draft incorporating any direct customization edits
  const activeDraft: CharacterDefinition | null = useMemo(() => {
    if (!compiled) return null;
    return {
      ...compiled.character,
      name: customName.trim() || compiled.character.name,
      title: customTitle.trim() || compiled.character.title,
      artworkUrl: customArtwork || compiled.character.artworkUrl,
      originalCreatorName:
        creatorName.trim() || compiled.character.originalCreatorName,
    };
  }, [compiled, customName, customTitle, customArtwork, creatorName]);

  const liveOriginality = useMemo(() => {
    if (!activeDraft) return null;
    return checkOriginality(activeDraft, existingCollection);
  }, [activeDraft, existingCollection]);

  const invokeOracle = async (isRefinement: boolean) => {
    setErrorMessage(null);
    setRegisteredNotice(null);

    const trimmedDesc = description.trim();
    if (trimmedDesc.length < 10) {
      setErrorMessage(
        'Describe your character concept in at least 10 characters before consulting the Oracle.'
      );
      return;
    }

    if (isRefinement && refinementNote.trim().length < 4) {
      setErrorMessage(
        'Enter a specific refinement instruction (e.g., "Trade some HP for faster speed and a stun").'
      );
      return;
    }

    if (isRefinement) {
      setRefining(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/oracle/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: trimmedDesc,
          oracleProfile: selectedProfile,
          creatorName: creatorName.trim() || 'Arena Architect',
          preferredRole,
          preferredElement,
          artworkUrl: isRefinement ? customArtwork || undefined : undefined,
          refinementNote: isRefinement ? refinementNote.trim() : undefined,
          previousDraft: isRefinement ? activeDraft : null,
          existingCardNames: existingCollection.map((c) => c.name),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setErrorMessage(
          payload?.error || 'The Oracle could not generate a character draft.'
        );
        return;
      }

      const result = payload as CompiledOracleResult;
      setCompiled(result);
      setCustomName(result.character.name);
      setCustomTitle(result.character.title);
      setCustomArtwork(result.character.artworkUrl);
      if (isRefinement) {
        setRefinementNote('');
      }
    } catch {
      setErrorMessage(
        'Unable to reach the Oracle API route. Check your connection and try again.'
      );
    } finally {
      setLoading(false);
      setRefining(false);
    }
  };

  const handleApprove = (deployAndBattle: boolean) => {
    if (!activeDraft) return;
    onApproveCard(activeDraft, deployAndBattle);
    if (!deployAndBattle) {
      setRegisteredNotice(
        `"${activeDraft.name}" has been registered to your Card Collection with permanent creator attribution.`
      );
    }
  };

  const customCardCount = existingCollection.filter((c) =>
    c.id.startsWith('chr-custom-')
  ).length;

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
              Oracle Studio
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs font-mono tabular-nums text-[#9CA3B8]">
              Custom Champions Registered: {customCardCount}
            </span>
            <button
              type="button"
              onClick={onOpenCollection}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-[#ECEEF4] bg-[#151A28] border border-white/15 rounded-md hover:border-[#D4AF37]/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Layers className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>Collection ({existingCollection.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Two-Column Studio Workspace */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-6 flex-1 items-start">
        {/* LEFT COLUMN: Concept & Oracle Profile Controls */}
        <section
          aria-label="Character Concept Forge"
          className="bg-[#111521] border border-white/12 rounded-lg p-5 space-y-5"
        >
          <div className="space-y-1">
            <h2 className="font-display text-base font-bold text-[#F5EFE0]">
              1. Choose Oracle Profile
            </h2>
            <p className="text-xs text-[#9CA3B8]">
              Each Oracle brings a distinct creative lens while obeying the same
              universal Level 1 balance rules.
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="Oracle Profile"
            className="grid grid-cols-2 gap-2"
          >
            {ORACLE_PROFILES.map((profile) => {
              const active = selectedProfile === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelectedProfile(profile.id)}
                  className={`text-left p-2.5 rounded-md border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#211C12] border-[#D4AF37] text-[#F5EFE0]'
                      : 'bg-[#0C0F18] border-white/10 text-[#A6ADC2] hover:border-white/25 hover:text-[#ECEEF4]'
                  }`}
                >
                  <p className="text-xs font-semibold truncate">{profile.id}</p>
                  <p className="text-[11px] text-[#8F96AB] line-clamp-2 mt-0.5 leading-snug">
                    {profile.tagline}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Concept Form */}
          <div className="space-y-4 pt-2 border-t border-white/10">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="oracle-concept-input"
                  className="text-xs font-semibold text-[#ECEEF4]"
                >
                  2. Describe Your Character
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setDescription(profileSpec.samplePrompt);
                    setErrorMessage(null);
                  }}
                  className="text-[11px] font-medium text-[#E5C158] hover:underline cursor-pointer"
                >
                  Use Sample Concept
                </button>
              </div>
              <textarea
                id="oracle-concept-input"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe name, appearance, weapons, elemental powers, fighting style, strengths, and weaknesses..."
                className="w-full rounded-md bg-[#0A0D15] border border-white/15 px-3 py-2.5 text-sm text-[#ECEEF4] placeholder:text-[#6B7287] focus:outline-none focus:border-[#D4AF37] resize-y leading-relaxed"
              />
              <div className="flex items-center justify-between text-[11px] text-[#8F96AB] font-mono tabular-nums">
                <span>Natural language · No code execution</span>
                <span>{description.trim().length}/900</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="oracle-role-select"
                  className="text-xs font-medium text-[#C4C9D8]"
                >
                  Combat Role
                </label>
                <select
                  id="oracle-role-select"
                  value={preferredRole}
                  onChange={(e) =>
                    setPreferredRole(e.target.value as 'Auto' | CombatRole)
                  }
                  className="w-full rounded-md bg-[#0A0D15] border border-white/15 px-2.5 py-2 text-xs text-[#ECEEF4] focus:outline-none focus:border-[#D4AF37]"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r === 'Auto' ? 'Auto (Oracle Decides)' : r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="oracle-element-select"
                  className="text-xs font-medium text-[#C4C9D8]"
                >
                  Element Affinity
                </label>
                <select
                  id="oracle-element-select"
                  value={preferredElement}
                  onChange={(e) =>
                    setPreferredElement(
                      e.target.value as 'Auto' | ElementAffinity
                    )
                  }
                  className="w-full rounded-md bg-[#0A0D15] border border-white/15 px-2.5 py-2 text-xs text-[#ECEEF4] focus:outline-none focus:border-[#D4AF37]"
                >
                  {ELEMENT_OPTIONS.map((el) => (
                    <option key={el} value={el}>
                      {el === 'Auto' ? 'Auto (Oracle Decides)' : el}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="oracle-creator-input"
                className="text-xs font-medium text-[#C4C9D8]"
              >
                Permanent Creator Attribution
              </label>
              <input
                id="oracle-creator-input"
                type="text"
                maxLength={36}
                value={creatorName}
                onChange={(e) => setCreatorName(e.target.value)}
                placeholder="Your creator handle"
                className="w-full rounded-md bg-[#0A0D15] border border-white/15 px-3 py-2 text-xs text-[#ECEEF4] placeholder:text-[#6B7287] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-md bg-rose-500/12 border border-rose-500/40 px-3.5 py-2.5 text-xs text-rose-200 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="button"
              disabled={loading || refining}
              onClick={() => invokeOracle(false)}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-sm hover:bg-[#E5C454] disabled:opacity-60 transition-colors cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>Consulting {selectedProfile}...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>Generate Character Draft</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* RIGHT COLUMN: Live Draft Preview, Balance Report, Refinement & Approval */}
        <section
          aria-label="Oracle Draft Preview and Validation"
          className="space-y-5"
        >
          {registeredNotice && (
            <div
              role="status"
              className="rounded-md bg-emerald-500/12 border border-emerald-500/40 px-4 py-3 text-sm text-emerald-200 flex flex-wrap items-center justify-between gap-3"
            >
              <span className="inline-flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{registeredNotice}</span>
              </span>
              <button
                type="button"
                onClick={onOpenCollection}
                className="text-xs font-semibold text-[#F5DC8B] hover:underline cursor-pointer"
              >
                View in Collection
              </button>
            </div>
          )}

          {!activeDraft || !compiled ? (
            <div className="bg-[#111521] border border-white/12 rounded-lg p-8 sm:p-10 space-y-6">
              <div className="space-y-2 max-w-xl">
                <h2 className="font-display text-2xl font-bold text-[#F5EFE0]">
                  Forge a Playable Champion
                </h2>
                <p className="text-sm text-[#A6ADC2] leading-relaxed">
                  Describe any character in natural language. The Oracle
                  translates your vision into structured 5v5 abilities, validates
                  every stat and power budget, and prepares a balanced card ready
                  for combat.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-white/10 text-xs text-[#C4C9D8]">
                <div className="space-y-1">
                  <p className="font-semibold text-[#F5DC8B]">
                    01. Natural-Language Concept
                  </p>
                  <p className="text-[#9CA3B8] leading-relaxed">
                    Specify fighting style, weapons, elemental affinity,
                    personality, and weaknesses.
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-[#F5DC8B]">
                    02. Deterministic Balance Validation
                  </p>
                  <p className="text-[#9CA3B8] leading-relaxed">
                    Every stat and ability is audited against the universal
                    Level 1 budget (620 max stat budget).
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-[#F5DC8B]">
                    03. Refine & Customize
                  </p>
                  <p className="text-[#9CA3B8] leading-relaxed">
                    Answer the Oracle&apos;s clarifying questions, adjust name or
                    artwork, and iterate before locking in.
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-[#F5DC8B]">
                    04. Approve & Deploy in 5v5
                  </p>
                  <p className="text-[#9CA3B8] leading-relaxed">
                    Approved cards receive a unique ID, permanent creator credit,
                    and can enter battle immediately.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Card Preview + Stats + Abilities */}
              <div className="bg-[#111521] border border-[#D4AF37]/35 rounded-lg p-5 sm:p-6 space-y-6">
                <div className="grid md:grid-cols-[220px_1fr] gap-5">
                  {/* Portrait Preview + Artwork Picker */}
                  <div className="space-y-3">
                    <div className="relative w-full aspect-[3/4] rounded-md overflow-hidden border border-[#D4AF37]/40 bg-gradient-to-b from-[#1A2133] to-[#0B0E17]">
                      <Image
                        src={activeDraft.artworkUrl}
                        alt={activeDraft.name}
                        fill
                        priority
                        sizes="220px"
                        referrerPolicy="no-referrer"
                        className="object-cover object-top"
                      />
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            'linear-gradient(180deg, rgba(9,11,16,0.15) 0%, rgba(9,11,16,0) 45%, rgba(9,11,16,0.92) 100%)',
                        }}
                      />
                      <div className="absolute bottom-2.5 inset-x-3">
                        <p
                          className={`text-[11px] font-medium ${
                            ELEMENT_STYLES[activeDraft.element].text
                          }`}
                        >
                          {activeDraft.role} · {activeDraft.element}
                        </p>
                        <p className="font-display text-base font-bold text-[#F5EFE0] truncate">
                          {activeDraft.name}
                        </p>
                      </div>
                    </div>

                    {/* Portrait Archetype Selector */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-[#9CA3B8]">
                        Select Card Artwork
                      </p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {PORTRAIT_GALLERY.map((art) => {
                          const picked = activeDraft.artworkUrl === art.url;
                          return (
                            <button
                              key={art.url}
                              type="button"
                              aria-label={`Choose ${art.label} portrait`}
                              title={art.label}
                              onClick={() => setCustomArtwork(art.url)}
                              className={`relative aspect-square rounded overflow-hidden border transition-all cursor-pointer ${
                                picked
                                  ? 'border-[#E5C158] ring-1 ring-[#E5C158]'
                                  : 'border-white/15 opacity-70 hover:opacity-100'
                              }`}
                            >
                              <Image
                                src={art.url}
                                alt={art.label}
                                fill
                                sizes="44px"
                                referrerPolicy="no-referrer"
                                className="object-cover object-top"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right Details & Customization */}
                  <div className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="draft-name-input"
                          className="text-[11px] font-medium text-[#9CA3B8]"
                        >
                          Champion Name
                        </label>
                        <input
                          id="draft-name-input"
                          type="text"
                          maxLength={42}
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          className="w-full rounded-md bg-[#0A0D15] border border-white/15 px-3 py-1.5 font-display text-sm font-bold text-[#F5EFE0] focus:outline-none focus:border-[#D4AF37]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="draft-title-input"
                          className="text-[11px] font-medium text-[#9CA3B8]"
                        >
                          Champion Title
                        </label>
                        <input
                          id="draft-title-input"
                          type="text"
                          maxLength={56}
                          value={customTitle}
                          onChange={(e) => setCustomTitle(e.target.value)}
                          className="w-full rounded-md bg-[#0A0D15] border border-white/15 px-3 py-1.5 text-xs text-[#D8DCE8] focus:outline-none focus:border-[#D4AF37]"
                        />
                      </div>
                    </div>

                    <p className="text-xs text-[#9CA3B8]">
                      {activeDraft.oracleProfile} · Creator:{' '}
                      <span className="text-[#ECEEF4]">
                        {activeDraft.originalCreatorName}
                      </span>{' '}
                      · Level {activeDraft.level} · Ruleset{' '}
                      {activeDraft.rulesetVersion}
                    </p>

                    <p className="text-sm text-[#D0D5E2] leading-relaxed">
                      {activeDraft.backstory}
                    </p>

                    {/* Attributes Grid */}
                    <dl className="grid grid-cols-3 sm:grid-cols-6 gap-2 py-3 border-y border-white/10 font-mono tabular-nums text-center">
                      <div>
                        <dt className="text-[10px] text-[#8F96AB]">HP</dt>
                        <dd className="text-sm font-bold text-emerald-300">
                          {activeDraft.stats.maxHp}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[#8F96AB]">ATK</dt>
                        <dd className="text-sm font-bold text-rose-300">
                          {activeDraft.stats.attack}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[#8F96AB]">DEF</dt>
                        <dd className="text-sm font-bold text-sky-300">
                          {activeDraft.stats.defense}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[#8F96AB]">SPD</dt>
                        <dd className="text-sm font-bold text-amber-300">
                          {activeDraft.stats.speed}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[#8F96AB]">START EN</dt>
                        <dd className="text-sm font-bold text-violet-300">
                          {activeDraft.stats.startingEnergy}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[#8F96AB]">HEAL</dt>
                        <dd className="text-sm font-bold text-yellow-200">
                          {activeDraft.stats.healingPower}
                        </dd>
                      </div>
                    </dl>

                    {/* Strengths & Weaknesses */}
                    <div className="grid sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="font-semibold text-emerald-300">
                          Strengths:{' '}
                        </span>
                        <span className="text-[#C4C9D8]">
                          {activeDraft.strengths.join(' · ')}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-rose-300">
                          Weaknesses:{' '}
                        </span>
                        <span className="text-[#C4C9D8]">
                          {activeDraft.weaknesses.join(' · ')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ability Kit */}
                <div className="space-y-2.5 pt-2 border-t border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-[#F5DC8B] tracking-wide">
                      Generated Ability Kit (Validated Mechanics)
                    </h3>
                    <span className="text-xs font-mono tabular-nums text-emerald-300">
                      Stat Budget: {compiled.validation.statBudgetUsed}/
                      {compiled.validation.statBudgetCap} · Valid for 5v5
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2.5">
                    {[
                      activeDraft.basicAttack,
                      ...activeDraft.specialAbilities,
                      ...(activeDraft.ultimateAbility
                        ? [activeDraft.ultimateAbility]
                        : []),
                    ].map((ability) => {
                      const budgetInfo =
                        compiled.validation.abilityBudgets[ability.id];
                      return (
                        <div
                          key={ability.id}
                          className="p-3 rounded-md bg-[#0C0F18] border border-white/10 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F5EFE0]">
                              {ability.category === 'ultimate' ? (
                                <Zap className="w-3.5 h-3.5 text-[#E5C158] shrink-0" />
                              ) : ability.shieldAmount > 0 ? (
                                <Shield className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                              ) : (
                                <Swords className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                              )}
                              <span>{ability.name}</span>
                            </span>
                            <span className="text-[11px] font-mono text-[#8F96AB] capitalize">
                              {ability.category}
                            </span>
                          </div>
                          <p className="text-xs text-[#B8BFD2] leading-snug">
                            {ability.description}
                          </p>
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-mono tabular-nums text-[#8F96AB] pt-1 border-t border-white/8">
                            <span>
                              {formatTargetLabel(ability.targetType)} ·{' '}
                              {ability.energyCost > 0
                                ? `${ability.energyCost} EN`
                                : `+${ability.energyGain} EN`}{' '}
                              · {ability.cooldown > 0 ? `${ability.cooldown}t CD` : 'No CD'}
                            </span>
                            {budgetInfo && (
                              <span className="text-emerald-300">
                                {budgetInfo.computed}/{budgetInfo.cap} BP
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Balance Adjustments & Originality Audit */}
                <div className="space-y-2.5 pt-3 border-t border-white/10 text-xs">
                  <p className="text-[#C4C9D8]">
                    <span className="font-semibold text-[#F5EFE0]">
                      Oracle Notes:{' '}
                    </span>
                    {compiled.oracleCommentary}
                  </p>

                  {compiled.adjustments.length > 0 && (
                    <div className="rounded-md bg-amber-500/10 border border-amber-500/35 p-3 space-y-1 text-amber-200">
                      <p className="font-semibold">
                        Universal Balance Adjustments Applied:
                      </p>
                      <ul className="space-y-1">
                        {compiled.adjustments.map((adj, idx) => (
                          <li key={`${adj.label}-${idx}`}>· {adj.explanation}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {liveOriginality && (
                    <p
                      className={
                        liveOriginality.status === 'near_duplicate'
                          ? 'text-amber-300'
                          : 'text-[#9CA3B8]'
                      }
                    >
                      <span className="font-semibold text-[#ECEEF4]">
                        Originality Check:{' '}
                      </span>
                      {liveOriginality.note}
                    </p>
                  )}
                </div>

                {/* Refinement & Clarifying Questions */}
                <div className="space-y-2.5 pt-3 border-t border-white/10">
                  <div className="space-y-1">
                    <label
                      htmlFor="oracle-refinement-input"
                      className="text-xs font-semibold text-[#ECEEF4]"
                    >
                      Refine Draft with the Oracle
                    </label>
                    {compiled.clarifyingQuestions.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {compiled.clarifyingQuestions.map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => setRefinementNote(q)}
                            className="text-left text-[11px] text-[#C4C9D8] hover:text-[#F5DC8B] bg-[#0B0E17] border border-white/12 rounded px-2.5 py-1.5 transition-colors cursor-pointer"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="oracle-refinement-input"
                      type="text"
                      value={refinementNote}
                      onChange={(e) => setRefinementNote(e.target.value)}
                      placeholder="Request a tweak (e.g., 'Make them faster and add a team shield ultimate')..."
                      className="flex-1 rounded-md bg-[#0A0D15] border border-white/15 px-3 py-2 text-xs text-[#ECEEF4] placeholder:text-[#6B7287] focus:outline-none focus:border-[#D4AF37]"
                    />
                    <button
                      type="button"
                      disabled={loading || refining}
                      onClick={() => invokeOracle(true)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-[#192033] border border-white/15 text-xs font-semibold text-[#ECEEF4] hover:border-[#D4AF37]/60 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {refining ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>{refining ? 'Refining...' : 'Refine Draft'}</span>
                    </button>
                  </div>
                </div>

                {/* Explicit Approval & Registration Actions */}
                <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => handleApprove(false)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-[#182032] border border-[#D4AF37]/45 text-sm font-semibold text-[#F5EFE0] hover:bg-[#222B42] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Check className="w-4 h-4 text-[#E5C158] shrink-0" />
                    <span>Approve & Register Card</span>
                  </button>

                  <button
                    type="button"
                    data-start="true"
                    onClick={() => handleApprove(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#D4AF37] text-[#0B0D13] text-sm font-semibold hover:bg-[#E5C454] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Swords className="w-4 h-4 shrink-0" />
                    <span>Register & Enter Battle</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
