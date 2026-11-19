import { normalizeCharacterProgression } from './progression';
import { DEFAULT_PLAYER_SQUAD_IDS } from './roster';
import {
  CharacterDefinition,
  CombatRole,
  ElementAffinity,
  OwnershipTransfer,
} from './types';

export const STARTING_SHARDS = 500;
export const MIN_LISTING_PRICE = 25;
export const MAX_LISTING_PRICE = 50000;
export const MAX_TRADE_SHARDS = 10000;
export const MATCH_WIN_SHARDS_SOLO = 60;
export const MATCH_LOSS_SHARDS_SOLO = 25;
export const MATCH_WIN_SHARDS_PVP = 85;
export const MATCH_LOSS_SHARDS_PVP = 35;

export interface PlayerWalletDoc {
  uid: string;
  shards: number;
  totalEarned: number;
  totalSpent: number;
  lastSettlementId: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface TradableCardDoc {
  cardId: string;
  ownerId: string;
  ownerName: string;
  originalCreatorId: string;
  originalCreatorName: string;
  name: string;
  role: CombatRole;
  element: ElementAffinity;
  rarity: CharacterDefinition['rarity'];
  level: number;
  evolutionStage: number;
  isCustom: boolean;
  activeListingId: string;
  lastTransferId: string;
  cardData: CharacterDefinition;
  createdAt: unknown;
  updatedAt: unknown;
}

export type MarketplaceListingStatus = 'active' | 'sold' | 'cancelled';

export interface MarketplaceListingDoc {
  listingId: string;
  cardId: string;
  sellerUid: string;
  sellerName: string;
  cardName: string;
  cardRole: CombatRole;
  cardElement: ElementAffinity;
  cardRarity: CharacterDefinition['rarity'];
  cardLevel: number;
  originalCreatorId: string;
  originalCreatorName: string;
  cardData: CharacterDefinition;
  priceShards: number;
  allowOffers: boolean;
  status: MarketplaceListingStatus;
  buyerUid: string;
  buyerName: string;
  finalPrice: number;
  transferId: string;
  acceptedOfferId: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export type MarketplaceOfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'withdrawn';

export interface MarketplaceOfferDoc {
  offerId: string;
  listingId: string;
  cardId: string;
  sellerUid: string;
  buyerUid: string;
  buyerName: string;
  offerPriceShards: number;
  note: string;
  status: MarketplaceOfferStatus;
  createdAt: unknown;
  updatedAt: unknown;
}

export type TradeProposalStatus =
  | 'pending'
  | 'countered'
  | 'accepted'
  | 'declined'
  | 'cancelled';

export interface TradeProposalDoc {
  tradeId: string;
  proposerUid: string;
  proposerName: string;
  recipientUid: string;
  recipientName: string;
  proposerCardId: string;
  proposerCardName: string;
  proposerCardData: CharacterDefinition;
  recipientCardId: string;
  recipientCardName: string;
  recipientCardData: CharacterDefinition;
  proposerShards: number;
  recipientShards: number;
  message: string;
  status: TradeProposalStatus;
  turnUid: string;
  revision: number;
  transferId: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface OwnershipTransferDoc {
  transferId: string;
  reason: 'marketplace' | 'trade';
  referenceId: string;
  cardId: string;
  cardName: string;
  counterCardId: string;
  counterCardName: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  shardsPayerUid: string;
  shardsReceiverUid: string;
  priceShards: number;
  verified: boolean;
  createdAt: unknown;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Only custom Oracle-forged cards are tradable or sellable.
 * Founding Starter Champions remain account-bound so every player always retains a valid 5-card squad.
 */
export function isCardTradable(card: Pick<CharacterDefinition, 'id'>): boolean {
  return card.id.startsWith('chr-custom-');
}

/**
 * Bounded Oracle Shard reward granted on match completion.
 * Strictly within [1, 100] to align with /wallets/{userId} security rule caps.
 */
export function computeMatchShardReward(
  didWin: boolean,
  mode: 'solo' | 'multiplayer'
): number {
  if (mode === 'multiplayer') {
    return didWin ? MATCH_WIN_SHARDS_PVP : MATCH_LOSS_SHARDS_PVP;
  }
  return didWin ? MATCH_WIN_SHARDS_SOLO : MATCH_LOSS_SHARDS_SOLO;
}

/**
 * Produces an updated CharacterDefinition reflecting verified ownership transfer.
 * Permanently preserves card ID, originalCreatorId, originalCreatorName, level, XP,
 * learned abilities, and evolution history.
 */
export function applyOwnershipTransferToCard(
  card: CharacterDefinition,
  params: {
    fromUserId: string;
    toUserId: string;
    reason: 'marketplace' | 'trade';
    timestamp?: string;
  }
): CharacterDefinition {
  const normalized = normalizeCharacterProgression(card);
  const transfer: OwnershipTransfer = {
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
    timestamp: params.timestamp ?? new Date().toISOString(),
    reason: params.reason,
  };

  return {
    ...normalized,
    id: normalized.id,
    originalCreatorId: normalized.originalCreatorId,
    originalCreatorName: normalized.originalCreatorName,
    currentOwnerId: params.toUserId,
    ownershipHistory: [...normalized.ownershipHistory, transfer],
  };
}

/**
 * Calculates net Oracle Shards settlement for a P2P trade proposal.
 * Exactly matches /ownershipLedger/{transferId} Firestore security rules.
 */
export function computeTradeNetShards(
  proposerUid: string,
  recipientUid: string,
  proposerShards: number,
  recipientShards: number
): {
  priceShards: number;
  shardsPayerUid: string;
  shardsReceiverUid: string;
} {
  const p = Math.max(0, Math.floor(proposerShards));
  const r = Math.max(0, Math.floor(recipientShards));
  if (p === r) {
    return { priceShards: 0, shardsPayerUid: '', shardsReceiverUid: '' };
  }
  if (p > r) {
    return {
      priceShards: p - r,
      shardsPayerUid: proposerUid,
      shardsReceiverUid: recipientUid,
    };
  }
  return {
    priceShards: r - p,
    shardsPayerUid: recipientUid,
    shardsReceiverUid: proposerUid,
  };
}

export function validateListingDraft(
  card: CharacterDefinition | null,
  priceShards: number,
  activeListingId = ''
): ValidationResult {
  if (!card) {
    return { ok: false, error: 'Select a custom Oracle champion to list.' };
  }
  if (!isCardTradable(card)) {
    return {
      ok: false,
      error:
        'Founding Starter Champions are account-bound. Forge a custom champion in Oracle Studio to sell or trade.',
    };
  }
  if (activeListingId) {
    return {
      ok: false,
      error: 'This champion is already listed on the Marketplace.',
    };
  }
  if (!Number.isInteger(priceShards)) {
    return {
      ok: false,
      error: 'Listing price must be a whole number of Oracle Shards.',
    };
  }
  if (priceShards < MIN_LISTING_PRICE || priceShards > MAX_LISTING_PRICE) {
    return {
      ok: false,
      error: `Listing price must be between ${MIN_LISTING_PRICE} and ${MAX_LISTING_PRICE.toLocaleString()} Oracle Shards.`,
    };
  }
  return { ok: true };
}

export function validateOfferDraft(
  listing: MarketplaceListingDoc,
  offerPriceShards: number,
  buyerUid: string,
  buyerShards: number
): ValidationResult {
  if (listing.status !== 'active') {
    return { ok: false, error: 'This listing is no longer active.' };
  }
  if (!listing.allowOffers) {
    return { ok: false, error: 'The seller has disabled offers on this listing.' };
  }
  if (listing.sellerUid === buyerUid) {
    return { ok: false, error: 'You cannot submit an offer on your own listing.' };
  }
  if (
    !Number.isInteger(offerPriceShards) ||
    offerPriceShards < MIN_LISTING_PRICE ||
    offerPriceShards > MAX_LISTING_PRICE
  ) {
    return {
      ok: false,
      error: `Offer must be between ${MIN_LISTING_PRICE} and ${MAX_LISTING_PRICE.toLocaleString()} Oracle Shards.`,
    };
  }
  if (offerPriceShards > buyerShards) {
    return {
      ok: false,
      error: `Insufficient Oracle Shards (you have ${buyerShards.toLocaleString()}).`,
    };
  }
  return { ok: true };
}

export function validateTradeProposalDraft(params: {
  proposerUid: string;
  proposerCard: TradableCardDoc | null;
  recipientCard: TradableCardDoc | null;
  proposerShards: number;
  recipientShards: number;
  proposerBalance: number;
}): ValidationResult {
  const {
    proposerUid,
    proposerCard,
    recipientCard,
    proposerShards,
    recipientShards,
    proposerBalance,
  } = params;

  if (!proposerCard) {
    return { ok: false, error: 'Select one of your custom champions to offer.' };
  }
  if (!recipientCard) {
    return { ok: false, error: 'Select a rival player champion to request.' };
  }
  if (proposerCard.ownerId !== proposerUid) {
    return { ok: false, error: 'You do not currently own the offered card.' };
  }
  if (recipientCard.ownerId === proposerUid) {
    return { ok: false, error: 'You cannot propose a trade with yourself.' };
  }
  if (proposerCard.cardId === recipientCard.cardId) {
    return { ok: false, error: 'Offered and requested cards must be different.' };
  }
  if (proposerCard.activeListingId) {
    return {
      ok: false,
      error: 'Cancel your active Marketplace listing for this card before trading it.',
    };
  }
  if (recipientCard.activeListingId) {
    return {
      ok: false,
      error: 'That champion is currently locked in an active Marketplace listing.',
    };
  }
  if (
    !Number.isInteger(proposerShards) ||
    proposerShards < 0 ||
    proposerShards > MAX_TRADE_SHARDS
  ) {
    return {
      ok: false,
      error: `Offered Shards must be between 0 and ${MAX_TRADE_SHARDS.toLocaleString()}.`,
    };
  }
  if (
    !Number.isInteger(recipientShards) ||
    recipientShards < 0 ||
    recipientShards > MAX_TRADE_SHARDS
  ) {
    return {
      ok: false,
      error: `Requested Shards must be between 0 and ${MAX_TRADE_SHARDS.toLocaleString()}.`,
    };
  }

  const net = computeTradeNetShards(
    proposerUid,
    recipientCard.ownerId,
    proposerShards,
    recipientShards
  );
  if (net.shardsPayerUid === proposerUid && net.priceShards > proposerBalance) {
    return {
      ok: false,
      error: `Your net Shard sweetener (${net.priceShards.toLocaleString()}) exceeds your balance (${proposerBalance.toLocaleString()}).`,
    };
  }

  return { ok: true };
}

/**
 * Reconciles a player's playable collection & active 5-card squad against the live
 * canonical /tradableCards registry whenever cards are acquired, sold, or traded.
 */
export function reconcileOwnedTradableCards(params: {
  localCollection: CharacterDefinition[];
  allKnownTradableCards: TradableCardDoc[];
  activeSquadIds: string[];
  userUid: string;
}): {
  nextCollection: CharacterDefinition[];
  nextSquadIds: string[];
  addedIds: string[];
  removedIds: string[];
} {
  const { localCollection, allKnownTradableCards, activeSquadIds, userUid } =
    params;

  const registryById = new Map<string, TradableCardDoc>();
  for (const doc of allKnownTradableCards) {
    registryById.set(doc.cardId, doc);
  }

  const localById = new Map<string, CharacterDefinition>();
  for (const card of localCollection) {
    localById.set(card.id, normalizeCharacterProgression(card));
  }

  const addedIds: string[] = [];
  const removedIds: string[] = [];

  // 1. Remove any custom card now owned by someone else in the canonical registry
  for (const [cardId] of Array.from(localById.entries())) {
    if (!cardId.startsWith('chr-custom-')) continue;
    const reg = registryById.get(cardId);
    if (reg && reg.ownerId !== userUid) {
      localById.delete(cardId);
      removedIds.push(cardId);
    }
  }

  // 2. Add or refresh any custom card owned by userUid in the canonical registry
  for (const reg of allKnownTradableCards) {
    if (reg.ownerId !== userUid) continue;
    const regCard = normalizeCharacterProgression(reg.cardData);
    const existing = localById.get(reg.cardId);
    if (!existing) {
      localById.set(reg.cardId, regCard);
      addedIds.push(reg.cardId);
    } else if (
      regCard.ownershipHistory.length > existing.ownershipHistory.length ||
      regCard.xp > existing.xp ||
      regCard.evolutionStage > existing.evolutionStage ||
      existing.currentOwnerId !== userUid
    ) {
      localById.set(reg.cardId, regCard);
    }
  }

  // Keep custom cards first, then preserve starter order
  const mergedValues = Array.from(localById.values());
  const customCards = mergedValues.filter((c) => c.id.startsWith('chr-custom-'));
  const starterCards = mergedValues.filter((c) => !c.id.startsWith('chr-custom-'));
  const nextCollection = [...customCards, ...starterCards];

  // 3. Heal active 5-card squad if any card was traded or sold away
  const validIdSet = new Set(nextCollection.map((c) => c.id));
  const nextSquadIds = activeSquadIds.filter((id) => validIdSet.has(id)).slice(0, 5);
  for (const fallbackId of DEFAULT_PLAYER_SQUAD_IDS) {
    if (nextSquadIds.length >= 5) break;
    if (!nextSquadIds.includes(fallbackId) && validIdSet.has(fallbackId)) {
      nextSquadIds.push(fallbackId);
    }
  }

  return {
    nextCollection,
    nextSquadIds,
    addedIds,
    removedIds,
  };
}
