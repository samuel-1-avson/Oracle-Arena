'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  awardMatchShards,
  removeCustomCardFromRegistry,
  subscribeTradableCardsCatalog,
  syncCustomCardToRegistry,
} from '@/lib/firebase/economy-repository';
import {
  commitValidatedMultiplayerMove,
  deleteCustomCardFromCloud,
  fetchCloudCards,
  fetchCloudMatches,
  forfeitActiveRoom,
  recordCloudMatchAndRating,
  saveCardsToCloud,
  saveCardToCloud,
  subscribeBattleRoom,
  updateProfileSquadAndCount,
} from '@/lib/firebase/repository';
import {
  computeMatchShardReward,
  isCardTradable,
  reconcileOwnedTradableCards,
  TradableCardDoc,
} from '@/lib/game/economy';
import {
  BattleRoomDoc,
  getViewerSide,
  hasActiveBattleState,
  MultiplayerBattleContext,
  ValidatedTurnResult,
} from '@/lib/game/multiplayer';
import {
  BattleXpGrant,
  computeValidatedBattleRewards,
  normalizeCharacterProgression,
} from '@/lib/game/progression';
import {
  DEFAULT_PLAYER_SQUAD_IDS,
  getComplementaryEnemySquad,
  getSquadCharacters,
  STARTER_CHARACTERS,
} from '@/lib/game/roster';
import {
  BattleAction,
  BattleState,
  CharacterDefinition,
  MatchSummaryRecord,
  TeamSide,
} from '@/lib/game/types';
import { persistence } from '@/lib/persistence/adapter';
import { BattleAnalyticsSummary } from './BattleAnalyticsSummary';
import { BattleArena } from './BattleArena';
import { CollectionView } from './CollectionView';
import { ErrorBoundary } from './ErrorBoundary';
import { EvolutionChamber } from './EvolutionChamber';
import { FirebaseProvider, useFirebaseAuth } from './FirebaseProvider';
import { MarketplaceView } from './MarketplaceView';
import { MatchReplayViewer } from './MatchReplayViewer';
import { MultiplayerLobby } from './MultiplayerLobby';
import { OracleStudio } from './OracleStudio';
import { SocialClanView, SocialTab } from './SocialClanView';
import { TitleScreen } from './TitleScreen';
import { TradingHubView } from './TradingHubView';

type AppScreen =
  | 'title'
  | 'collection'
  | 'studio'
  | 'evolution'
  | 'battle'
  | 'multiplayer'
  | 'pvp-battle'
  | 'marketplace'
  | 'trading'
  | 'social'
  | 'replay'
  | 'analytics';

interface OracleArenaAppProps {
  initialAutoStart?: boolean;
  initialRoomCode?: string;
}

function mergeLocalAndCloudCards(
  localCards: CharacterDefinition[],
  cloudCards: CharacterDefinition[]
): {
  merged: CharacterDefinition[];
  toUpload: CharacterDefinition[];
} {
  const byId = new Map<string, CharacterDefinition>();
  for (const c of localCards) {
    byId.set(c.id, normalizeCharacterProgression(c));
  }

  const cloudById = new Map<string, CharacterDefinition>();
  for (const c of cloudCards) {
    cloudById.set(c.id, normalizeCharacterProgression(c));
  }

  const toUpload: CharacterDefinition[] = [];

  for (const [id, cloudCard] of cloudById.entries()) {
    const localCard = byId.get(id);
    if (!localCard) {
      byId.set(id, cloudCard);
    } else if (
      cloudCard.xp > localCard.xp ||
      cloudCard.evolutionStage > localCard.evolutionStage ||
      cloudCard.learnedAbilities.length > localCard.learnedAbilities.length
    ) {
      byId.set(id, cloudCard);
    } else if (
      localCard.xp > cloudCard.xp ||
      localCard.evolutionStage > cloudCard.evolutionStage ||
      localCard.learnedAbilities.length > cloudCard.learnedAbilities.length
    ) {
      toUpload.push(localCard);
    }
  }

  for (const localCard of localCards) {
    const isCustom = localCard.id.startsWith('chr-custom-');
    const hasProgress =
      localCard.xp > 0 ||
      localCard.level > 1 ||
      localCard.evolutionStage > 0 ||
      localCard.combatRecord.matchesPlayed > 0;
    if (!cloudById.has(localCard.id) && (isCustom || hasProgress)) {
      toUpload.push(localCard);
    }
  }

  const mergedAll = Array.from(byId.values());
  const custom = mergedAll.filter((c) => c.id.startsWith('chr-custom-'));
  const starters = STARTER_CHARACTERS.map(
    (s) => byId.get(s.id) ?? normalizeCharacterProgression(s)
  );
  return {
    merged: [...custom, ...starters],
    toUpload,
  };
}

function OracleArenaShell({
  initialAutoStart = false,
  initialRoomCode = '',
}: OracleArenaAppProps) {
  const { user, profile } = useFirebaseAuth();

  const [screen, setScreen] = useState<AppScreen>(
    initialAutoStart
      ? 'battle'
      : initialRoomCode.length === 6
        ? 'multiplayer'
        : 'title'
  );
  const [allCharacters, setAllCharacters] =
    useState<CharacterDefinition[]>(STARTER_CHARACTERS);
  const [squadIds, setSquadIds] = useState<string[]>(DEFAULT_PLAYER_SQUAD_IDS);
  const [matchHistory, setMatchHistory] = useState<MatchSummaryRecord[]>([]);
  const [battleInstanceKey, setBattleInstanceKey] = useState(1);
  const [battleSeed, setBattleSeed] = useState(42026);
  const [evolutionFocusId, setEvolutionFocusId] = useState<string | null>(null);
  const [selectedReplayMatchId, setSelectedReplayMatchId] = useState<
    string | null
  >(null);
  const [socialInitialTab, setSocialInitialTab] =
    useState<SocialTab>('leaderboard');
  const [syncingCloud, setSyncingCloud] = useState(false);

  // Active Multiplayer Room state
  const [prefilledRoomCode, setPrefilledRoomCode] = useState(initialRoomCode);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<BattleRoomDoc | null>(null);
  const [submittingMove, setSubmittingMove] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Live Canonical Tradable Cards Registry (Phase 5 Marketplace & Trading Hub)
  const [tradableCatalog, setTradableCatalog] = useState<TradableCardDoc[]>([]);

  const syncedUidRef = useRef<string | null>(null);

  // Hydrate local persistence on mount
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setAllCharacters(persistence.getCollection());
      setSquadIds(persistence.getPlayerSquadIds());
      setMatchHistory(persistence.getMatchHistory());
    });
    return () => {
      active = false;
    };
  }, []);

  // Cloud Sync on Google Sign-In (merges local + Cloud Firestore cards, progression, squad & matches)
  useEffect(() => {
    if (!user || !profile) {
      if (!user) syncedUidRef.current = null;
      return;
    }
    if (syncedUidRef.current === user.uid) return;
    syncedUidRef.current = user.uid;

    let cancelled = false;
    setSyncingCloud(true);

    (async () => {
      try {
        const [cloudCards, cloudMatches] = await Promise.all([
          fetchCloudCards(user.uid),
          fetchCloudMatches(user.uid),
        ]);
        if (cancelled) return;

        const localCollection = persistence.getCollection();
        const { merged, toUpload } = mergeLocalAndCloudCards(
          localCollection,
          cloudCards
        );

        // Save merged custom cards & progression locally so offline/local state matches cloud
        for (const card of merged) {
          if (card.id.startsWith('chr-custom-')) {
            persistence.saveCustomCharacter(card);
          }
        }
        persistence.saveCharacterProgressions(merged);
        setAllCharacters(persistence.getCollection());

        // Restore cloud squad if valid against merged collection
        const validIds = new Set(merged.map((c) => c.id));
        if (
          profile.activeSquadIds.length === 5 &&
          profile.activeSquadIds.every((id) => validIds.has(id))
        ) {
          setSquadIds(profile.activeSquadIds);
          persistence.savePlayerSquadIds(profile.activeSquadIds);
        }

        // Merge match history (deduplicated by matchId while preserving local exact replayLog)
        const localHistory = persistence.getMatchHistory();
        const localById = new Map(localHistory.map((m) => [m.matchId, m]));
        const historyMap = new Map<string, MatchSummaryRecord>();
        for (const m of [...localHistory, ...cloudMatches]) {
          const existing = historyMap.get(m.matchId);
          if (!existing) {
            const localMatch = localById.get(m.matchId);
            historyMap.set(
              m.matchId,
              localMatch?.replayLog
                ? {
                    ...m,
                    replayLog: localMatch.replayLog,
                    replayUnitSnapshots: localMatch.replayUnitSnapshots,
                    opponentName: m.opponentName ?? localMatch.opponentName,
                    mode: m.mode ?? localMatch.mode,
                  }
                : m
            );
          }
        }
        const mergedHistory = Array.from(historyMap.values()).sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setMatchHistory(mergedHistory.slice(0, 20));

        // Push any newer local cards/progress up to Cloud Firestore
        if (toUpload.length > 0) {
          await saveCardsToCloud(user.uid, toUpload);
        }

        // Register user's custom cards into the canonical /tradableCards registry
        const ownerDisplayName =
          profile.displayName || user.displayName || 'Arena Tactician';
        const customCards = merged.filter((c) => isCardTradable(c));
        for (const customCard of customCards) {
          void syncCustomCardToRegistry(
            user.uid,
            ownerDisplayName,
            customCard
          ).catch((regErr) =>
            console.error('Tradable card registration warning:', regErr)
          );
        }
      } catch (err) {
        console.error('Cloud sync warning:', err);
      } finally {
        if (!cancelled) setSyncingCloud(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, profile]);

  // Live subscription to canonical /tradableCards registry & real-time ownership reconciliation
  useEffect(() => {
    if (!user) return;

    const unsub = subscribeTradableCardsCatalog(
      (catalog) => {
        setTradableCatalog(catalog);

        const currentLocal = persistence.getCollection();
        const currentSquad = persistence.getPlayerSquadIds();
        const reconciled = reconcileOwnedTradableCards({
          localCollection: currentLocal,
          allKnownTradableCards: catalog,
          activeSquadIds: currentSquad,
          userUid: user.uid,
        });

        if (reconciled.addedIds.length > 0 || reconciled.removedIds.length > 0) {
          for (const removedId of reconciled.removedIds) {
            persistence.deleteCustomCharacter(removedId);
            void deleteCustomCardFromCloud(user.uid, removedId).catch((err) =>
              console.error('Transferred card cloud cleanup warning:', err)
            );
          }
          for (const addedId of reconciled.addedIds) {
            const acquired = reconciled.nextCollection.find(
              (c) => c.id === addedId
            );
            if (acquired) {
              persistence.saveCustomCharacter(acquired);
              void saveCardToCloud(user.uid, acquired).catch((err) =>
                console.error('Acquired card cloud sync warning:', err)
              );
            }
          }
          persistence.savePlayerSquadIds(reconciled.nextSquadIds);
          setAllCharacters(persistence.getCollection());
          setSquadIds(reconciled.nextSquadIds);

          const nextCustomCount = reconciled.nextCollection.filter((c) =>
            isCardTradable(c)
          ).length;
          void updateProfileSquadAndCount(
            user.uid,
            reconciled.nextSquadIds,
            nextCustomCount
          ).catch((err) =>
            console.error('Reconciled profile sync warning:', err)
          );
        }
      },
      (err) => {
        console.error('Tradable cards subscription warning:', err);
      }
    );

    return () => unsub();
  }, [user]);

  // Live subscription to active PvP room when in 'pvp-battle' screen
  useEffect(() => {
    if (screen !== 'pvp-battle' || !activeRoomId || !user) {
      return;
    }

    const unsub = subscribeBattleRoom(
      activeRoomId,
      (room) => {
        setActiveRoom(room);
      },
      (err) => {
        console.error('Active PvP room subscription error:', err);
        setMoveError('Lost live connection to PvP room.');
      }
    );

    return () => unsub();
  }, [screen, activeRoomId, user]);

  const customCardCount = useMemo(
    () => allCharacters.filter((c) => c.id.startsWith('chr-custom-')).length,
    [allCharacters]
  );

  const syncBodyState = useCallback(
    (state: 'title' | 'playing' | 'paused' | 'gameover') => {
      if (typeof document !== 'undefined') {
        document.body.dataset.state = state;
      }
    },
    []
  );

  useEffect(() => {
    if (screen !== 'battle' && screen !== 'pvp-battle') {
      syncBodyState('title');
    }
  }, [screen, syncBodyState]);

  const handleSquadChange = useCallback(
    (nextIds: string[]) => {
      setSquadIds(nextIds);
      if (nextIds.length === 5) {
        persistence.savePlayerSquadIds(nextIds);
        if (user) {
          void updateProfileSquadAndCount(user.uid, nextIds, customCardCount).catch(
            (err) => console.error('Cloud squad update failed:', err)
          );
        }
      }
    },
    [user, customCardCount]
  );

  const handleStartBattle = useCallback(() => {
    if (
      typeof document !== 'undefined' &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
    setBattleSeed(Math.floor(10000 + Math.random() * 89999));
    setBattleInstanceKey((k) => k + 1);
    syncBodyState('playing');
    setScreen('battle');
  }, [syncBodyState]);

  const handleOpenEvolutionChamber = useCallback((focusDefId?: string) => {
    setEvolutionFocusId(focusDefId ?? null);
    setScreen('evolution');
  }, []);

  const handleOpenReplay = useCallback((matchId?: string) => {
    setSelectedReplayMatchId(matchId ?? null);
    setScreen('replay');
  }, []);

  const handleApproveCustomCard = useCallback(
    (card: CharacterDefinition, deployAndBattle: boolean) => {
      const attributedCard: CharacterDefinition = user
        ? {
            ...card,
            originalCreatorId: user.uid,
            originalCreatorName:
              profile?.displayName || user.displayName || card.originalCreatorName,
            currentOwnerId: user.uid,
          }
        : card;

      persistence.saveCustomCharacter(attributedCard);
      const nextCollection = persistence.getCollection();
      setAllCharacters(nextCollection);

      const nextCustomCount = nextCollection.filter((c) =>
        c.id.startsWith('chr-custom-')
      ).length;

      if (user) {
        const ownerDisplayName =
          profile?.displayName || user.displayName || 'Arena Tactician';
        void saveCardToCloud(user.uid, attributedCard).catch((err) =>
          console.error('Cloud custom card save failed:', err)
        );
        void syncCustomCardToRegistry(
          user.uid,
          ownerDisplayName,
          attributedCard
        ).catch((err) =>
          console.error('Tradable registry save failed:', err)
        );
      }

      if (deployAndBattle) {
        const nextSquad = [
          attributedCard.id,
          ...squadIds.filter((id) => id !== attributedCard.id),
        ].slice(0, 5);
        for (const fallbackId of DEFAULT_PLAYER_SQUAD_IDS) {
          if (nextSquad.length >= 5) break;
          if (!nextSquad.includes(fallbackId)) nextSquad.push(fallbackId);
        }
        setSquadIds(nextSquad);
        persistence.savePlayerSquadIds(nextSquad);
        if (user) {
          void updateProfileSquadAndCount(
            user.uid,
            nextSquad,
            nextCustomCount
          ).catch((err) => console.error('Cloud squad sync failed:', err));
        }
        setBattleSeed(Math.floor(10000 + Math.random() * 89999));
        setBattleInstanceKey((k) => k + 1);
        syncBodyState('playing');
        setScreen('battle');
      } else if (user) {
        void updateProfileSquadAndCount(
          user.uid,
          squadIds,
          nextCustomCount
        ).catch((err) => console.error('Cloud custom count sync failed:', err));
      }
    },
    [squadIds, syncBodyState, user, profile]
  );

  const handleDeleteCustomCard = useCallback(
    (cardId: string) => {
      persistence.deleteCustomCharacter(cardId);
      const nextCollection = persistence.getCollection();
      setAllCharacters(nextCollection);
      const nextCustomCount = nextCollection.filter((c) =>
        c.id.startsWith('chr-custom-')
      ).length;

      let nextSquad = squadIds;
      if (squadIds.includes(cardId)) {
        const remaining = squadIds.filter((id) => id !== cardId);
        for (const fallbackId of DEFAULT_PLAYER_SQUAD_IDS) {
          if (remaining.length >= 5) break;
          if (!remaining.includes(fallbackId)) remaining.push(fallbackId);
        }
        nextSquad = remaining;
        setSquadIds(remaining);
        persistence.savePlayerSquadIds(remaining);
      }

      if (user) {
        void deleteCustomCardFromCloud(user.uid, cardId).catch((err) =>
          console.error('Cloud card delete failed:', err)
        );
        void removeCustomCardFromRegistry(user.uid, cardId).catch((err) =>
          console.error('Tradable registry delete failed:', err)
        );
        void updateProfileSquadAndCount(
          user.uid,
          nextSquad,
          nextCustomCount
        ).catch((err) => console.error('Cloud count sync failed:', err));
      }
    },
    [squadIds, user]
  );

  const handleUpdateCharacter = useCallback(
    (updated: CharacterDefinition) => {
      const nextCollection = persistence.saveCharacterProgression(updated);
      setAllCharacters(nextCollection);
      if (user) {
        void saveCardToCloud(user.uid, updated).catch((err) =>
          console.error('Cloud progression sync failed:', err)
        );
        if (isCardTradable(updated)) {
          const ownerDisplayName =
            profile?.displayName || user.displayName || 'Arena Tactician';
          void syncCustomCardToRegistry(
            user.uid,
            ownerDisplayName,
            updated
          ).catch((err) =>
            console.error('Tradable registry progression sync failed:', err)
          );
        }
      }
    },
    [user, profile]
  );

  const handleMatchFinished = useCallback(
    (
      summary: MatchSummaryRecord,
      finalBattle: BattleState,
      options?: {
        mode: 'solo' | 'multiplayer';
        viewerSide: TeamSide;
        overrideWinner?: TeamSide;
        opponentName?: string;
      }
    ): BattleXpGrant[] => {
      persistence.recordMatchSummary(summary);
      setMatchHistory((prev) => [summary, ...prev].slice(0, 20));

      const mode = options?.mode ?? 'solo';
      const viewerSide = options?.viewerSide ?? 'player';
      const opponentName = options?.opponentName ?? 'Arena AI Vanguard';
      const didViewerWin = summary.winner === 'player';

      const currentCollection = persistence.getCollection();
      const { grants, updatedCharacters } = computeValidatedBattleRewards(
        finalBattle,
        currentCollection,
        viewerSide,
        options?.overrideWinner
      );

      const updatedList = Object.values(updatedCharacters);
      if (updatedList.length > 0) {
        const nextCollection = persistence.saveCharacterProgressions(updatedList);
        setAllCharacters(nextCollection);
      }

      if (user) {
        const ownerDisplayName =
          profile?.displayName || user.displayName || 'Arena Tactician';
        void recordCloudMatchAndRating(
          user.uid,
          summary,
          mode,
          opponentName,
          didViewerWin
        ).catch((err) => console.error('Cloud match record failed:', err));

        const shardReward = computeMatchShardReward(didViewerWin, mode);
        void awardMatchShards(user.uid, shardReward).catch((err) =>
          console.error('Cloud shard reward failed:', err)
        );

        if (updatedList.length > 0) {
          void saveCardsToCloud(user.uid, updatedList).catch((err) =>
            console.error('Cloud XP sync failed:', err)
          );
          for (const updatedCard of updatedList) {
            if (isCardTradable(updatedCard)) {
              void syncCustomCardToRegistry(
                user.uid,
                ownerDisplayName,
                updatedCard
              ).catch((err) =>
                console.error('Tradable card XP sync failed:', err)
              );
            }
          }
        }
      }

      return grants;
    },
    [user, profile]
  );

  const handleEnterPvpRoom = useCallback(
    (roomId: string) => {
      setMoveError(null);
      setActiveRoom(null);
      setActiveRoomId(roomId);
      syncBodyState('playing');
      setScreen('pvp-battle');
    },
    [syncBodyState]
  );

  const handleSubmitPvpAction = useCallback(
    async (action: BattleAction) => {
      if (!user || !activeRoom || !hasActiveBattleState(activeRoom.battleState)) {
        return;
      }
      const viewerSide = getViewerSide(activeRoom, user.uid);
      if (!viewerSide) return;

      setMoveError(null);
      setSubmittingMove(true);

      try {
        // 1. Validate turn authoritatively via Ruleset 1.0 Next.js API route
        const response = await fetch('/api/multiplayer/validate-turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            battleState: activeRoom.battleState,
            action,
            expectedSide: viewerSide,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          setMoveError(
            data?.error || 'Server rejected this turn as invalid.'
          );
          return;
        }

        // 2. Commit validated next BattleState + immutable move doc atomically to Firestore
        await commitValidatedMultiplayerMove(
          activeRoom,
          user.uid,
          viewerSide,
          action,
          data as ValidatedTurnResult
        );
      } catch (err) {
        setMoveError(
          err instanceof Error
            ? err.message
            : 'Unable to commit validated move to Cloud Firestore.'
        );
      } finally {
        setSubmittingMove(false);
      }
    },
    [user, activeRoom]
  );

  const handleForfeitPvp = useCallback(async () => {
    if (!user || !activeRoom) return;
    setMoveError(null);
    try {
      await forfeitActiveRoom(activeRoom, user.uid);
    } catch (err) {
      setMoveError(
        err instanceof Error ? err.message : 'Unable to process forfeit.'
      );
    }
  }, [user, activeRoom]);

  const activePlayerSquad = useMemo(() => {
    const squad = getSquadCharacters(squadIds, allCharacters);
    return squad.length === 5
      ? squad
      : getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS, allCharacters);
  }, [squadIds, allCharacters]);

  const activeEnemySquad = useMemo(
    () =>
      getComplementaryEnemySquad(
        activePlayerSquad.map((c) => c.id),
        STARTER_CHARACTERS
      ),
    [activePlayerSquad]
  );

  const activeTradableCatalog = useMemo(
    () => (user ? tradableCatalog : []),
    [user, tradableCatalog]
  );

  // Real-time PvP Battle Arena
  if (screen === 'pvp-battle') {
    const viewerSide =
      activeRoom && user ? getViewerSide(activeRoom, user.uid) : null;

    if (
      !user ||
      !activeRoom ||
      !viewerSide ||
      !hasActiveBattleState(activeRoom.battleState)
    ) {
      return (
        <main className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col items-center justify-center p-6 gap-4">
          <Loader2 className="w-7 h-7 animate-spin text-[#D4AF37]" />
          <p className="font-display text-lg text-[#F5EFE0]">
            Synchronizing 5v5 PvP Arena...
          </p>
          <button
            type="button"
            onClick={() => {
              setActiveRoomId(null);
              setActiveRoom(null);
              setScreen('multiplayer');
            }}
            className="px-4 py-2 rounded-md border border-white/15 text-xs text-[#C4C9D8] hover:text-white hover:bg-white/5 cursor-pointer"
          >
            Return to Multiplayer Lobby
          </button>
        </main>
      );
    }

    const viewerName =
      viewerSide === 'player' ? activeRoom.hostName : activeRoom.guestName;
    const opponentName =
      viewerSide === 'player' ? activeRoom.guestName : activeRoom.hostName;

    const pvpCharacters = [
      ...allCharacters,
      ...activeRoom.hostSquad,
      ...activeRoom.guestSquad,
    ];

    const multiplayerContext: MultiplayerBattleContext = {
      room: activeRoom,
      viewerSide,
      viewerName,
      opponentName: opponentName || 'Challenger',
      eloDeltaPreview: { win: 25, loss: -15 },
      submittingMove,
      moveError,
      onSubmitPvpAction: handleSubmitPvpAction,
      onForfeitPvp: handleForfeitPvp,
      onReturnToLobby: () => {
        setActiveRoomId(null);
        setActiveRoom(null);
        setMoveError(null);
        setScreen('multiplayer');
      },
    };

    return (
      <BattleArena
        key={`pvp-${activeRoom.roomId}`}
        allCharacters={pvpCharacters}
        playerSquad={activeRoom.hostSquad}
        enemySquad={activeRoom.guestSquad}
        multiplayerContext={multiplayerContext}
        onMatchFinished={handleMatchFinished}
        onOpenCollection={() => setScreen('collection')}
        onOpenEvolutionChamber={handleOpenEvolutionChamber}
        onOpenMatchReplay={handleOpenReplay}
        onReturnTitle={() => setScreen('title')}
        onStateChange={syncBodyState}
      />
    );
  }

  if (screen === 'multiplayer') {
    return (
      <MultiplayerLobby
        key={`mp-${prefilledRoomCode}`}
        activeSquad={activePlayerSquad}
        initialRoomCode={prefilledRoomCode}
        syncingCloud={syncingCloud}
        onEnterRoom={handleEnterPvpRoom}
        onStartSoloBattle={handleStartBattle}
        onOpenCollection={() => setScreen('collection')}
        onOpenEvolutionChamber={() => handleOpenEvolutionChamber()}
        onBackToTitle={() => setScreen('title')}
      />
    );
  }

  if (screen === 'battle') {
    return (
      <BattleArena
        key={battleInstanceKey}
        initialSeed={battleSeed}
        allCharacters={allCharacters}
        playerSquad={activePlayerSquad}
        enemySquad={activeEnemySquad}
        onMatchFinished={handleMatchFinished}
        onOpenCollection={() => setScreen('collection')}
        onOpenEvolutionChamber={handleOpenEvolutionChamber}
        onOpenMatchReplay={handleOpenReplay}
        onReturnTitle={() => setScreen('title')}
        onStateChange={syncBodyState}
      />
    );
  }

  if (screen === 'evolution') {
    return (
      <EvolutionChamber
        characters={allCharacters}
        initialSelectedId={evolutionFocusId}
        selectedSquadIds={squadIds}
        onUpdateCharacter={handleUpdateCharacter}
        onOpenCollection={() => setScreen('collection')}
        onOpenStudio={() => setScreen('studio')}
        onStartBattle={handleStartBattle}
        onBackToTitle={() => setScreen('title')}
      />
    );
  }

  if (screen === 'studio') {
    return (
      <OracleStudio
        existingCollection={allCharacters}
        onApproveCard={handleApproveCustomCard}
        onOpenCollection={() => setScreen('collection')}
        onBackToTitle={() => setScreen('title')}
      />
    );
  }

  if (screen === 'marketplace') {
    return (
      <MarketplaceView
        tradableCatalog={activeTradableCatalog}
        syncingCloud={syncingCloud}
        onOpenTradingHub={() => setScreen('trading')}
        onOpenStudio={() => setScreen('studio')}
        onOpenCollection={() => setScreen('collection')}
        onBackToTitle={() => setScreen('title')}
      />
    );
  }

  if (screen === 'trading') {
    return (
      <TradingHubView
        tradableCatalog={activeTradableCatalog}
        syncingCloud={syncingCloud}
        onOpenMarketplace={() => setScreen('marketplace')}
        onOpenStudio={() => setScreen('studio')}
        onOpenCollection={() => setScreen('collection')}
        onBackToTitle={() => setScreen('title')}
      />
    );
  }

  if (screen === 'collection') {
    return (
      <CollectionView
        characters={allCharacters}
        selectedSquadIds={squadIds}
        onChangeSquad={handleSquadChange}
        onDeleteCustomCard={handleDeleteCustomCard}
        onOpenStudio={() => setScreen('studio')}
        onOpenEvolutionChamber={handleOpenEvolutionChamber}
        onOpenMarketplace={() => setScreen('marketplace')}
        onOpenTradingHub={() => setScreen('trading')}
        onStartBattle={handleStartBattle}
        onBackToTitle={() => setScreen('title')}
      />
    );
  }

  if (screen === 'social') {
    return (
      <SocialClanView
        key={`social-${socialInitialTab}`}
        tradableCatalog={activeTradableCatalog}
        characters={allCharacters}
        recentMatches={matchHistory}
        syncingCloud={syncingCloud}
        initialTab={socialInitialTab}
        onOpenMultiplayer={(roomCode) => {
          if (roomCode) {
            setPrefilledRoomCode(roomCode);
          }
          setScreen('multiplayer');
        }}
        onOpenMarketplace={() => setScreen('marketplace')}
        onOpenTradingHub={() => setScreen('trading')}
        onStartSoloBattle={handleStartBattle}
        onBackToTitle={() => setScreen('title')}
      />
    );
  }

  if (screen === 'replay') {
    return (
      <MatchReplayViewer
        key={`replay-${selectedReplayMatchId ?? 'latest'}`}
        matches={matchHistory}
        initialMatchId={selectedReplayMatchId}
        allCharacters={allCharacters}
        syncingCloud={syncingCloud}
        onStartBattle={handleStartBattle}
        onOpenCollection={() => setScreen('collection')}
        onOpenAnalytics={() => setScreen('analytics')}
        onBackToTitle={() => setScreen('title')}
      />
    );
  }

  if (screen === 'analytics') {
    return (
      <BattleAnalyticsSummary
        matches={matchHistory}
        allCharacters={allCharacters}
        syncingCloud={syncingCloud}
        onStartBattle={handleStartBattle}
        onOpenReplay={handleOpenReplay}
        onOpenCollection={() => setScreen('collection')}
        onBackToTitle={() => setScreen('title')}
      />
    );
  }

  return (
    <TitleScreen
      onStartBattle={handleStartBattle}
      onOpenMultiplayer={() => setScreen('multiplayer')}
      onOpenStudio={() => setScreen('studio')}
      onOpenCollection={() => setScreen('collection')}
      onOpenEvolutionChamber={() => handleOpenEvolutionChamber()}
      onOpenMarketplace={() => setScreen('marketplace')}
      onOpenTradingHub={() => setScreen('trading')}
      onOpenSocial={() => {
        setSocialInitialTab('rankings');
        setScreen('social');
      }}
      onOpenLeaderboard={() => {
        setSocialInitialTab('leaderboard');
        setScreen('social');
      }}
      onOpenReplay={handleOpenReplay}
      onOpenAnalytics={() => setScreen('analytics')}
      recentMatches={matchHistory}
      customCardCount={customCardCount}
      syncingCloud={syncingCloud}
    />
  );
}

export function OracleArenaApp(props: OracleArenaAppProps) {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <OracleArenaShell {...props} />
      </FirebaseProvider>
    </ErrorBoundary>
  );
}
