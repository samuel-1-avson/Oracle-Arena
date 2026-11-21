import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCharacterBalance } from './balance';
import {
  BLIND_CLASH_DECK_SIZE,
  createBlindClashMatch,
  getBlindClashRivals,
  playBlindClashCard,
  resolveBlindClashRound,
} from './blind-clash';
import {
  awardAccountBattleProgress,
  BOOSTER_PACK_SHARD_COST,
  buyBoosterPackWithShards,
  buyCreatorCardWithShards,
  canClaimPeriodicPack,
  claimPeriodicPack,
  CREATOR_CARD_SHARD_COST,
  createInitialPlayerEconomy,
  generateCuratedVaultPackCards,
  openWelcomeStarterPack,
  spendCreatorCard,
  STARTER_PACK_CARD_COUNT,
  WEEKLY_PACK_INTERVAL_MS,
} from './packs';
import { STARTER_CHARACTERS } from './roster';
import {
  compileTraitTreeCharacter,
  computeTraitTreePreviewStats,
  getCardTraits,
  getCardVisualStats,
  resolveTraitCounter,
} from './traits';
import {
  buildSampleFriendWish,
  findMatchingPrivateCards,
  formatWishSummaryLine,
} from './wish-trade';

test('Trait Tree compiles legal balanced characters with explicit Pros & Cons', () => {
  const preview = computeTraitTreePreviewStats([
    'super_strength',
    'iron_hide',
    'venom_immunity',
    'heavy_impact',
  ]);
  assert.ok(
    preview.budgetUsed <= preview.budgetCap,
    `Expected stat budget ${preview.budgetUsed} <= ${preview.budgetCap}`
  );

  // Super Strength gives ATK while lowering Speed
  const basePreview = computeTraitTreePreviewStats([]);
  const strengthPreview = computeTraitTreePreviewStats(['super_strength']);
  assert.ok(strengthPreview.stats.attack > basePreview.stats.attack);
  assert.ok(strengthPreview.stats.speed < basePreview.stats.speed);

  const compiled = compileTraitTreeCharacter({
    name: 'Granite Colossus',
    lore: 'An ancient stone guardian who resists poison and smashes shields.',
    element: 'Iron',
    artworkUrl: '/images/card_malakor_dreadguard.jpg',
    creatorId: 'user-1',
    creatorName: 'PlayerOne',
    traitIds: ['super_strength', 'venom_immunity', 'iron_hide', 'titan_blood'],
    ultimateId: 'meteor_breaker',
  });

  assert.equal(compiled.validation.valid, true, JSON.stringify(compiled.validation.issues));
  assert.equal(validateCharacterBalance(compiled.character).valid, true);
  assert.ok(getCardTraits(compiled.character).includes('venom_immunity'));
  assert.ok(getCardTraits(compiled.character).includes('super_strength'));

  const visual = getCardVisualStats(compiled.character);
  assert.ok(visual.powerBars >= 1 && visual.powerBars <= 5);
  assert.ok(visual.healthBars >= 1 && visual.healthBars <= 5);
  assert.ok(visual.armorBars >= 1 && visual.armorBars <= 5);
  assert.ok(visual.speedBars >= 1 && visual.speedBars <= 5);
  assert.ok(visual.powerRating >= 45);
});

test('Trait Counters resolve automatic Blind Clash wins (Venom Resistant beats Venom Touch)', () => {
  const res = resolveTraitCounter(
    ['venom_immunity', 'iron_hide'],
    ['venom_fangs', 'shadow_step']
  );
  assert.equal(res.winner, 'player');
  assert.match(res.headline, /Venom Resistant/i);

  const counter2 = resolveTraitCounter(
    ['super_strength'],
    ['telekinesis']
  );
  assert.equal(counter2.winner, 'enemy');
  assert.match(counter2.headline, /Telekinesis/i);
});

test('Starter Pack unlocks 8 champions + 1 Creator Card, and leveling awards more Creator Cards', () => {
  const fresh = createInitialPlayerEconomy(false);
  assert.equal(fresh.starterPackOpened, false);
  assert.equal(fresh.unlockedStarterIds.length, 0);
  assert.equal(fresh.creatorCards, 0);

  // Spending Creator Card before opening Starter Pack fails cleanly
  const blockedSpend = spendCreatorCard(fresh);
  assert.equal(blockedSpend.ok, false);

  // Tear open Welcome Starter Pack -> 8 cards + 1 Creator Card
  const opened = openWelcomeStarterPack(fresh);
  assert.equal(opened.nextState.starterPackOpened, true);
  assert.equal(opened.unlockedCards.length, STARTER_PACK_CARD_COUNT);
  assert.equal(opened.nextState.unlockedStarterIds.length, STARTER_PACK_CARD_COUNT);
  assert.equal(opened.nextState.creatorCards, 1);

  // Spend the free Creator Card to mint a hero
  const spent = spendCreatorCard(opened.nextState);
  assert.equal(spent.ok, true);
  assert.equal(spent.nextState.creatorCards, 0);

  // Earn Account XP from 2 wins -> Level 2 -> +1 Creator Card!
  const b1 = awardAccountBattleProgress(spent.nextState, {
    won: true,
    mode: 'blind_clash',
  });
  assert.equal(b1.levelsGained, 0);
  const b2 = awardAccountBattleProgress(b1.nextState, {
    won: true,
    mode: 'arena_5v5',
  });
  assert.equal(b2.levelsGained, 1);
  assert.equal(b2.creatorCardsEarned, 1);
  assert.equal(b2.nextState.accountLevel, 2);
  assert.equal(b2.nextState.creatorCards, 1);

  // Buying Creator Card & Booster Pack with Shards
  const richState = {
    ...b2.nextState,
    localShards: CREATOR_CARD_SHARD_COST + BOOSTER_PACK_SHARD_COST,
  };
  const boughtCreator = buyCreatorCardWithShards(richState);
  assert.equal(boughtCreator.ok, true);
  assert.equal(boughtCreator.nextState.creatorCards, 2);
  const boughtPack = buyBoosterPackWithShards(boughtCreator.nextState);
  assert.equal(boughtPack.ok, true);
  assert.equal(boughtPack.nextState.localShards, 0);
});

test('Periodic Weekly/Monthly packs enforce cooldown timers and Vault packs produce 3 legal champions', () => {
  const start = openWelcomeStarterPack(createInitialPlayerEconomy(false)).nextState;
  const t0 = 1_700_000_000_000;

  assert.equal(canClaimPeriodicPack(start, 'weekly', t0).ready, true);
  const claimed = claimPeriodicPack(start, 'weekly', t0);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.packsAdded, 1);

  // Cannot claim again 1 hour later
  assert.equal(canClaimPeriodicPack(claimed.nextState, 'weekly', t0 + 3600_000).ready, false);
  // Ready again after 7 days
  assert.equal(
    canClaimPeriodicPack(claimed.nextState, 'weekly', t0 + WEEKLY_PACK_INTERVAL_MS).ready,
    true
  );

  const vault = generateCuratedVaultPackCards({
    seed: 101,
    existingNames: STARTER_CHARACTERS.slice(0, 8).map((c) => c.name),
    unlockedStarterIds: start.unlockedStarterIds,
    ownerId: 'local-player',
    ownerName: 'Player',
  });
  assert.equal(vault.cards.length, 3);
  for (const card of vault.cards) {
    assert.equal(validateCharacterBalance(card).valid, true);
  }
});

test('Blind Clash resolves 6 hidden rounds and triggers automatic Trait Counter wins', () => {
  const venomCard = compileTraitTreeCharacter({
    name: 'Venom Viper',
    lore: 'A venomous ambush specialist.',
    element: 'Void',
    artworkUrl: '/images/card_kora_hexsmith.jpg',
    creatorId: 'p1',
    creatorName: 'P1',
    traitIds: ['venom_fangs', 'shadow_step'],
    ultimateId: 'venom_cataclysm',
  }).character;

  const immuneCard = compileTraitTreeCharacter({
    name: 'Antidote Knight',
    lore: 'A paladin completely resistant to venom.',
    element: 'Solar',
    artworkUrl: '/images/card_kaelen_solaris.jpg',
    creatorId: 'p2',
    creatorName: 'P2',
    traitIds: ['venom_immunity'],
    ultimateId: 'aegis_sanctuary',
  }).character;

  // Even if immuneCard has lower raw power, Venom Resistant auto-wins vs Venom Touch!
  const round = resolveBlindClashRound(1, immuneCard, venomCard);
  assert.equal(round.winner, 'player');
  assert.equal(round.winReason, 'trait_counter');

  // Full 6-card match completion
  const rivals = getBlindClashRivals(STARTER_CHARACTERS);
  const playerDeck = STARTER_CHARACTERS.slice(0, BLIND_CLASH_DECK_SIZE);
  let match = createBlindClashMatch(playerDeck, rivals[0]);
  for (let i = 0; i < BLIND_CLASH_DECK_SIZE; i += 1) {
    const nextCard = match.playerRemaining[0];
    const step = playBlindClashCard(match, nextCard.id, 42 + i);
    match = step.nextState;
  }
  assert.equal(match.status, 'finished');
  assert.equal(match.rounds.length, BLIND_CLASH_DECK_SIZE);
  assert.ok(match.winner === 'player' || match.winner === 'enemy' || match.winner === 'draw');
});

test('Friends-only Blind Wish-Trade matches only against private cards with requested traits', () => {
  const offered = STARTER_CHARACTERS.find((c) => c.id === 'chr-kora') ?? STARTER_CHARACTERS[0];
  const wish = buildSampleFriendWish('me-uid', 'Me', offered);
  assert.match(formatWishSummaryLine(wish), /Super Strength/i);

  const matches = findMatchingPrivateCards(STARTER_CHARACTERS, wish);
  assert.ok(matches.length >= 1, 'Expected at least 1 starter card with Super Strength');
  assert.equal(matches[0].exactMatch, true);
  assert.ok(getCardTraits(matches[0].card).includes('super_strength'));

  // A private collection with no Super Strength cards produces zero matches
  const nonStrengthCards = STARTER_CHARACTERS.filter(
    (c) => !getCardTraits(c).includes('super_strength')
  );
  const noMatches = findMatchingPrivateCards(nonStrengthCards, wish);
  assert.equal(noMatches.length, 0);
});
