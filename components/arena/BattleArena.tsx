'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowUpCircle,
  Bot,
  Check,
  Crown,
  FastForward,
  Film,
  Flag,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { chooseTacticalAction } from '@/lib/game/bot';
import {
  createBattle,
  executeAction,
  getActiveUnit,
  getAllUnitAbilities,
  getEscalationBonusPercent,
  getLegalAbilities,
  getTurnOrderPreview,
  getValidTargets,
} from '@/lib/game/engine';
import {
  GauntletBossEncounter,
  recordGauntletVictory,
} from '@/lib/game/gauntlet';
import {
  getOrientedTeams,
  hasActiveBattleState,
  MultiplayerBattleContext,
} from '@/lib/game/multiplayer';
import { BattleXpGrant } from '@/lib/game/progression';
import { createReplayMetadataFromBattle } from '@/lib/game/replay';
import { getCharacterById } from '@/lib/game/roster';
import { soundEngine } from '@/lib/game/sound';
import {
  computeSquadSynergies,
  getElementalMatchup,
} from '@/lib/game/synergy';
import {
  AbilityDefinition,
  BattleAction,
  BattleState,
  CharacterDefinition,
  MatchSummaryRecord,
  TeamSide,
} from '@/lib/game/types';
import { CARD_TIER_MAP } from '@/lib/game/card-tiers';
import { CardTierBadge } from './CardTierBadge';
import { BattleCard, FloatingCallout } from './BattleCard';
import { CharacterDetailModal } from './CharacterDetailModal';
import {
  CombatProjectile,
  CombatVfxLayer,
  getProjectilePalette,
  UltimateCutInData,
} from './CombatVfxLayer';
import { formatTargetLabel } from './ui-meta';

interface BattleArenaProps {
  allCharacters: CharacterDefinition[];
  playerSquad: CharacterDefinition[];
  enemySquad: CharacterDefinition[];
  initialSeed?: number;
  bossEncounter?: GauntletBossEncounter | null;
  multiplayerContext?: MultiplayerBattleContext;
  onMatchFinished: (
    summary: MatchSummaryRecord,
    finalBattle: BattleState,
    options?: {
      mode: 'solo' | 'multiplayer';
      viewerSide: TeamSide;
      overrideWinner?: TeamSide;
      opponentName?: string;
    }
  ) => BattleXpGrant[];
  onBossCleared?: (encounterId: string, turnsTaken: number) => void;
  onOpenGauntlet?: () => void;
  onOpenCollection: () => void;
  onOpenEvolutionChamber: (focusDefId?: string) => void;
  onOpenMatchReplay?: (matchId: string) => void;
  onReturnTitle: () => void;
  onStateChange: (bodyState: 'playing' | 'paused' | 'gameover') => void;
}

function generateMatchSeed(): number {
  return Math.floor(10000 + Math.random() * 89999);
}

export function BattleArena({
  allCharacters,
  playerSquad,
  enemySquad,
  initialSeed = 42026,
  bossEncounter = null,
  multiplayerContext,
  onMatchFinished,
  onBossCleared,
  onOpenGauntlet,
  onOpenCollection,
  onOpenEvolutionChamber,
  onOpenMatchReplay,
  onReturnTitle,
  onStateChange,
}: BattleArenaProps) {
  const isMultiplayer = Boolean(multiplayerContext);
  const viewerSide: TeamSide = multiplayerContext?.viewerSide ?? 'player';

  const [localBattle, setLocalBattle] = useState<BattleState>(() =>
    createBattle(playerSquad, enemySquad, initialSeed, {
      bossEncounter: bossEncounter ?? undefined,
    })
  );

  const battle: BattleState =
    multiplayerContext && hasActiveBattleState(multiplayerContext.room.battleState)
      ? multiplayerContext.room.battleState
      : localBattle;

  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(
    null
  );
  const [autoBattle, setAutoBattle] = useState(false);
  const [fastSpeed, setFastSpeed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [showReplayInEndModal, setShowReplayInEndModal] = useState(false);
  const [inspectDefId, setInspectDefId] = useState<string | null>(null);
  const [hitFlashes, setHitFlashes] = useState<
    Record<string, 'damage' | 'heal' | 'shield'>
  >({});
  const [callouts, setCallouts] = useState<FloatingCallout[]>([]);
  const [projectiles, setProjectiles] = useState<CombatProjectile[]>([]);
  const [lungeState, setLungeState] = useState<{
    unitId: string;
    direction: 'up' | 'down';
  } | null>(null);
  const [screenShake, setScreenShake] = useState<'crit' | 'ko' | null>(null);
  const [ultimateBanner, setUltimateBanner] =
    useState<UltimateCutInData | null>(null);
  const [matchSnapshot, setMatchSnapshot] = useState<MatchSummaryRecord | null>(
    null
  );
  const [xpGrants, setXpGrants] = useState<BattleXpGrant[]>([]);

  const stageRef = useRef<HTMLElement | null>(null);
  const recordedMatchIdRef = useRef<string | null>(null);
  const lastFeedbackTurnRef = useRef<number>(battle.turnNumber);
  const flashTimerRef = useRef<number | null>(null);
  const calloutTimerRef = useRef<number | null>(null);
  const vfxTimerRef = useRef<number | null>(null);
  const lungeTimerRef = useRef<number | null>(null);
  const shakeTimerRef = useRef<number | null>(null);
  const ultimateTimerRef = useRef<number | null>(null);

  // Determine effective match completion (including PvP forfeit)
  const effectiveWinner: TeamSide | null =
    multiplayerContext && multiplayerContext.room.status === 'finished'
      ? (multiplayerContext.room.winnerSide || battle.winner || null)
      : battle.winner;
  const isMatchOver =
    Boolean(effectiveWinner) &&
    (battle.phase === 'victory' ||
      battle.phase === 'defeat' ||
      multiplayerContext?.room.status === 'finished');
  const didViewerWin = effectiveWinner === viewerSide;
  const endedByForfeit = Boolean(
    multiplayerContext &&
      multiplayerContext.room.status === 'finished' &&
      battle.phase === 'active'
  );

  const activeUnit = useMemo(() => getActiveUnit(battle), [battle]);
  const isPlayerTurn =
    !isMatchOver &&
    battle.phase === 'active' &&
    activeUnit?.side === viewerSide &&
    !(multiplayerContext?.submittingMove ?? false);

  const legalAbilities = useMemo(() => {
    if (!activeUnit || !isPlayerTurn) return [];
    return getLegalAbilities(battle, activeUnit.instanceId);
  }, [battle, activeUnit, isPlayerTurn]);

  const legalAbilityIds = useMemo(
    () => new Set(legalAbilities.map((a) => a.id)),
    [legalAbilities]
  );

  const selectedAbility: AbilityDefinition | null = useMemo(() => {
    if (!activeUnit || !selectedAbilityId) return null;
    return (
      getAllUnitAbilities(activeUnit).find((a) => a.id === selectedAbilityId) ??
      null
    );
  }, [activeUnit, selectedAbilityId]);

  const validTargets = useMemo(() => {
    if (!activeUnit || !selectedAbility || !isPlayerTurn) return [];
    return getValidTargets(battle, activeUnit.instanceId, selectedAbility.id);
  }, [battle, activeUnit, selectedAbility, isPlayerTurn]);

  const validTargetIds = useMemo(
    () => new Set(validTargets.map((u) => u.instanceId)),
    [validTargets]
  );

  const turnOrder = useMemo(() => getTurnOrderPreview(battle), [battle]);
  const { alliedUnits: playerUnits, opposingUnits: enemyUnits } = useMemo(
    () => getOrientedTeams(battle.units, viewerSide),
    [battle.units, viewerSide]
  );

  const playerSynergies = useMemo(
    () => computeSquadSynergies(playerUnits),
    [playerUnits]
  );
  const enemySynergies = useMemo(
    () => computeSquadSynergies(enemyUnits),
    [enemyUnits]
  );

  // Sync body state attribute cleanly
  useEffect(() => {
    if (isMatchOver) {
      onStateChange('gameover');
    } else if (paused) {
      onStateChange('paused');
    } else {
      onStateChange('playing');
    }
  }, [isMatchOver, paused, onStateChange]);

  // Trigger audio + visual impact juice for a resolved action
  const triggerActionFeedback = useCallback(
    (nextState: BattleState) => {
      const newFlashes: Record<string, 'damage' | 'heal' | 'shield'> = {};
      const newCallouts: FloatingCallout[] = [];
      const nextProjectiles: CombatProjectile[] = [];
      let soundToPlay:
        | 'attack'
        | 'heavy'
        | 'heal'
        | 'shield'
        | 'guard'
        | 'ko'
        | null = null;
      let shakeMode: 'crit' | 'ko' | null = null;

      const actionEvt = nextState.lastTurnEvents.find(
        (e) => e.kind === 'action_used'
      );
      const actorUnit = actionEvt?.actorId
        ? nextState.units.find((u) => u.instanceId === actionEvt.actorId)
        : undefined;
      const usedAbility =
        actorUnit && actionEvt?.abilityId
          ? getAllUnitAbilities(actorUnit).find(
              (a) => a.id === actionEvt.abilityId
            )
          : undefined;

      const isUltimateCast = usedAbility?.category === 'ultimate';

      // Measure real DOM card coordinates inside stageRef for directional trails
      const stageEl = stageRef.current;
      const stageRect = stageEl?.getBoundingClientRect() ?? null;
      const getCardCenter = (unitId: string): { x: number; y: number } | null => {
        if (!stageEl || !stageRect) return null;
        const el = stageEl.querySelector(
          `[data-testid="battle-unit-${unitId}"]`
        );
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left - stageRect.left + rect.width / 2,
          y: rect.top - stageRect.top + rect.height / 2,
        };
      };

      const actorCenter = actorUnit
        ? getCardCenter(actorUnit.instanceId)
        : null;
      const seenTrailKeys = new Set<string>();

      const pushProjectile = (
        targetId: string,
        kind: 'damage' | 'heal' | 'shield',
        opts?: { isCritical?: boolean; isResonant?: boolean }
      ) => {
        if (!actorUnit || !actorCenter) return;
        const key = `${targetId}:${kind}`;
        if (seenTrailKeys.has(key)) return;
        seenTrailKeys.add(key);

        const targetCenter = getCardCenter(targetId);
        if (!targetCenter) return;

        const dx = targetCenter.x - actorCenter.x;
        const dy = targetCenter.y - actorCenter.y;
        const midX = (actorCenter.x + targetCenter.x) / 2;
        const midY = (actorCenter.y + targetCenter.y) / 2;
        const curveSign = dx >= 0 ? -1 : 1;
        const arcOffset = Math.min(110, Math.max(36, Math.hypot(dx, dy) * 0.24));
        const palette = getProjectilePalette(kind, actorUnit.element);

        nextProjectiles.push({
          id: `${nextState.turnNumber}-${actorUnit.instanceId}-${targetId}-${kind}`,
          x1: actorCenter.x,
          y1: actorCenter.y,
          x2: targetCenter.x,
          y2: targetCenter.y,
          cx: midX + curveSign * arcOffset * 0.6,
          cy: midY - arcOffset * 0.42,
          kind,
          color: palette.color,
          glowColor: palette.glowColor,
          isCritical: opts?.isCritical,
          isUltimate: isUltimateCast,
          isResonant: opts?.isResonant,
        });
      };

      for (const evt of nextState.lastTurnEvents) {
        if (evt.kind === 'damage' && evt.targetId && evt.amount !== undefined) {
          newFlashes[evt.targetId] = 'damage';
          const isResonant = evt.elementalRelation === 'advantage';
          const isCrit = Boolean(evt.isCritical) || evt.amount >= 95;
          newCallouts.push({
            id: evt.id,
            unitId: evt.targetId,
            text: `-${evt.amount}${isResonant ? ' RESONANT' : ''}${
              evt.shieldAbsorbed ? ` (${evt.shieldAbsorbed} shd)` : ''
            }`,
            tone: isResonant ? 'resonant' : 'damage',
          });
          pushProjectile(evt.targetId, 'damage', {
            isCritical: isCrit,
            isResonant,
          });
          if (isCrit) {
            soundToPlay = 'heavy';
            if (shakeMode !== 'ko') shakeMode = 'crit';
          } else if (!soundToPlay) {
            soundToPlay = 'attack';
          }
        } else if (
          evt.kind === 'heal' &&
          evt.targetId &&
          evt.amount !== undefined &&
          evt.amount > 0
        ) {
          newFlashes[evt.targetId] = 'heal';
          newCallouts.push({
            id: evt.id,
            unitId: evt.targetId,
            text: `+${evt.amount} HP`,
            tone: 'heal',
          });
          pushProjectile(evt.targetId, 'heal');
          if (!soundToPlay) soundToPlay = 'heal';
        } else if (
          evt.kind === 'shield' &&
          evt.targetId &&
          evt.amount !== undefined
        ) {
          if (!newFlashes[evt.targetId]) newFlashes[evt.targetId] = 'shield';
          newCallouts.push({
            id: evt.id,
            unitId: evt.targetId,
            text: `+${evt.amount} SHD`,
            tone: 'shield',
          });
          pushProjectile(evt.targetId, 'shield');
          if (!soundToPlay) {
            soundToPlay =
              evt.abilityId === 'standard_guard' ? 'guard' : 'shield';
          }
        } else if (evt.kind === 'ko' && evt.targetId) {
          newCallouts.push({
            id: evt.id,
            unitId: evt.targetId,
            text: 'DEFEATED',
            tone: 'ko',
          });
          soundToPlay = 'ko';
          shakeMode = 'ko';
        } else if (evt.kind === 'stunned' && evt.targetId) {
          newCallouts.push({
            id: evt.id,
            unitId: evt.targetId,
            text: 'STUNNED',
            tone: 'status',
          });
        }
      }

      if (nextState.phase === 'victory') {
        soundEngine.play('victory');
      } else if (nextState.phase === 'defeat') {
        soundEngine.play('defeat');
      } else if (soundToPlay) {
        soundEngine.play(soundToPlay);
      }

      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      if (calloutTimerRef.current) window.clearTimeout(calloutTimerRef.current);
      if (vfxTimerRef.current) window.clearTimeout(vfxTimerRef.current);
      if (lungeTimerRef.current) window.clearTimeout(lungeTimerRef.current);
      if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);

      setHitFlashes(newFlashes);
      setCallouts(newCallouts);
      setProjectiles(nextProjectiles);

      if (actorUnit) {
        setLungeState({
          unitId: actorUnit.instanceId,
          direction: actorUnit.side === viewerSide ? 'up' : 'down',
        });
        lungeTimerRef.current = window.setTimeout(() => {
          setLungeState(null);
        }, 380);
      }

      if (shakeMode || isUltimateCast) {
        setScreenShake(shakeMode ?? 'crit');
        shakeTimerRef.current = window.setTimeout(() => {
          setScreenShake(null);
        }, 380);
      }

      if (isUltimateCast && actorUnit && usedAbility) {
        if (ultimateTimerRef.current) {
          window.clearTimeout(ultimateTimerRef.current);
        }
        setUltimateBanner({
          id: `${nextState.turnNumber}-${usedAbility.id}`,
          actorName: actorUnit.name,
          actorTitle: actorUnit.title,
          artworkUrl: actorUnit.artworkUrl,
          element: actorUnit.element,
          abilityName: usedAbility.name,
          side: actorUnit.side,
          isViewerAlly: actorUnit.side === viewerSide,
        });
        ultimateTimerRef.current = window.setTimeout(() => {
          setUltimateBanner(null);
        }, 950);
      }

      flashTimerRef.current = window.setTimeout(() => {
        setHitFlashes({});
      }, 360);
      vfxTimerRef.current = window.setTimeout(() => {
        setProjectiles([]);
      }, 620);
      calloutTimerRef.current = window.setTimeout(() => {
        setCallouts([]);
      }, 1080);
    },
    [viewerSide]
  );

  // Trigger feedback whenever a remote PvP turn arrives from Firestore
  useEffect(() => {
    if (!isMultiplayer) return;
    if (battle.turnNumber > lastFeedbackTurnRef.current) {
      lastFeedbackTurnRef.current = battle.turnNumber;
      triggerActionFeedback(battle);
    }
  }, [isMultiplayer, battle, triggerActionFeedback]);

  // Freeze end-of-match snapshot once per match
  useEffect(() => {
    const recordKey = multiplayerContext
      ? multiplayerContext.room.roomId
      : battle.matchId;

    if (
      isMatchOver &&
      effectiveWinner &&
      recordedMatchIdRef.current !== recordKey
    ) {
      recordedMatchIdRef.current = recordKey;
      const myUnits = battle.units.filter((u) => u.side === viewerSide);
      const rivalUnits = battle.units.filter((u) => u.side !== viewerSide);
      const replayMeta = createReplayMetadataFromBattle(
        battle,
        viewerSide,
        allCharacters
      );
      const opponentLabel =
        multiplayerContext?.opponentName ??
        (bossEncounter
          ? `${bossEncounter.bossName} (${bossEncounter.title})`
          : 'Arena AI Vanguard');
      const summary: MatchSummaryRecord = {
        matchId: recordKey,
        seed: battle.seed,
        timestamp: new Date().toISOString(),
        winner: effectiveWinner === viewerSide ? 'player' : 'enemy',
        rounds: battle.round,
        turns: multiplayerContext
          ? multiplayerContext.room.turnNumber
          : battle.turnNumber,
        playerSquadIds: myUnits.map((u) => u.definitionId),
        enemySquadIds: rivalUnits.map((u) => u.definitionId),
        playerSurvivors: myUnits.filter((u) => u.alive).length,
        enemySurvivors: rivalUnits.filter((u) => u.alive).length,
        totalPlayerDamage: myUnits.reduce(
          (sum, u) => sum + u.statsTracker.damageDealt,
          0
        ),
        totalPlayerHealing: myUnits.reduce(
          (sum, u) => sum + u.statsTracker.healingDone,
          0
        ),
        rulesetVersion: battle.rulesetVersion,
        mode: isMultiplayer ? 'multiplayer' : 'solo',
        opponentName: opponentLabel,
        ...replayMeta,
      };
      setMatchSnapshot(summary);
      if (bossEncounter && effectiveWinner === viewerSide) {
        recordGauntletVictory(bossEncounter.id, battle.turnNumber);
        onBossCleared?.(bossEncounter.id, battle.turnNumber);
      }
      const grants = onMatchFinished(summary, battle, {
        mode: isMultiplayer ? 'multiplayer' : 'solo',
        viewerSide,
        overrideWinner: endedByForfeit ? effectiveWinner : undefined,
        opponentName: opponentLabel,
      });
      setXpGrants(grants);
    }
  }, [
    isMatchOver,
    effectiveWinner,
    endedByForfeit,
    battle,
    viewerSide,
    isMultiplayer,
    multiplayerContext,
    bossEncounter,
    onBossCleared,
    onMatchFinished,
    allCharacters,
  ]);

  const commitAction = useCallback(
    (action: BattleAction) => {
      if (multiplayerContext) {
        setSelectedAbilityId(null);
        void multiplayerContext.onSubmitPvpAction(action);
        return;
      }

      setLocalBattle((prev) => {
        if (prev.phase !== 'active' || prev.activeUnitId !== action.actorId) {
          return prev;
        }
        const next = executeAction(prev, action);
        triggerActionFeedback(next);
        return next;
      });
      setSelectedAbilityId(null);
    },
    [multiplayerContext, triggerActionFeedback]
  );

  // Enemy AI & Optional Auto Battle turn driver (Strictly disabled in PvP!)
  useEffect(() => {
    if (isMultiplayer) return;
    if (paused || battle.phase !== 'active' || !activeUnit) return;

    const shouldAutomate = activeUnit.side === 'enemy' || autoBattle;
    if (!shouldAutomate) return;

    const delayMs = autoBattle
      ? fastSpeed
        ? 95
        : 220
      : fastSpeed
        ? 300
        : 580;
    const timer = window.setTimeout(() => {
      const action = chooseTacticalAction(battle);
      if (action) {
        commitAction(action);
      }
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [isMultiplayer, battle, activeUnit, autoBattle, fastSpeed, paused, commitAction]);

  // Clean up animation timers on unmount
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      if (calloutTimerRef.current) window.clearTimeout(calloutTimerRef.current);
      if (vfxTimerRef.current) window.clearTimeout(vfxTimerRef.current);
      if (lungeTimerRef.current) window.clearTimeout(lungeTimerRef.current);
      if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
      if (ultimateTimerRef.current) window.clearTimeout(ultimateTimerRef.current);
    };
  }, []);

  const handleRestartMatch = useCallback(() => {
    if (isMultiplayer) return;
    setPaused(false);
    setAutoBattle(false);
    setSelectedAbilityId(null);
    setHitFlashes({});
    setCallouts([]);
    setProjectiles([]);
    setLungeState(null);
    setScreenShake(null);
    setUltimateBanner(null);
    setMatchSnapshot(null);
    setXpGrants([]);
    setShowReplayInEndModal(false);
    recordedMatchIdRef.current = null;
    setLocalBattle(
      createBattle(playerSquad, enemySquad, generateMatchSeed(), {
        bossEncounter: bossEncounter ?? undefined,
      })
    );
  }, [isMultiplayer, playerSquad, enemySquad, bossEncounter]);

  const handleSelectAbility = useCallback(
    (ability: AbilityDefinition) => {
      if (!activeUnit || !isPlayerTurn || autoBattle || paused) return;
      if (!legalAbilityIds.has(ability.id)) return;

      soundEngine.play('select');

      const targets = getValidTargets(battle, activeUnit.instanceId, ability.id);
      if (targets.length === 0) return;

      // Clicking an already-selected AoE or Self ability confirms immediately
      if (
        selectedAbilityId === ability.id &&
        (ability.targetType === 'self' ||
          ability.targetType === 'all_enemies' ||
          ability.targetType === 'all_allies')
      ) {
        commitAction({
          actorId: activeUnit.instanceId,
          abilityId: ability.id,
          targetIds: targets.map((t) => t.instanceId),
        });
        return;
      }

      setSelectedAbilityId(ability.id);
    },
    [
      activeUnit,
      isPlayerTurn,
      autoBattle,
      paused,
      legalAbilityIds,
      battle,
      selectedAbilityId,
      commitAction,
    ]
  );

  const handleConfirmGroupCast = useCallback(() => {
    if (!activeUnit || !selectedAbility || validTargets.length === 0) return;
    commitAction({
      actorId: activeUnit.instanceId,
      abilityId: selectedAbility.id,
      targetIds: validTargets.map((t) => t.instanceId),
    });
  }, [activeUnit, selectedAbility, validTargets, commitAction]);

  const handleTargetClick = useCallback(
    (unitId: string) => {
      if (!activeUnit || !selectedAbility || !validTargetIds.has(unitId)) return;
      const isGroup =
        selectedAbility.targetType === 'all_enemies' ||
        selectedAbility.targetType === 'all_allies';
      commitAction({
        actorId: activeUnit.instanceId,
        abilityId: selectedAbility.id,
        targetIds: isGroup ? validTargets.map((t) => t.instanceId) : [unitId],
      });
    },
    [activeUnit, selectedAbility, validTargetIds, validTargets, commitAction]
  );

  // Keyboard shortcuts: 1-5 abilities, Enter confirm AoE/Self, Space Auto, Esc/P Pause, M Mute
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (inspectDefId) return;
      if (battle.phase !== 'active') return;

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (selectedAbilityId && e.key === 'Escape' && !paused) {
          setSelectedAbilityId(null);
        } else {
          setPaused((prev) => !prev);
        }
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        setMuted((prev) => {
          const next = !prev;
          soundEngine.setMuted(next);
          return next;
        });
        return;
      }

      if (paused) return;

      if (e.key === ' ' && !isMultiplayer) {
        e.preventDefault();
        setAutoBattle((prev) => !prev);
        return;
      }

      if (isPlayerTurn && !autoBattle && activeUnit) {
        const allSkills = getAllUnitAbilities(activeUnit);
        const digit = Number(e.key);
        if (digit >= 1 && digit <= allSkills.length) {
          e.preventDefault();
          handleSelectAbility(allSkills[digit - 1]);
          return;
        }

        if (
          e.key === 'Enter' &&
          selectedAbility &&
          (selectedAbility.targetType === 'self' ||
            selectedAbility.targetType === 'all_enemies' ||
            selectedAbility.targetType === 'all_allies')
        ) {
          e.preventDefault();
          handleConfirmGroupCast();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    inspectDefId,
    battle.phase,
    paused,
    selectedAbilityId,
    isMultiplayer,
    isPlayerTurn,
    autoBattle,
    activeUnit,
    selectedAbility,
    handleSelectAbility,
    handleConfirmGroupCast,
  ]);

  // Latest readable battle banner line
  const latestActionLine = useMemo(() => {
    const meaningful = [...battle.events]
      .reverse()
      .find(
        (e) =>
          e.kind === 'action_used' ||
          e.kind === 'ko' ||
          e.kind === 'stunned' ||
          e.kind === 'match_end' ||
          e.kind === 'match_start'
      );
    return meaningful?.message ?? 'Prepare for combat.';
  }, [battle.events]);

  const mvpUnit = useMemo(() => {
    const myUnits = battle.units.filter((u) => u.side === viewerSide);
    return myUnits.reduce((best, curr) => {
      const scoreCurr =
        curr.statsTracker.damageDealt +
        curr.statsTracker.healingDone +
        curr.statsTracker.shieldGranted;
      const scoreBest =
        best.statsTracker.damageDealt +
        best.statsTracker.healingDone +
        best.statsTracker.shieldGranted;
      return scoreCurr > scoreBest ? curr : best;
    }, myUnits[0]);
  }, [battle.units, viewerSide]);

  const inspectCharacter = inspectDefId
    ? getCharacterById(inspectDefId, allCharacters) ?? null
    : null;

  const activeAllAbilities = activeUnit ? getAllUnitAbilities(activeUnit) : [];
  const isGroupOrSelfSelected =
    selectedAbility &&
    (selectedAbility.targetType === 'self' ||
      selectedAbility.targetType === 'all_enemies' ||
      selectedAbility.targetType === 'all_allies');

  return (
    <div className="min-h-screen w-full bg-[#090B10] text-[#ECEEF4] flex flex-col justify-between relative overflow-x-hidden">
      {/* Subtle atmospheric arena glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(139,92,246,0.09) 0%, rgba(9,11,16,0) 70%), radial-gradient(ellipse 65% 40% at 50% 100%, rgba(212,175,55,0.08) 0%, rgba(9,11,16,0) 70%)',
        }}
      />

      {/* TOP TACTICAL HUD STRIP */}
      <div className="relative z-20 bg-[#0D101A]/95 border-b border-white/10 px-3 sm:px-6 py-2">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Round & Turn Counter */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-display text-sm sm:text-base font-bold text-[#F5DC8B] tracking-wide whitespace-nowrap">
              ORACLE ARENA
            </span>
            <div className="h-4 w-px bg-white/15" aria-hidden="true" />
            <div className="flex items-center gap-2 font-mono tabular-nums text-xs sm:text-sm text-[#D8DCE8]">
              <span>Round {battle.round}</span>
              <span className="text-white/25" aria-hidden="true">
                ·
              </span>
              <span className="text-[#9CA3B8]">Turn {battle.turnNumber}</span>
              {getEscalationBonusPercent(battle.round) > 0 && (
                <>
                  <span className="text-white/25" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-amber-300 font-semibold">
                    Escalation +{getEscalationBonusPercent(battle.round)}%
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Initiative Turn Order Queue */}
          <div
            aria-label="Turn order queue"
            className="hidden lg:flex items-center gap-1.5 overflow-x-auto max-w-[540px]"
          >
            <span className="text-[11px] font-mono text-[#8F96AB] mr-1 shrink-0">
              ORDER
            </span>
            {turnOrder.slice(0, 8).map((u, idx) => {
              const isViewerAlly = u.side === viewerSide;
              return (
                <div
                  key={`${u.instanceId}-${idx}`}
                  title={`${u.name} (${isViewerAlly ? 'Ally' : 'Opponent'} · SPD ${u.speed})`}
                  className={`relative w-8 h-8 rounded overflow-hidden border shrink-0 transition-transform ${
                    idx === 0
                      ? 'border-[#E5C158] ring-1 ring-[#E5C158] scale-110 z-10'
                      : isViewerAlly
                        ? 'border-sky-400/50 opacity-85'
                        : 'border-rose-400/50 opacity-85'
                  }`}
                >
                  <Image
                    src={u.artworkUrl}
                    alt={u.name}
                    fill
                    sizes="32px"
                    referrerPolicy="no-referrer"
                    className="object-cover object-top"
                  />
                  <span
                    className={`absolute bottom-0 inset-x-0 h-1 ${
                      isViewerAlly ? 'bg-sky-400' : 'bg-rose-500'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* Tactical Utility Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {multiplayerContext ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-semibold bg-violet-500/20 text-violet-100 border border-violet-400/45 whitespace-nowrap shrink-0">
                <Users className="w-3.5 h-3.5 text-[#F5DC8B] shrink-0" />
                <span>PvP #{multiplayerContext.room.roomCode}</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setAutoBattle((prev) => !prev);
                  }}
                  aria-pressed={autoBattle}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    autoBattle
                      ? 'bg-[#D4AF37] text-[#0B0D13] border-[#E5C158]'
                      : 'bg-[#151A28] text-[#D8DCE8] border-white/15 hover:border-white/30'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5 shrink-0" />
                  <span>Auto: {autoBattle ? 'On' : 'Off'}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setFastSpeed((prev) => !prev);
                  }}
                  aria-pressed={fastSpeed}
                  aria-label={`Battle speed ${fastSpeed ? '2x' : '1x'}`}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-mono font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    fastSpeed
                      ? 'bg-sky-500/25 text-sky-200 border-sky-400/50'
                      : 'bg-[#151A28] text-[#C4C9D8] border-white/15 hover:text-white'
                  }`}
                >
                  <FastForward className="w-3.5 h-3.5 shrink-0" />
                  <span>{fastSpeed ? '2x' : '1x'}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                setLogOpen((prev) => !prev);
              }}
              aria-expanded={logOpen}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                logOpen
                  ? 'bg-violet-500/25 text-violet-200 border-violet-400/50'
                  : 'bg-[#151A28] text-[#C4C9D8] border-white/15 hover:text-white'
              }`}
            >
              <ScrollText className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Battle Log</span>
            </button>

            <button
              type="button"
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                setMuted((prev) => {
                  const next = !prev;
                  soundEngine.setMuted(next);
                  return next;
                });
              }}
              className="p-1.5 rounded bg-[#151A28] border border-white/15 text-[#C4C9D8] hover:text-white transition-colors cursor-pointer"
            >
              {muted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              aria-label="Pause battle"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                setPaused(true);
              }}
              className="p-1.5 rounded bg-[#151A28] border border-white/15 text-[#C4C9D8] hover:text-white transition-colors cursor-pointer"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MAIN 5v5 BATTLEFIELD (with micro screen-shake & Combat VFX layer) */}
      <motion.main
        ref={stageRef}
        animate={
          screenShake === 'ko'
            ? { x: [0, -7, 7, -5, 4, 0], y: [0, 3, -3, 2, 0] }
            : screenShake === 'crit'
              ? { x: [0, -4, 4, -2, 0], y: [0, 1.5, -1.5, 0] }
              : { x: 0, y: 0 }
        }
        transition={{ duration: 0.34, ease: 'easeOut' }}
        className="relative z-10 flex-1 w-full max-w-[1400px] mx-auto px-3 sm:px-6 py-2 flex flex-col justify-between gap-2"
      >
        <CombatVfxLayer
          projectiles={projectiles}
          ultimateBanner={ultimateBanner}
        />

        {/* Boss Encounter Passive Banner (when fighting a Gauntlet Boss) */}
        {battle.bossEncounter && (
          <div
            data-testid="boss-encounter-banner"
            className="rounded-md bg-gradient-to-r from-[#1A1324] via-[#1B1418] to-[#131724] border border-amber-400/45 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2.5"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Crown className="w-4 h-4 text-[#F5DC8B] shrink-0" />
              <span className="font-display text-xs sm:text-sm font-bold text-[#F5DC8B] whitespace-nowrap">
                {battle.bossEncounter.title}: {battle.bossEncounter.bossName}
              </span>
              <span className="text-white/25 hidden sm:inline">·</span>
              <span className="text-xs text-amber-200/90 truncate">
                <strong className="font-semibold text-[#F5EFE0]">
                  {battle.bossEncounter.bossPassiveName}:
                </strong>{' '}
                {battle.bossEncounter.bossPassiveDescription}
              </span>
            </div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-rose-300 shrink-0">
              {bossEncounter?.difficulty ?? `Stage ${battle.bossEncounter.stage}`}
            </span>
          </div>
        )}

        {/* ENEMY FORMATION (TOP 5) */}
        <section aria-label="Opposing Squad" className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9CA3B8]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-rose-300 tracking-wide">
                {multiplayerContext
                  ? `${multiplayerContext.opponentName}'s Vanguard`
                  : battle.bossEncounter
                    ? `${battle.bossEncounter.bossName}'s Legion`
                    : 'Opposing Vanguard'}
              </span>
              {enemySynergies.synergies.map((syn) => (
                <span
                  key={syn.id}
                  title={syn.description}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/12 border border-rose-400/30 text-[10px] font-mono text-rose-200"
                >
                  <Sparkles className="w-2.5 h-2.5 shrink-0" />
                  <span>{syn.name}</span>
                </span>
              ))}
            </div>
            <span className="font-mono tabular-nums">
              {enemyUnits.filter((u) => u.alive).length}/5 Standing
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3">
            {enemyUnits.map((unit) => {
              const targetable =
                isPlayerTurn && !autoBattle && validTargetIds.has(unit.instanceId);
              const matchup =
                targetable &&
                activeUnit &&
                selectedAbility &&
                selectedAbility.damageMultiplier > 0
                  ? getElementalMatchup(activeUnit.element, unit.element)
                  : null;
              return (
                <BattleCard
                  key={unit.instanceId}
                  unit={unit}
                  isActive={battle.activeUnitId === unit.instanceId}
                  isTargetable={targetable}
                  isSelectedTarget={false}
                  hitFlash={hitFlashes[unit.instanceId] ?? null}
                  lungeDirection={
                    lungeState?.unitId === unit.instanceId
                      ? lungeState.direction
                      : null
                  }
                  isBoss={
                    battle.bossEncounter?.bossUnitInstanceId === unit.instanceId
                  }
                  elementalHint={
                    matchup && matchup.relation !== 'neutral'
                      ? matchup.relation
                      : null
                  }
                  callouts={callouts.filter((c) => c.unitId === unit.instanceId)}
                  onSelectTarget={handleTargetClick}
                  onInspect={(defId) => setInspectDefId(defId)}
                />
              );
            })}
          </div>
        </section>

        {/* CENTER CLASH BANNER */}
        <div
          aria-live="polite"
          className="rounded-md bg-[#111521]/95 border border-white/10 px-4 py-2 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Swords className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <p className="text-xs sm:text-sm text-[#E5E8F0] truncate">
              {multiplayerContext?.moveError ? (
                <span className="text-rose-300 inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {multiplayerContext.moveError}
                </span>
              ) : (
                latestActionLine
              )}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {!isMatchOver && battle.phase === 'active' && activeUnit && (
              <span
                className={`text-xs font-mono font-semibold inline-flex items-center gap-1.5 ${
                  isPlayerTurn ? 'text-[#F5DC8B]' : 'text-rose-300'
                }`}
              >
                {multiplayerContext?.submittingMove ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" />
                    <span>Validating move with Ruleset 1.0...</span>
                  </>
                ) : autoBattle ? (
                  `Auto Battle: ${activeUnit.name} acting...`
                ) : isPlayerTurn ? (
                  selectedAbility ? (
                    isGroupOrSelfSelected ? (
                      `Ready: ${selectedAbility.name} (${formatTargetLabel(
                        selectedAbility.targetType
                      )})`
                    ) : (
                      `Select target for ${selectedAbility.name}`
                    )
                  ) : (
                    `Your Turn: ${activeUnit.name}`
                  )
                ) : multiplayerContext ? (
                  `Waiting for ${multiplayerContext.opponentName} (${activeUnit.name})...`
                ) : (
                  `Enemy Turn: ${activeUnit.name} acting...`
                )}
              </span>
            )}

            {isPlayerTurn && !autoBattle && selectedAbility && (
              <div className="flex items-center gap-2">
                {isGroupOrSelfSelected && (
                  <button
                    type="button"
                    onClick={handleConfirmGroupCast}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded bg-[#D4AF37] text-[#0B0D13] text-xs font-semibold hover:bg-[#E5C454] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>Confirm Cast</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedAbilityId(null)}
                  className="px-2.5 py-1 rounded border border-white/15 text-xs text-[#C4C9D8] hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* PLAYER FORMATION (BOTTOM 5) */}
        <section aria-label="Allied Squad" className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9CA3B8]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sky-300 tracking-wide">
                {multiplayerContext
                  ? `Your Squad (${multiplayerContext.viewerName})`
                  : 'Your Squad'}
              </span>
              {playerSynergies.synergies.map((syn) => (
                <span
                  key={syn.id}
                  title={syn.description}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/12 border border-sky-400/35 text-[10px] font-mono text-sky-200"
                >
                  <Sparkles className="w-2.5 h-2.5 shrink-0" />
                  <span>{syn.name}</span>
                </span>
              ))}
            </div>
            <span className="font-mono tabular-nums">
              {playerUnits.filter((u) => u.alive).length}/5 Standing
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3">
            {playerUnits.map((unit) => (
              <BattleCard
                key={unit.instanceId}
                unit={unit}
                isActive={battle.activeUnitId === unit.instanceId}
                isTargetable={
                  isPlayerTurn &&
                  !autoBattle &&
                  validTargetIds.has(unit.instanceId)
                }
                isSelectedTarget={false}
                hitFlash={hitFlashes[unit.instanceId] ?? null}
                lungeDirection={
                  lungeState?.unitId === unit.instanceId
                    ? lungeState.direction
                    : null
                }
                callouts={callouts.filter((c) => c.unitId === unit.instanceId)}
                onSelectTarget={handleTargetClick}
                onInspect={(defId) => setInspectDefId(defId)}
              />
            ))}
          </div>
        </section>
      </motion.main>

      {/* UNIFIED BOTTOM COMMAND DOCK */}
      <section
        aria-label="Active Champion Command Dock"
        className="relative z-20 bg-[#0E121D] border-t border-[#D4AF37]/30 px-3 sm:px-6 py-2"
      >
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-3 items-center">
          {/* Active Actor Readout */}
          {activeUnit ? (
            <div className="flex items-center gap-3 pr-2 lg:border-r lg:border-white/10">
              <div
                className={`relative w-12 h-14 rounded overflow-hidden border shrink-0 ${
                  activeUnit.side === viewerSide
                    ? 'border-[#D4AF37]'
                    : 'border-rose-400/70'
                }`}
              >
                <Image
                  src={activeUnit.artworkUrl}
                  alt={activeUnit.name}
                  fill
                  sizes="48px"
                  referrerPolicy="no-referrer"
                  className="object-cover object-top"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-[11px] font-mono text-[#9CA3B8]">
                  {activeUnit.side === viewerSide
                    ? 'ACTIVE ALLY'
                    : 'OPPONENT ACTING'}
                </p>
                <p className="font-display font-bold text-sm text-[#F5EFE0] truncate">
                  {activeUnit.name}
                </p>
                <p className="font-mono tabular-nums text-[11px] text-[#C4C9D8]">
                  HP {activeUnit.currentHp}/{activeUnit.maxHp} · EN{' '}
                  {activeUnit.currentEnergy}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#9CA3B8]">Match concluded.</div>
          )}

          {/* Ability Buttons Grid (Adapts cleanly for 5 or 6 total abilities) */}
          <div
            className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${
              activeAllAbilities.length >= 6 ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
            }`}
          >
            {isPlayerTurn && activeUnit ? (
              activeAllAbilities.map((ability, idx) => {
                const cd = activeUnit.cooldowns[ability.id] ?? 0;
                const enoughEnergy =
                  activeUnit.currentEnergy >= ability.energyCost;
                const isLegal = cd === 0 && enoughEnergy && !autoBattle;
                const isSelected = selectedAbilityId === ability.id;

                const disabledReason =
                  cd > 0
                    ? `Cooldown ${cd}t`
                    : !enoughEnergy
                      ? `Need ${ability.energyCost} EN`
                      : autoBattle
                        ? 'Auto Active'
                        : null;

                return (
                  <button
                    key={ability.id}
                    type="button"
                    disabled={!isLegal}
                    onClick={() => handleSelectAbility(ability)}
                    aria-pressed={isSelected}
                    className={`group text-left p-2 rounded-md border transition-all duration-150 flex flex-col justify-between gap-1 min-h-[70px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] ${
                      isSelected
                        ? 'bg-[#221D12] border-[#E5C158] ring-1 ring-[#E5C158]/60 cursor-pointer'
                        : isLegal
                          ? ability.category === 'ultimate'
                            ? 'bg-[#191529] border-violet-400/50 hover:border-[#E5C158] hover:bg-[#211B35] cursor-pointer'
                            : 'bg-[#141927] border-white/15 hover:border-[#D4AF37]/60 hover:bg-[#1B2235] cursor-pointer'
                          : 'bg-[#0C0F17] border-white/8 opacity-55 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono text-[#8F96AB] mr-1">
                          [{idx + 1}]
                        </span>
                        <span className="text-xs font-semibold text-[#F5EFE0] leading-tight">
                          {ability.name}
                        </span>
                      </div>
                      {ability.category === 'guard' ? (
                        <Shield className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                      ) : ability.category === 'ultimate' ? (
                        <Zap className="w-3.5 h-3.5 text-[#E5C158] shrink-0" />
                      ) : (
                        <Swords className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                      )}
                    </div>

                    <p className="text-[11px] text-[#9CA3B8] line-clamp-2 leading-snug">
                      {ability.description}
                    </p>

                    <div className="flex items-center justify-between gap-1 text-[10px] font-mono tabular-nums pt-0.5 border-t border-white/8">
                      <span className="text-[#8F96AB] truncate">
                        {formatTargetLabel(ability.targetType)}
                      </span>
                      {disabledReason ? (
                        <span className="text-rose-300 font-semibold shrink-0">
                          {disabledReason}
                        </span>
                      ) : ability.energyCost > 0 ? (
                        <span className="text-violet-300 font-semibold shrink-0">
                          {ability.energyCost} EN
                        </span>
                      ) : (
                        <span className="text-emerald-300 font-semibold shrink-0">
                          +{ability.energyGain} EN
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="col-span-full h-[78px] rounded-md border border-white/10 bg-[#0B0E17] px-4 flex items-center justify-between text-xs sm:text-sm text-[#9CA3B8]">
                <span>
                  {!isMatchOver && battle.phase === 'active'
                    ? multiplayerContext?.submittingMove
                      ? 'Submitting server-validated action to Cloud Firestore...'
                      : multiplayerContext
                        ? `Waiting for ${multiplayerContext.opponentName} to command ${activeUnit?.name ?? 'their champion'}...`
                        : `${activeUnit?.name ?? 'Opponent'} is resolving their tactical action...`
                    : 'Battle complete.'}
                </span>
                {!isMatchOver && battle.phase === 'active' && !isMultiplayer && (
                  <span className="font-mono text-xs text-[#6B7287]">
                    Press Space to toggle Auto Battle
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* COLLAPSIBLE COMBAT LOG DRAWER */}
      {logOpen && (
        <aside
          aria-label="Combat Log"
          className="fixed top-12 right-0 bottom-0 z-40 w-full max-w-sm bg-[#0F131F] border-l border-white/15 shadow-2xl flex flex-col"
        >
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-bold text-[#F5EFE0]">
                Tactical Combat Log
              </h2>
              <p className="text-[11px] font-mono text-[#8F96AB]">
                Seed #{battle.seed} · {battle.replayLog.length} actions logged
              </p>
            </div>
            <button
              type="button"
              aria-label="Close combat log"
              onClick={() => setLogOpen(false)}
              className="p-1.5 rounded text-[#9CA3B8] hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <ol className="flex-1 overflow-y-auto p-4 space-y-2 text-xs font-mono">
            {[...battle.events].reverse().map((evt) => (
              <li
                key={evt.id}
                className="pb-2 border-b border-white/6 leading-relaxed"
              >
                <span className="text-[#6B7287] mr-2">
                  R{evt.round}·T{evt.turnNumber}
                </span>
                <span
                  className={
                    evt.kind === 'ko'
                      ? 'text-amber-300 font-semibold'
                      : evt.kind === 'damage' || evt.kind === 'status_tick'
                        ? 'text-rose-300'
                        : evt.kind === 'heal'
                          ? 'text-emerald-300'
                          : evt.kind === 'shield'
                            ? 'text-sky-300'
                            : evt.kind === 'round_start'
                              ? 'text-[#F5DC8B] font-semibold'
                              : 'text-[#C4C9D8]'
                  }
                >
                  {evt.message}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      )}

      {/* PAUSE MODAL */}
      {paused && !isMatchOver && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="bg-[#121622] border border-[#D4AF37]/35 rounded-lg max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="space-y-1 text-center">
              <h2
                id="pause-modal-title"
                className="font-display text-2xl font-bold text-[#F5EFE0] tracking-wide"
              >
                {multiplayerContext ? 'PvP Match Menu' : 'Battle Paused'}
              </h2>
              <p className="text-xs font-mono text-[#9CA3B8]">
                Round {battle.round} · Turn {battle.turnNumber} ·{' '}
                {multiplayerContext
                  ? `Room #${multiplayerContext.room.roomCode}`
                  : `Seed #${battle.seed}`}
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setPaused(false)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-sm hover:bg-[#E5C454] transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>Resume Battle</span>
              </button>

              {multiplayerContext ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPaused(false);
                      multiplayerContext.onReturnToLobby();
                    }}
                    className="w-full px-4 py-2.5 rounded-md bg-[#1A2030] border border-white/15 text-[#ECEEF4] font-medium text-sm hover:bg-[#232B40] transition-colors cursor-pointer"
                  >
                    Leave to Lobby (Rejoin Anytime)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaused(false);
                      void multiplayerContext.onForfeitPvp();
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-rose-500/45 text-rose-300 font-medium text-sm hover:bg-rose-950/40 transition-colors cursor-pointer"
                  >
                    <Flag className="w-4 h-4" />
                    <span>Forfeit PvP Match</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleRestartMatch}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[#1A2030] border border-white/15 text-[#ECEEF4] font-medium text-sm hover:bg-[#232B40] transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Restart Match</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaused(false);
                      onOpenCollection();
                    }}
                    className="w-full px-4 py-2.5 rounded-md border border-white/15 text-[#C4C9D8] font-medium text-sm hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    Edit Squad & Collection
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaused(false);
                      onReturnTitle();
                    }}
                    className="w-full px-4 py-2 rounded-md text-[#8F96AB] text-sm hover:text-white transition-colors cursor-pointer"
                  >
                    Return to Title
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VICTORY / DEFEAT MODAL */}
      {isMatchOver && matchSnapshot && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-result-title"
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-[#121622] border border-[#D4AF37]/45 rounded-lg max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#1C2233] border border-[#D4AF37]/40 mx-auto">
                <Trophy
                  className={`w-6 h-6 ${
                    didViewerWin ? 'text-[#F5DC8B]' : 'text-rose-400'
                  }`}
                />
              </div>
              <h2
                id="match-result-title"
                className={`font-display text-3xl font-bold tracking-wider ${
                  didViewerWin ? 'text-[#F5DC8B]' : 'text-rose-400'
                }`}
              >
                {didViewerWin ? 'VICTORY' : 'DEFEAT'}
              </h2>
              <p className="text-sm text-[#C4C9D8]">
                {multiplayerContext
                  ? endedByForfeit
                    ? didViewerWin
                      ? `${multiplayerContext.opponentName} forfeited the match. Ranked ELO (+${multiplayerContext.eloDeltaPreview.win}) awarded.`
                      : `You forfeited against ${multiplayerContext.opponentName} (${multiplayerContext.eloDeltaPreview.loss} ELO).`
                    : didViewerWin
                      ? `You defeated ${multiplayerContext.opponentName} in live 5v5 PvP (+${multiplayerContext.eloDeltaPreview.win} ELO).`
                      : `${multiplayerContext.opponentName} prevailed in live 5v5 PvP (${multiplayerContext.eloDeltaPreview.loss} ELO).`
                  : bossEncounter
                    ? didViewerWin
                      ? `Boss Conquered! You cleared ${bossEncounter.title} against ${bossEncounter.bossName} (+${bossEncounter.rewardShards} Shards bonus).`
                      : `${bossEncounter.bossName} held the arena in ${bossEncounter.title}. Tune your squad synergies and counter their passive!`
                    : didViewerWin
                      ? 'Your five-champion formation prevailed in the arena.'
                      : 'Your squad fell. Adjust your lineup or tactics and challenge again.'}
              </p>
            </div>

              {/* Outcome Metrics (Tabular Numerals) */}
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center border-y border-white/10 py-4 font-mono tabular-nums">
                <div>
                  <dt className="text-[11px] text-[#8F96AB]">Rounds</dt>
                  <dd className="text-xl font-bold text-[#F5EFE0]">
                    {matchSnapshot.rounds}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#8F96AB]">Survivors</dt>
                  <dd className="text-xl font-bold text-emerald-300">
                    {matchSnapshot.playerSurvivors}/5
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#8F96AB]">Damage Dealt</dt>
                  <dd className="text-xl font-bold text-rose-300">
                    {matchSnapshot.totalPlayerDamage}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#8F96AB]">Healing Done</dt>
                  <dd className="text-xl font-bold text-sky-300">
                    {matchSnapshot.totalPlayerHealing}
                  </dd>
                </div>
              </dl>

              {/* Standout Champion */}
              {mvpUnit && (
                <div className="flex items-center justify-between gap-3 text-xs bg-[#0C0F18] border border-white/10 rounded-md p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-10 h-12 rounded overflow-hidden border border-[#D4AF37]/40 shrink-0">
                      <Image
                        src={mvpUnit.artworkUrl}
                        alt={mvpUnit.name}
                        fill
                        sizes="40px"
                        referrerPolicy="no-referrer"
                        className="object-cover object-top"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#8F96AB]">Squad Standout</p>
                      <p className="font-display font-bold text-sm text-[#F5EFE0] truncate">
                        {mvpUnit.name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums text-[#C4C9D8] shrink-0">
                    <p>{mvpUnit.statsTracker.damageDealt} DMG</p>
                    <p className="text-[#8F96AB]">
                      {mvpUnit.statsTracker.kosScored} KOs · Seed #
                      {matchSnapshot.seed}
                    </p>
                  </div>
                </div>
              )}

              {/* Validated XP & Progression Rewards */}
              {xpGrants.length > 0 && (
                <div className="bg-[#0C0F18] border border-[#D4AF37]/30 rounded-md p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-bold text-[#F5DC8B] tracking-wide">
                      Validated Squad Progression
                    </span>
                    <span className="text-[11px] font-mono text-[#8F96AB]">
                      Earned from completed match
                    </span>
                  </div>
                  <div className="divide-y divide-white/8 text-xs font-mono tabular-nums">
                    {xpGrants.map((grant) => (
                      <div
                        key={grant.definitionId}
                        className="py-1.5 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-sans font-medium text-[#ECEEF4]">
                            {grant.name}
                          </span>
                          <CardTierBadge level={grant.newLevel} compact />
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-sky-300 font-semibold">
                            +{grant.xpGained} XP
                          </span>
                          {grant.newLevel > grant.previousLevel ? (
                            <span className="text-emerald-300 font-semibold">
                              Lv.{grant.previousLevel} → Lv.{grant.newLevel}
                              {grant.tierPromoted
                                ? ` · ${CARD_TIER_MAP[grant.newTier].badgeLabel}!`
                                : ''}
                              {grant.upgradePointsEarned > 0
                                ? ` (+${grant.upgradePointsEarned} UP`
                                : ''}
                              {grant.abilityPointsEarned > 0
                                ? `, +${grant.abilityPointsEarned} ACP)`
                                : grant.upgradePointsEarned > 0
                                  ? ')'
                                  : ''}
                            </span>
                          ) : (
                            <span className="text-[#8F96AB]">
                              Lv.{grant.newLevel}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Optional Expandable Replay Log */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowReplayInEndModal((prev) => !prev)}
                  className="text-xs font-medium text-[#A6ADC2] hover:text-[#F5DC8B] transition-colors cursor-pointer"
                >
                  {showReplayInEndModal
                    ? 'Hide Battle Replay Log'
                    : `Inspect Battle Replay Log (${battle.replayLog.length} recorded actions)`}
                </button>
                {showReplayInEndModal && (
                  <ol className="mt-2 max-h-40 overflow-y-auto rounded bg-[#090B10] border border-white/10 p-3 space-y-1 text-[11px] font-mono text-[#C4C9D8]">
                    {battle.events
                      .filter(
                        (e) =>
                          e.kind === 'action_used' ||
                          e.kind === 'ko' ||
                          e.kind === 'match_end'
                      )
                      .map((e) => (
                        <li key={e.id}>
                          <span className="text-[#6B7287] mr-1.5">
                            R{e.round}·T{e.turnNumber}
                          </span>
                          {e.message}
                        </li>
                      ))}
                  </ol>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onReturnTitle}
                  className="px-3.5 py-2.5 text-sm font-medium text-[#9CA3B8] hover:text-white transition-colors cursor-pointer"
                >
                  Title
                </button>
                <button
                  type="button"
                  onClick={onOpenCollection}
                  className="px-3.5 py-2.5 text-sm font-medium rounded-md border border-white/15 text-[#ECEEF4] hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Squad
                </button>
                {onOpenMatchReplay && matchSnapshot && (
                  <button
                    type="button"
                    onClick={() => onOpenMatchReplay(matchSnapshot.matchId)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-md bg-sky-500/20 border border-sky-400/50 text-sky-100 hover:bg-sky-500/30 transition-colors cursor-pointer"
                  >
                    <Film className="w-4 h-4 shrink-0" />
                    <span>Study Replay</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onOpenEvolutionChamber(
                      xpGrants[0]?.definitionId ?? mvpUnit?.definitionId
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-md bg-violet-500/20 border border-violet-400/50 text-violet-100 hover:bg-violet-500/30 transition-colors cursor-pointer"
                >
                  <ArrowUpCircle className="w-4 h-4 shrink-0" />
                  <span>Evolution Chamber</span>
                </button>
                {multiplayerContext ? (
                  <button
                    type="button"
                    onClick={multiplayerContext.onReturnToLobby}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-md bg-[#D4AF37] text-[#0B0D13] hover:bg-[#E5C454] transition-colors cursor-pointer"
                  >
                    <Users className="w-4 h-4" />
                    <span>Multiplayer Lobby</span>
                  </button>
                ) : bossEncounter && onOpenGauntlet ? (
                  <>
                    <button
                      type="button"
                      onClick={onOpenGauntlet}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-md bg-amber-500/20 border border-amber-400/50 text-[#F5DC8B] hover:bg-amber-500/30 transition-colors cursor-pointer"
                    >
                      <Crown className="w-4 h-4 shrink-0" />
                      <span>Boss Gauntlet</span>
                    </button>
                    <button
                      type="button"
                      data-start="true"
                      onClick={handleRestartMatch}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-md bg-[#D4AF37] text-[#0B0D13] hover:bg-[#E5C454] transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Rematch Boss</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    data-start="true"
                    onClick={handleRestartMatch}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-md bg-[#D4AF37] text-[#0B0D13] hover:bg-[#E5C454] transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Play Again</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      {/* CHARACTER INSPECT MODAL (Available mid-battle) */}
      <CharacterDetailModal
        character={inspectCharacter}
        onClose={() => setInspectDefId(null)}
      />
    </div>
  );
}
