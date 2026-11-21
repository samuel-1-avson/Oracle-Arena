import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCharacterBalance } from './balance';
import { chooseTacticalAction } from './bot';
import { createBattle, executeAction, getActiveUnit } from './engine';
import {
  FOUNDING_CHARACTERS,
  getComplementaryEnemySquad,
  STARTER_CHARACTERS,
} from './roster';
import { EXPANSION_CHARACTERS } from './roster-expansion';

test('roster contains 10 founding + 30 unique expansion champions = 40 total', () => {
  assert.equal(FOUNDING_CHARACTERS.length, 10);
  assert.equal(EXPANSION_CHARACTERS.length, 30);
  assert.equal(STARTER_CHARACTERS.length, 40);
});

test('all 40 champions are 100% unique across ID, name, title, lore, artwork, (role, element), and abilities', () => {
  const ids = new Set<string>();
  const names = new Set<string>();
  const titles = new Set<string>();
  const backstories = new Set<string>();
  const appearances = new Set<string>();
  const artworks = new Set<string>();
  const roleElementPairs = new Set<string>();
  const abilityIds = new Set<string>();
  const abilityNames = new Set<string>();
  const roleCounts = new Map<string, number>();
  const elementCounts = new Map<string, number>();

  const firestoreIdPattern = /^[a-zA-Z0-9_-]+$/;

  for (const card of STARTER_CHARACTERS) {
    assert.ok(
      firestoreIdPattern.test(card.id) && card.id.length <= 128,
      `Invalid Firestore ID: ${card.id}`
    );
    assert.equal(ids.has(card.id), false, `Duplicate character id: ${card.id}`);
    ids.add(card.id);

    const normName = card.name.trim().toLowerCase();
    assert.equal(names.has(normName), false, `Duplicate character name: ${card.name}`);
    names.add(normName);

    const normTitle = card.title.trim().toLowerCase();
    assert.equal(titles.has(normTitle), false, `Duplicate title: ${card.title}`);
    titles.add(normTitle);

    const normBackstory = card.backstory.trim().toLowerCase();
    assert.equal(backstories.has(normBackstory), false, `Duplicate backstory on ${card.name}`);
    backstories.add(normBackstory);

    const normAppearance = card.appearance.trim().toLowerCase();
    assert.equal(appearances.has(normAppearance), false, `Duplicate appearance on ${card.name}`);
    appearances.add(normAppearance);

    assert.equal(artworks.has(card.artworkUrl), false, `Duplicate artworkUrl: ${card.artworkUrl}`);
    artworks.add(card.artworkUrl);

    // Confirm portrait image file exists on disk in public/
    const diskPath = path.join(process.cwd(), 'public', card.artworkUrl.replace(/^\//, ''));
    assert.equal(
      fs.existsSync(diskPath),
      true,
      `Missing portrait asset on disk for ${card.name}: ${diskPath}`
    );

    const pair = `${card.role}::${card.element}`;
    assert.equal(
      roleElementPairs.has(pair),
      false,
      `Duplicate (Role, Element) archetype ${pair} on ${card.name}`
    );
    roleElementPairs.add(pair);

    roleCounts.set(card.role, (roleCounts.get(card.role) ?? 0) + 1);
    elementCounts.set(card.element, (elementCounts.get(card.element) ?? 0) + 1);

    const abilities = [
      card.basicAttack,
      ...card.specialAbilities,
      ...(card.ultimateAbility ? [card.ultimateAbility] : []),
    ];
    assert.equal(abilities.length, 4, `${card.name} should have 4 signature abilities`);

    for (const ability of abilities) {
      assert.equal(
        abilityIds.has(ability.id),
        false,
        `Duplicate ability id: ${ability.id}`
      );
      abilityIds.add(ability.id);

      const normAbilityName = ability.name.trim().toLowerCase();
      assert.equal(
        abilityNames.has(normAbilityName),
        false,
        `Duplicate ability name "${ability.name}" on ${card.name}`
      );
      abilityNames.add(normAbilityName);
    }

    const balance = validateCharacterBalance(card);
    assert.equal(
      balance.valid,
      true,
      `${card.name} failed Ruleset 1.0 balance: ${balance.issues
        .map((i) => i.message)
        .join('; ')}`
    );
  }

  // Verify exact complete 5 Roles x 8 Elements coverage
  assert.equal(roleElementPairs.size, 40);
  for (const [role, count] of roleCounts.entries()) {
    assert.equal(count, 8, `Expected 8 champions for role ${role}, got ${count}`);
  }
  for (const [element, count] of elementCounts.entries()) {
    assert.equal(count, 5, `Expected 5 champions for element ${element}, got ${count}`);
  }
  assert.equal(abilityIds.size, 160);
  assert.equal(abilityNames.size, 160);
});

test('5v5 battle using exclusively new expansion champions completes cleanly', () => {
  const playerSquad = [
    EXPANSION_CHARACTERS[0],  // Darius Umbravault (Vanguard)
    EXPANSION_CHARACTERS[6],  // Soren Dawnblade (Striker)
    EXPANSION_CHARACTERS[12], // Helios Sunscribe (Arcanist)
    EXPANSION_CHARACTERS[18], // Solana Radiance (Warden)
    EXPANSION_CHARACTERS[24], // Valerius Sunmarshal (Tactician)
  ];
  const enemySquad = getComplementaryEnemySquad(
    playerSquad.map((c) => c.id),
    EXPANSION_CHARACTERS,
    777
  );
  assert.equal(enemySquad.length, 5);
  assert.equal(new Set(enemySquad.map((c) => c.role)).size, 5);

  let state = createBattle(playerSquad, enemySquad, 202640);
  let steps = 0;
  while (state.phase === 'active' && steps < 250) {
    const active = getActiveUnit(state);
    assert.ok(active);
    const action = chooseTacticalAction(state, active.instanceId);
    state = executeAction(state, action);
    steps += 1;
  }
  assert.notEqual(state.phase, 'active', 'Expansion 5v5 match should finish within 250 turns');
  assert.ok(state.winner === 'player' || state.winner === 'enemy');
});
