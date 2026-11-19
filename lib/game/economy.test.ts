import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyOwnershipTransferToCard,
  computeMatchShardReward,
  computeTradeNetShards,
  isCardTradable,
  MarketplaceListingDoc,
  MAX_LISTING_PRICE,
  MIN_LISTING_PRICE,
  reconcileOwnedTradableCards,
  TradableCardDoc,
  validateListingDraft,
  validateOfferDraft,
  validateTradeProposalDraft,
} from './economy';
import { DEFAULT_PLAYER_SQUAD_IDS, STARTER_CHARACTERS } from './roster';
import { CharacterDefinition } from './types';

function makeCustomCard(
  id: string,
  ownerId: string,
  creatorId = 'creator-alpha',
  creatorName = 'ArchonLyra'
): CharacterDefinition {
  const base = structuredClone(STARTER_CHARACTERS[0]);
  return {
    ...base,
    id,
    name: `Aether ${id.slice(-4)}`,
    originalCreatorId: creatorId,
    originalCreatorName: creatorName,
    currentOwnerId: ownerId,
    level: 4,
    xp: 640,
    evolutionStage: 1,
    ownershipHistory: [
      {
        fromUserId: null,
        toUserId: creatorId,
        timestamp: '2026-01-01T00:00:00.000Z',
        reason: 'genesis',
      },
    ],
  };
}

function makeTradableDoc(
  card: CharacterDefinition,
  ownerName: string,
  activeListingId = ''
): TradableCardDoc {
  return {
    cardId: card.id,
    ownerId: card.currentOwnerId,
    ownerName,
    originalCreatorId: card.originalCreatorId,
    originalCreatorName: card.originalCreatorName,
    name: card.name,
    role: card.role,
    element: card.element,
    rarity: card.rarity,
    level: card.level,
    evolutionStage: card.evolutionStage,
    isCustom: true,
    activeListingId,
    lastTransferId: '',
    cardData: card,
    createdAt: null,
    updatedAt: null,
  };
}

test('only custom Oracle cards are tradable while Founding Starters remain account-bound', () => {
  assert.equal(isCardTradable(STARTER_CHARACTERS[0]), false);
  const custom = makeCustomCard('chr-custom-nova', 'user-a');
  assert.equal(isCardTradable(custom), true);
});

test('match shard rewards stay strictly within Firestore rule bounds [1, 100]', () => {
  for (const mode of ['solo', 'multiplayer'] as const) {
    const win = computeMatchShardReward(true, mode);
    const loss = computeMatchShardReward(false, mode);
    assert.ok(win > loss && win <= 100 && loss >= 1);
  }
});

test('applyOwnershipTransferToCard preserves immutable creator attribution, ID, and progression', () => {
  const custom = makeCustomCard('chr-custom-sol', 'user-a', 'creator-origin', 'SolForge');
  const transferred = applyOwnershipTransferToCard(custom, {
    fromUserId: 'user-a',
    toUserId: 'user-b',
    reason: 'marketplace',
    timestamp: '2026-06-15T12:00:00.000Z',
  });

  assert.equal(transferred.id, 'chr-custom-sol');
  assert.equal(transferred.originalCreatorId, 'creator-origin');
  assert.equal(transferred.originalCreatorName, 'SolForge');
  assert.equal(transferred.currentOwnerId, 'user-b');
  assert.equal(transferred.level, 4);
  assert.equal(transferred.xp, 640);
  assert.equal(transferred.evolutionStage, 1);
  assert.equal(transferred.ownershipHistory.length, 2);
  assert.deepEqual(transferred.ownershipHistory[1], {
    fromUserId: 'user-a',
    toUserId: 'user-b',
    timestamp: '2026-06-15T12:00:00.000Z',
    reason: 'marketplace',
  });
});

test('computeTradeNetShards resolves even swaps, proposer sweeteners, and recipient sweeteners', () => {
  assert.deepEqual(computeTradeNetShards('u1', 'u2', 0, 0), {
    priceShards: 0,
    shardsPayerUid: '',
    shardsReceiverUid: '',
  });
  assert.deepEqual(computeTradeNetShards('u1', 'u2', 120, 120), {
    priceShards: 0,
    shardsPayerUid: '',
    shardsReceiverUid: '',
  });
  assert.deepEqual(computeTradeNetShards('u1', 'u2', 250, 50), {
    priceShards: 200,
    shardsPayerUid: 'u1',
    shardsReceiverUid: 'u2',
  });
  assert.deepEqual(computeTradeNetShards('u1', 'u2', 40, 190), {
    priceShards: 150,
    shardsPayerUid: 'u2',
    shardsReceiverUid: 'u1',
  });
});

test('validateListingDraft rejects starters, locked cards, and out-of-bounds prices', () => {
  assert.equal(validateListingDraft(STARTER_CHARACTERS[0], 200).ok, false);
  const custom = makeCustomCard('chr-custom-1', 'user-a');
  assert.equal(validateListingDraft(custom, MIN_LISTING_PRICE - 1).ok, false);
  assert.equal(validateListingDraft(custom, MAX_LISTING_PRICE + 1).ok, false);
  assert.equal(validateListingDraft(custom, 150.5).ok, false);
  assert.equal(validateListingDraft(custom, 250, 'listing-existing').ok, false);
  assert.equal(validateListingDraft(custom, 250, '').ok, true);
});

test('validateOfferDraft enforces active listing, allowOffers, no self-offers, and buyer shard balance', () => {
  const custom = makeCustomCard('chr-custom-offer', 'seller-1');
  const listing: MarketplaceListingDoc = {
    listingId: 'list-1',
    cardId: custom.id,
    sellerUid: 'seller-1',
    sellerName: 'SellerOne',
    cardName: custom.name,
    cardRole: custom.role,
    cardElement: custom.element,
    cardRarity: custom.rarity,
    cardLevel: custom.level,
    originalCreatorId: custom.originalCreatorId,
    originalCreatorName: custom.originalCreatorName,
    cardData: custom,
    priceShards: 400,
    allowOffers: true,
    status: 'active',
    buyerUid: '',
    buyerName: '',
    finalPrice: 0,
    transferId: '',
    acceptedOfferId: '',
    createdAt: null,
    updatedAt: null,
  };

  assert.equal(validateOfferDraft(listing, 300, 'seller-1', 500).ok, false);
  assert.equal(validateOfferDraft(listing, 600, 'buyer-2', 500).ok, false);
  assert.equal(validateOfferDraft({ ...listing, allowOffers: false }, 300, 'buyer-2', 500).ok, false);
  assert.equal(validateOfferDraft(listing, 320, 'buyer-2', 500).ok, true);
});

test('validateTradeProposalDraft blocks self-trades, listed cards, and unaffordable Shard sweeteners', () => {
  const cardA = makeTradableDoc(makeCustomCard('chr-custom-a', 'user-a'), 'Alpha');
  const cardB = makeTradableDoc(makeCustomCard('chr-custom-b', 'user-b'), 'Beta');
  const cardBLocked = makeTradableDoc(makeCustomCard('chr-custom-b2', 'user-b'), 'Beta', 'list-9');

  assert.equal(
    validateTradeProposalDraft({
      proposerUid: 'user-a',
      proposerCard: cardA,
      recipientCard: cardA,
      proposerShards: 0,
      recipientShards: 0,
      proposerBalance: 500,
    }).ok,
    false
  );

  assert.equal(
    validateTradeProposalDraft({
      proposerUid: 'user-a',
      proposerCard: cardA,
      recipientCard: cardBLocked,
      proposerShards: 0,
      recipientShards: 0,
      proposerBalance: 500,
    }).ok,
    false
  );

  assert.equal(
    validateTradeProposalDraft({
      proposerUid: 'user-a',
      proposerCard: cardA,
      recipientCard: cardB,
      proposerShards: 700,
      recipientShards: 0,
      proposerBalance: 500,
    }).ok,
    false
  );

  assert.equal(
    validateTradeProposalDraft({
      proposerUid: 'user-a',
      proposerCard: cardA,
      recipientCard: cardB,
      proposerShards: 120,
      recipientShards: 0,
      proposerBalance: 500,
    }).ok,
    true
  );
});

test('reconcileOwnedTradableCards adds newly acquired cards, removes sold/traded cards, and heals 5-card squad', () => {
  const soldCard = makeCustomCard('chr-custom-sold', 'user-a');
  const acquiredCard = makeCustomCard('chr-custom-won', 'user-a', 'creator-b', 'RivalForge');

  const localCollection = [soldCard, ...STARTER_CHARACTERS];
  const activeSquadIds = [
    soldCard.id,
    DEFAULT_PLAYER_SQUAD_IDS[1],
    DEFAULT_PLAYER_SQUAD_IDS[2],
    DEFAULT_PLAYER_SQUAD_IDS[3],
    DEFAULT_PLAYER_SQUAD_IDS[4],
  ];

  const allKnownTradableCards: TradableCardDoc[] = [
    // soldCard is now owned by user-b in the canonical registry
    makeTradableDoc({ ...soldCard, currentOwnerId: 'user-b' }, 'BuyerBeta'),
    // acquiredCard is now owned by user-a in the canonical registry
    makeTradableDoc(acquiredCard, 'Alpha'),
  ];

  const result = reconcileOwnedTradableCards({
    localCollection,
    allKnownTradableCards,
    activeSquadIds,
    userUid: 'user-a',
  });

  assert.deepEqual(result.removedIds, ['chr-custom-sold']);
  assert.deepEqual(result.addedIds, ['chr-custom-won']);
  assert.equal(result.nextCollection.some((c) => c.id === 'chr-custom-sold'), false);
  assert.equal(result.nextCollection.some((c) => c.id === 'chr-custom-won'), true);
  assert.equal(result.nextSquadIds.length, 5);
  assert.equal(result.nextSquadIds.includes('chr-custom-sold'), false);
  assert.equal(new Set(result.nextSquadIds).size, 5);
});
