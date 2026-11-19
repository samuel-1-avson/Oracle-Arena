'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crown,
  FastForward,
  Film,
  Flame,
  Heart,
  Layers,
  Pause,
  Play,
  ScrollText,
  Shield,
  SkipBack,
  SkipForward,
  Sparkles,
  Swords,
  Target,
  Trophy,
} from 'lucide-react';
import {
  buildMatchReplayTimeline,
  ReplayFrame,
  ReplayUnitTurnDelta,
} from '@/lib/game/replay';
import { getCharacterById } from '@/lib/game/roster';
import { CharacterDefinition, MatchSummaryRecord } from '@/lib/game/types';
import { AccountBar } from './AccountBar';
import { BattleCard, FloatingCallout } from './BattleCard';
import { CharacterDetailModal } from './CharacterDetailModal';

interface MatchReplayViewerProps {
  matches: MatchSummaryRecord[];
  initialMatchId?: string | null;
  allCharacters: CharacterDefinition[];
  syncingCloud?: boolean;
  onStartBattle: () => void;
  onOpenCollection: () => void;
  onOpenAnalytics?: () => void;
  onBackToTitle: () => void;
}

type StudyTab = 'log' | 'strategy';

function formatMatchTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Recent Match';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildCalloutsForUnit(
  unitId: string,
  delta: ReplayUnitTurnDelta | undefined,
  frameIndex: number
): FloatingCallout[] {
  if (!delta) return [];
  const callouts: FloatingCallout[] = [];
  if (delta.damageTaken > 0 || delta.shieldAbsorbed > 0) {
    const total = delta.damageTaken + delta.shieldAbsorbed;
    const shieldPart =
      delta.shieldAbsorbed > 0 ? ` (${delta.shieldAbsorbed} shd)` : '';
    callouts.push({
      id: `rf-${frameIndex}-${unitId}-dmg`,
      unitId,
      text: delta.ko ? `-${total} · KO!` : `-${total}${shieldPart}`,
      tone: delta.ko ? 'ko' : 'damage',
    });
  } else if (delta.ko) {
    callouts.push({
      id: `rf-${frameIndex}-${unitId}-ko`,
      unitId,
      text: 'KO!',
      tone: 'ko',
    });
  }
  if (delta.healingReceived > 0) {
    callouts.push({
      id: `rf-${frameIndex}-${unitId}-heal`,
      unitId,
      text: `+${delta.healingReceived} HP`,
      tone: 'heal',
    });
  }
  if (delta.shieldGained > 0) {
    callouts.push({
      id: `rf-${frameIndex}-${unitId}-shd`,
      unitId,
      text: `+${delta.shieldGained} SHD`,
      tone: 'shield',
    });
  }
  if (!delta.ko && delta.stunned) {
    callouts.push({
      id: `rf-${frameIndex}-${unitId}-stun`,
      unitId,
      text: 'STUNNED',
      tone: 'status',
    });
  }
  return callouts;
}

function getHitFlashForDelta(
  delta: ReplayUnitTurnDelta | undefined
): 'damage' | 'heal' | 'shield' | null {
  if (!delta) return null;
  if (delta.damageTaken > 0 || delta.shieldAbsorbed > 0) return 'damage';
  if (delta.healingReceived > 0) return 'heal';
  if (delta.shieldGained > 0) return 'shield';
  return null;
}

function categoryBadgeClasses(category: ReplayFrame['abilityCategory']): string {
  switch (category) {
    case 'ultimate':
      return 'bg-[#D4AF37]/20 text-[#F5DC8B] border-[#D4AF37]/50';
    case 'special':
      return 'bg-violet-500/20 text-violet-200 border-violet-400/45';
    case 'guard':
      return 'bg-sky-500/20 text-sky-200 border-sky-400/45';
    case 'basic':
      return 'bg-white/10 text-[#C4C9D8] border-white/15';
    default:
      return 'bg-white/5 text-[#9CA3B8] border-white/10';
  }
}

export function MatchReplayViewer({
  matches,
  initialMatchId = null,
  allCharacters,
  syncingCloud = false,
  onStartBattle,
  onOpenCollection,
  onOpenAnalytics,
  onBackToTitle,
}: MatchReplayViewerProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string>(() => {
    if (initialMatchId && matches.some((m) => m.matchId === initialMatchId)) {
      return initialMatchId;
    }
    return matches[0]?.matchId ?? '';
  });

  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fastSpeed, setFastSpeed] = useState(false);
  const [studyTab, setStudyTab] = useState<StudyTab>('log');
  const [inspectDefId, setInspectDefId] = useState<string | null>(null);

  const logScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLogRowRef = useRef<HTMLButtonElement | null>(null);

  const selectedMatch = useMemo(() => {
    if (matches.length === 0) return null;
    return (
      matches.find((m) => m.matchId === selectedMatchId) ?? matches[0] ?? null
    );
  }, [matches, selectedMatchId]);

  const timeline = useMemo(() => {
    if (!selectedMatch) return null;
    return buildMatchReplayTimeline(selectedMatch, allCharacters);
  }, [selectedMatch, allCharacters]);

  const totalFrames = timeline?.frames.length ?? 0;
  const maxFrameIndex = Math.max(0, totalFrames - 1);
  const safeFrameIndex = Math.min(frameIndex, maxFrameIndex);
  const currentFrame = timeline?.frames[safeFrameIndex] ?? null;

  const handleSelectMatch = useCallback((nextId: string) => {
    setSelectedMatchId(nextId);
    setFrameIndex(0);
    setIsPlaying(false);
  }, []);

  const stepToFrame = useCallback(
    (targetIdx: number) => {
      setIsPlaying(false);
      setFrameIndex(Math.max(0, Math.min(maxFrameIndex, targetIdx)));
    },
    [maxFrameIndex]
  );

  const handleTogglePlay = useCallback(() => {
    if (maxFrameIndex === 0) return;
    setIsPlaying((prev) => {
      if (!prev && safeFrameIndex >= maxFrameIndex) {
        setFrameIndex(0);
      }
      return !prev;
    });
  }, [maxFrameIndex, safeFrameIndex]);

  // Auto-advance playback timer
  useEffect(() => {
    if (!isPlaying || maxFrameIndex === 0) return;
    const delayMs = fastSpeed ? 650 : 1250;
    const timer = window.setTimeout(() => {
      setFrameIndex((prev) => {
        if (prev >= maxFrameIndex) {
          setIsPlaying(false);
          return maxFrameIndex;
        }
        const next = prev + 1;
        if (next >= maxFrameIndex) {
          setIsPlaying(false);
        }
        return next;
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [isPlaying, fastSpeed, maxFrameIndex, safeFrameIndex]);

  // Keyboard shortcuts for tactical study (ArrowLeft / ArrowRight / Space / Home / End)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      if (inspectDefId) {
        if (e.key === 'Escape') setInspectDefId(null);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepToFrame(safeFrameIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepToFrame(safeFrameIndex - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        stepToFrame(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        stepToFrame(maxFrameIndex);
      } else if (e.key === ' ') {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    inspectDefId,
    safeFrameIndex,
    maxFrameIndex,
    stepToFrame,
    handleTogglePlay,
  ]);

  // Keep active turn row visible inside the Turn-by-Turn Log container without scrolling the page viewport
  useEffect(() => {
    if (
      studyTab === 'log' &&
      logScrollContainerRef.current &&
      activeLogRowRef.current
    ) {
      const container = logScrollContainerRef.current;
      const row = activeLogRowRef.current;
      const rowTop = row.offsetTop;
      const rowBottom = rowTop + row.offsetHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;
      if (rowTop < viewTop) {
        container.scrollTo({ top: Math.max(0, rowTop - 8), behavior: 'smooth' });
      } else if (rowBottom > viewBottom) {
        container.scrollTo({
          top: rowBottom - container.clientHeight + 8,
          behavior: 'smooth',
        });
      }
    }
  }, [safeFrameIndex, studyTab]);

  const inspectCharacter = useMemo(
    () => (inspectDefId ? getCharacterById(inspectDefId, allCharacters) ?? null : null),
    [inspectDefId, allCharacters]
  );

  // Empty state when player has not completed any matches yet
  if (!selectedMatch || !timeline || !currentFrame) {
    return (
      <div className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0E16]/95 backdrop-blur px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToTitle}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-white/10 text-xs font-medium text-[#C4C9D8] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Title</span>
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <Film className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <h1 className="font-display text-sm sm:text-base font-bold tracking-[0.06em] text-[#F5EFE0] truncate">
                MATCH REPLAY STUDIO
              </h1>
            </div>
          </div>
          <AccountBar syncingCloud={syncingCloud} />
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-xl bg-[#111521] border border-white/10 p-8 text-center space-y-5 shadow-2xl">
            <div className="mx-auto w-14 h-14 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center">
              <Film className="w-7 h-7 text-[#D4AF37]" />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-bold text-[#F5EFE0]">
                No Recorded Matches Yet
              </h2>
              <p className="text-sm text-[#9CA3B8] leading-relaxed">
                Complete any 5v5 Battle Arena or Multiplayer PvP match to record
                a full turn-by-turn tactical replay with damage breakdowns, KO
                timestamps, and round-by-round momentum analysis.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onStartBattle}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-sm hover:bg-[#E5C454] transition-colors cursor-pointer"
              >
                <Swords className="w-4 h-4" />
                <span>Enter 5v5 Battle Arena</span>
              </button>
              <button
                type="button"
                onClick={onOpenCollection}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-white/15 text-sm text-[#C4C9D8] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Layers className="w-4 h-4" />
                <span>Inspect Squad</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const enemyUnits = currentFrame.state.units.filter((u) => u.side === 'enemy');
  const playerUnits = currentFrame.state.units.filter(
    (u) => u.side === 'player'
  );
  const targetIdSet = new Set(currentFrame.targetIds);
  const { insights } = timeline;

  const maxRoundDamage = Math.max(
    1,
    ...insights.roundSummaries.map((r) =>
      Math.max(r.playerDamage, r.enemyDamage)
    )
  );

  const playerDamageShare =
    insights.playerTotals.damage + insights.enemyTotals.damage > 0
      ? Math.round(
          (insights.playerTotals.damage /
            (insights.playerTotals.damage + insights.enemyTotals.damage)) *
            100
        )
      : 50;

  return (
    <div className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col">
      {/* Single-Row Studio Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0E16]/95 backdrop-blur px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToTitle}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-white/10 text-xs font-medium text-[#C4C9D8] hover:text-white hover:bg-white/5 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Title</span>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Film className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <h1 className="font-display text-sm sm:text-base font-bold tracking-[0.06em] text-[#F5EFE0] truncate">
              MATCH REPLAY STUDIO
            </h1>
          </div>
          <span
            className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border shrink-0 ${
              timeline.mode === 'recorded'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
                : 'bg-sky-500/15 text-sky-300 border-sky-400/35'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            {timeline.mode === 'recorded'
              ? 'Exact Recorded Tape'
              : 'Deterministic Seed Breakdown'}
          </span>
        </div>

        {/* Match Selector + Primary CTA */}
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="sr-only" htmlFor="replay-match-select">
            Select past match to replay
          </label>
          <select
            id="replay-match-select"
            value={selectedMatch.matchId}
            onChange={(e) => handleSelectMatch(e.target.value)}
            className="max-w-[280px] sm:max-w-[360px] rounded-md bg-[#121725] border border-white/15 px-3 py-1.5 text-xs text-[#ECEEF4] focus:outline-none focus:border-[#D4AF37] cursor-pointer"
          >
            {matches.map((m, idx) => {
              const outcome = m.winner === 'player' ? 'WIN' : 'LOSS';
              const modeTag = m.mode === 'multiplayer' ? 'PvP' : '5v5';
              const tapeTag =
                m.replayLog && m.replayLog.length > 0 ? 'Exact' : 'Seed';
              return (
                <option key={m.matchId} value={m.matchId}>
                  #{matches.length - idx} · {outcome} · {modeTag} {m.rounds}R/
                  {m.turns}T ({tapeTag}) · {formatMatchTimestamp(m.timestamp)}
                </option>
              );
            })}
          </select>

          {onOpenAnalytics && (
            <button
              type="button"
              onClick={onOpenAnalytics}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-400/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 text-xs font-medium transition-colors cursor-pointer shrink-0"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics</span>
            </button>
          )}

          <button
            type="button"
            onClick={onStartBattle}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-xs hover:bg-[#E5C454] transition-colors cursor-pointer shrink-0"
          >
            <Swords className="w-3.5 h-3.5" />
            <span>New Battle</span>
          </button>

          <AccountBar syncingCloud={syncingCloud} />
        </div>
      </header>

      {/* Match Telemetry Ribbon */}
      <section className="border-b border-white/10 bg-[#0D111B] px-4 sm:px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`font-display font-bold uppercase tracking-wider px-2.5 py-0.5 rounded border ${
                selectedMatch.winner === 'player'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
                  : 'bg-rose-500/15 text-rose-300 border-rose-400/40'
              }`}
            >
              {selectedMatch.winner === 'player' ? 'Victory' : 'Defeat'}
            </span>
            <span className="text-[#C4C9D8] font-medium">
              vs {selectedMatch.opponentName || 'Arena AI Vanguard'}
            </span>
            <span className="text-[#6B7287]" aria-hidden="true">
              ·
            </span>
            <span className="font-mono text-[#9CA3B8]">
              Seed #{selectedMatch.seed}
            </span>
            <span className="text-[#6B7287]" aria-hidden="true">
              ·
            </span>
            <span className="font-mono text-[#9CA3B8]">
              Ruleset {selectedMatch.rulesetVersion}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-[#C4C9D8]">
            <span>
              Rounds:{' '}
              <strong className="text-[#F5EFE0]">{selectedMatch.rounds}</strong>
            </span>
            <span>
              Survivors:{' '}
              <strong className="text-emerald-300">
                {selectedMatch.playerSurvivors}
              </strong>{' '}
              vs{' '}
              <strong className="text-rose-300">
                {selectedMatch.enemySurvivors}
              </strong>
            </span>
            <span>
              Allied DMG:{' '}
              <strong className="text-rose-300">
                {selectedMatch.totalPlayerDamage}
              </strong>
            </span>
            <span>
              Allied Heal:{' '}
              <strong className="text-sky-300">
                {selectedMatch.totalPlayerHealing}
              </strong>
            </span>
          </div>
        </div>
      </section>

      {/* Main Split Workspace: Battlefield Stage (Left) + Turn Log / Strategy Study Panel (Right) */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-4 grid lg:grid-cols-[minmax(0,1fr)_390px] xl:grid-cols-[minmax(0,1fr)_420px] gap-4 items-start">
        {/* LEFT COLUMN: 5v5 Visual Replay Stage + Transport Bar */}
        <div className="space-y-3.5 min-w-0">
          {/* Active Frame Narration Banner */}
          <div
            data-testid="replay-frame-banner"
            className="rounded-lg bg-[#111521] border border-[#D4AF37]/25 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded bg-[#D4AF37]/15 text-[#F5DC8B] border border-[#D4AF37]/35 font-semibold">
                  Frame {safeFrameIndex} / {maxFrameIndex}
                </span>
                <span className="text-[#9CA3B8]">
                  Round {currentFrame.round} · Turn {currentFrame.turnNumber}
                </span>
                {currentFrame.abilityCategory && (
                  <span
                    className={`px-2 py-0.5 rounded border uppercase tracking-wider text-[10px] font-semibold ${categoryBadgeClasses(
                      currentFrame.abilityCategory
                    )}`}
                  >
                    {currentFrame.abilityCategory}
                  </span>
                )}
                {currentFrame.keyMomentLabel && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/45 font-semibold">
                    ★ {currentFrame.keyMomentLabel}
                  </span>
                )}
              </div>
              <p className="text-sm sm:text-base font-medium text-[#F5EFE0] leading-snug">
                {currentFrame.headline}
              </p>
            </div>

            {/* Frame Combat Impact Counters */}
            <div className="flex items-center gap-2 font-mono tabular-nums text-xs shrink-0">
              {currentFrame.totalDamage > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/15 border border-rose-400/35 text-rose-300 font-semibold">
                  <Flame className="w-3.5 h-3.5" />-{currentFrame.totalDamage}
                </span>
              )}
              {currentFrame.totalHealing > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 font-semibold">
                  <Heart className="w-3.5 h-3.5" />+{currentFrame.totalHealing}
                </span>
              )}
              {currentFrame.totalShield > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-500/15 border border-sky-400/35 text-sky-300 font-semibold">
                  <Shield className="w-3.5 h-3.5" />+{currentFrame.totalShield}
                </span>
              )}
              {currentFrame.koUnitNames.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-400/45 text-amber-200 font-semibold">
                  <Trophy className="w-3.5 h-3.5" />
                  {currentFrame.koUnitNames.length} KO
                </span>
              )}
            </div>
          </div>

          {/* 5v5 Visual Battlefield Canvas */}
          <div className="rounded-xl bg-[#0D111C] border border-white/10 p-3.5 sm:p-4 space-y-4 shadow-xl">
            {/* Opposing Squad Row */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-[#9CA3B8]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-rose-300">
                  <Target className="w-3.5 h-3.5" />
                  Opposing Squad ({enemyUnits.filter((u) => u.alive).length}/5
                  Standing)
                </span>
                <span className="font-mono text-[#7C849B]">
                  Click any champion card to inspect stats
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {enemyUnits.map((unit) => {
                  const delta = currentFrame.unitDeltas[unit.instanceId];
                  const isActor =
                    safeFrameIndex > 0 &&
                    currentFrame.actorId === unit.instanceId;
                  const isTargeted =
                    safeFrameIndex > 0 && targetIdSet.has(unit.instanceId);
                  return (
                    <BattleCard
                      key={unit.instanceId}
                      unit={unit}
                      isActive={isActor}
                      isTargetable={false}
                      isSelectedTarget={isTargeted}
                      hitFlash={getHitFlashForDelta(delta)}
                      callouts={buildCalloutsForUnit(
                        unit.instanceId,
                        delta,
                        safeFrameIndex
                      )}
                      onSelectTarget={() => setInspectDefId(unit.definitionId)}
                      onInspect={(defId) => setInspectDefId(defId)}
                    />
                  );
                })}
              </div>
            </div>

            {/* Subtle Battlefield Divider with Turn Phase Indicator */}
            <div className="flex items-center gap-3 py-0.5">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <span className="text-[11px] font-mono text-[#8F96AB] uppercase tracking-widest">
                {safeFrameIndex === 0
                  ? 'Opening Formation'
                  : currentFrame.state.phase !== 'active'
                    ? currentFrame.state.winner === 'player'
                      ? 'Allied Victory Confirmed'
                      : 'Opposing Victory Confirmed'
                    : `R${currentFrame.round} · T${currentFrame.turnNumber} · ${currentFrame.actorName}`}
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </div>

            {/* Allied Squad Row */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-[#9CA3B8]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                  <Shield className="w-3.5 h-3.5" />
                  Your Squad ({playerUnits.filter((u) => u.alive).length}/5
                  Standing)
                </span>
                <span className="font-mono text-[#7C849B]">
                  Gold border = Active Caster · Amber = Targeted
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {playerUnits.map((unit) => {
                  const delta = currentFrame.unitDeltas[unit.instanceId];
                  const isActor =
                    safeFrameIndex > 0 &&
                    currentFrame.actorId === unit.instanceId;
                  const isTargeted =
                    safeFrameIndex > 0 && targetIdSet.has(unit.instanceId);
                  return (
                    <BattleCard
                      key={unit.instanceId}
                      unit={unit}
                      isActive={isActor}
                      isTargetable={false}
                      isSelectedTarget={isTargeted}
                      hitFlash={getHitFlashForDelta(delta)}
                      callouts={buildCalloutsForUnit(
                        unit.instanceId,
                        delta,
                        safeFrameIndex
                      )}
                      onSelectTarget={() => setInspectDefId(unit.definitionId)}
                      onInspect={(defId) => setInspectDefId(defId)}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Playback & Timeline Scrubber Controls */}
          <div className="rounded-xl bg-[#111521] border border-white/10 p-4 space-y-3.5">
            {/* Interactive Scrubber */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#9CA3B8]">
                <span>Turn Scrubber</span>
                <span>
                  Turn {currentFrame.turnNumber} · Round {currentFrame.round} (
                  {safeFrameIndex}/{maxFrameIndex})
                </span>
              </div>
              <input
                type="range"
                aria-label="Scrub replay turn timeline"
                min={0}
                max={maxFrameIndex}
                value={safeFrameIndex}
                onChange={(e) => stepToFrame(Number(e.target.value))}
                className="w-full accent-[#D4AF37] cursor-pointer h-2 bg-[#1A2033] rounded-lg"
              />
            </div>

            {/* Transport Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => stepToFrame(0)}
                  disabled={safeFrameIndex === 0}
                  aria-label="Jump to opening formation"
                  className="p-2 rounded-md border border-white/10 bg-[#171C2B] text-[#C4C9D8] hover:text-white hover:bg-[#1F263B] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => stepToFrame(safeFrameIndex - 1)}
                  disabled={safeFrameIndex === 0}
                  aria-label="Previous turn"
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-white/10 bg-[#171C2B] text-xs font-medium text-[#C4C9D8] hover:text-white hover:bg-[#1F263B] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Prev</span>
                </button>
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-xs hover:bg-[#E5C454] transition-colors cursor-pointer"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>
                        {safeFrameIndex >= maxFrameIndex ? 'Replay' : 'Play'}
                      </span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => stepToFrame(safeFrameIndex + 1)}
                  disabled={safeFrameIndex >= maxFrameIndex}
                  aria-label="Next turn"
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-white/10 bg-[#171C2B] text-xs font-medium text-[#C4C9D8] hover:text-white hover:bg-[#1F263B] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => stepToFrame(maxFrameIndex)}
                  disabled={safeFrameIndex >= maxFrameIndex}
                  aria-label="Jump to final turn"
                  className="p-2 rounded-md border border-white/10 bg-[#171C2B] text-[#C4C9D8] hover:text-white hover:bg-[#1F263B] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setFastSpeed((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-mono transition-colors cursor-pointer ${
                    fastSpeed
                      ? 'bg-[#D4AF37]/20 border-[#D4AF37]/50 text-[#F5DC8B]'
                      : 'bg-[#171C2B] border-white/10 text-[#9CA3B8] hover:text-white'
                  }`}
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>{fastSpeed ? '2x Speed' : '1x Speed'}</span>
                </button>
                <span className="hidden sm:inline text-[11px] font-mono text-[#7C849B]">
                  ← / → Step · Space Play
                </span>
              </div>
            </div>

            {/* Key Moments Quick-Jump Bar */}
            {insights.keyMomentFrameIndices.length > 0 && (
              <div className="pt-2.5 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-[#9CA3B8]">
                  <span className="font-semibold uppercase tracking-wider text-[#F5DC8B] inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Key Tactical Moments
                  </span>
                  <span className="font-mono text-[#7C849B]">
                    Jump directly to KOs, Ultimates &amp; Peak Bursts
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {insights.keyMomentFrameIndices.slice(0, 10).map((idx) => {
                    const km = timeline.frames[idx];
                    if (!km) return null;
                    const isSelected = idx === safeFrameIndex;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => stepToFrame(idx)}
                        className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#D4AF37] text-[#0B0D13] border-[#F5DC8B] font-semibold'
                            : 'bg-[#171C2B] text-[#C4C9D8] border-white/10 hover:border-[#D4AF37]/50 hover:text-white'
                        }`}
                      >
                        T{km.turnNumber} · {km.keyMomentLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Turn-by-Turn Log & Strategic Breakdown Study Panel */}
        <aside className="rounded-xl bg-[#111521] border border-white/10 overflow-hidden flex flex-col lg:max-h-[calc(100vh-140px)] lg:sticky lg:top-[72px]">
          {/* Panel Tab Switcher */}
          <div
            role="tablist"
            aria-label="Replay study panels"
            className="grid grid-cols-2 border-b border-white/10 bg-[#0D111B]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={studyTab === 'log'}
              onClick={() => setStudyTab('log')}
              className={`inline-flex items-center justify-center gap-1.5 py-3 text-xs font-semibold tracking-wide transition-colors cursor-pointer border-b-2 ${
                studyTab === 'log'
                  ? 'border-[#D4AF37] text-[#F5DC8B] bg-[#141928]'
                  : 'border-transparent text-[#8F96AB] hover:text-white'
              }`}
            >
              <ScrollText className="w-3.5 h-3.5" />
              <span>Turn-by-Turn Log</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studyTab === 'strategy'}
              onClick={() => setStudyTab('strategy')}
              className={`inline-flex items-center justify-center gap-1.5 py-3 text-xs font-semibold tracking-wide transition-colors cursor-pointer border-b-2 ${
                studyTab === 'strategy'
                  ? 'border-[#D4AF37] text-[#F5DC8B] bg-[#141928]'
                  : 'border-transparent text-[#8F96AB] hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Strategy Breakdown</span>
            </button>
          </div>

          {/* TAB 1: TURN-BY-TURN LOG */}
          {studyTab === 'log' ? (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Current Frame Detailed Event Breakdown */}
              <div className="p-3.5 border-b border-white/10 bg-[#0E1320] space-y-2 shrink-0">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[#F5DC8B] font-semibold">
                    {safeFrameIndex === 0
                      ? 'Opening Deployment Events'
                      : `Turn ${currentFrame.turnNumber} Resolution`}
                  </span>
                  <span className="text-[#8F96AB]">
                    {currentFrame.events.length} events
                  </span>
                </div>
                <ul className="space-y-1 max-h-32 overflow-y-auto pr-1 text-xs text-[#C4C9D8]">
                  {currentFrame.events.map((evt) => (
                    <li
                      key={evt.id}
                      className={`leading-snug ${
                        evt.kind === 'ko'
                          ? 'text-amber-300 font-semibold'
                          : evt.kind === 'damage' || evt.kind === 'status_tick'
                            ? 'text-rose-200'
                            : evt.kind === 'heal'
                              ? 'text-emerald-200'
                              : evt.kind === 'shield'
                                ? 'text-sky-200'
                                : 'text-[#AEB5C8]'
                      }`}
                    >
                      • {evt.message}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Chronological Turn List */}
              <div
                ref={logScrollContainerRef}
                className="relative flex-1 overflow-y-auto divide-y divide-white/5 max-h-[460px] lg:max-h-none"
              >
                {timeline.frames.map((frame) => {
                  const isCurrent = frame.frameIndex === safeFrameIndex;
                  return (
                    <button
                      key={frame.frameIndex}
                      ref={isCurrent ? activeLogRowRef : null}
                      type="button"
                      onClick={() => stepToFrame(frame.frameIndex)}
                      className={`w-full text-left px-3.5 py-2.5 transition-colors cursor-pointer flex items-start justify-between gap-2.5 ${
                        isCurrent
                          ? 'bg-[#D4AF37]/15 border-l-2 border-[#D4AF37]'
                          : 'hover:bg-white/[0.04] border-l-2 border-transparent'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-mono">
                          <span className="text-[#8F96AB]">
                            R{frame.round}·T{frame.turnNumber}
                          </span>
                          {frame.actorSide && (
                            <span
                              className={`font-semibold ${
                                frame.actorSide === 'player'
                                  ? 'text-emerald-300'
                                  : 'text-rose-300'
                              }`}
                            >
                              {frame.actorSide === 'player' ? 'ALLY' : 'FOE'}
                            </span>
                          )}
                          <span className="text-[#F5EFE0] font-sans font-semibold truncate">
                            {frame.frameIndex === 0
                              ? 'Opening Formation'
                              : frame.actorName}
                          </span>
                        </div>
                        <p className="text-xs text-[#9CA3B8] truncate">
                          {frame.frameIndex === 0
                            ? '5v5 squads deployed · speed initiative locked'
                            : `${frame.abilityName}${
                                frame.targetNames.length > 0
                                  ? ` → ${frame.targetNames.slice(0, 2).join(', ')}${
                                      frame.targetNames.length > 2
                                        ? ` +${frame.targetNames.length - 2}`
                                        : ''
                                    }`
                                  : ''
                              }`}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-0.5 font-mono tabular-nums text-[11px] shrink-0">
                        {frame.totalDamage > 0 && (
                          <span className="text-rose-300 font-semibold">
                            -{frame.totalDamage}
                          </span>
                        )}
                        {frame.totalHealing > 0 && (
                          <span className="text-emerald-300">
                            +{frame.totalHealing} HP
                          </span>
                        )}
                        {frame.totalShield > 0 && (
                          <span className="text-sky-300">
                            +{frame.totalShield} SHD
                          </span>
                        )}
                        {frame.koUnitIds.length > 0 && (
                          <span className="text-amber-300 font-bold">KO!</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* TAB 2: STRATEGY BREAKDOWN */
            <div className="flex-1 overflow-y-auto p-4 space-y-5 max-h-[600px] lg:max-h-none">
              {/* Match MVP Card */}
              {insights.mvpUnit && (
                <div className="rounded-lg bg-[#0D111B] border border-[#D4AF37]/35 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="inline-flex items-center gap-1.5 text-[#F5DC8B] font-semibold uppercase tracking-wider">
                      <Crown className="w-3.5 h-3.5" />
                      Match Standout MVP
                    </span>
                    <span className="text-[#8F96AB]">
                      Score {insights.mvpUnit.mvpScore}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-14 rounded overflow-hidden border border-[#D4AF37]/40 shrink-0">
                      <Image
                        src={insights.mvpUnit.artworkUrl}
                        alt={insights.mvpUnit.name}
                        fill
                        sizes="48px"
                        referrerPolicy="no-referrer"
                        className="object-cover object-top"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold text-sm text-[#F5EFE0] truncate">
                        {insights.mvpUnit.name}
                      </p>
                      <p className="text-xs text-[#9CA3B8]">
                        {insights.mvpUnit.role} ·{' '}
                        <span
                          className={
                            insights.mvpUnit.side === 'player'
                              ? 'text-emerald-300'
                              : 'text-rose-300'
                          }
                        >
                          {insights.mvpUnit.side === 'player'
                            ? 'Your Squad'
                            : 'Opposing Squad'}
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-2.5 mt-1 text-[11px] font-mono tabular-nums text-[#C4C9D8]">
                        <span className="text-rose-300">
                          {insights.mvpUnit.damageDealt} DMG
                        </span>
                        <span className="text-emerald-300">
                          {insights.mvpUnit.healingDone} HEAL
                        </span>
                        <span className="text-sky-300">
                          {insights.mvpUnit.shieldGranted} SHD
                        </span>
                        <span className="text-amber-300">
                          {insights.mvpUnit.kosScored} KOs
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Data-Driven Tactical Takeaways */}
              {insights.tacticalTakeaways.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9CA3B8]">
                    Tactical Study Notes
                  </h2>
                  <ul className="space-y-1.5 text-xs text-[#C4C9D8] leading-relaxed">
                    {insights.tacticalTakeaways.map((note, idx) => (
                      <li
                        key={idx}
                        className="rounded-md bg-[#0D111B] border border-white/8 px-3 py-2"
                      >
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Squad Comparison Bar */}
              <div className="space-y-2.5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9CA3B8]">
                  Squad Output Comparison
                </h2>
                <div className="rounded-lg bg-[#0D111B] border border-white/10 p-3 space-y-2.5 text-xs font-mono tabular-nums">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-emerald-300">
                        You: {insights.playerTotals.damage} DMG
                      </span>
                      <span className="text-rose-300">
                        Foe: {insights.enemyTotals.damage} DMG
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-rose-500/35 overflow-hidden">
                      <div
                        className="h-full bg-emerald-400"
                        style={{ width: `${playerDamageShare}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-[#9CA3B8]">
                    <div>
                      Healing:{' '}
                      <strong className="text-emerald-300">
                        {insights.playerTotals.healing}
                      </strong>{' '}
                      vs{' '}
                      <strong className="text-rose-300">
                        {insights.enemyTotals.healing}
                      </strong>
                    </div>
                    <div className="text-right">
                      Shields:{' '}
                      <strong className="text-sky-300">
                        {insights.playerTotals.shield}
                      </strong>{' '}
                      vs{' '}
                      <strong className="text-rose-300">
                        {insights.enemyTotals.shield}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Round-by-Round Momentum (Clickable to jump to round start!) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9CA3B8]">
                    Round-by-Round Momentum
                  </h2>
                  <span className="text-[10px] font-mono text-[#7C849B]">
                    Click round to jump
                  </span>
                </div>
                <div className="space-y-1.5">
                  {insights.roundSummaries.map((r) => {
                    const pPct = Math.round(
                      (r.playerDamage / maxRoundDamage) * 100
                    );
                    const ePct = Math.round(
                      (r.enemyDamage / maxRoundDamage) * 100
                    );
                    const isActiveRound = currentFrame.round === r.round;
                    return (
                      <button
                        key={r.round}
                        type="button"
                        onClick={() => stepToFrame(r.startFrameIndex)}
                        className={`w-full text-left rounded-md border p-2.5 transition-colors cursor-pointer space-y-1.5 ${
                          isActiveRound
                            ? 'bg-[#171D30] border-[#D4AF37]/45'
                            : 'bg-[#0D111B] border-white/8 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="font-semibold text-[#F5EFE0]">
                            Round {r.round}
                          </span>
                          <span className="text-[#9CA3B8]">
                            {r.playerDamage} vs {r.enemyDamage} DMG
                            {r.kos > 0 ? ` · ${r.kos} KO` : ''}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="h-1.5 rounded bg-white/5 overflow-hidden">
                            <div
                              className="h-full bg-emerald-400"
                              style={{ width: `${pPct}%` }}
                            />
                          </div>
                          <div className="h-1.5 rounded bg-white/5 overflow-hidden">
                            <div
                              className="h-full bg-rose-400"
                              style={{ width: `${ePct}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 10-Champion Combat Ledger */}
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9CA3B8]">
                  Champion Combat Ledger
                </h2>
                <div className="rounded-lg border border-white/10 overflow-hidden bg-[#0D111B]">
                  <table className="w-full text-[11px] font-mono tabular-nums">
                    <thead className="bg-white/5 text-[#8F96AB] text-left">
                      <tr>
                        <th className="py-1.5 px-2.5 font-medium">Champion</th>
                        <th className="py-1.5 px-1.5 text-right font-medium">
                          DMG
                        </th>
                        <th className="py-1.5 px-1.5 text-right font-medium">
                          HEAL
                        </th>
                        <th className="py-1.5 px-1.5 text-right font-medium">
                          SHD
                        </th>
                        <th className="py-1.5 px-2 text-right font-medium">
                          KO
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {insights.unitPerformances.map((u) => (
                        <tr
                          key={u.instanceId}
                          className="hover:bg-white/[0.03]"
                        >
                          <td className="py-1.5 px-2.5 font-sans">
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                                u.side === 'player'
                                  ? 'bg-emerald-400'
                                  : 'bg-rose-400'
                              }`}
                            />
                            <span
                              className={
                                u.alive
                                  ? 'text-[#ECEEF4]'
                                  : 'text-[#7C849B] line-through'
                              }
                            >
                              {u.name}
                            </span>
                          </td>
                          <td className="py-1.5 px-1.5 text-right text-rose-300">
                            {u.damageDealt}
                          </td>
                          <td className="py-1.5 px-1.5 text-right text-emerald-300">
                            {u.healingDone}
                          </td>
                          <td className="py-1.5 px-1.5 text-right text-sky-300">
                            {u.shieldGranted}
                          </td>
                          <td className="py-1.5 px-2 text-right text-amber-300">
                            {u.kosScored}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </aside>
      </main>

      {/* Champion Inspect Modal */}
      <CharacterDetailModal
        character={inspectCharacter}
        onClose={() => setInspectDefId(null)}
      />
    </div>
  );
}
