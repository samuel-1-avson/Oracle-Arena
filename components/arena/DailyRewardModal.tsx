'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  Crown,
  Flame,
  Gift,
  Lock,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ClaimDailyRewardResult,
  DAILY_REWARD_SCHEDULE,
  DailyLoginRewardState,
  formatResetCountdown,
  getDailyRewardStatus,
} from '@/lib/game/daily-rewards';

interface DailyRewardModalProps {
  isOpen: boolean;
  rewardState: DailyLoginRewardState;
  currentShards: number;
  cloudSynced: boolean;
  onClaimToday: () => ClaimDailyRewardResult;
  onClose: () => void;
}

export function DailyRewardModal({
  isOpen,
  rewardState,
  currentShards,
  cloudSynced,
  onClaimToday,
  onClose,
}: DailyRewardModalProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [recentClaim, setRecentClaim] = useState<{
    day: number;
    shards: number;
    title: string;
    isMilestone: boolean;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Refresh countdown every 30s while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(id);
  }, [isOpen]);

  // Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const status = getDailyRewardStatus(rewardState, new Date(nowMs));

  const handleClaimClick = () => {
    setErrorMsg(null);
    const result = onClaimToday();
    setNowMs(Date.now());
    if (!result.ok) {
      setErrorMsg(result.error || 'Unable to claim daily reward right now.');
      return;
    }
    setRecentClaim({
      day: result.claimedDay,
      shards: result.shardsAwarded,
      title: result.rewardTier?.title ?? `Day ${result.claimedDay} Bonus`,
      isMilestone: result.isMilestoneDay,
    });
  };

  const daysOneToSix = DAILY_REWARD_SCHEDULE.slice(0, 6);
  const daySeven = DAILY_REWARD_SCHEDULE[6];

  const getTierVisualState = (day: number): 'claimed' | 'today' | 'locked' => {
    if (status.claimedDaysDisplay.includes(day)) return 'claimed';
    if (status.canClaimToday && status.nextClaimDay === day) return 'today';
    return 'locked';
  };

  const daySevenState = getTierVisualState(7);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-reward-modal-title"
      data-testid="daily-reward-modal"
      className="fixed inset-0 z-50 bg-black/82 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-xl bg-[#0F1320] border border-[#D4AF37]/45 shadow-[0_24px_80px_rgba(0,0,0,0.85)] overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-[#171C2E] via-[#131726] to-[#171B2A] border-b border-white/10 flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#F5DC8B]">
              <CalendarDays className="w-4 h-4 shrink-0" />
              <span>7-Day Oracle Tribute</span>
            </div>
            <h2
              id="daily-reward-modal-title"
              className="font-display text-2xl sm:text-3xl font-bold text-[#F5EFE0] tracking-wide"
            >
              Daily Login Rewards
            </h2>
            <p className="text-xs sm:text-sm text-[#B4BACD]">
              Return every day to grow your streak and collect escalating Oracle
              Shards for Card Packs, Creator Cards, and Marketplace trades.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Daily Login Rewards"
            onClick={onClose}
            className="p-2 rounded-md text-[#9CA3B8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Streak & Balance Summary Bar */}
        <div className="px-6 py-3.5 bg-[#0A0D16] border-b border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm font-mono tabular-nums">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-amber-300 font-semibold">
              <Flame className="w-4 h-4 shrink-0" />
              <span data-testid="daily-streak-label">
                Streak: Day {status.effectiveStreak}
              </span>
            </span>
            <span className="text-white/20" aria-hidden="true">
              |
            </span>
            <span className="text-[#B4BACD]">
              Best Streak: {rewardState.longestStreak}d
            </span>
            <span className="text-white/20" aria-hidden="true">
              |
            </span>
            <span className="text-[#B4BACD]">
              Total Claimed: {rewardState.totalShardsClaimed} Shards
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold">
            <Coins className="w-4 h-4 shrink-0" />
            <span data-testid="daily-modal-shard-balance">
              Balance: {currentShards} Shards
            </span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Streak Reset Notice (only when player returned after missing a day) */}
          {status.streakBroken && !recentClaim && (
            <div className="rounded-md bg-amber-500/10 border border-amber-400/35 px-4 py-2.5 text-xs text-amber-200">
              Your previous streak expired after a missed day — claim Day 1
              today to ignite a fresh 7-day Oracle Tribute streak!
            </div>
          )}

          {/* Claim Confirmation Celebration Banner */}
          <AnimatePresence>
            {recentClaim && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                data-testid="daily-claim-success-banner"
                className="rounded-lg bg-emerald-500/15 border border-emerald-400/45 px-4 py-3.5 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-[#F5DC8B] shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[#F5EFE0]">
                      Day {recentClaim.day} Claimed — +{recentClaim.shards}{' '}
                      Oracle Shards Added!
                    </p>
                    <p className="text-xs text-emerald-200/90">
                      {recentClaim.title}
                      {cloudSynced
                        ? ' · Credited to your Cloud Wallet & Pack Vault.'
                        : ' · Added to your Pack Vault Shard balance.'}
                    </p>
                  </div>
                </div>
                <span className="font-mono tabular-nums text-xs text-emerald-300 font-semibold">
                  +{recentClaim.shards} Shards
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-md bg-rose-500/15 border border-rose-400/40 px-4 py-2.5 text-xs text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          {/* 7-Day Calendar Grid: Days 1-6 + Day 7 Grand Weekly Trove */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {daysOneToSix.map((tier) => {
              const state = getTierVisualState(tier.day);
              return (
                <div
                  key={tier.day}
                  data-testid={`daily-tier-day-${tier.day}`}
                  data-tier-state={state}
                  className={`rounded-lg p-3.5 border transition-colors flex flex-col justify-between gap-2.5 ${
                    state === 'today'
                      ? 'bg-[#1D1B14] border-[#D4AF37] shadow-[0_0_24px_rgba(212,175,55,0.22)]'
                      : state === 'claimed'
                        ? 'bg-[#101A19] border-emerald-500/45'
                        : 'bg-[#131724] border-white/10 opacity-85'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-mono text-xs font-bold uppercase tracking-wider ${
                        state === 'today'
                          ? 'text-[#F5DC8B]'
                          : state === 'claimed'
                            ? 'text-emerald-300'
                            : 'text-[#8F96AB]'
                      }`}
                    >
                      Day {tier.day}
                    </span>
                    {state === 'claimed' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Claimed</span>
                      </span>
                    ) : state === 'today' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#F5DC8B]">
                        <Gift className="w-3.5 h-3.5 shrink-0" />
                        <span>Ready</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#7D8499]">
                        <Lock className="w-3 h-3 shrink-0" />
                        <span>Upcoming</span>
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <p className="font-mono tabular-nums text-xl font-bold text-[#F5EFE0] inline-flex items-center gap-1.5">
                      <Coins
                        className={`w-4 h-4 shrink-0 ${
                          state === 'today'
                            ? 'text-[#F5DC8B]'
                            : state === 'claimed'
                              ? 'text-emerald-400'
                              : 'text-[#9CA3B8]'
                        }`}
                      />
                      <span>+{tier.shards}</span>
                      <span className="text-xs font-normal text-[#9CA3B8]">
                        Shards
                      </span>
                    </p>
                    <p className="text-xs font-medium text-[#D2D6E4] truncate">
                      {tier.title}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Day 7 Grand Milestone Banner Card */}
          <div
            data-testid="daily-tier-day-7"
            data-tier-state={daySevenState}
            className={`rounded-lg p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              daySevenState === 'today'
                ? 'bg-gradient-to-r from-[#28200D] via-[#1C1A24] to-[#171828] border-[#F5DC8B] shadow-[0_0_28px_rgba(212,175,55,0.28)]'
                : daySevenState === 'claimed'
                  ? 'bg-[#101A19] border-emerald-500/45'
                  : 'bg-gradient-to-r from-[#171A29] to-[#121622] border-[#D4AF37]/30'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`w-11 h-11 rounded-lg flex items-center justify-center border shrink-0 ${
                  daySevenState === 'claimed'
                    ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-300'
                    : 'bg-[#D4AF37]/15 border-[#D4AF37]/45 text-[#F5DC8B]'
                }`}
              >
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#F5DC8B]">
                    Day 7 · Grand Weekly Trove
                  </span>
                  {daySevenState === 'claimed' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Claimed</span>
                    </span>
                  )}
                  {daySevenState === 'today' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#F5DC8B]">
                      <Gift className="w-3.5 h-3.5" />
                      <span>Ready Today</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#B4BACD] mt-0.5">
                  Log in 7 consecutive days to unlock the maximum Oracle Shard
                  payout before starting your next weekly cycle.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono tabular-nums text-2xl font-bold text-[#F5DC8B] shrink-0">
              <Coins className="w-5 h-5" />
              <span>+{daySeven.shards} Shards</span>
            </div>
          </div>

          {/* Primary Action Footer */}
          <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[#9CA3B8] font-mono tabular-nums">
              <Clock className="w-4 h-4 text-[#D4AF37] shrink-0" />
              {status.canClaimToday ? (
                <span>
                  Day {status.nextClaimDay} reward ready to claim now!
                </span>
              ) : (
                <span data-testid="daily-next-reset-countdown">
                  Next reward (Day {status.nextClaimDay}: +
                  {status.nextRewardTier.shards} Shards) unlocks in{' '}
                  {formatResetCountdown(status.msUntilReset)}
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-md text-xs sm:text-sm font-medium text-[#C4C9D8] hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                data-testid="claim-daily-reward-btn"
                disabled={!status.canClaimToday}
                onClick={handleClaimClick}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-[#D4AF37] text-[#0B0D13] font-bold text-xs sm:text-sm hover:bg-[#E5C454] active:scale-[0.98] disabled:bg-[#23283A] disabled:text-[#8F96AB] disabled:cursor-not-allowed transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-[0_6px_22px_rgba(212,175,55,0.28)] disabled:shadow-none"
              >
                {status.canClaimToday ? (
                  <>
                    <Gift className="w-4 h-4 shrink-0" />
                    <span>
                      Claim Day {status.nextClaimDay} (+
                      {status.nextRewardTier.shards} Shards)
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Claimed Today</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
