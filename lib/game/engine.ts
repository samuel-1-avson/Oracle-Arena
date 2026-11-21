import { getCardTierForLevel } from './card-tiers';
import { GauntletBossEncounter } from './gauntlet';
import { createInitialRngState, nextRandom, nextRandomRange } from './rng';
import { STANDARD_GUARD_ABILITY } from './roster';
import { computeSquadSynergies, getElementalMatchup } from './synergy';
import {
  AbilityDefinition,
  ActiveStatusEffect,
  BattleAction,
  BattleEvent,
  BattleState,
  BattleUnit,
  CharacterDefinition,
  RULESET_VERSION,
  StatusEffectType,
  TeamSide,
} from './types';

const PASSIVE_TURN_ENERGY_REGEN = 10;

function cloneUnit(unit: BattleUnit): BattleUnit {
  return {
    ...unit,
    cooldowns: { ...unit.cooldowns },
    statuses: unit.statuses.map((s) => ({ ...s })),
    statsTracker: { ...unit.statsTracker },
  };
}

function createEventId(round: number, turnNumber: number, idx: number): string {
  return `evt-r${round}-t${turnNumber}-${idx}`;
}

export function getEffectiveSpeed(unit: BattleUnit): number {
  const hasHaste = unit.statuses.some((s) => s.type === 'haste');
  return unit.speed + (hasHaste ? 18 : 0);
}

export function getEffectiveDefense(unit: BattleUnit): number {
  const hasFortify = unit.statuses.some((s) => s.type === 'fortify');
  return Math.round(unit.defense * (hasFortify ? 1.25 : 1.0));
}

/**
 * Competitive anti-stall mechanic: starting in Round 6, all combat damage
 * escalates by +10% per round (up to +60%) so matches reach decisive finishes.
 */
export function getEscalationBonusPercent(round: number): number {
  if (round < 6) return 0;
  return Math.min(60, (round - 5) * 10);
}

export function getAllUnitAbilities(unit: BattleUnit): AbilityDefinition[] {
  return [unit.basicAttack, unit.guardAction, ...unit.abilities];
}

export function findAbility(
  unit: BattleUnit,
  abilityId: string
): AbilityDefinition | undefined {
  return getAllUnitAbilities(unit).find((a) => a.id === abilityId);
}

function buildRoundTurnQueue(units: BattleUnit[]): string[] {
  return units
    .filter((u) => u.alive)
    .sort((a, b) => {
      const spdDiff = getEffectiveSpeed(b) - getEffectiveSpeed(a);
      if (spdDiff !== 0) return spdDiff;
      // Deterministic tie-breaker: player before enemy, then slotIndex
      if (a.side !== b.side) return a.side === 'player' ? -1 : 1;
      return a.slotIndex - b.slotIndex;
    })
    .map((u) => u.instanceId);
}

function instantiateUnit(
  def: CharacterDefinition,
  side: TeamSide,
  slotIndex: number
): BattleUnit {
  const equippedAbilities: AbilityDefinition[] = [
    ...def.specialAbilities,
    ...(def.ultimateAbility ? [def.ultimateAbility] : []),
  ].slice(0, def.abilitySlotCapacity);

  const unitLevel = Math.max(1, Math.floor(def.level ?? 1));
  const tier = getCardTierForLevel(unitLevel);
  const tierMult = 1 + tier.combatStatBonusPct / 100;
  const scaledMaxHp = Math.round(def.stats.maxHp * tierMult);
  const scaledAttack = Math.round(def.stats.attack * tierMult);
  const scaledDefense = Math.round(def.stats.defense * tierMult);
  const scaledStartingEnergy = Math.min(
    def.stats.maxEnergy,
    def.stats.startingEnergy + tier.startingEnergyBonus
  );

  return {
    instanceId: `${side}-${slotIndex}-${def.id}`,
    definitionId: def.id,
    name: def.name,
    title: def.title,
    side,
    slotIndex,
    role: def.role,
    element: def.element,
    level: unitLevel,
    cardTier: tier.id,
    artworkUrl: def.artworkUrl,
    maxHp: scaledMaxHp,
    currentHp: scaledMaxHp,
    shield: 0,
    attack: scaledAttack,
    defense: scaledDefense,
    speed: def.stats.speed,
    maxEnergy: def.stats.maxEnergy,
    currentEnergy: scaledStartingEnergy,
    healingPower: def.stats.healingPower,
    alive: true,
    basicAttack: def.basicAttack,
    guardAction: STANDARD_GUARD_ABILITY,
    abilities: equippedAbilities,
    cooldowns: {},
    statuses: [],
    statsTracker: {
      damageDealt: 0,
      damageTaken: 0,
      healingDone: 0,
      shieldGranted: 0,
      abilitiesUsed: 0,
      kosScored: 0,
    },
  };
}

function checkWinner(units: BattleUnit[]): TeamSide | null {
  const playerAlive = units.some((u) => u.side === 'player' && u.alive);
  const enemyAlive = units.some((u) => u.side === 'enemy' && u.alive);
  if (!enemyAlive && playerAlive) return 'player';
  if (!playerAlive && enemyAlive) return 'enemy';
  if (!playerAlive && !enemyAlive) return 'enemy';
  return null;
}

/**
 * Resolves start-of-turn hooks for the next unit in queue:
 * - Expires 'guarding' from previous turn
 * - Passive energy regeneration
 * - Ticks DoTs (burn/bleed)
 * - Handles KO from DoT or Stun skip automatically until an actionable living unit is ready or match ends.
 */
function advanceToNextActionableTurn(
  state: BattleState,
  accumulatedEvents: BattleEvent[]
): BattleState {
  let units = state.units.map(cloneUnit);
  let round = state.round;
  let turnNumber = state.turnNumber;
  let turnQueue = [...state.turnQueue];
  let rngState = state.rngState;
  const events = [...state.events];
  const turnEvents = [...accumulatedEvents];

  const pushEvent = (
    partial: Omit<BattleEvent, 'id' | 'round' | 'turnNumber'>
  ) => {
    const evt: BattleEvent = {
      ...partial,
      id: createEventId(round, turnNumber, events.length + 1),
      round,
      turnNumber,
    };
    events.push(evt);
    turnEvents.push(evt);
  };

  // Guard against infinite loops if everyone is somehow stunned
  let safetyCounter = 0;

  while (safetyCounter < 40) {
    safetyCounter += 1;

    const winner = checkWinner(units);
    if (winner) {
      pushEvent({
        kind: 'match_end',
        message:
          winner === 'player'
            ? 'Victory! All opposing champions have fallen.'
            : 'Defeat. Your squad has been overwhelmed.',
      });
      return {
        ...state,
        rngState,
        round,
        turnNumber,
        phase: winner === 'player' ? 'victory' : 'defeat',
        winner,
        units,
        turnQueue: [],
        activeUnitId: null,
        events,
        lastTurnEvents: turnEvents,
      };
    }

    // Refill round queue if empty
    turnQueue = turnQueue.filter((id) => {
      const u = units.find((unit) => unit.instanceId === id);
      return Boolean(u && u.alive);
    });

    if (turnQueue.length === 0) {
      round += 1;
      turnQueue = buildRoundTurnQueue(units);
      pushEvent({
        kind: 'round_start',
        message: `Round ${round} begins — speed order recalculated.`,
      });

      // PvE Boss Encounter round-start passive hooks
      if (state.bossEncounter) {
        const boss = units.find(
          (u) => u.instanceId === state.bossEncounter?.bossUnitInstanceId && u.alive
        );
        if (boss) {
          if (
            state.bossEncounter.bossPassiveId === 'ember_nova' &&
            round >= 3 &&
            round % 2 === 1
          ) {
            for (const pUnit of units.filter((u) => u.side === 'player' && u.alive)) {
              let rem = 18;
              let absorbed = 0;
              if (pUnit.shield > 0) {
                absorbed = Math.min(pUnit.shield, rem);
                pUnit.shield -= absorbed;
                rem -= absorbed;
              }
              if (rem > 0) {
                pUnit.currentHp = Math.max(0, pUnit.currentHp - rem);
                pUnit.statsTracker.damageTaken += rem;
              }
              pushEvent({
                kind: 'status_tick',
                actorId: boss.instanceId,
                targetId: pUnit.instanceId,
                statusType: 'burn',
                amount: rem,
                shieldAbsorbed: absorbed,
                message: `Cinder Pulse scorches ${pUnit.name} for ${rem + absorbed} damage${
                  absorbed > 0 ? ` (${absorbed} blocked)` : ''
                }.`,
              });
              if (pUnit.currentHp <= 0) {
                pUnit.alive = false;
                pUnit.shield = 0;
                pUnit.statuses = [];
                boss.statsTracker.kosScored += 1;
                pushEvent({
                  kind: 'ko',
                  actorId: boss.instanceId,
                  targetId: pUnit.instanceId,
                  message: `${pUnit.name} succumbs to Cinder Pulse!`,
                });
              }
            }
          } else if (state.bossEncounter.bossPassiveId === 'singularity_core') {
            const before = boss.currentEnergy;
            boss.currentEnergy = Math.min(boss.maxEnergy, boss.currentEnergy + 8);
            const bonus = boss.currentEnergy - before;
            if (bonus > 0) {
              pushEvent({
                kind: 'energy',
                actorId: boss.instanceId,
                targetId: boss.instanceId,
                amount: bonus,
                message: `Overclock Matrix surges ${boss.name} (+${bonus} Energy).`,
              });
            }
          }
        }
      }
    }

    const nextId = turnQueue.shift()!;
    const unit = units.find((u) => u.instanceId === nextId);
    if (!unit || !unit.alive) continue;

    // 1. Remove previous turn's Guarding stance
    unit.statuses = unit.statuses.filter((s) => s.type !== 'guarding');

    // 2. Tick cooldowns down by 1 at start of the unit's turn
    for (const key of Object.keys(unit.cooldowns)) {
      if (unit.cooldowns[key] > 0) {
        unit.cooldowns[key] = Math.max(0, unit.cooldowns[key] - 1);
      }
    }

    // 3. Passive Energy Regen
    const energyBefore = unit.currentEnergy;
    unit.currentEnergy = Math.min(
      unit.maxEnergy,
      unit.currentEnergy + PASSIVE_TURN_ENERGY_REGEN
    );
    const gained = unit.currentEnergy - energyBefore;
    if (gained > 0 && turnNumber > 0) {
      pushEvent({
        kind: 'energy',
        actorId: unit.instanceId,
        targetId: unit.instanceId,
        amount: gained,
        message: `${unit.name} channels +${gained} Energy.`,
      });
    }

    // 4. Process Damage-over-Time effects (burn, bleed)
    const dotStatuses = unit.statuses.filter(
      (s) => s.type === 'burn' || s.type === 'bleed'
    );
    for (const dot of dotStatuses) {
      if (!unit.alive) break;
      let remainingDmg = Math.max(1, Math.round(dot.potency));
      let absorbed = 0;
      if (unit.shield > 0) {
        absorbed = Math.min(unit.shield, remainingDmg);
        unit.shield -= absorbed;
        remainingDmg -= absorbed;
      }
      if (remainingDmg > 0) {
        unit.currentHp = Math.max(0, unit.currentHp - remainingDmg);
        unit.statsTracker.damageTaken += remainingDmg;
      }
      pushEvent({
        kind: 'status_tick',
        targetId: unit.instanceId,
        statusType: dot.type,
        amount: remainingDmg,
        shieldAbsorbed: absorbed,
        message: `${unit.name} suffers ${remainingDmg + absorbed} ${dot.type} damage${
          absorbed > 0 ? ` (${absorbed} absorbed by shield)` : ''
        }.`,
      });

      if (unit.currentHp <= 0) {
        unit.alive = false;
        unit.shield = 0;
        unit.statuses = [];
        pushEvent({
          kind: 'ko',
          targetId: unit.instanceId,
          message: `${unit.name} succumbs to ${dot.type} and falls!`,
        });
      }
    }

    if (!unit.alive) {
      continue;
    }

    // 5. Check Stun
    const stunIndex = unit.statuses.findIndex((s) => s.type === 'stun');
    if (stunIndex >= 0) {
      unit.statuses.splice(stunIndex, 1);
      // Decrement remaining statuses since turn was consumed
      decrementStatuses(unit, pushEvent);
      turnNumber += 1;
      pushEvent({
        kind: 'stunned',
        actorId: unit.instanceId,
        targetId: unit.instanceId,
        statusType: 'stun',
        message: `${unit.name} is Stunned and loses their turn!`,
      });
      continue;
    }

    // Unit is alive and ready to act!
    pushEvent({
      kind: 'turn_start',
      actorId: unit.instanceId,
      message: `${unit.name}'s turn (${unit.side === 'player' ? 'Allied' : 'Enemy'}).`,
    });

    return {
      ...state,
      rngState,
      round,
      turnNumber,
      phase: 'active',
      winner: null,
      units,
      turnQueue,
      activeUnitId: unit.instanceId,
      events,
      lastTurnEvents: turnEvents,
    };
  }

  return {
    ...state,
    rngState,
    round,
    turnNumber,
    units,
    turnQueue,
    events,
    lastTurnEvents: turnEvents,
  };
}

function decrementStatuses(
  unit: BattleUnit,
  pushEvent: (partial: Omit<BattleEvent, 'id' | 'round' | 'turnNumber'>) => void
) {
  const remaining: ActiveStatusEffect[] = [];
  for (const status of unit.statuses) {
    // Guarding persists until the unit's OWN next turn start
    if (status.type === 'guarding') {
      remaining.push(status);
      continue;
    }
    const nextTurns = status.remainingTurns - 1;
    if (nextTurns > 0) {
      remaining.push({ ...status, remainingTurns: nextTurns });
    } else {
      pushEvent({
        kind: 'status_expired',
        targetId: unit.instanceId,
        statusType: status.type,
        message: `${status.type.charAt(0).toUpperCase() + status.type.slice(1)} fades from ${unit.name}.`,
      });
    }
  }
  unit.statuses = remaining;
}

export interface CreateBattleOptions {
  bossEncounter?: GauntletBossEncounter;
  skipSynergy?: boolean;
}

export function createBattle(
  playerCards: CharacterDefinition[],
  enemyCards: CharacterDefinition[],
  seed: number = 42019,
  options?: CreateBattleOptions
): BattleState {
  if (playerCards.length !== 5 || enemyCards.length !== 5) {
    throw new Error('Oracle Arena requires exactly 5 characters on each team.');
  }

  const playerSynergy = computeSquadSynergies(playerCards);
  const enemySynergy = computeSquadSynergies(enemyCards);

  const applySynergyToUnit = (
    unit: BattleUnit,
    synergy: ReturnType<typeof computeSquadSynergies>
  ): BattleUnit => {
    if (options?.skipSynergy) return unit;
    return {
      ...unit,
      attack: Math.round(unit.attack * (1 + synergy.totalAttackPct / 100)),
      defense: Math.round(unit.defense * (1 + synergy.totalDefensePct / 100)),
      speed: unit.speed + synergy.totalSpeedFlat,
      healingPower: Math.round(
        unit.healingPower * (1 + synergy.totalHealingPct / 100)
      ),
    };
  };

  const units: BattleUnit[] = [
    ...playerCards.map((card, i) =>
      applySynergyToUnit(instantiateUnit(card, 'player', i), playerSynergy)
    ),
    ...enemyCards.map((card, i) =>
      applySynergyToUnit(instantiateUnit(card, 'enemy', i), enemySynergy)
    ),
  ];

  // Apply PvE Boss Encounter opening passives if present
  let bossEncounterMeta: BattleState['bossEncounter'] = undefined;
  const bossEnc = options?.bossEncounter;
  if (bossEnc) {
    const enemyUnits = units.filter((u) => u.side === 'enemy');
    const bossUnit = enemyUnits[bossEnc.bossSlotIndex] ?? enemyUnits[0];
    if (bossUnit) {
      bossEncounterMeta = {
        id: bossEnc.id,
        stage: bossEnc.stage,
        title: bossEnc.title,
        bossName: bossEnc.bossName,
        bossPassiveId: bossEnc.bossPassiveId,
        bossPassiveName: bossEnc.bossPassiveName,
        bossPassiveDescription: bossEnc.bossPassiveDescription,
        bossUnitInstanceId: bossUnit.instanceId,
      };

      if (bossEnc.bossPassiveId === 'iron_bulwark') {
        for (const eUnit of enemyUnits) {
          eUnit.shield = Math.min(Math.round(eUnit.maxHp * 0.6), eUnit.shield + 24);
        }
        bossUnit.statuses.push({
          id: 'boss-init-fortify',
          type: 'fortify',
          remainingTurns: 2,
          potency: 25,
          sourceUnitId: bossUnit.instanceId,
        });
      } else if (bossEnc.bossPassiveId === 'shadow_tempo') {
        for (const eUnit of enemyUnits) {
          eUnit.speed += 6;
        }
        bossUnit.statuses.push({
          id: 'boss-init-empower',
          type: 'empower',
          remainingTurns: 2,
          potency: 20,
          sourceUnitId: bossUnit.instanceId,
        });
      } else if (bossEnc.bossPassiveId === 'singularity_core') {
        bossUnit.currentEnergy = Math.min(
          bossUnit.maxEnergy,
          bossUnit.currentEnergy + 22
        );
      }
    }
  }

  const initialQueue = buildRoundTurnQueue(units);
  const startEvent: BattleEvent = {
    id: 'evt-match-start',
    round: 1,
    turnNumber: 0,
    kind: 'match_start',
    message: bossEnc
      ? `Boss Encounter: ${bossEnc.title} (${bossEnc.bossPassiveName}) — 5v5 engagement begins.`
      : `Match initiated (Seed #${seed}). Round 1 — 5v5 engagement begins.`,
  };

  const baseState: BattleState = {
    matchId: `match-${seed}`,
    seed,
    rngState: createInitialRngState(seed),
    rulesetVersion: RULESET_VERSION,
    round: 1,
    turnNumber: 0,
    phase: 'active',
    winner: null,
    units,
    turnQueue: initialQueue,
    activeUnitId: null,
    events: [startEvent],
    lastTurnEvents: [startEvent],
    replayLog: [],
    bossEncounter: bossEncounterMeta,
  };

  return advanceToNextActionableTurn(baseState, [startEvent]);
}

export function getActiveUnit(state: BattleState): BattleUnit | null {
  if (!state.activeUnitId) return null;
  return state.units.find((u) => u.instanceId === state.activeUnitId) ?? null;
}

export function getLegalAbilities(
  state: BattleState,
  unitId: string
): AbilityDefinition[] {
  if (state.phase !== 'active' || state.activeUnitId !== unitId) return [];
  const unit = state.units.find((u) => u.instanceId === unitId);
  if (!unit || !unit.alive) return [];

  return getAllUnitAbilities(unit).filter((ability) => {
    const cd = unit.cooldowns[ability.id] ?? 0;
    return cd === 0 && unit.currentEnergy >= ability.energyCost;
  });
}

export function getValidTargets(
  state: BattleState,
  unitId: string,
  abilityId: string
): BattleUnit[] {
  const actor = state.units.find((u) => u.instanceId === unitId);
  if (!actor || !actor.alive) return [];
  const ability = findAbility(actor, abilityId);
  if (!ability) return [];

  const livingEnemies = state.units.filter(
    (u) => u.alive && u.side !== actor.side
  );
  const livingAllies = state.units.filter(
    (u) => u.alive && u.side === actor.side
  );

  switch (ability.targetType) {
    case 'single_enemy':
    case 'all_enemies':
      return livingEnemies;
    case 'single_ally':
    case 'all_allies':
      return livingAllies;
    case 'self':
      return [actor];
  }
}

export function isActionLegal(state: BattleState, action: BattleAction): boolean {
  if (state.phase !== 'active') return false;
  if (state.activeUnitId !== action.actorId) return false;
  const legalAbilities = getLegalAbilities(state, action.actorId);
  const ability = legalAbilities.find((a) => a.id === action.abilityId);
  if (!ability) return false;

  const validTargets = getValidTargets(state, action.actorId, action.abilityId);
  if (validTargets.length === 0) return false;

  const validIds = new Set(validTargets.map((t) => t.instanceId));

  if (
    ability.targetType === 'single_enemy' ||
    ability.targetType === 'single_ally'
  ) {
    return action.targetIds.length === 1 && validIds.has(action.targetIds[0]);
  }

  if (ability.targetType === 'self') {
    return action.targetIds.length === 1 && action.targetIds[0] === action.actorId;
  }

  // AoE abilities automatically resolve against all valid targets
  return action.targetIds.length > 0 && action.targetIds.every((id) => validIds.has(id));
}

function applyStatusEffect(
  target: BattleUnit,
  type: StatusEffectType,
  duration: number,
  potency: number,
  sourceUnitId: string
) {
  const existing = target.statuses.find((s) => s.type === type);
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, duration);
    existing.potency = Math.max(existing.potency, potency);
  } else {
    target.statuses.push({
      id: `${type}-${sourceUnitId}-${target.instanceId}-${target.statuses.length}`,
      type,
      remainingTurns: duration,
      potency,
      sourceUnitId,
    });
  }
}

/**
 * Pure, deterministic combat resolution for one legal BattleAction.
 */
export function executeAction(
  state: BattleState,
  action: BattleAction
): BattleState {
  if (!isActionLegal(state, action)) {
    throw new Error(
      `Illegal battle action: actor=${action.actorId}, ability=${action.abilityId}`
    );
  }

  const units = state.units.map(cloneUnit);
  const actor = units.find((u) => u.instanceId === action.actorId)!;
  const ability = findAbility(actor, action.abilityId)!;

  let rngState = state.rngState;
  const turnNumber = state.turnNumber + 1;
  const round = state.round;
  const events = [...state.events];
  const turnEvents: BattleEvent[] = [];

  const pushEvent = (
    partial: Omit<BattleEvent, 'id' | 'round' | 'turnNumber'>
  ) => {
    const evt: BattleEvent = {
      ...partial,
      id: createEventId(round, turnNumber, events.length + 1),
      round,
      turnNumber,
    };
    events.push(evt);
    turnEvents.push(evt);
  };

  // Resolve target list authoritatively based on targetType
  const resolvedTargets: BattleUnit[] = (() => {
    if (ability.targetType === 'all_enemies') {
      return units.filter((u) => u.alive && u.side !== actor.side);
    }
    if (ability.targetType === 'all_allies') {
      return units.filter((u) => u.alive && u.side === actor.side);
    }
    if (ability.targetType === 'self') {
      return [actor];
    }
    return action.targetIds
      .map((id) => units.find((u) => u.instanceId === id && u.alive))
      .filter((u): u is BattleUnit => Boolean(u));
  })();

  // Spend Energy & set Cooldown
  actor.currentEnergy = Math.max(0, actor.currentEnergy - ability.energyCost);
  if (ability.cooldown > 0) {
    // +1 because cooldown ticks down at the start of actor's next turn
    actor.cooldowns[ability.id] = ability.cooldown;
  }
  actor.statsTracker.abilitiesUsed += 1;

  pushEvent({
    kind: 'action_used',
    actorId: actor.instanceId,
    abilityId: ability.id,
    abilityName: ability.name,
    targetId: resolvedTargets.length === 1 ? resolvedTargets[0].instanceId : undefined,
    message: `${actor.name} uses ${ability.name}${
      resolvedTargets.length === 1 && resolvedTargets[0].instanceId !== actor.instanceId
        ? ` on ${resolvedTargets[0].name}`
        : ''
    }.`,
  });

  // Self energy gain (basic attacks, guard, self boosts)
  if (
    ability.energyGain > 0 &&
    (ability.targetType === 'single_enemy' ||
      ability.targetType === 'all_enemies' ||
      ability.targetType === 'self')
  ) {
    const prev = actor.currentEnergy;
    actor.currentEnergy = Math.min(actor.maxEnergy, actor.currentEnergy + ability.energyGain);
    const diff = actor.currentEnergy - prev;
    if (diff > 0) {
      pushEvent({
        kind: 'energy',
        actorId: actor.instanceId,
        targetId: actor.instanceId,
        amount: diff,
        message: `${actor.name} gains +${diff} Energy.`,
      });
    }
  }

  // Resolve effects on each target
  const actorEmpowered = actor.statuses.some((s) => s.type === 'empower');
  const actorWeakened = actor.statuses.some((s) => s.type === 'weaken');

  for (const target of resolvedTargets) {
    if (!target.alive) continue;

    // 1. Damage Calculation
    if (ability.damageMultiplier > 0 || ability.flatDamage > 0) {
      const varianceStep = nextRandomRange(rngState, 0.94, 1.06);
      rngState = varianceStep.nextState;

      let rawAttack = actor.attack * ability.damageMultiplier + ability.flatDamage;
      if (actorEmpowered) rawAttack *= 1.2;
      if (actorWeakened) rawAttack *= 0.8;

      const effectiveDef = getEffectiveDefense(target);
      // Smooth armor mitigation curve: 100 / (100 + def * 0.95)
      let mitigated = rawAttack * (100 / (100 + effectiveDef * 0.95));

      if (target.statuses.some((s) => s.type === 'vulnerable')) {
        mitigated *= 1.25;
      }
      if (target.statuses.some((s) => s.type === 'guarding')) {
        mitigated *= 0.6;
      }

      const escalationPct = getEscalationBonusPercent(round);
      if (escalationPct > 0) {
        mitigated *= 1 + escalationPct / 100;
      }

      // Soft Elemental Resonance matchup (+12% Resonant / -6% Dampened)
      const matchup = getElementalMatchup(actor.element, target.element);
      mitigated *= matchup.multiplier;

      const finalDamage = Math.max(8, Math.round(mitigated * varianceStep.value));
      const isCritical =
        (varianceStep.value >= 1.035 && finalDamage >= 78) ||
        (ability.category === 'ultimate' && finalDamage >= 85) ||
        (matchup.relation === 'advantage' && finalDamage >= 95);

      let remainingDamage = finalDamage;
      let shieldAbsorbed = 0;

      if (target.shield > 0) {
        shieldAbsorbed = Math.min(target.shield, remainingDamage);
        target.shield -= shieldAbsorbed;
        remainingDamage -= shieldAbsorbed;
      }

      if (remainingDamage > 0) {
        target.currentHp = Math.max(0, target.currentHp - remainingDamage);
      }

      actor.statsTracker.damageDealt += finalDamage;
      target.statsTracker.damageTaken += finalDamage;

      const resonanceTag =
        matchup.relation === 'advantage'
          ? ' [Resonant +12%]'
          : matchup.relation === 'disadvantage'
            ? ' [Dampened]'
            : '';

      pushEvent({
        kind: 'damage',
        actorId: actor.instanceId,
        targetId: target.instanceId,
        abilityId: ability.id,
        abilityName: ability.name,
        amount: finalDamage,
        shieldAbsorbed,
        elementalRelation: matchup.relation,
        isCritical,
        message: `${target.name} takes ${finalDamage} damage${resonanceTag}${
          shieldAbsorbed > 0 ? ` (${shieldAbsorbed} blocked by shield)` : ''
        }.`,
      });

      if (target.currentHp <= 0) {
        target.alive = false;
        target.shield = 0;
        target.statuses = [];
        actor.statsTracker.kosScored += 1;
        pushEvent({
          kind: 'ko',
          actorId: actor.instanceId,
          targetId: target.instanceId,
          message: `${target.name} has been defeated by ${actor.name}!`,
        });
        continue;
      }
    }

    // 2. Healing Calculation
    if (ability.healMultiplier > 0 || ability.flatHeal > 0) {
      const baseHeal =
        Math.max(actor.healingPower, 30) * ability.healMultiplier + ability.flatHeal;
      const healVal = Math.max(10, Math.round(baseHeal));
      const before = target.currentHp;
      target.currentHp = Math.min(target.maxHp, target.currentHp + healVal);
      const actualHeal = target.currentHp - before;
      actor.statsTracker.healingDone += actualHeal;

      pushEvent({
        kind: 'heal',
        actorId: actor.instanceId,
        targetId: target.instanceId,
        abilityId: ability.id,
        abilityName: ability.name,
        amount: actualHeal,
        message: `${target.name} restores ${actualHeal} HP.`,
      });
    }

    // 3. Shield Generation
    if (ability.shieldAmount > 0) {
      const shieldVal = Math.round(ability.shieldAmount);
      target.shield = Math.min(Math.round(target.maxHp * 0.6), target.shield + shieldVal);
      actor.statsTracker.shieldGranted += shieldVal;

      pushEvent({
        kind: 'shield',
        actorId: actor.instanceId,
        targetId: target.instanceId,
        abilityId: ability.id,
        abilityName: ability.name,
        amount: shieldVal,
        message: `${target.name} gains a ${shieldVal}-point shield.`,
      });
    }

    // 4. Ally Energy Infusion (when targeting allies specifically)
    if (
      ability.energyGain > 0 &&
      (ability.targetType === 'single_ally' || ability.targetType === 'all_allies')
    ) {
      const before = target.currentEnergy;
      target.currentEnergy = Math.min(
        target.maxEnergy,
        target.currentEnergy + ability.energyGain
      );
      const gained = target.currentEnergy - before;
      if (gained > 0) {
        pushEvent({
          kind: 'energy',
          actorId: actor.instanceId,
          targetId: target.instanceId,
          amount: gained,
          message: `${target.name} receives +${gained} Energy.`,
        });
      }
    }

    // 5. Cooldown Reduction
    if (ability.cooldownReduction > 0) {
      let reducedAny = false;
      for (const cdKey of Object.keys(target.cooldowns)) {
        if (target.cooldowns[cdKey] > 0 && cdKey !== ability.id) {
          target.cooldowns[cdKey] = Math.max(
            0,
            target.cooldowns[cdKey] - ability.cooldownReduction
          );
          reducedAny = true;
        }
      }
      if (reducedAny) {
        pushEvent({
          kind: 'cooldown_reduced',
          actorId: actor.instanceId,
          targetId: target.instanceId,
          amount: ability.cooldownReduction,
          message: `${target.name}'s ability cooldowns reduced by ${ability.cooldownReduction} turn.`,
        });
      }
    }

    // 6. Status Applications
    for (const statusApp of ability.statuses) {
      const rollStep = nextRandom(rngState);
      rngState = rollStep.nextState;
      const chance = statusApp.chance ?? 1;

      if (rollStep.value <= chance) {
        applyStatusEffect(
          target,
          statusApp.type,
          statusApp.duration,
          statusApp.potency ?? 0,
          actor.instanceId
        );
        pushEvent({
          kind: 'status_applied',
          actorId: actor.instanceId,
          targetId: target.instanceId,
          statusType: statusApp.type,
          message: `${target.name} is affected by ${
            statusApp.type.charAt(0).toUpperCase() + statusApp.type.slice(1)
          } (${statusApp.duration}t).`,
        });
      }
    }
  }

  // Decrement actor's own active statuses at end of their action
  if (actor.alive) {
    decrementStatuses(actor, pushEvent);
  }

  const nextStateBase: BattleState = {
    ...state,
    rngState,
    round,
    turnNumber,
    units,
    events,
    lastTurnEvents: turnEvents,
    replayLog: [
      ...state.replayLog,
      {
        turnNumber,
        round,
        action: {
          actorId: action.actorId,
          abilityId: action.abilityId,
          targetIds: resolvedTargets.map((t) => t.instanceId),
        },
      },
    ],
  };

  return advanceToNextActionableTurn(nextStateBase, turnEvents);
}

/**
 * Computes the upcoming turn order preview across living units.
 */
export function getTurnOrderPreview(state: BattleState): BattleUnit[] {
  const unitMap = new Map(state.units.map((u) => [u.instanceId, u]));
  const result: BattleUnit[] = [];

  if (state.activeUnitId) {
    const active = unitMap.get(state.activeUnitId);
    if (active && active.alive) result.push(active);
  }

  for (const id of state.turnQueue) {
    const u = unitMap.get(id);
    if (u && u.alive && !result.some((r) => r.instanceId === u.instanceId)) {
      result.push(u);
    }
  }

  // Fill remainder with next round's predicted speed order
  const nextRoundOrder = buildRoundTurnQueue(state.units);
  for (const id of nextRoundOrder) {
    if (result.length >= 10) break;
    const u = unitMap.get(id);
    if (u && u.alive && !result.some((r) => r.instanceId === u.instanceId)) {
      result.push(u);
    }
  }

  return result;
}
