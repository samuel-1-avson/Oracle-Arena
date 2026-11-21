'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  EyeOff,
  HelpCircle,
  PackageOpen,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Swords,
  Trophy,
  Wand2,
} from 'lucide-react';
import {
  BLIND_CLASH_DECK_SIZE,
  BlindClashMatchState,
  BlindClashRivalProfile,
  BlindClashRoundResult,
  createBlindClashMatch,
  getBlindClashRivals,
  playBlindClashCard,
} from '@/lib/game/blind-clash';
import { BattleAccountReward, PlayerEconomyState } from '@/lib/game/packs';
import { getCardVisualStats, TRAIT_MAP } from '@/lib/game/traits';
import { CharacterDefinition } from '@/lib/game/types';
import { AccountBar } from './AccountBar';
import { CardTierBadge } from './CardTierBadge';
import { ELEMENT_STYLES } from './ui-meta';
import { VisualStatBars } from './VisualStatBars';

interface BlindClashViewProps {
  ownedCharacters: CharacterDefinition[];
  economy: PlayerEconomyState;
  onCompleteBlindClash: (won: boolean) => BattleAccountReward;
  onOpenPackVault: () => void;
  onOpenStudio: () => void;
  onBackToTitle: () => void;
}

export function BlindClashView({
  ownedCharacters,
  economy,
  onCompleteBlindClash,
  onOpenPackVault,
  onOpenStudio,
  onBackToTitle,
}: BlindClashViewProps) {
  const rivals = useMemo(
    () => getBlindClashRivals(ownedCharacters),
    [ownedCharacters]
  );

  const [selectedRivalId, setSelectedRivalId] = useState<string>(
    rivals[0]?.id ?? 'rival-dimple'
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    ownedCharacters.slice(0, BLIND_CLASH_DECK_SIZE).map((c) => c.id)
  );
  const [match, setMatch] = useState<BlindClashMatchState | null>(null);
  const [latestReveal, setLatestReveal] = useState<BlindClashRoundResult | null>(
    null
  );
  const [reward, setReward] = useState<BattleAccountReward | null>(null);
  const [seedCounter, setSeedCounter] = useState(19);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  const selectedRival: BlindClashRivalProfile =
    rivals.find((r) => r.id === selectedRivalId) ?? rivals[0];

  const validSelectedIds = useMemo(() => {
    const ownedSet = new Set(ownedCharacters.map((c) => c.id));
    return selectedIds.filter((id) => ownedSet.has(id));
  }, [selectedIds, ownedCharacters]);

  const toggleCardSelection = (cardId: string) => {
    setDraftNotice(null);
    if (validSelectedIds.includes(cardId)) {
      setSelectedIds(validSelectedIds.filter((id) => id !== cardId));
    } else if (validSelectedIds.length < BLIND_CLASH_DECK_SIZE) {
      setSelectedIds([...validSelectedIds, cardId]);
    } else {
      setDraftNotice(
        `You can bring up to ${BLIND_CLASH_DECK_SIZE} cards into a Blind Clash. Deselect one card first.`
      );
    }
  };

  const handleStartClash = () => {
    if (validSelectedIds.length !== BLIND_CLASH_DECK_SIZE) {
      setDraftNotice(
        `Pick exactly ${BLIND_CLASH_DECK_SIZE} cards from your collection (selected ${validSelectedIds.length}/${BLIND_CLASH_DECK_SIZE}).`
      );
      return;
    }
    const deck = validSelectedIds
      .map((id) => ownedCharacters.find((c) => c.id === id))
      .filter((c): c is CharacterDefinition => Boolean(c));

    setLatestReveal(null);
    setReward(null);
    setMatch(createBlindClashMatch(deck, selectedRival));
  };

  const handleThrowCard = (cardId: string) => {
    if (!match || match.status !== 'active') return;
    const { nextState, roundResult } = playBlindClashCard(
      match,
      cardId,
      seedCounter + match.rounds.length * 17
    );
    setSeedCounter((s) => s + 13);
    setMatch(nextState);
    setLatestReveal(roundResult);

    if (nextState.status === 'finished') {
      const won = nextState.winner === 'player';
      const earned = onCompleteBlindClash(won);
      setReward(earned);
    }
  };

  const handleResetToDraft = () => {
    setMatch(null);
    setLatestReveal(null);
    setReward(null);
  };

  // Need at least 6 owned cards (open Starter Pack first!)
  if (ownedCharacters.length < BLIND_CLASH_DECK_SIZE) {
    return (
      <main className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col items-center justify-center p-6 text-center gap-4">
        <PackageOpen className="w-12 h-12 text-[#F5DC8B]" />
        <h1 className="font-display text-2xl font-bold text-[#F5EFE0]">
          Open Your Welcome Starter Pack First!
        </h1>
        <p className="text-sm text-[#9CA3B8] max-w-md">
          Blind Clash lets you pick 6 champions out of your 8+ collection to
          gamble against hidden rival cards. Tear open your free Starter Pack to
          unlock 8 champions + 1 Creator Card right now!
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenPackVault}
            className="px-6 py-3 rounded-md bg-[#D4AF37] text-[#0B0D13] font-bold text-sm hover:bg-[#E5C454] cursor-pointer"
          >
            Open Starter Pack
          </button>
          <button
            type="button"
            onClick={onBackToTitle}
            className="px-4 py-3 rounded-md border border-white/15 text-sm text-[#C4C9D8] hover:text-white cursor-pointer"
          >
            Back to Title
          </button>
        </div>
      </main>
    );
  }

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
              Blind Clash · 6-Card Mystery Gamble
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs text-[#F5DC8B]">
              Lv.{economy.accountLevel} · {economy.creatorCards} Creator Cards
            </span>
            <button
              type="button"
              onClick={onOpenPackVault}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-[#D4AF37]/40 text-[#F5DC8B] hover:bg-[#D4AF37]/15 cursor-pointer whitespace-nowrap"
            >
              <PackageOpen className="w-3.5 h-3.5" />
              <span>Packs ({economy.unopenedBoosterPacks})</span>
            </button>
            <AccountBar compact />
          </div>
        </div>
      </div>

      {/* PHASE 1: DRAFT 6 CARDS AGAINST RIVAL RATING (CARDS HIDDEN!) */}
      {!match ? (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6 flex-1">
          {/* Rival Picker — Shows Rating Only, NEVER Shows Rival Cards */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                  1. Choose Your Rival (Cards Stay Hidden!)
                </h2>
                <p className="text-xs text-[#9CA3B8]">
                  You only see the opponent&apos;s Rating and reputation. Their
                  6 champions stay face-down until you throw yours!
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
                <EyeOff className="w-4 h-4" />
                <span>Opponent Deck Hidden</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {rivals.map((rival) => {
                const active = rival.id === selectedRival.id;
                return (
                  <button
                    key={rival.id}
                    type="button"
                    onClick={() => setSelectedRivalId(rival.id)}
                    className={`text-left rounded-lg p-4 border transition-all cursor-pointer space-y-2 ${
                      active
                        ? 'bg-[#171C2D] border-[#D4AF37] shadow-[0_0_24px_rgba(212,175,55,0.16)]'
                        : 'bg-[#111521] border-white/12 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-base font-bold text-[#F5EFE0]">
                        {rival.name}
                      </span>
                      <span className="font-mono tabular-nums text-xs font-bold text-[#F5DC8B]">
                        {rival.rating} Rating
                      </span>
                    </div>
                    <p className="text-xs text-sky-300 font-medium">
                      {rival.tierLabel} · 6 Mystery Cards
                    </p>
                    <p className="text-xs text-[#9CA3B8] leading-relaxed">
                      {rival.hintText}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Draft 6 Cards Out of Owned 8+ Collection */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111521] border border-[#D4AF37]/30 rounded-lg p-4">
              <div>
                <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                  2. Select {BLIND_CLASH_DECK_SIZE} of Your {ownedCharacters.length}{' '}
                  Cards ({validSelectedIds.length}/{BLIND_CLASH_DECK_SIZE})
                </h2>
                <p className="text-xs text-[#9CA3B8]">
                  Tip: Mix strong Power cards with Counter Skills like{' '}
                  <span className="text-emerald-300">Venom Resistant</span>,{' '}
                  <span className="text-emerald-300">Telekinesis</span>, or{' '}
                  <span className="text-emerald-300">Oracle Sight</span> to score
                  instant Auto-Wins!
                </p>
              </div>
              <button
                type="button"
                data-testid="start-blind-clash-btn"
                onClick={handleStartClash}
                className={`inline-flex items-center gap-2 px-6 py-3 rounded-md font-bold text-sm transition-colors cursor-pointer whitespace-nowrap ${
                  validSelectedIds.length === BLIND_CLASH_DECK_SIZE
                    ? 'bg-[#D4AF37] text-[#0B0D13] hover:bg-[#E5C454]'
                    : 'bg-[#1D2232] text-[#8F96AB] border border-white/15'
                }`}
              >
                <Swords className="w-4 h-4" />
                <span>
                  Enter Blind Clash ({validSelectedIds.length}/
                  {BLIND_CLASH_DECK_SIZE})
                </span>
              </button>
            </div>

            {draftNotice && (
              <p role="alert" className="text-sm text-amber-300 font-medium">
                {draftNotice}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {ownedCharacters.map((card) => {
                const picked = validSelectedIds.includes(card.id);
                const elem = ELEMENT_STYLES[card.element];
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => toggleCardSelection(card.id)}
                    className={`text-left rounded-lg overflow-hidden bg-[#121622] border transition-all cursor-pointer flex flex-col ${
                      picked
                        ? 'border-[#D4AF37] shadow-[0_0_22px_rgba(212,175,55,0.2)]'
                        : 'border-white/12 hover:border-white/30 opacity-85 hover:opacity-100'
                    }`}
                  >
                    <div className="relative h-36 w-full bg-[#0B0E17]">
                      <Image
                        src={card.artworkUrl}
                        alt={card.name}
                        fill
                        sizes="(max-width: 640px) 100vw, 25vw"
                        referrerPolicy="no-referrer"
                        className="object-cover object-top"
                      />
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            'linear-gradient(180deg, rgba(9,11,16,0.2) 0%, rgba(9,11,16,0.92) 100%)',
                        }}
                      />
                      {picked && (
                        <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[#D4AF37] text-[#0B0D13] flex items-center justify-center shadow">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </span>
                      )}
                      <div className="absolute bottom-2 inset-x-3">
                        <p className={`text-[11px] font-medium ${elem.text}`}>
                          {card.role} · {card.element}
                        </p>
                        <h3 className="font-display text-base font-bold text-[#F5EFE0] truncate">
                          {card.name}
                        </h3>
                      </div>
                    </div>
                    <div className="p-3 w-full">
                      <VisualStatBars character={card} compact />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        /* PHASE 2: ACTIVE BLIND CLASH CARD TABLE */
        <div
          data-testid="blind-clash-table"
          className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-5 space-y-5 flex-1 flex flex-col justify-between"
        >
          {/* Scoreboard HUD */}
          <div className="rounded-lg bg-[#111521] border border-[#D4AF37]/30 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-display text-base font-bold text-[#F5EFE0]">
                You
              </span>
              <span
                data-testid="blind-clash-score"
                className="font-mono tabular-nums text-xl font-bold text-[#F5DC8B]"
              >
                {match.playerScore} — {match.enemyScore}
              </span>
              <span className="font-display text-base font-bold text-rose-200">
                {match.rival.name}
              </span>
              <span className="text-xs font-mono text-[#8F96AB]">
                ({match.rival.rating} Rating)
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-[#9CA3B8]">
              <span>
                Clash {Math.min(BLIND_CLASH_DECK_SIZE, match.rounds.length + (match.status === 'active' ? 1 : 0))} of{' '}
                {BLIND_CLASH_DECK_SIZE}
              </span>
              <button
                type="button"
                onClick={handleResetToDraft}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-white/15 text-[#C4C9D8] hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Change Deck</span>
              </button>
            </div>
          </div>

          {/* TOP ZONE: Rival's Hidden Face-Down Cards */}
          <section aria-label="Hidden rival cards" className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
              <EyeOff className="w-3.5 h-3.5" />
              <span>
                Rival&apos;s Hidden Hand ({match.enemyRemaining.length} Face-Down
                Cards Remaining)
              </span>
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {match.enemyRemaining.map((_, idx) => (
                <div
                  key={`hidden-${idx}`}
                  data-testid="enemy-hidden-card"
                  className="h-24 rounded-lg border border-[#D4AF37]/40 bg-gradient-to-b from-[#1D1628] to-[#0B0E17] flex flex-col items-center justify-center gap-1 shadow-inner"
                >
                  <HelpCircle className="w-6 h-6 text-[#D4AF37]/80" />
                  <span className="text-[11px] font-mono text-[#9CA3B8]">
                    MYSTERY
                  </span>
                </div>
              ))}
              {match.enemyRemaining.length === 0 && (
                <div className="col-span-full py-4 text-center text-xs text-[#8F96AB] border border-dashed border-white/10 rounded-lg">
                  All 6 rival cards have been revealed!
                </div>
              )}
            </div>
          </section>

          {/* CENTER CLASH ARENA: Simultaneous Flip & Reveal */}
          <section
            aria-label="Center clash reveal"
            className="rounded-xl bg-[#0D111C] border border-white/12 p-5 min-h-[240px] flex flex-col justify-center"
          >
            <AnimatePresence mode="wait">
              {latestReveal ? (
                <motion.div
                  key={`round-${latestReveal.roundNumber}`}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.24 }}
                  data-testid="blind-clash-reveal"
                  className="space-y-4"
                >
                  {/* Verdict Banner */}
                  <div
                    className={`rounded-lg px-4 py-3 border text-center space-y-0.5 ${
                      latestReveal.winner === 'player'
                        ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-100'
                        : latestReveal.winner === 'enemy'
                          ? 'bg-rose-500/15 border-rose-400/50 text-rose-100'
                          : 'bg-amber-500/15 border-amber-400/45 text-amber-100'
                    }`}
                  >
                    <p className="font-display text-base sm:text-lg font-bold">
                      Round {latestReveal.roundNumber}: {latestReveal.headline}
                    </p>
                    <p className="text-xs opacity-90">{latestReveal.detail}</p>
                  </div>

                  {/* Side-by-Side Revealed Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                    {/* Player Card */}
                    <motion.div
                      initial={{ rotateY: -85, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      transition={{ duration: 0.28 }}
                      className={`rounded-lg p-3.5 bg-[#121827] border flex items-center gap-3.5 ${
                        latestReveal.winner === 'player'
                          ? 'border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.2)]'
                          : 'border-white/15'
                      }`}
                    >
                      <div className="relative w-20 h-24 rounded-md overflow-hidden shrink-0 border border-white/15">
                        <Image
                          src={latestReveal.playerCard.artworkUrl}
                          alt={latestReveal.playerCard.name}
                          fill
                          sizes="80px"
                          referrerPolicy="no-referrer"
                          className="object-cover object-top"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[11px] font-mono text-emerald-300">
                            YOUR CARD · {latestReveal.playerFinalPower} PWR
                          </p>
                          <CardTierBadge
                            level={latestReveal.playerCard.level}
                            compact
                          />
                        </div>
                        <p className="font-display text-base font-bold text-[#F5EFE0] truncate">
                          {latestReveal.playerCard.name}
                        </p>
                        <p className="text-xs text-[#C4C9D8]">
                          {latestReveal.playerTraits
                            .map((t) => TRAIT_MAP[t]?.name)
                            .join(' · ')}
                        </p>
                      </div>
                    </motion.div>

                    <div className="text-center font-display text-xl font-bold text-[#F5DC8B]">
                      VS
                    </div>

                    {/* Enemy Revealed Card */}
                    <motion.div
                      initial={{ rotateY: 85, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      transition={{ duration: 0.28 }}
                      className={`rounded-lg p-3.5 bg-[#1A1320] border flex items-center gap-3.5 ${
                        latestReveal.winner === 'enemy'
                          ? 'border-rose-400 shadow-[0_0_24px_rgba(244,63,94,0.2)]'
                          : 'border-white/15'
                      }`}
                    >
                      <div className="relative w-20 h-24 rounded-md overflow-hidden shrink-0 border border-white/15">
                        <Image
                          src={latestReveal.enemyCard.artworkUrl}
                          alt={latestReveal.enemyCard.name}
                          fill
                          sizes="80px"
                          referrerPolicy="no-referrer"
                          className="object-cover object-top"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[11px] font-mono text-rose-300">
                            RIVAL REVEALED · {latestReveal.enemyFinalPower} PWR
                          </p>
                          <CardTierBadge
                            level={latestReveal.enemyCard.level}
                            compact
                          />
                        </div>
                        <p className="font-display text-base font-bold text-[#F5EFE0] truncate">
                          {latestReveal.enemyCard.name}
                        </p>
                        <p className="text-xs text-[#C4C9D8]">
                          {latestReveal.enemyTraits
                            .map((t) => TRAIT_MAP[t]?.name)
                            .join(' · ')}
                        </p>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              ) : (
                <div className="text-center space-y-2 py-8">
                  <Sparkles className="w-8 h-8 text-[#F5DC8B] mx-auto" />
                  <p className="font-display text-lg font-bold text-[#F5EFE0]">
                    Throw Your First Card to Reveal the Clash!
                  </p>
                  <p className="text-xs sm:text-sm text-[#9CA3B8] max-w-lg mx-auto">
                    Click any champion in your hand below. Both your card and a
                    hidden rival card flip over at the same time!
                  </p>
                </div>
              )}
            </AnimatePresence>

            {/* End-of-Match Reward Banner */}
            {match.status === 'finished' && reward && (
              <div
                data-testid="blind-clash-summary"
                className="mt-5 pt-5 border-t border-white/15 flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <Trophy
                    className={`w-9 h-9 shrink-0 ${
                      match.winner === 'player'
                        ? 'text-[#F5DC8B]'
                        : 'text-[#8F96AB]'
                    }`}
                  />
                  <div>
                    <h3 className="font-display text-xl font-bold text-[#F5EFE0]">
                      {match.winner === 'player'
                        ? 'Blind Clash Victory!'
                        : match.winner === 'enemy'
                          ? 'Rival Won This Gamble'
                          : 'Deadlock Draw!'}
                    </h3>
                    <p className="text-xs sm:text-sm text-emerald-300 font-mono">
                      +{reward.xpEarned} Account XP · +{reward.shardsEarned}{' '}
                      Shards
                      {reward.creatorCardsEarned > 0
                        ? ` · LEVEL UP! +${reward.creatorCardsEarned} Creator Card!`
                        : ''}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleResetToDraft}
                    className="px-5 py-2.5 rounded-md bg-[#D4AF37] text-[#0B0D13] font-bold text-xs sm:text-sm hover:bg-[#E5C454] cursor-pointer"
                  >
                    Play Again
                  </button>
                  {reward.creatorCardsEarned > 0 && (
                    <button
                      type="button"
                      onClick={onOpenStudio}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-violet-500/25 border border-violet-400/50 text-violet-100 font-semibold text-xs sm:text-sm hover:bg-violet-500/35 cursor-pointer"
                    >
                      <Wand2 className="w-4 h-4" />
                      <span>Spend Creator Card</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* BOTTOM ZONE: Player's Remaining Playable Hand */}
          <section aria-label="Your playable cards" className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-wider text-[#F5DC8B] flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>
                Your Hand — Click a Champion to Throw ({match.playerRemaining.length}{' '}
                Left)
              </span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {match.playerRemaining.map((card) => {
                const visual = getCardVisualStats(card);
                return (
                  <button
                    key={card.id}
                    type="button"
                    data-testid="player-clash-card"
                    onClick={() => handleThrowCard(card.id)}
                    className="group text-left rounded-lg overflow-hidden bg-[#121622] border border-[#D4AF37]/40 hover:border-[#F5DC8B] hover:-translate-y-1 transition-all duration-150 cursor-pointer flex flex-col"
                  >
                    <div className="relative h-28 w-full bg-[#0B0E17]">
                      <Image
                        src={card.artworkUrl}
                        alt={card.name}
                        fill
                        sizes="180px"
                        referrerPolicy="no-referrer"
                        className="object-cover object-top"
                      />
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            'linear-gradient(180deg, rgba(9,11,16,0.1) 0%, rgba(9,11,16,0.92) 100%)',
                        }}
                      />
                      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[#090B10]/85 text-[11px] font-mono font-bold text-[#F5DC8B]">
                        {visual.powerRating}
                      </span>
                      <div className="absolute bottom-1.5 inset-x-2">
                        <p className="font-display text-sm font-bold text-[#F5EFE0] truncate">
                          {card.name}
                        </p>
                      </div>
                    </div>
                    <div className="p-2 space-y-1">
                      <p className="text-[11px] text-[#C4C9D8] truncate">
                        {visual.traits.map((t) => t.name).join(' · ')}
                      </p>
                      {visual.counterHighlights[0] && (
                        <p className="text-[10px] font-medium text-emerald-300 truncate">
                          {visual.counterHighlights[0]}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
