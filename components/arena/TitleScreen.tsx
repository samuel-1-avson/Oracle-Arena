'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  ArrowLeftRight,
  ArrowUpCircle,
  BarChart3,
  BookOpen,
  CalendarDays,
  Crown,
  EyeOff,
  Film,
  Flame,
  Gift,
  Globe,
  Layers,
  PackageOpen,
  Sparkles,
  Store,
  Swords,
  Trophy,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import {
  DailyLoginRewardState,
  getDailyRewardStatus,
} from '@/lib/game/daily-rewards';
import { PlayerEconomyState, XP_PER_ACCOUNT_LEVEL } from '@/lib/game/packs';
import { MatchSummaryRecord } from '@/lib/game/types';
import { AccountBar } from './AccountBar';

interface TitleScreenProps {
  economy: PlayerEconomyState;
  dailyRewards: DailyLoginRewardState;
  dailyRewardModalOpen?: boolean;
  ownedCardCount: number;
  onOpenDailyRewards: () => void;
  onOpenPackVault: () => void;
  onOpenBlindClash: () => void;
  onStartBattle: () => void;
  onOpenGauntlet: () => void;
  onOpenMultiplayer: () => void;
  onOpenStudio: () => void;
  onOpenCollection: () => void;
  onOpenEvolutionChamber: () => void;
  onOpenMarketplace: () => void;
  onOpenTradingHub: () => void;
  onOpenSocial: () => void;
  onOpenLeaderboard: () => void;
  onOpenReplay: (matchId?: string) => void;
  onOpenAnalytics: () => void;
  recentMatches: MatchSummaryRecord[];
  customCardCount: number;
  syncingCloud?: boolean;
}

export function TitleScreen({
  economy,
  dailyRewards,
  dailyRewardModalOpen = false,
  ownedCardCount,
  onOpenDailyRewards,
  onOpenPackVault,
  onOpenBlindClash,
  onStartBattle,
  onOpenGauntlet,
  onOpenMultiplayer,
  onOpenStudio,
  onOpenCollection,
  onOpenEvolutionChamber,
  onOpenMarketplace,
  onOpenTradingHub,
  onOpenSocial,
  onOpenLeaderboard,
  onOpenReplay,
  onOpenAnalytics,
  recentMatches,
  syncingCloud = false,
}: TitleScreenProps) {
  const [showRules, setShowRules] = useState(false);
  const [nowMs] = useState<number>(() => Date.now());
  const dailyStatus = getDailyRewardStatus(dailyRewards, new Date(nowMs));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (dailyRewardModalOpen) return;
      if (showRules) {
        if (e.key === 'Escape') setShowRules(false);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'BUTTON' || tag === 'A') return;
        e.preventDefault();
        onStartBattle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStartBattle, showRules, dailyRewardModalOpen]);

  const wins = recentMatches.filter((m) => m.winner === 'player').length;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#090B10] flex flex-col justify-between">
      {/* Full-viewport Key Art Backdrop */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/title_arena_backdrop.jpg"
          alt="Oracle Arena celestial colosseum floating in obsidian cosmos"
          fill
          priority
          sizes="100vw"
          referrerPolicy="no-referrer"
          className="object-cover object-center scale-[1.01]"
        />
        {/* Measured contrast scrim preserving negative space on left while letting the colosseum shine on right */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(9,11,16,0.92) 0%, rgba(9,11,16,0.78) 42%, rgba(9,11,16,0.28) 72%, rgba(9,11,16,0.45) 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(9,11,16,0.35) 0%, rgba(9,11,16,0) 25%, rgba(9,11,16,0) 75%, rgba(9,11,16,0.88) 100%)',
          }}
        />
      </div>

      {/* Top-Right Safe Area: Daily Login Reward + Cloud Account Status */}
      <div className="relative z-20 px-6 sm:px-12 lg:px-20 pt-5 flex flex-wrap items-center justify-end gap-2.5">
        <button
          type="button"
          data-testid="title-daily-reward-btn"
          onClick={onOpenDailyRewards}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            dailyStatus.canClaimToday
              ? 'bg-[#D4AF37]/20 border border-[#D4AF37]/75 text-[#F5DC8B] hover:bg-[#D4AF37]/30 shadow-[0_0_20px_rgba(212,175,55,0.22)]'
              : 'bg-[#111521]/90 border border-white/15 text-[#C4C9D8] hover:text-white hover:border-white/30'
          }`}
        >
          {dailyStatus.canClaimToday ? (
            <>
              <CalendarDays className="w-4 h-4 text-[#F5DC8B] shrink-0" />
              <span>
                Daily Reward: +{dailyStatus.nextRewardTier.shards} Shards
              </span>
            </>
          ) : (
            <>
              <Flame className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Daily Streak: Day {dailyStatus.effectiveStreak}</span>
            </>
          )}
        </button>
        <AccountBar syncingCloud={syncingCloud} />
      </div>

      {/* Main Content Anchored in Left Negative Space */}
      <div className="relative z-10 flex-1 flex items-center px-6 sm:px-12 lg:px-20 py-10">
        <div className="max-w-xl w-full flex flex-col items-start gap-8">
          {/* Custom Inline SVG Emblem + Monumental Title Lockup */}
          <div className="flex flex-col items-start gap-5">
            <svg
              viewBox="0 0 88 88"
              className="w-16 h-16 sm:w-20 sm:h-20"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="oa-gold" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#F5DC8B" />
                  <stop offset="55%" stopColor="#D4AF37" />
                  <stop offset="100%" stopColor="#8C6B1F" />
                </linearGradient>
                <linearGradient id="oa-arc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A78BFA" />
                  <stop offset="100%" stopColor="#38BDF8" />
                </linearGradient>
              </defs>
              {/* Outer Astrolabe Ring */}
              <circle
                cx="44"
                cy="44"
                r="38"
                fill="rgba(12, 15, 24, 0.72)"
                stroke="url(#oa-gold)"
                strokeWidth="2.2"
              />
              <circle
                cx="44"
                cy="44"
                r="30"
                fill="none"
                stroke="rgba(212, 175, 55, 0.35)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              {/* Diamond Crest */}
              <polygon
                points="44,12 68,44 44,76 20,44"
                fill="none"
                stroke="url(#oa-gold)"
                strokeWidth="2"
              />
              {/* Inner Arcane Eye / Core */}
              <polygon
                points="44,26 56,44 44,62 32,44"
                fill="rgba(139, 92, 246, 0.25)"
                stroke="url(#oa-arc)"
                strokeWidth="1.6"
              />
              <circle cx="44" cy="44" r="5" fill="#F5DC8B" />
              {/* Cardinal ticks */}
              <line x1="44" y1="3" x2="44" y2="11" stroke="#F5DC8B" strokeWidth="2" />
              <line x1="44" y1="77" x2="44" y2="85" stroke="#F5DC8B" strokeWidth="2" />
              <line x1="3" y1="44" x2="11" y2="44" stroke="#F5DC8B" strokeWidth="2" />
              <line x1="77" y1="44" x2="85" y2="44" stroke="#F5DC8B" strokeWidth="2" />
            </svg>

            <div className="space-y-2.5">
              <h1
                className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-[0.06em] text-[#F5EFE0] leading-[1.02]"
                style={{
                  textShadow:
                    '0 4px 28px rgba(0,0,0,0.85), 0 1px 0 rgba(212,175,55,0.45)',
                  textWrap: 'balance',
                }}
              >
                ORACLE ARENA
              </h1>
              <p className="text-base sm:text-lg text-[#C4C9D8] max-w-md leading-relaxed">
                Tear open Champion Packs, gamble 6 hidden cards in Blind Clash,
                and earn Creator Cards to craft your own hero in the Skill Tree.
              </p>
            </div>
          </div>

          {/* Welcome Starter Pack Callout for New Players */}
          {!economy.starterPackOpened && (
            <div
              data-testid="title-starter-pack-callout"
              className="w-full rounded-lg bg-[#161B2B]/95 border border-[#D4AF37]/70 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_32px_rgba(212,175,55,0.2)]"
            >
              <div className="flex items-center gap-3">
                <Gift className="w-7 h-7 text-[#F5DC8B] shrink-0" />
                <div>
                  <p className="font-display text-sm sm:text-base font-bold text-[#F5EFE0]">
                    Welcome Gift Ready: Free Starter Pack!
                  </p>
                  <p className="text-xs text-[#C4C9D8]">
                    Tear open 8 developer champions + 1 free Creator Card to start!
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-testid="title-open-starter-pack-btn"
                onClick={onOpenPackVault}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-[#D4AF37] text-[#0B0D13] font-bold text-xs sm:text-sm hover:bg-[#E5C454] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <PackageOpen className="w-4 h-4" />
                <span>Open Starter Pack</span>
              </button>
            </div>
          )}

          {/* Primary Menu Actions (<= 3 actions) */}
          <div className="flex flex-col sm:flex-row sm:flex-nowrap items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              data-testid="title-blind-clash-btn"
              onClick={onOpenBlindClash}
              className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-sm sm:text-base tracking-wide hover:bg-[#E5C454] active:scale-[0.98] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5DC8B] shadow-[0_8px_28px_rgba(212,175,55,0.28)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <EyeOff className="w-4 h-4 shrink-0" />
              <span>Blind Clash (6v6)</span>
            </button>

            <button
              type="button"
              data-start="true"
              onClick={onStartBattle}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-md bg-[#121C2D]/95 text-[#ECEEF4] border border-sky-400/50 font-medium text-sm sm:text-base hover:bg-[#192942] hover:border-sky-300/80 active:scale-[0.98] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Swords className="w-4 h-4 text-sky-300 shrink-0" />
              <span>5v5 Tactical Arena</span>
            </button>

            <button
              type="button"
              data-testid="title-packs-btn"
              onClick={onOpenPackVault}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-md bg-[#18142B]/90 text-[#ECEEF4] border border-violet-400/45 font-medium text-sm sm:text-base hover:bg-[#231D3F] hover:border-violet-300/70 active:scale-[0.98] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PackageOpen className="w-4 h-4 text-violet-300 shrink-0" />
              <span>
                Card Packs
                {economy.unopenedBoosterPacks > 0
                  ? ` (${economy.unopenedBoosterPacks})`
                  : ''}
              </span>
            </button>
          </div>

          {/* Account Level & Creator Card Progress Strip */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#C4C9D8] font-mono tabular-nums">
            <span className="text-[#F5DC8B] font-semibold">
              Account Lv.{economy.accountLevel} ({economy.accountXp}/
              {XP_PER_ACCOUNT_LEVEL} XP)
            </span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenStudio}
              className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200 underline underline-offset-4 cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Creator Cards: {economy.creatorCards}</span>
            </button>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-300">
              {economy.localShards} Shards
            </span>
            <span aria-hidden="true">·</span>
            <span>{ownedCardCount} Owned Cards</span>
          </div>

          {/* Quiet Match Record Summary (only when real matches exist) */}
          {recentMatches.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-[#9CA3B8] font-mono tabular-nums pt-1">
              <span>Matches Played: {recentMatches.length}</span>
              <span aria-hidden="true">·</span>
              <span>Victories: {wins}</span>
              <span aria-hidden="true">·</span>
              <span>
                Last Result:{' '}
                <span
                  className={
                    recentMatches[0].winner === 'player'
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }
                >
                  {recentMatches[0].winner === 'player' ? 'Victory' : 'Defeat'}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onOpenReplay(recentMatches[0].matchId)}
                className="inline-flex items-center gap-1 text-[#F5DC8B] hover:text-[#FFF0B8] underline underline-offset-4 transition-colors cursor-pointer"
              >
                <Film className="w-3.5 h-3.5 shrink-0" />
                <span>Study Last Replay</span>
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onOpenAnalytics}
                className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200 underline underline-offset-4 transition-colors cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                <span>Battle Analytics</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Safe Margin — Single Flat Control Hint */}
      <footer className="relative z-10 px-6 sm:px-12 lg:px-20 pb-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[#8F96AB]">
        <p className="font-mono tracking-wide">
          Enter Start · 1–5 Select Ability · Space Auto Battle · Esc Pause
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onOpenStudio}
            className="inline-flex items-center gap-1.5 text-violet-300 hover:text-violet-200 font-medium transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Skill Tree Forge</span>
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onOpenMultiplayer}
            className="inline-flex items-center gap-1.5 text-sky-300 hover:text-sky-200 font-medium transition-colors cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>Multiplayer PvP</span>
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onOpenGauntlet}
            className="inline-flex items-center gap-1.5 text-amber-300 hover:text-[#FFF0B8] font-medium transition-colors cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5 shrink-0" />
            <span>PvE Gauntlet</span>
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onOpenCollection}
            className="inline-flex items-center gap-1.5 text-[#C4C9D8] hover:text-[#F5DC8B] transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>Card Collection</span>
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onOpenEvolutionChamber}
            className="inline-flex items-center gap-1.5 text-[#C4C9D8] hover:text-[#F5DC8B] transition-colors cursor-pointer"
          >
            <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Evolution Chamber</span>
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onOpenTradingHub}
            className="inline-flex items-center gap-1.5 text-sky-300 hover:text-sky-200 transition-colors cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
            <span>Friends Trade</span>
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onOpenMarketplace}
            className="inline-flex items-center gap-1.5 text-[#F5DC8B] hover:text-[#FFF0B8] transition-colors cursor-pointer"
          >
            <Store className="w-3.5 h-3.5 shrink-0" />
            <span>Marketplace</span>
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onOpenSocial}
            className="inline-flex items-center gap-1.5 text-violet-300 hover:text-violet-200 transition-colors cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span>Social &amp; Clans</span>
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="inline-flex items-center gap-1.5 text-[#F5DC8B] hover:text-[#FFF0B8] transition-colors cursor-pointer"
          >
            <Trophy className="w-3.5 h-3.5 shrink-0" />
            <span>Leaderboard</span>
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onOpenReplay()}
            className="inline-flex items-center gap-1.5 text-sky-300 hover:text-sky-200 transition-colors cursor-pointer"
          >
            <Film className="w-3.5 h-3.5 shrink-0" />
            <span>Replays</span>
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onOpenAnalytics}
            className="inline-flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200 transition-colors cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
            <span>Analytics</span>
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="inline-flex items-center gap-1.5 text-[#C4C9D8] hover:text-[#F5DC8B] transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Rules</span>
          </button>
        </div>
      </footer>

      {/* Combat Rules Dialog */}
      {showRules && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rules-modal-title"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowRules(false)}
        >
          <div
            className="bg-[#121622] border border-[#D4AF37]/30 rounded-lg max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
              <h2
                id="rules-modal-title"
                className="font-display text-2xl font-bold text-[#F5EFE0] tracking-wide"
              >
                5v5 Arena Combat Rules
              </h2>
              <button
                type="button"
                aria-label="Close Combat Rules"
                onClick={() => setShowRules(false)}
                className="p-2 rounded-md text-[#9CA3B8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-5 text-sm text-[#C4C9D8] leading-relaxed">
              <div className="space-y-1.5">
                <h3 className="font-semibold text-[#F5EFE0]">
                  1. Speed Initiative Order
                </h3>
                <p>
                  Every round sorts all living champions from highest Speed to
                  lowest. Haste boosts Speed by +18 for upcoming rounds.
                </p>
              </div>
              <div className="space-y-1.5">
                <h3 className="font-semibold text-[#F5EFE0]">
                  2. Energy & Cooldowns
                </h3>
                <p>
                  Champions regenerate +10 Energy each turn and gain bonus
                  Energy from Basic Attacks or Tactical Guard. Specials and
                  Ultimates require Energy and enter cooldown after casting.
                </p>
              </div>
              <div className="space-y-1.5">
                <h3 className="font-semibold text-[#F5EFE0]">
                  3. Shields & Tactical Guard
                </h3>
                <p>
                  Shields absorb incoming damage before Health. Tactical Guard
                  reduces incoming damage by 40% until your next turn, adds a
                  32-point shield, and restores +25 Energy.
                </p>
              </div>
              <div className="space-y-1.5">
                <h3 className="font-semibold text-[#F5EFE0]">
                  4. Statuses & Fair Auto Battle
                </h3>
                <p>
                  Burn and Bleed tick at turn start. Stun skips the unit&apos;s
                  next turn. Auto Battle uses the exact same legal moves and
                  energy limits as manual play.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="px-4 py-2 text-sm font-medium text-[#C4C9D8] hover:text-white rounded-md hover:bg-white/5 transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRules(false);
                  onStartBattle();
                }}
                className="px-5 py-2 text-sm font-semibold rounded-md bg-[#D4AF37] text-[#0B0D13] hover:bg-[#E5C454] transition-colors cursor-pointer"
              >
                Enter Battle Arena
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
