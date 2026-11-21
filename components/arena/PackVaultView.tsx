'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  Clock,
  Coins,
  Gift,
  Layers,
  Loader2,
  PackageOpen,
  ShoppingBag,
  Sparkles,
  Swords,
  Wand2,
} from 'lucide-react';
import {
  DailyLoginRewardState,
  formatResetCountdown,
  getDailyRewardStatus,
} from '@/lib/game/daily-rewards';
import {
  BOOSTER_PACK_SHARD_COST,
  canClaimPeriodicPack,
  CREATOR_CARD_SHARD_COST,
  formatCountdownLabel,
  generateCuratedVaultPackCards,
  PlayerEconomyState,
  XP_PER_ACCOUNT_LEVEL,
} from '@/lib/game/packs';
import { CharacterDefinition } from '@/lib/game/types';
import { AccountBar } from './AccountBar';
import { ELEMENT_STYLES } from './ui-meta';
import { VisualStatBars } from './VisualStatBars';

interface PackVaultViewProps {
  economy: PlayerEconomyState;
  dailyRewards: DailyLoginRewardState;
  ownedCharacters: CharacterDefinition[];
  ownerId: string;
  ownerName: string;
  onOpenStarterPack: () => {
    unlockedCards: CharacterDefinition[];
    creatorCardsGranted: number;
  };
  onClaimPeriodicPack: (kind: 'weekly' | 'monthly') => {
    ok: boolean;
    error?: string;
    packsAdded: number;
  };
  onOpenDailyRewards: () => void;
  onBuyCreatorCard: () => { ok: boolean; error?: string };
  onBuyBoosterPack: () => { ok: boolean; error?: string };
  onCommitBoosterCards: (
    cards: CharacterDefinition[],
    newlyUnlockedStarterIds: string[]
  ) => void;
  onOpenStudio: () => void;
  onOpenBlindClash: () => void;
  onOpenCollection: () => void;
  onBackToTitle: () => void;
}

export function PackVaultView({
  economy,
  dailyRewards,
  ownedCharacters,
  ownerId,
  ownerName,
  onOpenStarterPack,
  onClaimPeriodicPack,
  onOpenDailyRewards,
  onBuyCreatorCard,
  onBuyBoosterPack,
  onCommitBoosterCards,
  onOpenStudio,
  onOpenBlindClash,
  onOpenCollection,
  onBackToTitle,
}: PackVaultViewProps) {
  const [tearing, setTearing] = useState<'starter' | 'ai_booster' | 'vault_booster' | null>(null);
  const [revealedCards, setRevealedCards] = useState<CharacterDefinition[]>([]);
  const [revealHeadline, setRevealHeadline] = useState<string>('');
  const [revealSubline, setRevealSubline] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [nowMs] = useState<number>(() => Date.now());
  const weeklyStatus = useMemo(
    () => canClaimPeriodicPack(economy, 'weekly', nowMs),
    [economy, nowMs]
  );
  const monthlyStatus = useMemo(
    () => canClaimPeriodicPack(economy, 'monthly', nowMs),
    [economy, nowMs]
  );
  const dailyStatus = useMemo(
    () => getDailyRewardStatus(dailyRewards, new Date(nowMs)),
    [dailyRewards, nowMs]
  );

  const xpPercent = Math.min(
    100,
    Math.round((economy.accountXp / XP_PER_ACCOUNT_LEVEL) * 100)
  );

  const handleTearStarterPack = () => {
    setErrorMsg(null);
    setNotice(null);
    setTearing('starter');
    window.setTimeout(() => {
      const res = onOpenStarterPack();
      setRevealedCards(res.unlockedCards);
      setRevealHeadline('Welcome Starter Pack Opened!');
      setRevealSubline(
        `You unlocked ${res.unlockedCards.length} Starter Champions + ${res.creatorCardsGranted} Free Creator Card + 1 Bonus Booster Pack!`
      );
      setTearing(null);
    }, 520);
  };

  const handleOpenAiBoosterPack = async () => {
    if (economy.unopenedBoosterPacks < 1) {
      setErrorMsg('No unopened Booster Packs right now. Claim a Weekly/Monthly pack or buy one with Shards!');
      return;
    }
    setErrorMsg(null);
    setNotice(null);
    setTearing('ai_booster');
    try {
      const res = await fetch('/api/packs/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingNames: ownedCharacters.map((c) => c.name),
          ownerId,
          ownerName,
          packTheme: economy.totalPacksOpened % 3 === 0 ? 'mythic' : 'standard',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(
          data?.error ||
            'AI Pack Forgemaster was unavailable. You can retry or open an Instant Vault Pack below.'
        );
        setTearing(null);
        return;
      }
      const pulled = (data.cards ?? []) as CharacterDefinition[];
      onCommitBoosterCards(pulled, []);
      setRevealedCards(pulled);
      setRevealHeadline('AI-Forged Booster Pack Opened!');
      setRevealSubline(
        '3 brand-new AI-generated champions with unique Skill Tree pros & cons joined your private collection.'
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Network error while forging AI Booster Pack.'
      );
    } finally {
      setTearing(null);
    }
  };

  const handleOpenInstantVaultPack = () => {
    if (economy.unopenedBoosterPacks < 1) {
      setErrorMsg('No unopened Booster Packs right now. Claim a free pack or buy one with Shards!');
      return;
    }
    setErrorMsg(null);
    setNotice(null);
    setTearing('vault_booster');
    window.setTimeout(() => {
      const generated = generateCuratedVaultPackCards({
        seed: Date.now() % 100000,
        existingNames: ownedCharacters.map((c) => c.name),
        unlockedStarterIds: economy.unlockedStarterIds,
        ownerId,
        ownerName,
      });
      onCommitBoosterCards(generated.cards, generated.newlyUnlockedStarterIds);
      setRevealedCards(generated.cards);
      setRevealHeadline('Vault Booster Pack Torn Open!');
      setRevealSubline(
        '3 balanced champions joined your private collection — ready for Blind Clash or 5v5 Arena!'
      );
      setTearing(null);
    }, 450);
  };

  const handleClaim = (kind: 'weekly' | 'monthly') => {
    setErrorMsg(null);
    const res = onClaimPeriodicPack(kind);
    if (!res.ok) {
      setErrorMsg(res.error || 'Pack is still recharging.');
      return;
    }
    setNotice(
      `Claimed +${res.packsAdded} Free ${kind === 'monthly' ? 'Monthly Mythic' : 'Weekly'} Booster Pack${res.packsAdded > 1 ? 's' : ''}! Tear it open below.`
    );
  };

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
              Card Packs &amp; Creator Vault
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenBlindClash}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-amber-500/20 border border-amber-400/45 text-amber-100 hover:bg-amber-500/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Swords className="w-3.5 h-3.5 shrink-0" />
              <span>Blind Clash</span>
            </button>
            <button
              type="button"
              onClick={onOpenStudio}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-violet-500/20 border border-violet-400/45 text-violet-100 hover:bg-violet-500/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5 shrink-0" />
              <span>Oracle Studio ({economy.creatorCards} Creator)</span>
            </button>
            <button
              type="button"
              onClick={onOpenCollection}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-white/15 text-[#C4C9D8] hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>My Cards ({ownedCharacters.length})</span>
            </button>
            <AccountBar compact />
          </div>
        </div>
      </div>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6 flex-1">
        {/* Account Level & Creator Card Resource Banner */}
        <section className="rounded-lg bg-[#111521] border border-[#D4AF37]/30 p-5 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 items-center">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                Account Level {economy.accountLevel}
              </h2>
              <span className="font-mono tabular-nums text-xs text-[#F5DC8B]">
                {economy.accountXp} / {XP_PER_ACCOUNT_LEVEL} XP to Level{' '}
                {economy.accountLevel + 1} (+1 Creator Card!)
              </span>
            </div>
            <div className="h-3 rounded-sm bg-[#090B10] border border-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#D4AF37] to-amber-300 transition-all duration-300"
                style={{ width: `${xpPercent}%` }}
              />
            </div>
            <p className="text-xs text-[#9CA3B8]">
              Play Blind Clash, 5v5 Arena, or Boss Gauntlet to level up. Every
              level grants <span className="text-[#F5DC8B] font-semibold">+1 Creator Card</span> to
              forge your own original hero in the Visual Skill Tree!
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md bg-[#0B0E17] border border-violet-400/30 p-3">
              <p className="text-[11px] text-[#9CA3B8]">Creator Cards</p>
              <p
                data-testid="vault-creator-card-count"
                className="font-mono tabular-nums text-2xl font-bold text-violet-300 mt-0.5"
              >
                {economy.creatorCards}
              </p>
            </div>
            <div className="rounded-md bg-[#0B0E17] border border-[#D4AF37]/30 p-3">
              <p className="text-[11px] text-[#9CA3B8]">Booster Packs</p>
              <p
                data-testid="vault-booster-pack-count"
                className="font-mono tabular-nums text-2xl font-bold text-[#F5DC8B] mt-0.5"
              >
                {economy.unopenedBoosterPacks}
              </p>
            </div>
            <div className="rounded-md bg-[#0B0E17] border border-emerald-400/30 p-3">
              <p className="text-[11px] text-[#9CA3B8]">Oracle Shards</p>
              <p
                data-testid="vault-shard-count"
                className="font-mono tabular-nums text-2xl font-bold text-emerald-300 mt-0.5"
              >
                {economy.localShards}
              </p>
            </div>
          </div>
        </section>

        {notice && (
          <div className="rounded-md bg-emerald-500/15 border border-emerald-400/40 px-4 py-3 text-sm text-emerald-200">
            {notice}
          </div>
        )}
        {errorMsg && (
          <div
            role="alert"
            className="rounded-md bg-rose-500/15 border border-rose-400/40 px-4 py-3 text-sm text-rose-200"
          >
            {errorMsg}
          </div>
        )}

        {/* Welcome Starter Pack Hero (Priority #1 for New Players!) */}
        {!economy.starterPackOpened && (
          <section
            data-testid="starter-pack-hero"
            className="rounded-lg bg-gradient-to-br from-[#191E30] via-[#131726] to-[#0D101A] border-2 border-[#D4AF37]/70 p-6 sm:p-8 flex flex-col lg:flex-row items-center gap-8 shadow-[0_0_48px_rgba(212,175,55,0.16)]"
          >
            <motion.div
              animate={
                tearing === 'starter'
                  ? { scale: [1, 1.08, 0.92, 1.15], rotate: [0, -4, 5, 0] }
                  : { y: [0, -5, 0] }
              }
              transition={
                tearing === 'starter'
                  ? { duration: 0.45 }
                  : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
              }
              className="relative w-52 h-72 rounded-xl border-2 border-[#F5DC8B] bg-gradient-to-b from-[#2A2210] via-[#141928] to-[#090B10] shadow-2xl flex flex-col items-center justify-between p-5 shrink-0 overflow-hidden"
            >
              <div className="w-full flex items-center justify-between text-[11px] font-mono text-[#F5DC8B]">
                <span>SERIES 01</span>
                <span>8 CARDS + 1</span>
              </div>
              <div className="text-center space-y-2">
                <Gift className="w-12 h-12 text-[#F5DC8B] mx-auto" />
                <p className="font-display text-xl font-bold text-[#F5EFE0] tracking-wide">
                  WELCOME PACK
                </p>
                <p className="text-xs text-[#C4C9D8]">
                  Developer Starter Collection
                </p>
              </div>
              <div className="w-full text-center pt-2 border-t border-[#D4AF37]/40 text-[11px] font-semibold text-emerald-300">
                Includes 1 Free Creator Card
              </div>
            </motion.div>

            <div className="flex-1 space-y-4 text-center lg:text-left">
              <p className="font-mono text-xs uppercase tracking-widest text-[#F5DC8B]">
                First-Time Player Gift
              </p>
              <h2 className="font-display text-3xl font-bold text-[#F5EFE0]">
                Tear Open Your Starter Pack!
              </h2>
              <p className="text-sm sm:text-base text-[#C4C9D8] max-w-2xl leading-relaxed">
                Start your adventure with <strong className="text-white">8 developer-crafted Champions</strong>,{' '}
                <strong className="text-violet-300">1 Creator Card</strong> to invent your very own hero, and{' '}
                <strong className="text-[#F5DC8B]">1 Bonus Booster Pack</strong>. Pick 6 of your cards to gamble in Blind Clash!
              </p>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-1">
                <button
                  type="button"
                  data-testid="tear-starter-pack-btn"
                  disabled={tearing !== null}
                  onClick={handleTearStarterPack}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-md bg-[#D4AF37] text-[#0B0D13] font-bold text-sm sm:text-base hover:bg-[#E5C454] active:scale-[0.98] transition-all cursor-pointer shadow-[0_8px_28px_rgba(212,175,55,0.3)]"
                >
                  {tearing === 'starter' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PackageOpen className="w-5 h-5" />
                  )}
                  <span>
                    {tearing === 'starter'
                      ? 'Tearing Foil Seal...'
                      : 'Tear Open Welcome Starter Pack'}
                  </span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Pack Reveal Showcase */}
        <AnimatePresence>
          {revealedCards.length > 0 && (
            <motion.section
              key={revealHeadline + revealedCards.length}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              data-testid="pack-reveal-grid"
              className="rounded-lg bg-[#121622] border border-[#D4AF37]/50 p-5 sm:p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-[#F5DC8B]">
                    {revealHeadline}
                  </h2>
                  <p className="text-xs sm:text-sm text-[#C4C9D8]">
                    {revealSubline}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenBlindClash}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-xs hover:bg-[#E5C454] cursor-pointer"
                  >
                    <Swords className="w-3.5 h-3.5" />
                    <span>Play Blind Clash (Pick 6)</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenStudio}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-violet-500/20 border border-violet-400/50 text-violet-100 font-semibold text-xs hover:bg-violet-500/30 cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Use Creator Card</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {revealedCards.map((card, idx) => {
                  const elem = ELEMENT_STYLES[card.element];
                  return (
                    <motion.article
                      key={card.id}
                      initial={{ opacity: 0, rotateY: -70, scale: 0.92 }}
                      animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                      transition={{ duration: 0.32, delay: idx * 0.06 }}
                      className="rounded-lg overflow-hidden bg-[#0D101A] border border-[#D4AF37]/35 flex flex-col"
                    >
                      <div className="relative h-36 w-full bg-[#161B2B]">
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
                              'linear-gradient(180deg, rgba(9,11,16,0.1) 0%, rgba(9,11,16,0.92) 100%)',
                          }}
                        />
                        <div className="absolute bottom-2 inset-x-3">
                          <p className={`text-[11px] font-medium ${elem.text}`}>
                            {card.role} · {card.element}
                          </p>
                          <h3 className="font-display text-base font-bold text-[#F5EFE0] truncate">
                            {card.name}
                          </h3>
                        </div>
                      </div>
                      <div className="p-3">
                        <VisualStatBars character={card} compact />
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Booster Pack Opener + Periodic Free Packs + Creator Card Shop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Column 1: Tear Open Booster Packs */}
          <section className="rounded-lg bg-[#111521] border border-white/12 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F5DC8B]">
                  <Sparkles className="w-4 h-4" />
                  <span>Booster Pack Opener</span>
                </span>
                <span className="font-mono tabular-nums text-xs text-[#C4C9D8]">
                  {economy.unopenedBoosterPacks} Ready
                </span>
              </div>
              <h3 className="font-display text-lg font-bold text-[#F5EFE0]">
                Open a 3-Card Booster Pack
              </h3>
              <p className="text-xs text-[#9CA3B8] leading-relaxed">
                Every Booster Pack reveals 3 balanced champions with unique
                Visual Skill Tree traits, pros &amp; cons, and artwork.
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                data-testid="open-ai-pack-btn"
                disabled={tearing !== null || economy.unopenedBoosterPacks < 1}
                onClick={handleOpenAiBoosterPack}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-xs sm:text-sm hover:bg-[#E5C454] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {tearing === 'ai_booster' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>
                  {tearing === 'ai_booster'
                    ? 'AI Forging 3 New Heroes...'
                    : 'Tear Open AI Booster Pack (Gemini)'}
                </span>
              </button>

              <button
                type="button"
                data-testid="open-vault-pack-btn"
                disabled={tearing !== null || economy.unopenedBoosterPacks < 1}
                onClick={handleOpenInstantVaultPack}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[#182035] border border-sky-400/40 text-sky-100 font-medium text-xs hover:bg-[#222D48] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {tearing === 'vault_booster' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <PackageOpen className="w-3.5 h-3.5" />
                )}
                <span>Open Instant Curated Vault Pack</span>
              </button>
            </div>
          </section>

          {/* Column 2: Weekly & Monthly Free Drops */}
          <section className="rounded-lg bg-[#111521] border border-white/12 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <Calendar className="w-4 h-4" />
                <span>Periodic Free Packs</span>
              </span>
              <h3 className="font-display text-lg font-bold text-[#F5EFE0]">
                Weekly &amp; Monthly Drops
              </h3>
              <p className="text-xs text-[#9CA3B8] leading-relaxed">
                Come back every week for a free Booster Pack, and once a month
                for a double Mythic Pack drop!
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="rounded-md bg-[#0B0E17] border border-[#D4AF37]/30 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#F5EFE0] inline-flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-[#F5DC8B]" />
                    <span>Daily Login Shards (Day {dailyStatus.canClaimToday ? dailyStatus.nextClaimDay : dailyStatus.effectiveStreak})</span>
                  </p>
                  <p className="text-[11px] text-[#8F96AB] inline-flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    <span>
                      {dailyStatus.canClaimToday
                        ? `+${dailyStatus.nextRewardTier.shards} Shards ready now`
                        : `Next in ${formatResetCountdown(dailyStatus.msUntilReset)}`}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="vault-daily-reward-btn"
                  onClick={onOpenDailyRewards}
                  className={`px-3.5 py-2 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    dailyStatus.canClaimToday
                      ? 'bg-[#D4AF37] text-[#0B0D13] hover:bg-[#E5C454]'
                      : 'bg-white/5 border border-white/15 text-[#C4C9D8] hover:text-white hover:bg-white/10'
                  }`}
                >
                  {dailyStatus.canClaimToday
                    ? `Claim +${dailyStatus.nextRewardTier.shards}`
                    : 'View 7-Day Streak'}
                </button>
              </div>

              <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#F5EFE0]">
                    Weekly Free Pack
                  </p>
                  <p className="text-[11px] text-[#8F96AB] inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatCountdownLabel(weeklyStatus.remainingMs)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="claim-weekly-pack-btn"
                  disabled={!weeklyStatus.ready}
                  onClick={() => handleClaim('weekly')}
                  className="px-3.5 py-2 rounded-md text-xs font-semibold bg-emerald-500/20 border border-emerald-400/50 text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  {weeklyStatus.ready ? 'Claim +1 Pack' : 'Recharging'}
                </button>
              </div>

              <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#F5EFE0]">
                    Monthly Mythic Drop
                  </p>
                  <p className="text-[11px] text-[#8F96AB] inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatCountdownLabel(monthlyStatus.remainingMs)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="claim-monthly-pack-btn"
                  disabled={!monthlyStatus.ready}
                  onClick={() => handleClaim('monthly')}
                  className="px-3.5 py-2 rounded-md text-xs font-semibold bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#F5DC8B] hover:bg-[#D4AF37]/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  {monthlyStatus.ready ? 'Claim +2 Packs' : 'Recharging'}
                </button>
              </div>
            </div>
          </section>

          {/* Column 3: Buy Creator Cards & Extra Packs with Shards */}
          <section className="rounded-lg bg-[#111521] border border-white/12 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300">
                <ShoppingBag className="w-4 h-4" />
                <span>Shard Exchange</span>
              </span>
              <h3 className="font-display text-lg font-bold text-[#F5EFE0]">
                Buy Creator Cards &amp; Packs
              </h3>
              <p className="text-xs text-[#9CA3B8] leading-relaxed">
                Spend Oracle Shards won from battles to unlock extra Creator
                Cards or extra Booster Packs anytime.
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded-md bg-[#0B0E17] border border-violet-400/25 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#F5EFE0]">
                    +1 Creator Card
                  </p>
                  <p className="text-[11px] text-violet-300 font-mono">
                    {CREATOR_CARD_SHARD_COST} Shards
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="buy-creator-card-btn"
                  onClick={() => {
                    setErrorMsg(null);
                    const res = onBuyCreatorCard();
                    if (!res.ok) setErrorMsg(res.error || 'Not enough Shards.');
                    else setNotice('Purchased +1 Creator Card! Open Oracle Studio to build your hero.');
                  }}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-md text-xs font-semibold bg-violet-500/25 border border-violet-400/50 text-violet-100 hover:bg-violet-500/35 cursor-pointer whitespace-nowrap"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>Buy</span>
                </button>
              </div>

              <div className="rounded-md bg-[#0B0E17] border border-[#D4AF37]/25 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#F5EFE0]">
                    +1 Booster Pack
                  </p>
                  <p className="text-[11px] text-[#F5DC8B] font-mono">
                    {BOOSTER_PACK_SHARD_COST} Shards
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="buy-booster-pack-btn"
                  onClick={() => {
                    setErrorMsg(null);
                    const res = onBuyBoosterPack();
                    if (!res.ok) setErrorMsg(res.error || 'Not enough Shards.');
                    else setNotice('Purchased +1 Booster Pack! Tear it open on the left.');
                  }}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-md text-xs font-semibold bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#F5DC8B] hover:bg-[#D4AF37]/30 cursor-pointer whitespace-nowrap"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>Buy</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
