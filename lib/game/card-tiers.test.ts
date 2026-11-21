import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCharacterBalance } from './balance';
import { resolveBlindClashRound } from './blind-clash';
import {
  CARD_TIERS,
  countCardsByTier,
  formatTierLevelLabel,
  getCardTierForLevel,
  getCardTierVisualClasses,
  getNextCardTier,
  isTrumpCard,
  SHARD_TRAINING_COST,
  SHARD_TRAINING_XP,
} from './card-tiers';
import { createBattle } from './engine';
import {
  LEVEL_XP_THRESHOLDS,
  MAX_CHARACTER_LEVEL,
  trainCharacterWithShards,
} from './progression';
import {
  DEFAULT_ENEMY_SQUAD_IDS,
  DEFAULT_PLAYER_SQUAD_IDS,
  getSquadCharacters,
  STARTER_CHARACTERS,
} from './roster';

test('Card Level Tier System maps Levels 1-10 cleanly to Bronze, Silver, Gold, Diamond, and Legendary Trump Cards', () => {
  assert.equal(CARD_TIERS.length, 5);

  const expected: Array<[number, string, boolean]> = [
    [1, 'bronze', false],
    [2, 'bronze', false],
    [3, 'silver', false],
    [4, 'silver', false],
    [5, 'gold', false],
    [6, 'gold', false],
    [7, 'diamond', false],
    [8, 'diamond', false],
    [9, 'trump', true],
    [10, 'trump', true],
  ];

  for (const [level, tierId, trump] of expected) {
    const tier = getCardTierForLevel(level);
    assert.equal(tier.id, tierId, `Expected Lv.${level} to map to ${tierId}`);
    assert.equal(isTrumpCard(level), trump, `Unexpected Trump status at Lv.${level}`);
  }

  assert.equal(getCardTierForLevel(9).rankTitle, 'Legendary Trump Card');
  assert.equal(getCardTierForLevel(10).badgeLabel, 'TRUMP CARD');
  assert.equal(getNextCardTier(1)?.id, 'silver');
  assert.equal(getNextCardTier(3)?.id, 'gold');
  assert.equal(getNextCardTier(5)?.id, 'diamond');
  assert.equal(getNextCardTier(7)?.id, 'trump');
  assert.equal(getNextCardTier(9), null);
  assert.equal(formatTierLevelLabel(9), 'TRUMP CARD · Lv.9');

  const counts = countCardsByTier([
    { level: 1 },
    { level: 2 },
    { level: 4 },
    { level: 6 },
    { level: 8 },
    { level: 9 },
    { level: 10 },
  ]);
  assert.deepEqual(counts, {
    bronze: 2,
    silver: 1,
    gold: 1,
    diamond: 1,
    trump: 2,
  });
});

test('trainCharacterWithShards promotes a card from Bronze -> Silver -> Gold -> Diamond -> Legendary Trump Card', () => {
  let card = { ...STARTER_CHARACTERS[0], level: 1, xp: 0, upgradePoints: 0, abilityCreationPoints: 0 };
  let shards = 1000;

  // Reject when shards are insufficient
  const broke = trainCharacterWithShards(card, SHARD_TRAINING_COST - 1);
  assert.equal(broke.ok, false);

  const promotedTiers: string[] = [];
  while (card.level < MAX_CHARACTER_LEVEL) {
    const res = trainCharacterWithShards(card, shards);
    assert.equal(res.ok, true, res.ok ? '' : res.error);
    if (!res.ok) break;
    assert.equal(res.shardsSpent, SHARD_TRAINING_COST);
    assert.equal(res.xpGained, SHARD_TRAINING_XP);
    shards -= res.shardsSpent;
    card = res.character;
    if (res.tierPromoted) {
      promotedTiers.push(`${res.previousTier}->${res.newTier}`);
    }
  }

  assert.equal(card.level, MAX_CHARACTER_LEVEL);
  assert.equal(isTrumpCard(card), true);
  assert.deepEqual(promotedTiers, [
    'bronze->silver',
    'silver->gold',
    'gold->diamond',
    'diamond->trump',
  ]);
  assert.equal(card.upgradePoints, 18); // 9 level-ups * 2 UP
  assert.equal(card.abilityCreationPoints, 5); // Lv 2, 4, 6, 8, 10
  assert.equal(validateCharacterBalance(card).valid, true);

  // Reject once at Max Level 10
  const capped = trainCharacterWithShards(card, 500);
  assert.equal(capped.ok, false);
});

test('5v5 battle engine applies Tier Resonance bonuses cleanly and grants Trump Cards +15% stats & +15 Starting Energy', () => {
  const basePlayerSquad = getSquadCharacters(DEFAULT_PLAYER_SQUAD_IDS);
  const enemySquad = getSquadCharacters(DEFAULT_ENEMY_SQUAD_IDS);

  const baselineBattle = createBattle(basePlayerSquad, enemySquad, 5050);
  const baselineUnits = baselineBattle.units.filter((u) => u.side === 'player');

  const upgradedSquad = [
    { ...basePlayerSquad[0], level: 1, xp: 0 }, // Bronze (+0%)
    { ...basePlayerSquad[1], level: 3, xp: LEVEL_XP_THRESHOLDS[2] }, // Silver (+3%)
    { ...basePlayerSquad[2], level: 5, xp: LEVEL_XP_THRESHOLDS[4] }, // Gold (+6%)
    { ...basePlayerSquad[3], level: 7, xp: LEVEL_XP_THRESHOLDS[6] }, // Diamond (+10%)
    { ...basePlayerSquad[4], level: 9, xp: LEVEL_XP_THRESHOLDS[8] }, // Legendary Trump (+15% & +15 EN)
  ];

  const battle = createBattle(upgradedSquad, enemySquad, 5050);
  const units = battle.units.filter((u) => u.side === 'player');

  assert.equal(units[0].cardTier, 'bronze');
  assert.equal(units[0].maxHp, baselineUnits[0].maxHp);
  assert.equal(units[0].currentEnergy, baselineUnits[0].currentEnergy);

  assert.equal(units[1].cardTier, 'silver');
  assert.equal(units[1].maxHp, Math.round(basePlayerSquad[1].stats.maxHp * 1.03));

  assert.equal(units[2].cardTier, 'gold');
  assert.ok(
    units[2].attack > baselineUnits[2].attack,
    `Expected Gold attack (${units[2].attack}) > Bronze attack (${baselineUnits[2].attack})`
  );

  assert.equal(units[3].cardTier, 'diamond');
  assert.ok(
    units[3].defense > baselineUnits[3].defense,
    `Expected Diamond defense (${units[3].defense}) > Bronze defense (${baselineUnits[3].defense})`
  );

  assert.equal(units[4].cardTier, 'trump');
  assert.equal(units[4].maxHp, Math.round(basePlayerSquad[4].stats.maxHp * 1.15));
  assert.equal(
    units[4].currentEnergy,
    Math.min(
      basePlayerSquad[4].stats.maxEnergy,
      basePlayerSquad[4].stats.startingEnergy + 15
    )
  );
});

test('Blind Clash grants Tier Power Bonuses and Legendary Trump Card Dominance', () => {
  // Use identical champion definitions (no trait counter, same element) to isolate Tier impact
  const bronzeCard = { ...STARTER_CHARACTERS[0], level: 1, xp: 0 };
  const trumpCard = { ...STARTER_CHARACTERS[0], level: 9, xp: LEVEL_XP_THRESHOLDS[8] };

  const result = resolveBlindClashRound(1, trumpCard, bronzeCard);
  assert.equal(result.playerTier, 'trump');
  assert.equal(result.enemyTier, 'bronze');
  assert.equal(result.winner, 'player');
  assert.equal(result.winReason, 'trump_override');
  assert.equal(result.playerFinalPower, result.playerBasePower + 15);
  assert.equal(result.enemyFinalPower, result.enemyBasePower);
  assert.ok(result.playerFinalPower > result.enemyFinalPower);
  assert.ok(result.headline.includes('TRUMP CARD'));
});

test('CSS styling system assigns distinct border, overlay, and corner filigree classes per tier', () => {
  const sampleLevels = [1, 3, 5, 7, 9];
  const frameSet = new Set<string>();
  const overlaySet = new Set<string>();

  for (const lvl of sampleLevels) {
    const css = getCardTierVisualClasses(lvl);
    assert.ok(css.frameClass.includes('card-tier-frame'));
    assert.ok(css.frameClass.includes(`card-tier-${css.tierId}`));
    assert.ok(css.overlayClass.includes('card-tier-overlay'));
    assert.ok(css.overlayClass.includes(`card-tier-overlay-${css.tierId}`));
    frameSet.add(css.frameClass);
    overlaySet.add(css.overlayClass);
  }

  assert.equal(frameSet.size, 5, 'All 5 tiers must have unique CSS border classes');
  assert.equal(overlaySet.size, 5, 'All 5 tiers must have unique CSS overlay classes');
  assert.equal(getCardTierVisualClasses(1).showCornerFiligree, false);
  assert.equal(getCardTierVisualClasses(3).showCornerFiligree, false);
  assert.equal(getCardTierVisualClasses(5).showCornerFiligree, true);
  assert.equal(getCardTierVisualClasses(7).showCornerFiligree, true);
  assert.equal(getCardTierVisualClasses(9).showCornerFiligree, true);
});
