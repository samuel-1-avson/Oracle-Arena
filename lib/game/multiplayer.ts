import { z } from 'zod';
import { executeAction, getActiveUnit, isActionLegal } from './engine';
import {
  BattleAction,
  BattleState,
  BattleUnit,
  CharacterDefinition,
  RULESET_VERSION,
  TeamSide,
} from './types';

export type RoomStatus = 'waiting' | 'active' | 'finished' | 'cancelled';

export interface PlayerProfileDoc {
  uid: string;
  displayName: string;
  avatarUrl: string;
  title: string;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  customCardCount: number;
  activeSquadIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BattleRoomDoc {
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  rulesetVersion: string;
  seed: number;
  hostUid: string;
  hostName: string;
  hostSquad: CharacterDefinition[];
  guestUid: string;
  guestName: string;
  guestSquad: CharacterDefinition[];
  turnNumber: number;
  round: number;
  activeSide: TeamSide;
  winnerSide: '' | TeamSide;
  winnerUid: string;
  battleState: BattleState | Record<string, never>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RoomMoveDoc {
  moveId: string;
  roomId: string;
  turnNumber: number;
  actorUid: string;
  side: TeamSide;
  actorId: string;
  abilityId: string;
  targetIds: string[];
  createdAt?: unknown;
}

export interface MultiplayerBattleContext {
  room: BattleRoomDoc;
  viewerSide: TeamSide;
  viewerName: string;
  opponentName: string;
  eloDeltaPreview: { win: number; loss: number };
  submittingMove: boolean;
  moveError: string | null;
  onSubmitPvpAction: (action: BattleAction) => Promise<void>;
  onForfeitPvp: () => Promise<void>;
  onReturnToLobby: () => void;
}

export const BattleActionRequestSchema = z.object({
  actorId: z.string().min(2).max(128),
  abilityId: z.string().min(2).max(128),
  targetIds: z.array(z.string().min(2).max(128)).min(1).max(5),
});

export const ValidateTurnPayloadSchema = z.object({
  expectedSide: z.enum(['player', 'enemy']),
  action: BattleActionRequestSchema,
  battleState: z.object({
    matchId: z.string().min(1),
    seed: z.number().int(),
    rngState: z.number(),
    rulesetVersion: z.string().min(1),
    round: z.number().int().min(1),
    turnNumber: z.number().int().min(0),
    phase: z.enum(['active', 'victory', 'defeat']),
    winner: z.enum(['player', 'enemy']).nullable(),
    units: z.array(z.any()).length(10),
    turnQueue: z.array(z.string()),
    activeUnitId: z.string().nullable(),
    events: z.array(z.any()),
    lastTurnEvents: z.array(z.any()),
    replayLog: z.array(z.any()),
  }),
});

export interface ValidatedTurnResult {
  nextBattleState: BattleState;
  nextActiveSide: TeamSide;
  turnNumber: number;
  round: number;
  status: 'active' | 'finished';
  winnerSide: '' | TeamSide;
  resolvedTargetIds: string[];
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generates an unambiguous 6-character uppercase room code matching ^[A-Z0-9]{6}$.
 */
export function generateRoomCode(randomFn: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.floor(randomFn() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[Math.min(idx, ROOM_CODE_ALPHABET.length - 1)];
  }
  return code;
}

/**
 * Normalizes a user-typed room code (strips whitespace/dashes, uppercases, max 6 chars).
 */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

/**
 * Determines which TeamSide a given Firebase UID controls in a BattleRoom.
 * Host always controls 'player'; Guest always controls 'enemy'.
 */
export function getViewerSide(
  room: Pick<BattleRoomDoc, 'hostUid' | 'guestUid'>,
  uid: string
): TeamSide | null {
  if (room.hostUid === uid) return 'player';
  if (room.guestUid && room.guestUid === uid) return 'enemy';
  return null;
}

/**
 * Orients battlefield rows so the viewer's own squad is ALWAYS rendered at the bottom
 * and the opponent's squad is ALWAYS rendered at the top, while preserving real instanceIds.
 */
export function getOrientedTeams(
  units: BattleUnit[],
  viewerSide: TeamSide
): { alliedUnits: BattleUnit[]; opposingUnits: BattleUnit[] } {
  const alliedUnits = units
    .filter((u) => u.side === viewerSide)
    .sort((a, b) => a.slotIndex - b.slotIndex);
  const opposingUnits = units
    .filter((u) => u.side !== viewerSide)
    .sort((a, b) => a.slotIndex - b.slotIndex);
  return { alliedUnits, opposingUnits };
}

/**
 * Computes bounded ELO rating change strictly within [-40, +40] (matching firestore.rules invariants).
 */
export function computeEloDelta(
  currentRating: number,
  didWin: boolean,
  mode: 'solo' | 'multiplayer'
): { nextRating: number; delta: number } {
  // Solo AI battles grant modest practice rating; PvP battles grant full ranked ELO stakes
  const rawDelta =
    mode === 'multiplayer' ? (didWin ? 25 : -15) : didWin ? 10 : -5;
  const clampedDelta = Math.max(-40, Math.min(40, rawDelta));
  const nextRating = Math.max(0, Math.min(5000, currentRating + clampedDelta));
  return {
    nextRating,
    delta: nextRating - currentRating,
  };
}

/**
 * Checks whether a BattleRoomDoc has a real populated BattleState.
 */
export function hasActiveBattleState(
  state: BattleState | Record<string, never> | undefined
): state is BattleState {
  return Boolean(
    state &&
      typeof state === 'object' &&
      'units' in state &&
      Array.isArray(state.units) &&
      state.units.length === 10
  );
}

/**
 * Pure authoritative turn validator for multiplayer PvP matches.
 * Verifies ruleset version, active phase, active unit ownership by expectedSide,
 * and full Ruleset 1.0 legality before executing one deterministic combat turn.
 */
export function validateAndAdvanceMultiplayerTurn(
  battleState: BattleState,
  action: BattleAction,
  expectedSide: TeamSide
): { ok: true; result: ValidatedTurnResult } | { ok: false; error: string } {
  if (battleState.rulesetVersion !== RULESET_VERSION) {
    return {
      ok: false,
      error: `Ruleset mismatch: expected ${RULESET_VERSION}, received ${battleState.rulesetVersion}.`,
    };
  }

  if (battleState.phase !== 'active') {
    return {
      ok: false,
      error: 'This multiplayer match has already concluded.',
    };
  }

  const activeUnit = getActiveUnit(battleState);
  if (!activeUnit) {
    return {
      ok: false,
      error: 'No living active unit is scheduled to act.',
    };
  }

  if (activeUnit.side !== expectedSide) {
    return {
      ok: false,
      error: `Turn rejected: it is currently the opposing side's turn (${activeUnit.name}).`,
    };
  }

  if (action.actorId !== activeUnit.instanceId) {
    return {
      ok: false,
      error: `Turn rejected: expected actor ${activeUnit.instanceId}, received ${action.actorId}.`,
    };
  }

  if (!isActionLegal(battleState, action)) {
    return {
      ok: false,
      error:
        'Illegal battle action: insufficient energy, ability on cooldown, or invalid target.',
    };
  }

  const nextBattleState = executeAction(battleState, action);
  const nextActive = getActiveUnit(nextBattleState);
  const finished =
    nextBattleState.phase === 'victory' || nextBattleState.phase === 'defeat';
  const winnerSide: '' | TeamSide = finished
    ? (nextBattleState.winner ?? expectedSide)
    : '';
  const nextActiveSide: TeamSide = nextActive
    ? nextActive.side
    : expectedSide;

  const latestReplay =
    nextBattleState.replayLog[nextBattleState.replayLog.length - 1];
  const resolvedTargetIds =
    latestReplay?.action.targetIds.length > 0
      ? latestReplay.action.targetIds
      : action.targetIds;

  return {
    ok: true,
    result: {
      nextBattleState,
      nextActiveSide,
      turnNumber: nextBattleState.turnNumber,
      round: nextBattleState.round,
      status: finished ? 'finished' : 'active',
      winnerSide,
      resolvedTargetIds,
    },
  };
}
