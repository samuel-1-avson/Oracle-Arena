import { z } from 'zod';

export const RULESET_VERSION = '1.0.0';
export const CONTENT_SCHEMA_VERSION = '1.0.0';

export const CombatRoleSchema = z.enum([
  'Vanguard',
  'Striker',
  'Arcanist',
  'Warden',
  'Tactician',
]);
export type CombatRole = z.infer<typeof CombatRoleSchema>;

export const ElementAffinitySchema = z.enum([
  'Solar',
  'Void',
  'Storm',
  'Aether',
  'Cyber',
  'Iron',
  'Ember',
  'Frost',
]);
export type ElementAffinity = z.infer<typeof ElementAffinitySchema>;

export const OracleProfileSchema = z.enum([
  'Universal Oracle',
  'Elemental Oracle',
  'Arcane Oracle',
  'Cyber Oracle',
  'Mythic Oracle',
  'Tactical Oracle',
]);
export type OracleProfile = z.infer<typeof OracleProfileSchema>;

export const AbilityCategorySchema = z.enum([
  'basic',
  'guard',
  'special',
  'ultimate',
]);
export type AbilityCategory = z.infer<typeof AbilityCategorySchema>;

export const TargetTypeSchema = z.enum([
  'single_enemy',
  'all_enemies',
  'single_ally',
  'all_allies',
  'self',
]);
export type TargetType = z.infer<typeof TargetTypeSchema>;

export const StatusEffectTypeSchema = z.enum([
  'burn',       // Damage over time at start of unit's turn
  'bleed',      // Damage over time at start of unit's turn
  'stun',       // Skips unit's next action
  'fortify',    // +25% Defense
  'vulnerable', // +25% Incoming Damage
  'weaken',     // -20% Outgoing Damage
  'empower',    // +20% Outgoing Damage
  'haste',      // +18 Speed
  'guarding',   // -40% Incoming Damage until next turn
]);
export type StatusEffectType = z.infer<typeof StatusEffectTypeSchema>;

export const StatusApplicationSchema = z.object({
  type: StatusEffectTypeSchema,
  duration: z.number().int().min(1).max(4),
  potency: z.number().min(0).max(200).optional(), // DoT flat damage or percentage modifier
  chance: z.number().min(0).max(1).default(1),
});
export type StatusApplication = z.infer<typeof StatusApplicationSchema>;

export const AbilityDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(48),
  description: z.string().min(4).max(260),
  category: AbilityCategorySchema,
  targetType: TargetTypeSchema,
  damageMultiplier: z.number().min(0).max(2.6).default(0),
  flatDamage: z.number().min(0).max(120).default(0),
  healMultiplier: z.number().min(0).max(2.2).default(0),
  flatHeal: z.number().min(0).max(160).default(0),
  shieldAmount: z.number().min(0).max(180).default(0),
  energyCost: z.number().int().min(0).max(100),
  energyGain: z.number().int().min(0).max(45).default(0),
  cooldown: z.number().int().min(0).max(6),
  cooldownReduction: z.number().int().min(0).max(2).default(0),
  statuses: z.array(StatusApplicationSchema).default([]),
  prerequisites: z.object({
    minLevel: z.number().int().min(1).default(1),
  }).default({ minLevel: 1 }),
  rulesetVersion: z.string().default(RULESET_VERSION),
  visualEffect: z.string().min(2).max(140),
  powerBudgetCost: z.number().min(0).max(200),
});
export type AbilityDefinition = z.infer<typeof AbilityDefinitionSchema>;

export const OwnershipTransferSchema = z.object({
  fromUserId: z.string().nullable(),
  toUserId: z.string(),
  timestamp: z.string(),
  reason: z.enum(['genesis', 'trade', 'marketplace', 'grant']),
});
export type OwnershipTransfer = z.infer<typeof OwnershipTransferSchema>;

export const EvolutionRecordSchema = z.object({
  stage: z.number().int().min(0),
  title: z.string(),
  timestamp: z.string(),
  summary: z.string(),
});
export type EvolutionRecord = z.infer<typeof EvolutionRecordSchema>;

export const UpgradeTransactionSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  kind: z.enum([
    'xp_reward',
    'stat_upgrade',
    'ability_upgrade',
    'ability_unlocked',
    'evolution',
  ]),
  summary: z.string(),
  matchId: z.string().optional(),
});
export type UpgradeTransaction = z.infer<typeof UpgradeTransactionSchema>;

export const StatUpgradeTallySchema = z.object({
  maxHp: z.number().int().min(0).max(5).default(0),
  attack: z.number().int().min(0).max(5).default(0),
  defense: z.number().int().min(0).max(5).default(0),
  speed: z.number().int().min(0).max(5).default(0),
  healingPower: z.number().int().min(0).max(5).default(0),
});
export type StatUpgradeTally = z.infer<typeof StatUpgradeTallySchema>;

export const CharacterStatsSchema = z.object({
  maxHp: z.number().int().min(180).max(650),
  attack: z.number().int().min(25).max(115),
  defense: z.number().int().min(15).max(95),
  speed: z.number().int().min(45).max(130),
  maxEnergy: z.number().int().min(80).max(120).default(100),
  startingEnergy: z.number().int().min(20).max(60).default(40),
  healingPower: z.number().int().min(0).max(110).default(0),
});
export type CharacterStats = z.infer<typeof CharacterStatsSchema>;

export const CharacterDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(42),
  title: z.string().min(2).max(56),
  originalCreatorId: z.string().min(1),
  originalCreatorName: z.string().min(1),
  currentOwnerId: z.string().min(1),
  oracleProfile: OracleProfileSchema,
  appearance: z.string().min(10),
  artworkUrl: z.string().min(1),
  backstory: z.string().min(10),
  personality: z.string().min(4),
  role: CombatRoleSchema,
  element: ElementAffinitySchema,
  rarity: z.enum(['Core', 'Rare', 'Ascendant', 'Mythic']),
  level: z.number().int().min(1).max(10).default(1),
  xp: z.number().int().min(0).default(0),
  upgradePoints: z.number().int().min(0).default(0),
  abilityCreationPoints: z.number().int().min(0).default(0),
  evolutionStage: z.number().int().min(0).max(2).default(0),
  statUpgrades: StatUpgradeTallySchema.default({
    maxHp: 0,
    attack: 0,
    defense: 0,
    speed: 0,
    healingPower: 0,
  }),
  stats: CharacterStatsSchema,
  strengths: z.array(z.string()).min(1).max(4),
  weaknesses: z.array(z.string()).min(1).max(4),
  basicAttack: AbilityDefinitionSchema,
  specialAbilities: z.array(AbilityDefinitionSchema).min(1).max(4),
  ultimateAbility: AbilityDefinitionSchema.nullable(),
  learnedAbilities: z.array(AbilityDefinitionSchema).default([]),
  abilitySlotCapacity: z.number().int().min(4).max(6).default(4),
  evolutionHistory: z.array(EvolutionRecordSchema).default([]),
  upgradeHistory: z.array(UpgradeTransactionSchema).default([]),
  combatRecord: z.object({
    matchesPlayed: z.number().int().min(0).default(0),
    wins: z.number().int().min(0).default(0),
    totalDamageDealt: z.number().int().min(0).default(0),
    totalHealingDone: z.number().int().min(0).default(0),
  }).default({ matchesPlayed: 0, wins: 0, totalDamageDealt: 0, totalHealingDone: 0 }),
  ownershipHistory: z.array(OwnershipTransferSchema).min(1),
  rulesetVersion: z.string().default(RULESET_VERSION),
  contentSchemaVersion: z.string().default(CONTENT_SCHEMA_VERSION),
});
export type CharacterDefinition = z.infer<typeof CharacterDefinitionSchema>;

// Runtime Battle Types (Strict separation from CharacterDefinition)

export type TeamSide = 'player' | 'enemy';

export interface ActiveStatusEffect {
  id: string;
  type: StatusEffectType;
  remainingTurns: number;
  potency: number;
  sourceUnitId: string;
}

export interface BattleUnit {
  instanceId: string;
  definitionId: string;
  name: string;
  title: string;
  side: TeamSide;
  slotIndex: number; // 0..4
  role: CombatRole;
  element: ElementAffinity;
  level: number;
  cardTier: 'bronze' | 'silver' | 'gold' | 'diamond' | 'trump';
  artworkUrl: string;
  maxHp: number;
  currentHp: number;
  shield: number;
  attack: number;
  defense: number;
  speed: number;
  maxEnergy: number;
  currentEnergy: number;
  healingPower: number;
  alive: boolean;
  basicAttack: AbilityDefinition;
  guardAction: AbilityDefinition;
  abilities: AbilityDefinition[]; // equipped special + ultimate
  cooldowns: Record<string, number>; // abilityId -> turns remaining
  statuses: ActiveStatusEffect[];
  statsTracker: {
    damageDealt: number;
    damageTaken: number;
    healingDone: number;
    shieldGranted: number;
    abilitiesUsed: number;
    kosScored: number;
  };
}

export type BattlePhase = 'active' | 'victory' | 'defeat';

export interface BattleAction {
  actorId: string;
  abilityId: string;
  targetIds: string[];
}

export type BattleEventKind =
  | 'match_start'
  | 'round_start'
  | 'turn_start'
  | 'action_used'
  | 'damage'
  | 'heal'
  | 'shield'
  | 'energy'
  | 'status_applied'
  | 'status_tick'
  | 'status_expired'
  | 'cooldown_reduced'
  | 'stunned'
  | 'ko'
  | 'match_end';

export interface BattleEvent {
  id: string;
  round: number;
  turnNumber: number;
  kind: BattleEventKind;
  actorId?: string;
  targetId?: string;
  abilityId?: string;
  abilityName?: string;
  amount?: number;
  shieldAbsorbed?: number;
  statusType?: StatusEffectType;
  elementalRelation?: 'advantage' | 'disadvantage' | 'neutral';
  isCritical?: boolean;
  message: string;
}

export interface BattleReplayEntry {
  turnNumber: number;
  round: number;
  action: BattleAction;
}

export interface BattleState {
  matchId: string;
  seed: number;
  rngState: number;
  rulesetVersion: string;
  round: number;
  turnNumber: number;
  phase: BattlePhase;
  winner: TeamSide | null;
  units: BattleUnit[];
  turnQueue: string[]; // instanceIds remaining in current round
  activeUnitId: string | null;
  events: BattleEvent[];
  lastTurnEvents: BattleEvent[];
  replayLog: BattleReplayEntry[];
  bossEncounter?: {
    id: string;
    stage: number;
    title: string;
    bossName: string;
    bossPassiveId: string;
    bossPassiveName: string;
    bossPassiveDescription: string;
    bossUnitInstanceId: string;
  };
}

export interface ReplayUnitStatSnapshot {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  maxEnergy: number;
  startingEnergy: number;
  healingPower: number;
  level: number;
  evolutionStage: number;
}

export interface MatchSummaryRecord {
  matchId: string;
  seed: number;
  timestamp: string;
  winner: TeamSide;
  rounds: number;
  turns: number;
  playerSquadIds: string[];
  enemySquadIds: string[];
  playerSurvivors: number;
  enemySurvivors: number;
  totalPlayerDamage: number;
  totalPlayerHealing: number;
  rulesetVersion: string;
  mode?: 'solo' | 'multiplayer';
  opponentName?: string;
  replayLog?: BattleReplayEntry[];
  replayUnitSnapshots?: Record<string, ReplayUnitStatSnapshot>;
}
