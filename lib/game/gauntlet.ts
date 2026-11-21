import { getCharacterById, STARTER_CHARACTERS } from './roster';
import { CharacterDefinition } from './types';

export type BossPassiveId =
  | 'iron_bulwark'
  | 'shadow_tempo'
  | 'ember_nova'
  | 'singularity_core';

export interface GauntletBossEncounter {
  id: string;
  stage: 1 | 2 | 3 | 4;
  title: string;
  bossName: string;
  bossTitle: string;
  subtitle: string;
  difficulty: 'Veteran' | 'Elite' | 'Master' | 'Mythic Boss';
  bossPassiveId: BossPassiveId;
  bossPassiveName: string;
  bossPassiveDescription: string;
  enemySquadIds: string[];
  bossSlotIndex: number;
  statScale: number;
  bossHpBonusPct: number;
  rewardShards: number;
  rewardXpBonusPct: number;
  seed: number;
  bossArtworkUrl: string;
}

export const GAUNTLET_ENCOUNTERS: GauntletBossEncounter[] = [
  {
    id: 'gauntlet-stage-1-iron-bastion',
    stage: 1,
    title: 'Stage I · The Iron Bastion',
    bossName: 'Malakor Ironhearth',
    bossTitle: 'Obsidian Siege Warden',
    subtitle:
      'Break through a fortified front line reinforced by Malakor’s furnace barrier.',
    difficulty: 'Veteran',
    bossPassiveId: 'iron_bulwark',
    bossPassiveName: 'Forge Bulwark',
    bossPassiveDescription:
      'Opens the encounter by granting +24 Shield to all opposing units and Fortify to the Boss.',
    enemySquadIds: [
      'chr-kaelen-solaris',
      'chr-freya-frostbinder',
      'chr-malakor-dreadguard',
      'chr-kora-hexsmith',
      'chr-seraphina-aether',
    ],
    bossSlotIndex: 2,
    statScale: 1.0,
    bossHpBonusPct: 0.18,
    rewardShards: 120,
    rewardXpBonusPct: 15,
    seed: 61001,
    bossArtworkUrl: '/images/card_malakor_dreadguard.jpg',
  },
  {
    id: 'gauntlet-stage-2-eclipse-syndicate',
    stage: 2,
    title: 'Stage II · Eclipse Syndicate',
    bossName: 'Nyx Eclipse',
    bossTitle: 'Phantom Regent',
    subtitle:
      'High-velocity Void strikers that punish slow backlines and stack Bleed pressure.',
    difficulty: 'Elite',
    bossPassiveId: 'shadow_tempo',
    bossPassiveName: 'Shadow Tempo',
    bossPassiveDescription:
      'Opposing squad gains +6 initiative Speed and Nyx begins combat with Empowered blades.',
    enemySquadIds: [
      'chr-lyra-voidweaver',
      'chr-vex-chronostriker',
      'chr-nyx-shadowblade',
      'chr-orion-tactician',
      'chr-freya-frostbinder',
    ],
    bossSlotIndex: 2,
    statScale: 1.06,
    bossHpBonusPct: 0.24,
    rewardShards: 180,
    rewardXpBonusPct: 25,
    seed: 62002,
    bossArtworkUrl: '/images/card_nyx_shadowblade.jpg',
  },
  {
    id: 'gauntlet-stage-3-pyroclasm-conclave',
    stage: 3,
    title: 'Stage III · Pyroclasm Conclave',
    bossName: 'Ignis Solborn',
    bossTitle: 'Volcanic Ember Archon',
    subtitle:
      'Sustained AoE burn devastation backed by double-warden recovery.',
    difficulty: 'Master',
    bossPassiveId: 'ember_nova',
    bossPassiveName: 'Cinder Pulse',
    bossPassiveDescription:
      'Every odd round from Round 3 onward, Ignis unleashes a Cinder Pulse scorching all allied champions for 18 damage.',
    enemySquadIds: [
      'chr-malakor-dreadguard',
      'chr-seraphina-aether',
      'chr-ignis-pyromancer',
      'chr-lyra-voidweaver',
      'chr-freya-frostbinder',
    ],
    bossSlotIndex: 2,
    statScale: 1.12,
    bossHpBonusPct: 0.32,
    rewardShards: 260,
    rewardXpBonusPct: 35,
    seed: 63003,
    bossArtworkUrl: '/images/card_ignis_pyromancer.jpg',
  },
  {
    id: 'gauntlet-stage-4-archon-singularity',
    stage: 4,
    title: 'Stage IV · Archon Singularity',
    bossName: 'Kora Hexsmith',
    bossTitle: 'Sovereign Overmind',
    subtitle:
      'Final Apex Boss Raid. Overclocked energy conduits fuel relentless Ultimate chains.',
    difficulty: 'Mythic Boss',
    bossPassiveId: 'singularity_core',
    bossPassiveName: 'Overclock Matrix',
    bossPassiveDescription:
      'Boss starts with +22 bonus Energy and channels +8 extra Energy each round while alive.',
    enemySquadIds: [
      'chr-malakor-dreadguard',
      'chr-nyx-shadowblade',
      'chr-kora-hexsmith',
      'chr-ignis-pyromancer',
      'chr-freya-frostbinder',
    ],
    bossSlotIndex: 2,
    statScale: 1.18,
    bossHpBonusPct: 0.45,
    rewardShards: 400,
    rewardXpBonusPct: 50,
    seed: 64004,
    bossArtworkUrl: '/images/card_kora_hexsmith.jpg',
  },
];

/**
 * Constructs the scaled 5-champion Boss Encounter squad deterministically from starter cards.
 */
export function buildGauntletEnemySquad(
  encounter: GauntletBossEncounter
): CharacterDefinition[] {
  return encounter.enemySquadIds.map((id, idx) => {
    const base =
      getCharacterById(id, STARTER_CHARACTERS) ??
      STARTER_CHARACTERS[idx % STARTER_CHARACTERS.length];
    const isBoss = idx === encounter.bossSlotIndex;
    const hpMult = encounter.statScale * (isBoss ? 1 + encounter.bossHpBonusPct : 1);
    const statMult = encounter.statScale * (isBoss ? 1.06 : 1);

    return {
      ...base,
      title: isBoss ? `BOSS · ${encounter.bossTitle}` : base.title,
      stats: {
        ...base.stats,
        maxHp: Math.round(base.stats.maxHp * hpMult),
        attack: Math.round(base.stats.attack * statMult),
        defense: Math.round(base.stats.defense * statMult),
        speed: Math.min(130, Math.round(base.stats.speed * (isBoss ? 1.04 : 1))),
        healingPower: Math.round(base.stats.healingPower * statMult),
      },
    };
  });
}

export interface GauntletProgressRecord {
  clearedEncounterIds: string[];
  clearCounts: Record<string, number>;
  bestTurnsByEncounter: Record<string, number>;
}

const GAUNTLET_STORAGE_KEY = 'oracle_arena_gauntlet_progress_v1';

export function loadGauntletProgress(): GauntletProgressRecord {
  if (typeof window === 'undefined') {
    return { clearedEncounterIds: [], clearCounts: {}, bestTurnsByEncounter: {} };
  }
  try {
    const raw = window.localStorage.getItem(GAUNTLET_STORAGE_KEY);
    if (!raw) {
      return { clearedEncounterIds: [], clearCounts: {}, bestTurnsByEncounter: {} };
    }
    const parsed = JSON.parse(raw) as Partial<GauntletProgressRecord>;
    return {
      clearedEncounterIds: Array.isArray(parsed.clearedEncounterIds)
        ? parsed.clearedEncounterIds
        : [],
      clearCounts:
        parsed.clearCounts && typeof parsed.clearCounts === 'object'
          ? parsed.clearCounts
          : {},
      bestTurnsByEncounter:
        parsed.bestTurnsByEncounter &&
        typeof parsed.bestTurnsByEncounter === 'object'
          ? parsed.bestTurnsByEncounter
          : {},
    };
  } catch {
    return { clearedEncounterIds: [], clearCounts: {}, bestTurnsByEncounter: {} };
  }
}

export function recordGauntletVictory(
  encounterId: string,
  turnsTaken: number
): GauntletProgressRecord {
  const current = loadGauntletProgress();
  const clearedSet = new Set(current.clearedEncounterIds);
  clearedSet.add(encounterId);

  const prevBest = current.bestTurnsByEncounter[encounterId];
  const next: GauntletProgressRecord = {
    clearedEncounterIds: Array.from(clearedSet),
    clearCounts: {
      ...current.clearCounts,
      [encounterId]: (current.clearCounts[encounterId] ?? 0) + 1,
    },
    bestTurnsByEncounter: {
      ...current.bestTurnsByEncounter,
      [encounterId]:
        prevBest !== undefined ? Math.min(prevBest, turnsTaken) : turnsTaken,
    },
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(GAUNTLET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota issues
    }
  }
  return next;
}
