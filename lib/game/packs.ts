import { STARTER_CHARACTERS } from './roster';
import {
  compileTraitTreeCharacter,
  TRAIT_CATALOG,
  TraitId,
  ULTIMATE_TREE_CATALOG,
  UltimateTreeId,
} from './traits';
import { CharacterDefinition, ElementAffinity } from './types';

export const ACCOUNT_ECONOMY_STORAGE_KEY = 'oracle_arena_account_progress_v1';

export const CREATOR_CARD_SHARD_COST = 250;
export const BOOSTER_PACK_SHARD_COST = 180;
export const STARTER_PACK_CARD_COUNT = 8;
export const WEEKLY_PACK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const MONTHLY_PACK_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
export const XP_PER_ACCOUNT_LEVEL = 100;

export interface PlayerEconomyState {
  starterPackOpened: boolean;
  unlockedStarterIds: string[];
  accountLevel: number;
  accountXp: number;
  creatorCards: number;
  localShards: number;
  unopenedBoosterPacks: number;
  totalPacksOpened: number;
  lastWeeklyPackClaimAt: number | null;
  lastMonthlyPackClaimAt: number | null;
}

export interface BattleAccountReward {
  xpEarned: number;
  shardsEarned: number;
  levelsGained: number;
  creatorCardsEarned: number;
  nextState: PlayerEconomyState;
}

export function createInitialPlayerEconomy(
  alreadyActivePlayer = false
): PlayerEconomyState {
  if (alreadyActivePlayer) {
    return {
      starterPackOpened: true,
      unlockedStarterIds: STARTER_CHARACTERS.slice(
        0,
        STARTER_PACK_CARD_COUNT
      ).map((c) => c.id),
      accountLevel: 1,
      accountXp: 0,
      creatorCards: 1,
      localShards: 300,
      unopenedBoosterPacks: 1,
      totalPacksOpened: 1,
      lastWeeklyPackClaimAt: null,
      lastMonthlyPackClaimAt: null,
    };
  }

  return {
    starterPackOpened: false,
    unlockedStarterIds: [],
    accountLevel: 1,
    accountXp: 0,
    creatorCards: 0,
    localShards: 120,
    unopenedBoosterPacks: 0,
    totalPacksOpened: 0,
    lastWeeklyPackClaimAt: null,
    lastMonthlyPackClaimAt: null,
  };
}

export function loadPlayerEconomy(
  fallbackAlreadyActive = false
): PlayerEconomyState {
  if (typeof window === 'undefined') {
    return createInitialPlayerEconomy(fallbackAlreadyActive);
  }
  try {
    const raw = window.localStorage.getItem(ACCOUNT_ECONOMY_STORAGE_KEY);
    if (!raw) {
      const initial = createInitialPlayerEconomy(fallbackAlreadyActive);
      return initial;
    }
    const parsed = JSON.parse(raw) as Partial<PlayerEconomyState>;
    const base = createInitialPlayerEconomy(fallbackAlreadyActive);
    return {
      starterPackOpened: Boolean(parsed.starterPackOpened),
      unlockedStarterIds: Array.isArray(parsed.unlockedStarterIds)
        ? parsed.unlockedStarterIds.filter((id): id is string => typeof id === 'string')
        : base.unlockedStarterIds,
      accountLevel:
        typeof parsed.accountLevel === 'number' && parsed.accountLevel >= 1
          ? Math.floor(parsed.accountLevel)
          : 1,
      accountXp:
        typeof parsed.accountXp === 'number' && parsed.accountXp >= 0
          ? Math.floor(parsed.accountXp)
          : 0,
      creatorCards:
        typeof parsed.creatorCards === 'number' && parsed.creatorCards >= 0
          ? Math.floor(parsed.creatorCards)
          : base.creatorCards,
      localShards:
        typeof parsed.localShards === 'number' && parsed.localShards >= 0
          ? Math.floor(parsed.localShards)
          : base.localShards,
      unopenedBoosterPacks:
        typeof parsed.unopenedBoosterPacks === 'number' &&
        parsed.unopenedBoosterPacks >= 0
          ? Math.floor(parsed.unopenedBoosterPacks)
          : base.unopenedBoosterPacks,
      totalPacksOpened:
        typeof parsed.totalPacksOpened === 'number' && parsed.totalPacksOpened >= 0
          ? Math.floor(parsed.totalPacksOpened)
          : 0,
      lastWeeklyPackClaimAt:
        typeof parsed.lastWeeklyPackClaimAt === 'number'
          ? parsed.lastWeeklyPackClaimAt
          : null,
      lastMonthlyPackClaimAt:
        typeof parsed.lastMonthlyPackClaimAt === 'number'
          ? parsed.lastMonthlyPackClaimAt
          : null,
    };
  } catch {
    return createInitialPlayerEconomy(fallbackAlreadyActive);
  }
}

export function savePlayerEconomy(state: PlayerEconomyState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      ACCOUNT_ECONOMY_STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch {
    // Ignore storage quota issues cleanly
  }
}

/**
 * Tears open the Welcome Starter Pack for a new player:
 * Unlocks 8 developer-curated starter champions + grants 1 free Creator Card!
 */
export function openWelcomeStarterPack(state: PlayerEconomyState): {
  nextState: PlayerEconomyState;
  unlockedCards: CharacterDefinition[];
  creatorCardsGranted: number;
} {
  const starterEight = STARTER_CHARACTERS.slice(0, STARTER_PACK_CARD_COUNT);
  const unlockedIds = Array.from(
    new Set([...state.unlockedStarterIds, ...starterEight.map((c) => c.id)])
  );

  if (state.starterPackOpened) {
    return {
      nextState: {
        ...state,
        unlockedStarterIds: unlockedIds,
      },
      unlockedCards: starterEight,
      creatorCardsGranted: 0,
    };
  }

  return {
    nextState: {
      ...state,
      starterPackOpened: true,
      unlockedStarterIds: unlockedIds,
      creatorCards: state.creatorCards + 1,
      unopenedBoosterPacks: state.unopenedBoosterPacks + 1,
      totalPacksOpened: state.totalPacksOpened + 1,
    },
    unlockedCards: starterEight,
    creatorCardsGranted: 1,
  };
}

/**
 * Awards Account XP and Oracle Shards after any match (Blind Clash, 5v5 Arena, Gauntlet, or PvP).
 * Every Account Level-Up grants +1 Creator Card!
 */
export function awardAccountBattleProgress(
  state: PlayerEconomyState,
  options: {
    won: boolean;
    mode: 'blind_clash' | 'arena_5v5' | 'gauntlet' | 'pvp';
  }
): BattleAccountReward {
  let xpEarned = options.won ? 65 : 35;
  let shardsEarned = options.won ? 90 : 40;

  if (options.mode === 'gauntlet') {
    xpEarned = options.won ? 95 : 40;
    shardsEarned = options.won ? 140 : 45;
  } else if (options.mode === 'pvp') {
    xpEarned = options.won ? 80 : 45;
    shardsEarned = options.won ? 120 : 50;
  } else if (options.mode === 'blind_clash') {
    xpEarned = options.won ? 60 : 30;
    shardsEarned = options.won ? 85 : 35;
  }

  let totalXp = state.accountXp + xpEarned;
  let nextLevel = state.accountLevel;
  let levelsGained = 0;

  while (totalXp >= XP_PER_ACCOUNT_LEVEL) {
    totalXp -= XP_PER_ACCOUNT_LEVEL;
    nextLevel += 1;
    levelsGained += 1;
  }

  const creatorCardsEarned = levelsGained;
  const bonusPacks =
    levelsGained > 0 && nextLevel % 2 === 0 ? 1 : 0;

  const nextState: PlayerEconomyState = {
    ...state,
    accountLevel: nextLevel,
    accountXp: totalXp,
    creatorCards: state.creatorCards + creatorCardsEarned,
    localShards: state.localShards + shardsEarned,
    unopenedBoosterPacks: state.unopenedBoosterPacks + bonusPacks,
  };

  return {
    xpEarned,
    shardsEarned,
    levelsGained,
    creatorCardsEarned,
    nextState,
  };
}

export function spendCreatorCard(state: PlayerEconomyState): {
  ok: boolean;
  error?: string;
  nextState: PlayerEconomyState;
} {
  if (state.creatorCards < 1) {
    return {
      ok: false,
      error:
        'You need 1 Creator Card to forge a custom champion. Battle to level up or buy one with Oracle Shards!',
      nextState: state,
    };
  }
  return {
    ok: true,
    nextState: {
      ...state,
      creatorCards: state.creatorCards - 1,
    },
  };
}

export function buyCreatorCardWithShards(state: PlayerEconomyState): {
  ok: boolean;
  error?: string;
  nextState: PlayerEconomyState;
} {
  if (state.localShards < CREATOR_CARD_SHARD_COST) {
    return {
      ok: false,
      error: `Need ${CREATOR_CARD_SHARD_COST} Shards (you have ${state.localShards}). Win battles to earn more!`,
      nextState: state,
    };
  }
  return {
    ok: true,
    nextState: {
      ...state,
      localShards: state.localShards - CREATOR_CARD_SHARD_COST,
      creatorCards: state.creatorCards + 1,
    },
  };
}

export function buyBoosterPackWithShards(state: PlayerEconomyState): {
  ok: boolean;
  error?: string;
  nextState: PlayerEconomyState;
} {
  if (state.localShards < BOOSTER_PACK_SHARD_COST) {
    return {
      ok: false,
      error: `Need ${BOOSTER_PACK_SHARD_COST} Shards (you have ${state.localShards}).`,
      nextState: state,
    };
  }
  return {
    ok: true,
    nextState: {
      ...state,
      localShards: state.localShards - BOOSTER_PACK_SHARD_COST,
      unopenedBoosterPacks: state.unopenedBoosterPacks + 1,
    },
  };
}

export function canClaimPeriodicPack(
  state: PlayerEconomyState,
  kind: 'weekly' | 'monthly',
  nowMs = Date.now()
): { ready: boolean; remainingMs: number } {
  const interval =
    kind === 'weekly' ? WEEKLY_PACK_INTERVAL_MS : MONTHLY_PACK_INTERVAL_MS;
  const lastClaim =
    kind === 'weekly'
      ? state.lastWeeklyPackClaimAt
      : state.lastMonthlyPackClaimAt;

  if (lastClaim === null) {
    return { ready: true, remainingMs: 0 };
  }
  const elapsed = nowMs - lastClaim;
  if (elapsed >= interval) {
    return { ready: true, remainingMs: 0 };
  }
  return { ready: false, remainingMs: interval - elapsed };
}

export function claimPeriodicPack(
  state: PlayerEconomyState,
  kind: 'weekly' | 'monthly',
  nowMs = Date.now()
): {
  ok: boolean;
  error?: string;
  packsAdded: number;
  nextState: PlayerEconomyState;
} {
  const status = canClaimPeriodicPack(state, kind, nowMs);
  if (!status.ready) {
    return {
      ok: false,
      error: `Your ${kind} pack is recharging. Check back soon!`,
      packsAdded: 0,
      nextState: state,
    };
  }

  const packsAdded = kind === 'monthly' ? 2 : 1;
  return {
    ok: true,
    packsAdded,
    nextState: {
      ...state,
      unopenedBoosterPacks: state.unopenedBoosterPacks + packsAdded,
      lastWeeklyPackClaimAt:
        kind === 'weekly' ? nowMs : state.lastWeeklyPackClaimAt,
      lastMonthlyPackClaimAt:
        kind === 'monthly' ? nowMs : state.lastMonthlyPackClaimAt,
    },
  };
}

export function consumeBoosterPack(state: PlayerEconomyState): {
  ok: boolean;
  nextState: PlayerEconomyState;
} {
  if (state.unopenedBoosterPacks < 1) {
    return { ok: false, nextState: state };
  }
  return {
    ok: true,
    nextState: {
      ...state,
      unopenedBoosterPacks: state.unopenedBoosterPacks - 1,
      totalPacksOpened: state.totalPacksOpened + 1,
    },
  };
}

export function formatCountdownLabel(remainingMs: number): string {
  if (remainingMs <= 0) return 'Ready Now!';
  const totalHours = Math.ceil(remainingMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

// =============================================================================
// Curated Vault Pack Generator (for instant deterministic offline pack pulls
// when player opts into Quick Vault Pack or unlocks remaining Starter Heroes)
// =============================================================================

const PACK_ARTWORKS = [
  '/images/card_kaelen_solaris.jpg',
  '/images/card_lyra_voidweaver.jpg',
  '/images/card_vex_chronostriker.jpg',
  '/images/card_seraphina_aether.jpg',
  '/images/card_orion_tactician.jpg',
  '/images/card_malakor_dreadguard.jpg',
  '/images/card_nyx_shadowblade.jpg',
  '/images/card_ignis_pyromancer.jpg',
  '/images/card_freya_frostbinder.jpg',
  '/images/card_kora_hexsmith.jpg',
];

const CURATED_VAULT_BLUEPRINTS: Array<{
  name: string;
  title: string;
  element: ElementAffinity;
  lore: string;
  traits: TraitId[];
  ultimateId: UltimateTreeId;
  artworkUrl: string;
}> = [
  {
    name: 'Vipera Shade',
    title: 'Alchemist of the Emerald Fang',
    element: 'Void',
    lore: 'Raised in glowing subterranean jungles, Vipera brews potent toxins that eat through steel shields.',
    traits: ['venom_fangs', 'shadow_step', 'lightning_reflex'],
    ultimateId: 'venom_cataclysm',
    artworkUrl: '/images/card_kora_hexsmith.jpg',
  },
  {
    name: 'Bramwell Stonefist',
    title: 'Warden of the Antidote Citadel',
    element: 'Iron',
    lore: 'Trained in the Mountain Sanctuary, Bramwell resists every poison while smashing rivals with iron fists.',
    traits: ['venom_immunity', 'super_strength', 'iron_hide'],
    ultimateId: 'meteor_breaker',
    artworkUrl: '/images/card_malakor_dreadguard.jpg',
  },
  {
    name: 'Zara Mindspire',
    title: 'Telekinetic Prodigy',
    element: 'Aether',
    lore: 'Zara lifts boulders and brawlers effortlessly with her mind, keeping heavy hitters far away.',
    traits: ['telekinesis', 'true_sight', 'storm_surge'],
    ultimateId: 'psychic_singularity',
    artworkUrl: '/images/card_lyra_voidweaver.jpg',
  },
  {
    name: 'Cinder Rex',
    title: 'Forgeheart Breaker',
    element: 'Ember',
    lore: 'Born beside a star-furnace, Cinder melts ice barriers and shatters heavy armor in seconds.',
    traits: ['ember_surge', 'armor_pierce', 'heavy_impact'],
    ultimateId: 'solar_nova',
    artworkUrl: '/images/card_ignis_pyromancer.jpg',
  },
  {
    name: 'Lumina Dawn',
    title: 'Radiant Sanctuary Healer',
    element: 'Solar',
    lore: 'Lumina carries a crystal lantern that purges venom and shields injured champions.',
    traits: ['healing_aura', 'venom_immunity', 'frost_barrier'],
    ultimateId: 'aegis_sanctuary',
    artworkUrl: '/images/card_seraphina_aether.jpg',
  },
  {
    name: 'Riftwalker Kaze',
    title: 'Phantom Blink Duelist',
    element: 'Storm',
    lore: 'Kaze steps between lightning bolts to outmaneuver telekinetic masters and ambush key targets.',
    traits: ['phase_blink', 'shadow_step', 'storm_surge'],
    ultimateId: 'phantom_barrage',
    artworkUrl: '/images/card_vex_chronostriker.jpg',
  },
];

function seededPick(seed: number, mod: number): number {
  const x = Math.abs(Math.sin(seed * 9301 + 49297) * 233280);
  return Math.floor(x) % Math.max(1, mod);
}

/**
 * Generates 3 balanced champions for a Curated Vault Booster Pack (deterministic & instant).
 * If any of the 10 starter champions are still locked, includes 1 locked starter first!
 */
export function generateCuratedVaultPackCards(params: {
  seed: number;
  existingNames: string[];
  unlockedStarterIds: string[];
  ownerId: string;
  ownerName: string;
}): {
  cards: CharacterDefinition[];
  newlyUnlockedStarterIds: string[];
} {
  const cards: CharacterDefinition[] = [];
  const newlyUnlockedStarterIds: string[] = [];
  const takenNames = new Set(params.existingNames.map((n) => n.toLowerCase()));

  // Include 1 locked starter hero if any remain
  const lockedStarters = STARTER_CHARACTERS.filter(
    (s) => !params.unlockedStarterIds.includes(s.id)
  );
  if (lockedStarters.length > 0) {
    const pick = lockedStarters[seededPick(params.seed, lockedStarters.length)];
    cards.push(pick);
    newlyUnlockedStarterIds.push(pick.id);
    takenNames.add(pick.name.toLowerCase());
  }

  let idx = seededPick(params.seed + 7, CURATED_VAULT_BLUEPRINTS.length);
  let attempts = 0;
  while (cards.length < 3 && attempts < 18) {
    attempts += 1;
    const bp =
      CURATED_VAULT_BLUEPRINTS[(idx + attempts) % CURATED_VAULT_BLUEPRINTS.length];
    let candidateName = bp.name;
    if (takenNames.has(candidateName.toLowerCase())) {
      const suffix = ['II', 'Prime', 'Apex', 'Nova', 'Vanguard'][
        seededPick(params.seed + attempts * 13, 5)
      ];
      candidateName = `${bp.name} ${suffix}`;
    }
    if (takenNames.has(candidateName.toLowerCase())) {
      candidateName = `${bp.name} #${(params.seed + attempts) % 99}`;
    }
    takenNames.add(candidateName.toLowerCase());

    const compiled = compileTraitTreeCharacter({
      name: candidateName,
      title: bp.title,
      lore: bp.lore,
      element: bp.element,
      artworkUrl:
        bp.artworkUrl ||
        PACK_ARTWORKS[seededPick(params.seed + attempts, PACK_ARTWORKS.length)],
      creatorId: params.ownerId,
      creatorName: 'Oracle Vault Pack',
      traitIds: bp.traits,
      ultimateId: bp.ultimateId,
    });
    cards.push(compiled.character);
    idx += 1;
  }

  // Fallback synthetic trait pick if ever needed
  while (cards.length < 3) {
    const t1 = TRAIT_CATALOG[seededPick(params.seed + cards.length * 3, TRAIT_CATALOG.length)];
    const t2 = TRAIT_CATALOG[seededPick(params.seed + cards.length * 7 + 5, TRAIT_CATALOG.length)];
    const ult = ULTIMATE_TREE_CATALOG[seededPick(params.seed + cards.length, ULTIMATE_TREE_CATALOG.length)];
    const compiled = compileTraitTreeCharacter({
      name: `Vault Hero ${(params.seed + cards.length) % 900}`,
      lore: 'Forged inside an Oracle Booster Pack with a balanced trio of traits.',
      element: ult.preferredElement,
      artworkUrl: PACK_ARTWORKS[cards.length % PACK_ARTWORKS.length],
      creatorId: params.ownerId,
      creatorName: 'Oracle Vault Pack',
      traitIds: [t1.id, t2.id],
      ultimateId: ult.id,
    });
    cards.push(compiled.character);
  }

  return { cards, newlyUnlockedStarterIds };
}
