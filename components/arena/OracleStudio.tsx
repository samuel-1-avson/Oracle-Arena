'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Coins,
  Layers,
  Loader2,
  Lock,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Swords,
  TreePine,
  Wand2,
} from 'lucide-react';
import {
  CREATOR_CARD_SHARD_COST,
  PlayerEconomyState,
} from '@/lib/game/packs';
import {
  compileTraitTreeCharacter,
  computeTraitTreePreviewStats,
  MAX_CORE_TRAITS,
  TRAIT_BRANCH_META,
  TRAIT_CATALOG,
  TraitBranch,
  TraitId,
  ULTIMATE_TREE_CATALOG,
  UltimateTreeId,
} from '@/lib/game/traits';
import {
  CharacterDefinition,
  ElementAffinity,
  OracleProfile,
} from '@/lib/game/types';
import { CompiledOracleResult } from '@/lib/oracle/compiler';
import { ORACLE_PROFILES } from '@/lib/oracle/profiles';
import { AccountBar } from './AccountBar';
import { useFirebaseAuth } from './FirebaseProvider';
import { ELEMENT_STYLES } from './ui-meta';
import { VisualStatBars } from './VisualStatBars';

interface OracleStudioProps {
  existingCollection: CharacterDefinition[];
  economy: PlayerEconomyState;
  onSpendCreatorCard: () => { ok: boolean; error?: string };
  onBuyCreatorCard: () => { ok: boolean; error?: string };
  onApproveCard: (card: CharacterDefinition, deployAndBattle: boolean) => void;
  onOpenPackVault: () => void;
  onOpenCollection: () => void;
  onBackToTitle: () => void;
}

const PORTRAIT_PRESETS = [
  { label: 'Solar Knight', url: '/images/card_kaelen_solaris.jpg' },
  { label: 'Void Mystic', url: '/images/card_lyra_voidweaver.jpg' },
  { label: 'Storm Striker', url: '/images/card_vex_chronostriker.jpg' },
  { label: 'Aether Healer', url: '/images/card_seraphina_aether.jpg' },
  { label: 'Cyber Scout', url: '/images/card_orion_tactician.jpg' },
  { label: 'Iron Titan', url: '/images/card_malakor_dreadguard.jpg' },
  { label: 'Shadow Blade', url: '/images/card_nyx_shadowblade.jpg' },
  { label: 'Ember Mage', url: '/images/card_ignis_pyromancer.jpg' },
  { label: 'Frost Warden', url: '/images/card_freya_frostbinder.jpg' },
  { label: 'Venom Alchemist', url: '/images/card_kora_hexsmith.jpg' },
];

const ELEMENTS: ElementAffinity[] = [
  'Solar',
  'Void',
  'Storm',
  'Aether',
  'Cyber',
  'Iron',
  'Ember',
  'Frost',
];

const BRANCH_ORDER: TraitBranch[] = ['might', 'agility', 'arcane', 'resilience'];

export function OracleStudio({
  existingCollection,
  economy,
  onSpendCreatorCard,
  onBuyCreatorCard,
  onApproveCard,
  onOpenPackVault,
  onOpenCollection,
  onBackToTitle,
}: OracleStudioProps) {
  const { user, profile } = useFirebaseAuth();

  const [studioTab, setStudioTab] = useState<'tree' | 'ai_assist'>('tree');

  // === Visual Skill Tree State (Primary Mode — 4 Traits + 1 Big Ultimate = 5 Skills) ===
  const [heroName, setHeroName] = useState('Aegis Viper');
  const [heroTitle, setHeroTitle] = useState('Defender of the Twin Realms');
  const [heroElement, setHeroElement] = useState<ElementAffinity>('Solar');
  const [heroArtwork, setHeroArtwork] = useState<string>(PORTRAIT_PRESETS[0].url);
  const [heroLore, setHeroLore] = useState(
    'Trained to withstand deadly venom while lifting rivals with pure psychic force, Aegis protects younger fighters across the arena.'
  );
  const [selectedTraits, setSelectedTraits] = useState<TraitId[]>([
    'super_strength',
    'venom_immunity',
    'telekinesis',
  ]);
  const [selectedUltimate, setSelectedUltimate] =
    useState<UltimateTreeId>('meteor_breaker');

  // === Secondary AI Oracle Text Assist State ===
  const [oracleProfile, setOracleProfile] =
    useState<OracleProfile>('Universal Oracle');
  const [description, setDescription] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiResult, setAiResult] = useState<CompiledOracleResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const creatorId = user?.uid ?? 'local-player';
  const creatorName =
    profile?.displayName || user?.displayName || 'Arena Architect';

  const hasCreatorCard = economy.creatorCards >= 1;

  // Live preview of the Skill Tree champion (updates instantaneously as traits toggle!)
  const liveTreeBuild = useMemo(() => {
    return compileTraitTreeCharacter({
      name: heroName,
      title: heroTitle,
      lore: heroLore,
      element: heroElement,
      artworkUrl: heroArtwork,
      creatorId,
      creatorName,
      traitIds: selectedTraits,
      ultimateId: selectedUltimate,
    });
  }, [
    heroName,
    heroTitle,
    heroLore,
    heroElement,
    heroArtwork,
    creatorId,
    creatorName,
    selectedTraits,
    selectedUltimate,
  ]);

  const previewStats = useMemo(
    () => computeTraitTreePreviewStats(selectedTraits),
    [selectedTraits]
  );

  const toggleTrait = (traitId: TraitId) => {
    setError(null);
    if (selectedTraits.includes(traitId)) {
      if (selectedTraits.length <= 1) {
        setError('Keep at least 1 Core Skill selected in your Skill Tree.');
        return;
      }
      setSelectedTraits(selectedTraits.filter((id) => id !== traitId));
      return;
    }
    if (selectedTraits.length >= MAX_CORE_TRAITS) {
      setError(
        `You can pick up to ${MAX_CORE_TRAITS} Core Skills (+ 1 Big Ultimate = 5 total). Unselect one first.`
      );
      return;
    }
    setSelectedTraits([...selectedTraits, traitId]);
  };

  const handleMintHero = (
    card: CharacterDefinition,
    deployAndBattle: boolean
  ) => {
    setError(null);
    setNotice(null);

    if (card.name.trim().length < 2) {
      setError('Give your champion a name (at least 2 letters).');
      return;
    }

    const spend = onSpendCreatorCard();
    if (!spend.ok) {
      setError(
        spend.error ||
          'You need 1 Creator Card to forge a custom champion!'
      );
      return;
    }

    onApproveCard(card, deployAndBattle);
    if (!deployAndBattle) {
      setNotice(
        `Forged "${card.name}" using 1 Creator Card! Added to your private collection.`
      );
    }
  };

  const handleGenerateAiDraft = async () => {
    setError(null);
    if (description.trim().length < 10) {
      setError('Describe your hero concept in at least 10 characters.');
      return;
    }
    setLoadingAi(true);
    try {
      const response = await fetch('/api/oracle/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          oracleProfile,
          creatorName,
          artworkUrl: heroArtwork,
          existingCardNames: existingCollection.map((c) => c.name),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || 'Oracle could not generate a draft.');
        return;
      }
      setAiResult(data as CompiledOracleResult);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to reach Oracle service.'
      );
    } finally {
      setLoadingAi(false);
    }
  };

  const activePreviewCard =
    studioTab === 'ai_assist' && aiResult
      ? aiResult.character
      : liveTreeBuild.character;

  return (
    <main className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col">
      {/* Top Shell Bar */}
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
              Oracle Studio · Skill Tree Forge
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              data-testid="studio-creator-card-balance"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-mono text-xs font-bold ${
                hasCreatorCard
                  ? 'bg-violet-500/20 border-violet-400/50 text-violet-100'
                  : 'bg-rose-500/15 border-rose-400/45 text-rose-200'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Creator Cards: {economy.creatorCards}</span>
            </span>

            <button
              type="button"
              onClick={onOpenPackVault}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-[#D4AF37]/40 text-[#F5DC8B] hover:bg-[#D4AF37]/15 cursor-pointer whitespace-nowrap"
            >
              <PackageOpen className="w-3.5 h-3.5" />
              <span>Packs &amp; Shop</span>
            </button>

            <button
              type="button"
              onClick={onOpenCollection}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-white/15 text-[#C4C9D8] hover:text-white cursor-pointer whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Collection</span>
            </button>

            <AccountBar compact />
          </div>
        </div>
      </div>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-5 flex-1">
        {/* Creator Card Resource Banner */}
        <section className="rounded-lg bg-[#111521] border border-violet-400/35 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#F5EFE0] flex items-center gap-2">
              {hasCreatorCard ? (
                <Sparkles className="w-4 h-4 text-violet-300" />
              ) : (
                <Lock className="w-4 h-4 text-rose-300" />
              )}
              <span>
                {hasCreatorCard
                  ? `You have ${economy.creatorCards} Creator Card${economy.creatorCards === 1 ? '' : 's'} ready to forge!`
                  : 'Out of Creator Cards — Level up from battles or buy one below!'}
              </span>
            </p>
            <p className="text-xs text-[#9CA3B8]">
              Creating a custom champion costs <strong className="text-white">1 Creator Card</strong> so
              every custom hero feels earned. Earn +1 Creator Card every time
              your Account levels up (Lv.{economy.accountLevel} →{' '}
              {economy.accountXp}/100 XP).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!economy.starterPackOpened && (
              <button
                type="button"
                onClick={onOpenPackVault}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#D4AF37] text-[#0B0D13] font-bold text-xs hover:bg-[#E5C454] cursor-pointer whitespace-nowrap"
              >
                <PackageOpen className="w-3.5 h-3.5" />
                <span>Claim Free Starter Pack (+1 Creator Card)</span>
              </button>
            )}
            <button
              type="button"
              data-testid="studio-buy-creator-card-btn"
              onClick={() => {
                setError(null);
                const res = onBuyCreatorCard();
                if (!res.ok) {
                  setError(res.error || 'Not enough Oracle Shards.');
                } else {
                  setNotice('Purchased +1 Creator Card with Oracle Shards!');
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-violet-500/20 border border-violet-400/50 text-violet-100 font-semibold text-xs hover:bg-violet-500/30 cursor-pointer whitespace-nowrap"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>
                Buy +1 Creator Card ({CREATOR_CARD_SHARD_COST} Shards · You
                have {economy.localShards})
              </span>
            </button>
          </div>
        </section>

        {/* Mode Switcher: Visual Skill Tree (Default) vs AI Text Assist */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1.5 p-1 rounded-md bg-[#111521] border border-white/10">
            <button
              type="button"
              onClick={() => setStudioTab('tree')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold transition-colors cursor-pointer ${
                studioTab === 'tree'
                  ? 'bg-[#D4AF37] text-[#0B0D13]'
                  : 'text-[#A6ADC2] hover:text-white'
              }`}
            >
              <TreePine className="w-3.5 h-3.5" />
              <span>Visual Skill Tree (Pick 4 Skills + 1 Ultimate)</span>
            </button>
            <button
              type="button"
              onClick={() => setStudioTab('ai_assist')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold transition-colors cursor-pointer ${
                studioTab === 'ai_assist'
                  ? 'bg-violet-500 text-white'
                  : 'text-[#A6ADC2] hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Oracle Prompt Assist</span>
            </button>
          </div>

          <p className="text-xs text-[#9CA3B8]">
            Every skill gives a <span className="text-emerald-300 font-medium">Pro</span> and
            a fair <span className="text-rose-300 font-medium">Con</span> — no unfair &ldquo;unkillable&rdquo; cards!
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md bg-rose-500/15 border border-rose-400/45 px-4 py-3 text-sm text-rose-200"
          >
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-md bg-emerald-500/15 border border-emerald-400/45 px-4 py-3 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        {/* Main 2-Column Workspace: Builder Left + Live Easy-to-Read Card Preview Right */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.95fr] gap-6 items-start">
          {/* LEFT: Skill Tree OR AI Prompt Assist */}
          {studioTab === 'tree' ? (
            <div className="space-y-6">
              {/* STEP 1: VISUAL 4-BRANCH SKILL TREE */}
              <section className="rounded-lg bg-[#111521] border border-white/12 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                      Step 1: Pick Up to {MAX_CORE_TRAITS} Core Skills ({selectedTraits.length}/{MAX_CORE_TRAITS})
                    </h2>
                    <p className="text-xs text-[#9CA3B8]">
                      Tap skills across the 4 tree branches. Watch how each Pro
                      &amp; Con updates your Power, Health, Armor, and Speed
                      bars!
                    </p>
                  </div>
                  <span className="text-xs font-mono text-emerald-300">
                    Role Auto-Match: {previewStats.role}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {BRANCH_ORDER.map((branchKey) => {
                    const meta = TRAIT_BRANCH_META[branchKey];
                    const branchTraits = TRAIT_CATALOG.filter(
                      (t) => t.branch === branchKey
                    );
                    return (
                      <div
                        key={branchKey}
                        className="rounded-lg bg-[#0B0E17] border border-white/10 p-3.5 space-y-2.5"
                      >
                        <div className="pb-2 border-b border-white/10">
                          <h3 className={`text-sm font-bold ${meta.accentText}`}>
                            {meta.name}
                          </h3>
                          <p className="text-[11px] text-[#8F96AB]">
                            {meta.subtitle}
                          </p>
                        </div>

                        <div className="space-y-2">
                          {branchTraits.map((trait) => {
                            const active = selectedTraits.includes(trait.id);
                            return (
                              <button
                                key={trait.id}
                                type="button"
                                data-testid={`trait-node-${trait.id}`}
                                onClick={() => toggleTrait(trait.id)}
                                className={`w-full text-left rounded-md p-2.5 border transition-all cursor-pointer space-y-1 ${
                                  active
                                    ? `${meta.accentBg} ${meta.accentBorder} shadow-sm`
                                    : 'bg-[#121622] border-white/8 hover:border-white/25'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-[#F5EFE0]">
                                    {trait.name}
                                  </span>
                                  {active && (
                                    <Check className="w-4 h-4 text-[#F5DC8B] shrink-0" />
                                  )}
                                </div>
                                <p className="text-[11px] text-emerald-300 leading-snug">
                                  Pro: {trait.proLabel}
                                </p>
                                <p className="text-[11px] text-rose-300 leading-snug">
                                  Con: {trait.conLabel}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* STEP 2: PICK 1 BIG SIGNATURE ULTIMATE (5th Skill!) */}
              <section className="rounded-lg bg-[#111521] border border-white/12 p-5 space-y-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                    Step 2: Pick 1 Big Ultimate Move (5th Skill)
                  </h2>
                  <p className="text-xs text-[#9CA3B8]">
                    Your signature big ability once your hero builds Energy in
                    battle.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ULTIMATE_TREE_CATALOG.map((ult) => {
                    const active = selectedUltimate === ult.id;
                    return (
                      <button
                        key={ult.id}
                        type="button"
                        onClick={() => setSelectedUltimate(ult.id)}
                        className={`text-left rounded-md p-3 border transition-all cursor-pointer space-y-1 ${
                          active
                            ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F5EFE0]'
                            : 'bg-[#0B0E17] border-white/10 hover:border-white/25'
                        }`}
                      >
                        <p className="text-xs font-bold text-[#F5DC8B]">
                          {ult.name}
                        </p>
                        <p className="text-[11px] text-[#C4C9D8]">
                          {ult.shortDesc}
                        </p>
                        <p className="text-[11px] text-emerald-300">
                          + {ult.proLabel}
                        </p>
                        <p className="text-[11px] text-rose-300">
                          - {ult.conLabel}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* STEP 3: NAME, ELEMENT, PORTRAIT & CHARACTER LORE */}
              <section className="rounded-lg bg-[#111521] border border-white/12 p-5 space-y-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                    Step 3: Name Your Hero &amp; Write Their Lore
                  </h2>
                  <p className="text-xs text-[#9CA3B8]">
                    Explain who your character is and how they earned their 5
                    chosen skills!
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="space-y-1.5 block">
                    <span className="text-xs font-semibold text-[#C4C9D8]">
                      Champion Name
                    </span>
                    <input
                      type="text"
                      data-testid="tree-hero-name-input"
                      value={heroName}
                      maxLength={38}
                      onChange={(e) => setHeroName(e.target.value)}
                      className="w-full rounded-md bg-[#0B0E17] border border-white/15 px-3 py-2 text-sm text-[#F5EFE0] focus:outline-none focus:border-[#D4AF37]"
                      placeholder="e.g., Captain Antidote"
                    />
                  </label>

                  <label className="space-y-1.5 block">
                    <span className="text-xs font-semibold text-[#C4C9D8]">
                      Hero Title
                    </span>
                    <input
                      type="text"
                      value={heroTitle}
                      maxLength={52}
                      onChange={(e) => setHeroTitle(e.target.value)}
                      className="w-full rounded-md bg-[#0B0E17] border border-white/15 px-3 py-2 text-sm text-[#F5EFE0] focus:outline-none focus:border-[#D4AF37]"
                      placeholder="e.g., Guardian of the Starlight"
                    />
                  </label>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-[#C4C9D8]">
                    Element Affinity
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ELEMENTS.map((el) => (
                      <button
                        key={el}
                        type="button"
                        onClick={() => setHeroElement(el)}
                        className={`px-3 py-1.5 rounded text-xs font-semibold border cursor-pointer transition-colors ${
                          heroElement === el
                            ? 'bg-[#D4AF37] text-[#0B0D13] border-[#D4AF37]'
                            : 'bg-[#0B0E17] text-[#C4C9D8] border-white/12 hover:border-white/30'
                        }`}
                      >
                        {el}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-[#C4C9D8]">
                    Portrait Artwork
                  </span>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                    {PORTRAIT_PRESETS.map((preset) => (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() => setHeroArtwork(preset.url)}
                        title={preset.label}
                        className={`relative aspect-square rounded-md overflow-hidden border-2 cursor-pointer transition-all ${
                          heroArtwork === preset.url
                            ? 'border-[#D4AF37] scale-105'
                            : 'border-white/15 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <Image
                          src={preset.url}
                          alt={preset.label}
                          fill
                          sizes="56px"
                          referrerPolicy="no-referrer"
                          className="object-cover object-top"
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <label className="space-y-1.5 block">
                  <span className="text-xs font-semibold text-[#C4C9D8]">
                    Character Lore &amp; Story
                  </span>
                  <textarea
                    rows={3}
                    data-testid="tree-hero-lore-input"
                    value={heroLore}
                    maxLength={420}
                    onChange={(e) => setHeroLore(e.target.value)}
                    className="w-full rounded-md bg-[#0B0E17] border border-white/15 px-3 py-2 text-sm text-[#F5EFE0] focus:outline-none focus:border-[#D4AF37]"
                    placeholder="Write your character's origin story..."
                  />
                </label>
              </section>
            </div>
          ) : (
            /* SECONDARY TAB: AI ORACLE TEXT ASSIST */
            <section className="rounded-lg bg-[#111521] border border-violet-400/30 p-5 space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                  AI Oracle Prompt Assist
                </h2>
                <p className="text-xs text-[#9CA3B8]">
                  Prefer describing an idea in words? Let the AI Oracle turn
                  your idea into a balanced card (still spends 1 Creator Card
                  only when you mint it!).
                </p>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-[#C4C9D8]">
                  Oracle Style
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {ORACLE_PROFILES.map((prof) => (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => setOracleProfile(prof.id)}
                      className={`px-3 py-1.5 rounded text-xs font-medium border cursor-pointer ${
                        oracleProfile === prof.id
                          ? 'bg-violet-500/25 border-violet-400 text-white'
                          : 'bg-[#0B0E17] border-white/12 text-[#A6ADC2]'
                      }`}
                    >
                      {prof.id}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your champion's powers, personality, and weakness..."
                className="w-full rounded-md bg-[#0B0E17] border border-white/15 px-3 py-2.5 text-sm text-[#F5EFE0] focus:outline-none focus:border-violet-400"
              />

              <button
                type="button"
                disabled={loadingAi}
                onClick={handleGenerateAiDraft}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-violet-500 text-white font-semibold text-sm hover:bg-violet-400 disabled:opacity-50 cursor-pointer"
              >
                {loadingAi ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>
                  {loadingAi
                    ? 'Consulting Gemini Oracle...'
                    : 'Generate Balanced Draft'}
                </span>
              </button>
            </section>
          )}

          {/* RIGHT COLUMN: LIVE EASY-TO-READ CARD PREVIEW & MINT BUTTON */}
          <aside className="sticky top-20 rounded-lg bg-[#121622] border border-[#D4AF37]/45 overflow-hidden shadow-2xl">
            <div className="relative h-56 w-full bg-[#0B0E17]">
              <Image
                src={activePreviewCard.artworkUrl}
                alt={activePreviewCard.name}
                fill
                sizes="(max-width: 1280px) 100vw, 420px"
                referrerPolicy="no-referrer"
                className="object-cover object-top"
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(9,11,16,0.2) 0%, rgba(9,11,16,0.95) 100%)',
                }}
              />
              <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#090B10]/85 border border-emerald-400/40 text-[11px] font-semibold text-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Fair Balance Verified</span>
              </div>
              <div className="absolute bottom-3 inset-x-4">
                <p
                  className={`text-xs font-medium ${ELEMENT_STYLES[activePreviewCard.element].text}`}
                >
                  {activePreviewCard.role} · {activePreviewCard.element} · Level
                  1
                </p>
                <h3 className="font-display text-2xl font-bold text-[#F5EFE0] truncate">
                  {activePreviewCard.name}
                </h3>
                <p className="text-xs text-[#C4C9D8] truncate">
                  {activePreviewCard.title}
                </p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Simple Kid-Friendly Visual Stat Meters */}
              <VisualStatBars character={activePreviewCard} />

              {/* Lore Preview */}
              <p className="text-xs text-[#C4C9D8] leading-relaxed border-t border-white/10 pt-3">
                {activePreviewCard.backstory}
              </p>

              {/* Big Ultimate Preview */}
              {activePreviewCard.ultimateAbility && (
                <div className="rounded-md bg-[#0B0E17] border border-[#D4AF37]/30 p-3 space-y-1">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-[#F5DC8B]">
                    Big Ultimate Move
                  </p>
                  <p className="text-xs font-bold text-[#F5EFE0]">
                    {activePreviewCard.ultimateAbility.name}
                  </p>
                  <p className="text-[11px] text-[#9CA3B8]">
                    {activePreviewCard.ultimateAbility.description}
                  </p>
                </div>
              )}

              {/* Mint & Spend 1 Creator Card Actions */}
              <div className="space-y-2.5 pt-2 border-t border-white/10">
                <button
                  type="button"
                  data-testid="mint-tree-hero-btn"
                  disabled={!hasCreatorCard}
                  onClick={() => handleMintHero(activePreviewCard, false)}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-[#D4AF37] text-[#0B0D13] font-bold text-sm hover:bg-[#E5C454] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {hasCreatorCard
                      ? 'Forge Champion (Spend 1 Creator Card)'
                      : 'Need 1 Creator Card to Forge'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!hasCreatorCard}
                  onClick={() => handleMintHero(activePreviewCard, true)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-violet-500/20 border border-violet-400/45 text-violet-100 font-semibold text-xs hover:bg-violet-500/30 disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <Swords className="w-3.5 h-3.5" />
                  <span>Forge &amp; Deploy Straight to Battle</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
