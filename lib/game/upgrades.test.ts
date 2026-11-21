import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, executeAction, getActiveUnit } from './engine';
import {
  buildGauntletEnemySquad,
  GAUNTLET_ENCOUNTERS,
} from './gauntlet';
import {
  getExpandedEloWindow,
  selectBestQuickMatchRoom,
} from './matchmaking';
import { BattleRoomDoc } from './multiplayer';
import {
  DEFAULT_ENEMY_SQUAD_IDS,
  DEFAULT_PLAYER_SQUAD_IDS,
  getSquadCharacters,
  STARTER_CHARACTERS,
} from './roster';
import {
  computeSquadSynergies,
  ELEMENTAL_COUNTER_MAP,
  getElementalMatchup,
} from './synergy';

test('Elemental Resonance rings cover all 8 elements with symmetric +12% / -6% multipliers', () => {
  const solarVsVoid = getElementalMatchup('Solar', 'Void');
  assert.equal(solarVsVoid.relation, 'advantage');
  assert.equal(solarVsVoid.multiplier, 1.12);

  const voidVsSolar = getElementalMatchup('Void', 'Solar');
  assert.equal(voidVsSolar.relation, 'disadvantage');
  assert.equal(voidVsSolar.multiplier, 0.94);

  const emberVsStorm = getElementalMatchup('Ember', 'Storm');
  assert.equal(emberVsStorm.relation, 'neutral');
  assert.equal(emberVsStorm.multiplier, 1.0);

  // Every element counters a distinct element
  const targets = new Set(Object.values(ELEMENTAL_COUNTER_MAP));
  assert.equal(targets.size, 8);
});

test('computeSquadSynergies awards Full-Spectrum Formation and Elemental Resonance pairs accurately', () => {
  const defaultSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS);
  const defaultProfile = computeSquadSynergies(defaultSquad);
  assert.ok(
    defaultProfile.synergies.some((s) => s.id === 'formation-full-spectrum')
  );
  assert.equal(defaultProfile.totalAttackPct, 6);
  assert.equal(defaultProfile.totalDefensePct, 6);

  // Pair 2 Storm champions to trigger Tempest Velocity (+5 Speed, +4% Attack)
  const stormPairSquad = [
    ...defaultSquad.slice(0, 4),
    STARTER_CHARACTERS.find((c) => c.id === 'chr-kora-hexsmith')!,
  ];
  const stormProfile = computeSquadSynergies(stormPairSquad);
  assert.ok(stormProfile.synergies.some((s) => s.id === 'resonance-storm'));
  assert.equal(stormProfile.totalSpeedFlat, 5);
});

test('PvE Gauntlet Boss Encounters scale Boss HP and trigger unique opening Boss passives', () => {
  const starterById = new Map(STARTER_CHARACTERS.map((c) => [c.id, c]));
  for (const encounter of GAUNTLET_ENCOUNTERS) {
    assert.equal(encounter.enemySquadIds.length, 5);
    for (const id of encounter.enemySquadIds) {
      assert.ok(
        starterById.has(id),
        `Gauntlet encounter ${encounter.id} references unknown starter ID: ${id}`
      );
    }
    const bossDef = starterById.get(
      encounter.enemySquadIds[encounter.bossSlotIndex]
    )!;
    assert.equal(encounter.bossName, bossDef.name);
    assert.equal(encounter.bossArtworkUrl, bossDef.artworkUrl);
  }

  const playerSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS);
  const ironStage = GAUNTLET_ENCOUNTERS[0];
  const enemySquad = buildGauntletEnemySquad(ironStage);

  assert.equal(enemySquad.length, 5);
  assert.ok(enemySquad[ironStage.bossSlotIndex].title.startsWith('BOSS ·'));
  assert.equal(enemySquad[ironStage.bossSlotIndex].name, 'Malakor Ironhearth');

  const battle = createBattle(playerSquad, enemySquad, ironStage.seed, {
    bossEncounter: ironStage,
  });

  assert.ok(battle.bossEncounter);
  assert.equal(battle.bossEncounter.bossPassiveId, 'iron_bulwark');

  // Forge Bulwark grants +24 Shield to all opposing units and Fortify to Boss
  const enemyUnits = battle.units.filter((u) => u.side === 'enemy');
  assert.ok(enemyUnits.every((u) => u.shield >= 24));
  const bossUnit = enemyUnits.find(
    (u) => u.instanceId === battle.bossEncounter?.bossUnitInstanceId
  )!;
  assert.equal(bossUnit.name, 'Malakor Ironhearth');
  assert.ok(bossUnit.statuses.some((s) => s.type === 'fortify'));

  // Stage 4 Singularity Core grants +22 starting energy to Boss
  const apexStage = GAUNTLET_ENCOUNTERS[3];
  const apexBattle = createBattle(
    playerSquad,
    buildGauntletEnemySquad(apexStage),
    apexStage.seed,
    { bossEncounter: apexStage }
  );
  const apexBoss = apexBattle.units.find(
    (u) => u.instanceId === apexBattle.bossEncounter?.bossUnitInstanceId
  )!;
  assert.equal(apexBoss.name, 'Kora Hexsmith');
  assert.ok(apexBoss.currentEnergy >= 55);
});

test('executeAction records elementalRelation on damage events', () => {
  const playerSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS);
  const enemySquad = getSquadCharacters(DEFAULT_ENEMY_SQUAD_IDS);
  const state = createBattle(playerSquad, enemySquad, 4242);
  const actor = getActiveUnit(state)!; // Nyx (Void)
  const aetherTarget = state.units.find(
    (u) => u.side === 'player' && u.element === 'Aether'
  )!; // Seraphina (Aether) — Void counters Aether (+12%)

  const next = executeAction(state, {
    actorId: actor.instanceId,
    abilityId: actor.basicAttack.id,
    targetIds: [aetherTarget.instanceId],
  });

  const dmgEvt = next.lastTurnEvents.find((e) => e.kind === 'damage');
  assert.ok(dmgEvt);
  assert.equal(dmgEvt.elementalRelation, 'advantage');
  assert.ok(dmgEvt.message.includes('Resonant +12%'));
});

test('Quick-Match PvP queue picks closest ELO opponent, ignores self, and widens window over time', () => {
  const squad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS);
  const makeRoom = (roomId: string, hostUid: string): BattleRoomDoc => ({
    roomId,
    roomCode: 'ABC123',
    status: 'waiting',
    rulesetVersion: '1.0.0',
    seed: 1000,
    hostUid,
    hostName: hostUid,
    hostSquad: squad,
    guestUid: '',
    guestName: '',
    guestSquad: [],
    turnNumber: 0,
    round: 1,
    activeSide: 'player',
    winnerSide: '',
    winnerUid: '',
    battleState: {},
    createdAt: null,
    updatedAt: null,
  });

  const rooms = [
    makeRoom('r-self', 'me'),
    makeRoom('r-far', 'rival-far'),
    makeRoom('r-close', 'rival-close'),
  ];
  const ratings = {
    me: 1200,
    'rival-far': 1620,
    'rival-close': 1260,
  };

  assert.equal(getExpandedEloWindow(0), 150);
  assert.equal(getExpandedEloWindow(20), 300);

  const match = selectBestQuickMatchRoom(rooms, 'me', 1200, ratings, 0);
  assert.ok(match);
  assert.equal(match.room.roomId, 'r-close');
  assert.equal(match.ratingDiff, 60);

  // If only a far rival exists, 0s window returns null, 25s window widens and matches
  const onlyFar = [makeRoom('r-far', 'rival-far')];
  assert.equal(
    selectBestQuickMatchRoom(onlyFar, 'me', 1200, ratings, 0),
    null
  );
  const fallbackMatch = selectBestQuickMatchRoom(
    onlyFar,
    'me',
    1200,
    ratings,
    25
  );
  assert.ok(fallbackMatch);
  assert.equal(fallbackMatch.room.roomId, 'r-far');
});
