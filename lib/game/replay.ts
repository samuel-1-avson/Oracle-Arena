import { chooseTacticalAction } from './bot';
import {
  createBattle,
  executeAction,
  findAbility,
  isActionLegal,
} from './engine';
import { DEFAULT_PLAYER_SQUAD_IDS, STARTER_CHARACTERS } from './roster';
import {
  AbilityCategory,
  BattleAction,
  BattleEvent,
  BattleReplayEntry,
  BattleState,
  CharacterDefinition,
  CombatRole,
  ElementAffinity,
  MatchSummaryRecord,
  ReplayUnitStatSnapshot,
  StatusEffectType,
  TeamSide,
} from './types';

export type ReplayReconstructionMode = 'recorded' | 'simulated';

export interface ReplayUnitTurnDelta {
  unitId: string;
  damageTaken: number;
  shieldAbsorbed: number;
  healingReceived: number;
  shieldGained: number;
  statusesApplied: StatusEffectType[];
  ko: boolean;
  stunned: boolean;
}

export interface ReplayFrame {
  frameIndex: number;
  turnNumber: number;
  round: number;
  actorId: string | null;
  actorName: string;
  actorSide: TeamSide | null;
  abilityId: string | null;
  abilityName: string;
  abilityCategory: AbilityCategory | null;
  targetIds: string[];
  targetNames: string[];
  events: BattleEvent[];
  unitDeltas: Record<string, ReplayUnitTurnDelta>;
  totalDamage: number;
  totalHealing: number;
  totalShield: number;
  koUnitIds: string[];
  koUnitNames: string[];
  isKeyMoment: boolean;
  keyMomentLabel: string | null;
  headline: string;
  state: BattleState;
}

export interface ReplayRoundSummary {
  round: number;
  playerDamage: number;
  enemyDamage: number;
  playerHealing: number;
  enemyHealing: number;
  playerShield: number;
  enemyShield: number;
  kos: number;
  startFrameIndex: number;
  endFrameIndex: number;
}

export interface ReplayUnitPerformance {
  instanceId: string;
  definitionId: string;
  name: string;
  title: string;
  side: TeamSide;
  role: CombatRole;
  element: ElementAffinity;
  artworkUrl: string;
  alive: boolean;
  finalHp: number;
  maxHp: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  shieldGranted: number;
  abilitiesUsed: number;
  kosScored: number;
  mvpScore: number;
}

export interface ReplayStrategicInsights {
  mvpUnit: ReplayUnitPerformance | null;
  biggestTurnFrameIndex: number | null;
  biggestTurnDamage: number;
  keyMomentFrameIndices: number[];
  roundSummaries: ReplayRoundSummary[];
  unitPerformances: ReplayUnitPerformance[];
  playerTotals: {
    damage: number;
    healing: number;
    shield: number;
    kos: number;
    survivors: number;
  };
  enemyTotals: {
    damage: number;
    healing: number;
    shield: number;
    kos: number;
    survivors: number;
  };
  tacticalTakeaways: string[];
}

export interface MatchReplayTimeline {
  summary: MatchSummaryRecord;
  mode: ReplayReconstructionMode;
  frames: ReplayFrame[];
  insights: ReplayStrategicInsights;
  substitutedCharacterIds: string[];
  recordedActionsMatched: number;
  totalRecordedActions: number;
}

const MAX_REPLAY_TURNS = 140;

function flipInstanceIdSide(instanceId: string): string {
  if (instanceId.startsWith('player-')) {
    return `enemy-${instanceId.slice('player-'.length)}`;
  }
  if (instanceId.startsWith('enemy-')) {
    return `player-${instanceId.slice('enemy-'.length)}`;
  }
  return instanceId;
}

/**
 * Extracts compact replay metadata (turn-by-turn action log + lightweight unit stat snapshots)
 * from a completed BattleState so the match can later be replayed with 100% deterministic fidelity
 * even after champions level up or evolve.
 */
export function createReplayMetadataFromBattle(
  battle: BattleState,
  viewerSide: TeamSide = 'player',
  rosterReference: CharacterDefinition[] = []
): {
  replayLog: BattleReplayEntry[];
  replayUnitSnapshots: Record<string, ReplayUnitStatSnapshot>;
} {
  const shouldFlip = viewerSide === 'enemy';
  const rosterById = new Map(rosterReference.map((c) => [c.id, c]));

  const replayLog: BattleReplayEntry[] = battle.replayLog.map((entry) => ({
    turnNumber: entry.turnNumber,
    round: entry.round,
    action: shouldFlip
      ? {
          actorId: flipInstanceIdSide(entry.action.actorId),
          abilityId: entry.action.abilityId,
          targetIds: entry.action.targetIds.map(flipInstanceIdSide),
        }
      : {
          actorId: entry.action.actorId,
          abilityId: entry.action.abilityId,
          targetIds: [...entry.action.targetIds],
        },
  }));

  const replayUnitSnapshots: Record<string, ReplayUnitStatSnapshot> = {};
  for (const unit of battle.units) {
    const orientedSide: TeamSide = shouldFlip
      ? unit.side === 'player'
        ? 'enemy'
        : 'player'
      : unit.side;
    const def = rosterById.get(unit.definitionId);
    const key = `${orientedSide}:${unit.definitionId}`;
    replayUnitSnapshots[key] = {
      maxHp: unit.maxHp,
      attack: unit.attack,
      defense: unit.defense,
      speed: unit.speed,
      maxEnergy: unit.maxEnergy,
      startingEnergy: def?.stats.startingEnergy ?? 35,
      healingPower: unit.healingPower,
      level: def?.level ?? 1,
      evolutionStage: def?.evolutionStage ?? 0,
    };
  }

  return { replayLog, replayUnitSnapshots };
}

function applyStatSnapshot(
  card: CharacterDefinition,
  snapshot?: ReplayUnitStatSnapshot
): CharacterDefinition {
  if (!snapshot) return card;
  return {
    ...card,
    level: snapshot.level,
    evolutionStage: snapshot.evolutionStage,
    stats: {
      maxHp: snapshot.maxHp,
      attack: snapshot.attack,
      defense: snapshot.defense,
      speed: snapshot.speed,
      maxEnergy: snapshot.maxEnergy,
      startingEnergy: snapshot.startingEnergy,
      healingPower: snapshot.healingPower,
    },
  };
}

function resolveReplaySquad(
  squadIds: string[],
  side: TeamSide,
  availableCharacters: CharacterDefinition[],
  snapshots: Record<string, ReplayUnitStatSnapshot> | undefined,
  substitutedOut: string[]
): CharacterDefinition[] {
  const byId = new Map<string, CharacterDefinition>();
  for (const starter of STARTER_CHARACTERS) {
    byId.set(starter.id, starter);
  }
  for (const ch of availableCharacters) {
    byId.set(ch.id, ch);
  }

  const fallbackPool =
    side === 'player'
      ? DEFAULT_PLAYER_SQUAD_IDS.map((id) => byId.get(id)).filter(
          (c): c is CharacterDefinition => Boolean(c)
        )
      : STARTER_CHARACTERS.filter(
          (s) => !DEFAULT_PLAYER_SQUAD_IDS.includes(s.id)
        );

  const chosen: CharacterDefinition[] = [];
  const usedFallbackIds = new Set<string>();

  for (let i = 0; i < 5; i += 1) {
    const requestedId = squadIds[i];
    const found = requestedId ? byId.get(requestedId) : undefined;
    if (found) {
      const snap = snapshots?.[`${side}:${found.id}`];
      chosen.push(applyStatSnapshot(found, snap));
    } else {
      if (requestedId) substitutedOut.push(requestedId);
      const fallback =
        fallbackPool.find((c) => !usedFallbackIds.has(c.id)) ??
        STARTER_CHARACTERS[i % STARTER_CHARACTERS.length];
      usedFallbackIds.add(fallback.id);
      const snap = requestedId ? snapshots?.[`${side}:${requestedId}`] : undefined;
      chosen.push(applyStatSnapshot(fallback, snap));
    }
  }

  return chosen;
}

function emptyDelta(unitId: string): ReplayUnitTurnDelta {
  return {
    unitId,
    damageTaken: 0,
    shieldAbsorbed: 0,
    healingReceived: 0,
    shieldGained: 0,
    statusesApplied: [],
    ko: false,
    stunned: false,
  };
}

function buildFrameFromTurn(
  frameIndex: number,
  prevState: BattleState,
  nextState: BattleState,
  action: BattleAction
): ReplayFrame {
  const prevUnitMap = new Map(prevState.units.map((u) => [u.instanceId, u]));
  const nextUnitMap = new Map(nextState.units.map((u) => [u.instanceId, u]));
  const actor = prevUnitMap.get(action.actorId) ?? nextUnitMap.get(action.actorId);
  const ability = actor ? findAbility(actor, action.abilityId) : undefined;

  const events = nextState.lastTurnEvents;
  const unitDeltas: Record<string, ReplayUnitTurnDelta> = {};
  const ensureDelta = (id: string) => {
    if (!unitDeltas[id]) unitDeltas[id] = emptyDelta(id);
    return unitDeltas[id];
  };

  let totalDamage = 0;
  let totalHealing = 0;
  let totalShield = 0;
  const koUnitIds: string[] = [];
  const koUnitNames: string[] = [];

  for (const evt of events) {
    if (evt.kind === 'damage' && evt.targetId) {
      const delta = ensureDelta(evt.targetId);
      const dmg = evt.amount ?? 0;
      const shd = evt.shieldAbsorbed ?? 0;
      delta.damageTaken += dmg;
      delta.shieldAbsorbed += shd;
      totalDamage += dmg + shd;
    } else if (evt.kind === 'status_tick' && evt.targetId) {
      const delta = ensureDelta(evt.targetId);
      const dmg = evt.amount ?? 0;
      const shd = evt.shieldAbsorbed ?? 0;
      delta.damageTaken += dmg;
      delta.shieldAbsorbed += shd;
      totalDamage += dmg + shd;
    } else if (evt.kind === 'heal' && evt.targetId) {
      const delta = ensureDelta(evt.targetId);
      const heal = evt.amount ?? 0;
      delta.healingReceived += heal;
      totalHealing += heal;
    } else if (evt.kind === 'shield' && evt.targetId) {
      const delta = ensureDelta(evt.targetId);
      const shield = evt.amount ?? 0;
      delta.shieldGained += shield;
      totalShield += shield;
    } else if (evt.kind === 'status_applied' && evt.targetId && evt.statusType) {
      const delta = ensureDelta(evt.targetId);
      if (!delta.statusesApplied.includes(evt.statusType)) {
        delta.statusesApplied.push(evt.statusType);
      }
    } else if (evt.kind === 'ko' && evt.targetId) {
      const delta = ensureDelta(evt.targetId);
      delta.ko = true;
      if (!koUnitIds.includes(evt.targetId)) {
        koUnitIds.push(evt.targetId);
        const fallen = nextUnitMap.get(evt.targetId) ?? prevUnitMap.get(evt.targetId);
        koUnitNames.push(fallen?.name ?? 'Champion');
      }
    } else if (evt.kind === 'stunned' && evt.targetId) {
      const delta = ensureDelta(evt.targetId);
      delta.stunned = true;
    }
  }

  const targetNames = action.targetIds
    .map((id) => prevUnitMap.get(id)?.name ?? nextUnitMap.get(id)?.name)
    .filter((n): n is string => Boolean(n));

  const actionEvent = events.find((e) => e.kind === 'action_used');
  const actorName = actor?.name ?? 'Champion';
  const abilityName = ability?.name ?? actionEvent?.abilityName ?? action.abilityId;
  const headline =
    actionEvent?.message ??
    `${actorName} uses ${abilityName}${
      targetNames.length > 0 ? ` on ${targetNames.join(', ')}` : ''
    }.`;

  let isKeyMoment = false;
  let keyMomentLabel: string | null = null;
  if (nextState.phase !== 'active') {
    isKeyMoment = true;
    keyMomentLabel =
      nextState.winner === 'player' ? 'Final Blow · Victory' : 'Final Blow · Defeat';
  } else if (koUnitNames.length > 0) {
    isKeyMoment = true;
    keyMomentLabel =
      koUnitNames.length === 1
        ? `KO · ${koUnitNames[0]}`
        : `${koUnitNames.length}x KO`;
  } else if (ability?.category === 'ultimate') {
    isKeyMoment = true;
    keyMomentLabel = `Ultimate · ${abilityName}`;
  }

  const recordedEntry = nextState.replayLog[nextState.replayLog.length - 1];

  return {
    frameIndex,
    turnNumber: recordedEntry?.turnNumber ?? nextState.turnNumber,
    round: recordedEntry?.round ?? prevState.round,
    actorId: action.actorId,
    actorName,
    actorSide: actor?.side ?? null,
    abilityId: action.abilityId,
    abilityName,
    abilityCategory: ability?.category ?? null,
    targetIds: [...action.targetIds],
    targetNames,
    events,
    unitDeltas,
    totalDamage,
    totalHealing,
    totalShield,
    koUnitIds,
    koUnitNames,
    isKeyMoment,
    keyMomentLabel,
    headline,
    state: nextState,
  };
}

function buildInsights(
  frames: ReplayFrame[],
  summary: MatchSummaryRecord,
  mode: ReplayReconstructionMode
): ReplayStrategicInsights {
  const finalState = frames[frames.length - 1].state;

  let biggestTurnFrameIndex: number | null = null;
  let biggestTurnDamage = 0;

  const roundMap = new Map<number, ReplayRoundSummary>();

  for (const frame of frames) {
    if (frame.frameIndex === 0) continue;

    if (frame.totalDamage > biggestTurnDamage) {
      biggestTurnDamage = frame.totalDamage;
      biggestTurnFrameIndex = frame.frameIndex;
    }

    const r = frame.round;
    let bucket = roundMap.get(r);
    if (!bucket) {
      bucket = {
        round: r,
        playerDamage: 0,
        enemyDamage: 0,
        playerHealing: 0,
        enemyHealing: 0,
        playerShield: 0,
        enemyShield: 0,
        kos: 0,
        startFrameIndex: frame.frameIndex,
        endFrameIndex: frame.frameIndex,
      };
      roundMap.set(r, bucket);
    }
    bucket.endFrameIndex = frame.frameIndex;
    bucket.kos += frame.koUnitIds.length;

    if (frame.actorSide === 'player') {
      bucket.playerDamage += frame.totalDamage;
      bucket.playerHealing += frame.totalHealing;
      bucket.playerShield += frame.totalShield;
    } else if (frame.actorSide === 'enemy') {
      bucket.enemyDamage += frame.totalDamage;
      bucket.enemyHealing += frame.totalHealing;
      bucket.enemyShield += frame.totalShield;
    }
  }

  // Also promote the biggest single-turn damage spike as a Key Moment if not already flagged
  if (biggestTurnFrameIndex !== null && biggestTurnDamage >= 120) {
    const spikeFrame = frames[biggestTurnFrameIndex];
    if (spikeFrame && !spikeFrame.isKeyMoment) {
      spikeFrame.isKeyMoment = true;
      spikeFrame.keyMomentLabel = `Peak Burst · ${biggestTurnDamage} DMG`;
    }
  }

  const keyMomentFrameIndices = frames
    .filter((f) => f.isKeyMoment)
    .map((f) => f.frameIndex);

  const unitPerformances: ReplayUnitPerformance[] = finalState.units
    .map((u) => {
      const mvpScore = Math.round(
        u.statsTracker.damageDealt +
          u.statsTracker.healingDone * 1.15 +
          u.statsTracker.shieldGranted * 0.85 +
          u.statsTracker.kosScored * 140 +
          (u.alive ? 60 : 0)
      );
      return {
        instanceId: u.instanceId,
        definitionId: u.definitionId,
        name: u.name,
        title: u.title,
        side: u.side,
        role: u.role,
        element: u.element,
        artworkUrl: u.artworkUrl,
        alive: u.alive,
        finalHp: u.currentHp,
        maxHp: u.maxHp,
        damageDealt: u.statsTracker.damageDealt,
        damageTaken: u.statsTracker.damageTaken,
        healingDone: u.statsTracker.healingDone,
        shieldGranted: u.statsTracker.shieldGranted,
        abilitiesUsed: u.statsTracker.abilitiesUsed,
        kosScored: u.statsTracker.kosScored,
        mvpScore,
      };
    })
    .sort((a, b) => b.mvpScore - a.mvpScore);

  const mvpUnit = unitPerformances[0] ?? null;

  const playerUnits = unitPerformances.filter((u) => u.side === 'player');
  const enemyUnits = unitPerformances.filter((u) => u.side === 'enemy');

  const playerTotals = {
    damage: playerUnits.reduce((sum, u) => sum + u.damageDealt, 0),
    healing: playerUnits.reduce((sum, u) => sum + u.healingDone, 0),
    shield: playerUnits.reduce((sum, u) => sum + u.shieldGranted, 0),
    kos: playerUnits.reduce((sum, u) => sum + u.kosScored, 0),
    survivors: playerUnits.filter((u) => u.alive).length,
  };

  const enemyTotals = {
    damage: enemyUnits.reduce((sum, u) => sum + u.damageDealt, 0),
    healing: enemyUnits.reduce((sum, u) => sum + u.healingDone, 0),
    shield: enemyUnits.reduce((sum, u) => sum + u.shieldGranted, 0),
    kos: enemyUnits.reduce((sum, u) => sum + u.kosScored, 0),
    survivors: enemyUnits.filter((u) => u.alive).length,
  };

  const roundSummaries = Array.from(roundMap.values()).sort(
    (a, b) => a.round - b.round
  );

  // Build concise, factual tactical takeaways derived directly from timeline telemetry
  const tacticalTakeaways: string[] = [];

  const firstKoFrame = frames.find((f) => f.koUnitIds.length > 0);
  if (firstKoFrame) {
    tacticalTakeaways.push(
      `First elimination occurred on Round ${firstKoFrame.round}, Turn ${firstKoFrame.turnNumber}: ${firstKoFrame.actorName} defeated ${firstKoFrame.koUnitNames.join(', ')}.`
    );
  }

  if (biggestTurnFrameIndex !== null && biggestTurnDamage > 0) {
    const spike = frames[biggestTurnFrameIndex];
    tacticalTakeaways.push(
      `Peak burst turn was Turn ${spike.turnNumber} (${spike.actorName}'s ${spike.abilityName}) dealing ${biggestTurnDamage} total damage.`
    );
  }

  const playerSustain = playerTotals.healing + playerTotals.shield;
  const enemySustain = enemyTotals.healing + enemyTotals.shield;
  if (playerSustain > 0 || enemySustain > 0) {
    const sustainLeader =
      playerSustain >= enemySustain ? 'Your squad' : 'The opposing squad';
    const margin = Math.abs(playerSustain - enemySustain);
    tacticalTakeaways.push(
      `${sustainLeader} led defensive sustain (healing + shields) by +${margin} effective HP (${playerSustain} vs ${enemySustain}).`
    );
  }

  if (mode === 'simulated') {
    tacticalTakeaways.push(
      `Legacy match record (#${summary.seed}) re-visualized using Ruleset ${summary.rulesetVersion} deterministic tactical simulation.`
    );
  }

  return {
    mvpUnit,
    biggestTurnFrameIndex,
    biggestTurnDamage,
    keyMomentFrameIndices,
    roundSummaries,
    unitPerformances,
    playerTotals,
    enemyTotals,
    tacticalTakeaways,
  };
}

/**
 * Re-visualizes a MatchSummaryRecord as a complete turn-by-turn Replay Timeline.
 * - Uses exact recorded turn actions (`mode: 'recorded'`) whenever `summary.replayLog` is present and valid.
 * - Falls back transparently to deterministic seed-based Ruleset 1.0 simulation (`mode: 'simulated'`)
 *   for older/cloud-synced MatchSummaryRecord entries that predate action-tape recording.
 */
export function buildMatchReplayTimeline(
  summary: MatchSummaryRecord,
  availableCharacters: CharacterDefinition[] = STARTER_CHARACTERS
): MatchReplayTimeline {
  const substitutedCharacterIds: string[] = [];
  const playerSquad = resolveReplaySquad(
    summary.playerSquadIds,
    'player',
    availableCharacters,
    summary.replayUnitSnapshots,
    substitutedCharacterIds
  );
  const enemySquad = resolveReplaySquad(
    summary.enemySquadIds,
    'enemy',
    availableCharacters,
    summary.replayUnitSnapshots,
    substitutedCharacterIds
  );

  const initialState = createBattle(playerSquad, enemySquad, summary.seed);

  const frames: ReplayFrame[] = [
    {
      frameIndex: 0,
      turnNumber: 0,
      round: 1,
      actorId: initialState.activeUnitId,
      actorName:
        initialState.units.find((u) => u.instanceId === initialState.activeUnitId)
          ?.name ?? 'Opening Formation',
      actorSide:
        initialState.units.find((u) => u.instanceId === initialState.activeUnitId)
          ?.side ?? null,
      abilityId: null,
      abilityName: 'Opening Formation',
      abilityCategory: null,
      targetIds: [],
      targetNames: [],
      events: initialState.events,
      unitDeltas: {},
      totalDamage: 0,
      totalHealing: 0,
      totalShield: 0,
      koUnitIds: [],
      koUnitNames: [],
      isKeyMoment: false,
      keyMomentLabel: null,
      headline: `5v5 Arena deployment complete · Seed #${summary.seed} · First initiative ready.`,
      state: initialState,
    },
  ];

  const recordedLog = Array.isArray(summary.replayLog) ? summary.replayLog : [];
  let current = initialState;
  let recordedActionsMatched = 0;
  let allRecordedValid = recordedLog.length > 0;

  if (recordedLog.length > 0) {
    for (const entry of recordedLog) {
      if (current.phase !== 'active' || frames.length > MAX_REPLAY_TURNS) break;
      if (isActionLegal(current, entry.action)) {
        const next = executeAction(current, entry.action);
        frames.push(buildFrameFromTurn(frames.length, current, next, entry.action));
        current = next;
        recordedActionsMatched += 1;
      } else {
        allRecordedValid = false;
        break;
      }
    }
  }

  let mode: ReplayReconstructionMode =
    recordedLog.length > 0 && allRecordedValid ? 'recorded' : 'simulated';

  // If no recorded log existed (legacy/cloud match) or a recorded tape diverged before match end,
  // deterministically simulate remaining turns with the fair tactical engine using the same seed.
  if (mode === 'simulated') {
    while (current.phase === 'active' && frames.length <= MAX_REPLAY_TURNS) {
      const action = chooseTacticalAction(current);
      if (!action) break;
      const next = executeAction(current, action);
      frames.push(buildFrameFromTurn(frames.length, current, next, action));
      current = next;
    }
  } else if (current.phase === 'active' && recordedLog.length === 0) {
    mode = 'simulated';
  }

  const insights = buildInsights(frames, summary, mode);

  return {
    summary,
    mode,
    frames,
    insights,
    substitutedCharacterIds,
    recordedActionsMatched,
    totalRecordedActions: recordedLog.length,
  };
}
