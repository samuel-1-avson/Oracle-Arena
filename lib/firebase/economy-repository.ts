import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  applyOwnershipTransferToCard,
  computeTradeNetShards,
  isCardTradable,
  MarketplaceListingDoc,
  MarketplaceOfferDoc,
  MAX_LISTING_PRICE,
  MAX_TRADE_SHARDS,
  MIN_LISTING_PRICE,
  OwnershipTransferDoc,
  PlayerWalletDoc,
  STARTING_SHARDS,
  TradableCardDoc,
  TradeProposalDoc,
} from '@/lib/game/economy';
import { normalizeCharacterProgression } from '@/lib/game/progression';
import { CharacterDefinition } from '@/lib/game/types';
import { db, handleFirestoreError, OperationType } from './client';

function stripUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Timestamp) return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

function clampString(
  val: string,
  minLen: number,
  maxLen: number,
  fallback: string
): string {
  const cleaned = val.trim().slice(0, maxLen);
  if (cleaned.length < minLen) return fallback.slice(0, maxLen);
  return cleaned;
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`.replace(
    /[^a-zA-Z0-9_-]/g,
    ''
  );
}

export function getEconomyTimestampMillis(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (
    ts &&
    typeof ts === 'object' &&
    'toMillis' in ts &&
    typeof (ts as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

// ============================================================================
// 1. Oracle Shards Wallet (/wallets/{uid})
// ============================================================================

export async function ensurePlayerWallet(uid: string): Promise<PlayerWalletDoc> {
  const path = `wallets/${uid}`;
  const walletRef = doc(db, 'wallets', uid);
  try {
    const snap = await getDoc(walletRef);
    if (snap.exists()) {
      return snap.data() as PlayerWalletDoc;
    }
    const initial: PlayerWalletDoc = {
      uid,
      shards: STARTING_SHARDS,
      totalEarned: STARTING_SHARDS,
      totalSpent: 0,
      lastSettlementId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(walletRef, initial);
    return initial;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribePlayerWallet(
  uid: string,
  onData: (wallet: PlayerWalletDoc | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'wallets', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as PlayerWalletDoc) : null);
    },
    (err) => {
      if (onError) onError(err);
      else console.error(`Wallet listener error at wallets/${uid}:`, err);
    }
  );
}

export async function awardMatchShards(
  uid: string,
  rewardAmount: number
): Promise<number> {
  const delta = Math.max(1, Math.min(100, Math.floor(rewardAmount)));
  const path = `wallets/${uid}`;
  const walletRef = doc(db, 'wallets', uid);
  try {
    const snap = await getDoc(walletRef);
    if (!snap.exists()) {
      await ensurePlayerWallet(uid);
      return STARTING_SHARDS;
    }
    const wallet = snap.data() as PlayerWalletDoc;
    const nextShards = Math.min(10000000, wallet.shards + delta);
    const actualDelta = nextShards - wallet.shards;
    if (actualDelta <= 0) return wallet.shards;

    await updateDoc(walletRef, {
      shards: nextShards,
      totalEarned: wallet.totalEarned + actualDelta,
      updatedAt: serverTimestamp(),
    });
    return nextShards;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// ============================================================================
// 2. Canonical Verified Custom Card Registry (/tradableCards/{cardId})
// ============================================================================

export async function syncCustomCardToRegistry(
  uid: string,
  ownerName: string,
  rawCard: CharacterDefinition
): Promise<void> {
  if (!isCardTradable(rawCard)) return;

  const card = normalizeCharacterProgression(rawCard);
  const path = `tradableCards/${card.id}`;
  const cardRef = doc(db, 'tradableCards', card.id);
  const safeOwnerName = clampString(ownerName, 2, 40, 'Arena Tactician');

  try {
    const snap = await getDoc(cardRef);
    const normalizedCard: CharacterDefinition = {
      ...card,
      currentOwnerId: uid,
    };
    const cleanCardData = stripUndefinedDeep(normalizedCard);

    if (!snap.exists()) {
      const docPayload: TradableCardDoc = {
        cardId: card.id,
        ownerId: uid,
        ownerName: safeOwnerName,
        originalCreatorId: clampString(card.originalCreatorId, 1, 128, uid),
        originalCreatorName: clampString(
          card.originalCreatorName,
          1,
          48,
          safeOwnerName
        ),
        name: clampString(card.name, 2, 48, 'Champion'),
        role: card.role,
        element: card.element,
        rarity: card.rarity,
        level: Math.max(1, Math.min(10, Math.floor(card.level))),
        evolutionStage: Math.max(
          0,
          Math.min(2, Math.floor(card.evolutionStage))
        ),
        isCustom: true,
        activeListingId: '',
        lastTransferId: '',
        cardData: cleanCardData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(cardRef, docPayload);
      return;
    }

    const existing = snap.data() as TradableCardDoc;
    // Only the current owner may update progression, and only while card is not locked in a listing
    if (existing.ownerId !== uid || existing.activeListingId !== '') {
      return;
    }

    await updateDoc(cardRef, {
      ownerName: safeOwnerName,
      name: clampString(card.name, 2, 48, 'Champion'),
      rarity: card.rarity,
      level: Math.max(1, Math.min(10, Math.floor(card.level))),
      evolutionStage: Math.max(
        0,
        Math.min(2, Math.floor(card.evolutionStage))
      ),
      cardData: cleanCardData,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeCustomCardFromRegistry(
  uid: string,
  cardId: string
): Promise<void> {
  if (!cardId.startsWith('chr-custom-')) return;
  const path = `tradableCards/${cardId}`;
  const cardRef = doc(db, 'tradableCards', cardId);
  try {
    const snap = await getDoc(cardRef);
    if (!snap.exists()) return;
    const data = snap.data() as TradableCardDoc;
    if (data.ownerId !== uid) return;
    if (data.activeListingId) {
      throw new Error(
        'Cancel your active Marketplace listing before deleting this card.'
      );
    }
    await deleteDoc(cardRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeTradableCardsCatalog(
  onData: (cards: TradableCardDoc[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(
    collection(db, 'tradableCards'),
    where('isCustom', '==', true),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const cards = snap.docs
        .map((d) => d.data() as TradableCardDoc)
        .sort(
          (a, b) =>
            getEconomyTimestampMillis(b.updatedAt) -
            getEconomyTimestampMillis(a.updatedAt)
        );
      onData(cards);
    },
    (err) => {
      if (onError) onError(err);
      else console.error('Tradable cards catalog listener error:', err);
    }
  );
}

// ============================================================================
// 3. Marketplace Listings & Offers (/marketplaceListings + /offers)
// ============================================================================

export function subscribeMarketplaceListings(
  uid: string,
  onData: (payload: {
    activeListings: MarketplaceListingDoc[];
    myListings: MarketplaceListingDoc[];
    myPurchases: MarketplaceListingDoc[];
  }) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  let activeDocs: MarketplaceListingDoc[] = [];
  let sellerDocs: MarketplaceListingDoc[] = [];
  let buyerDocs: MarketplaceListingDoc[] = [];

  const emit = () => {
    const activeListings = [...activeDocs].sort(
      (a, b) =>
        getEconomyTimestampMillis(b.createdAt) -
        getEconomyTimestampMillis(a.createdAt)
    );
    const myListings = [...sellerDocs].sort(
      (a, b) =>
        getEconomyTimestampMillis(b.updatedAt) -
        getEconomyTimestampMillis(a.updatedAt)
    );
    const myPurchases = [...buyerDocs].sort(
      (a, b) =>
        getEconomyTimestampMillis(b.updatedAt) -
        getEconomyTimestampMillis(a.updatedAt)
    );
    onData({ activeListings, myListings, myPurchases });
  };

  const unsubActive = onSnapshot(
    query(
      collection(db, 'marketplaceListings'),
      where('status', '==', 'active'),
      limit(60)
    ),
    (snap) => {
      activeDocs = snap.docs.map((d) => d.data() as MarketplaceListingDoc);
      emit();
    },
    (err) => {
      if (onError) onError(err);
      else console.error('Active marketplace listings listener error:', err);
    }
  );

  const unsubSeller = onSnapshot(
    query(
      collection(db, 'marketplaceListings'),
      where('sellerUid', '==', uid),
      limit(40)
    ),
    (snap) => {
      sellerDocs = snap.docs.map((d) => d.data() as MarketplaceListingDoc);
      emit();
    },
    (err) => {
      if (onError) onError(err);
      else console.error('Seller listings listener error:', err);
    }
  );

  const unsubBuyer = onSnapshot(
    query(
      collection(db, 'marketplaceListings'),
      where('buyerUid', '==', uid),
      limit(30)
    ),
    (snap) => {
      buyerDocs = snap.docs.map((d) => d.data() as MarketplaceListingDoc);
      emit();
    },
    (err) => {
      if (onError) onError(err);
      else console.error('Buyer listings listener error:', err);
    }
  );

  return () => {
    unsubActive();
    unsubSeller();
    unsubBuyer();
  };
}

/**
 * Creates a Marketplace listing and atomically locks /tradableCards/{cardId}.activeListingId.
 */
export async function createMarketplaceListing(params: {
  sellerUid: string;
  sellerName: string;
  card: TradableCardDoc;
  priceShards: number;
  allowOffers: boolean;
}): Promise<string> {
  const { sellerUid, sellerName, card, priceShards, allowOffers } = params;
  const clampedPrice = Math.max(
    MIN_LISTING_PRICE,
    Math.min(MAX_LISTING_PRICE, Math.floor(priceShards))
  );
  const listingId = makeId('lst');
  const path = `marketplaceListings/${listingId}`;

  try {
    const cardRef = doc(db, 'tradableCards', card.cardId);
    const freshSnap = await getDoc(cardRef);
    if (!freshSnap.exists()) {
      throw new Error('This custom card is not registered in the verified registry yet.');
    }
    const freshCard = freshSnap.data() as TradableCardDoc;
    if (freshCard.ownerId !== sellerUid) {
      throw new Error('You no longer own this champion card.');
    }
    if (freshCard.activeListingId) {
      throw new Error('This champion is already listed on the Marketplace.');
    }

    const batch = writeBatch(db);
    const listingRef = doc(db, 'marketplaceListings', listingId);

    const listingPayload: MarketplaceListingDoc = {
      listingId,
      cardId: freshCard.cardId,
      sellerUid,
      sellerName: clampString(sellerName, 2, 40, 'Arena Seller'),
      cardName: clampString(freshCard.name, 2, 48, 'Champion'),
      cardRole: freshCard.role,
      cardElement: freshCard.element,
      cardRarity: freshCard.rarity,
      cardLevel: freshCard.level,
      originalCreatorId: freshCard.originalCreatorId,
      originalCreatorName: freshCard.originalCreatorName,
      cardData: stripUndefinedDeep(freshCard.cardData),
      priceShards: clampedPrice,
      allowOffers,
      status: 'active',
      buyerUid: '',
      buyerName: '',
      finalPrice: 0,
      transferId: '',
      acceptedOfferId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(listingRef, listingPayload);
    batch.update(cardRef, {
      activeListingId: listingId,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return listingId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Cancels an active Marketplace listing and atomically unlocks /tradableCards/{cardId}.
 */
export async function cancelMarketplaceListing(
  listing: MarketplaceListingDoc
): Promise<void> {
  const path = `marketplaceListings/${listing.listingId}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'marketplaceListings', listing.listingId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'tradableCards', listing.cardId), {
      activeListingId: '',
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Executes an atomic Instant Buyout across:
 * 1) /marketplaceListings/{listingId} (status -> sold)
 * 2) /tradableCards/{cardId} (ownership transfer + appended OwnershipTransfer)
 * 3) /wallets/{buyerUid} (debit priceShards)
 * 4) /wallets/{sellerUid} (credit priceShards)
 * 5) /ownershipLedger/{transferId} (immutable verified receipt)
 */
export async function buyMarketplaceListing(params: {
  listing: MarketplaceListingDoc;
  buyerUid: string;
  buyerName: string;
}): Promise<string> {
  const { listing, buyerUid, buyerName } = params;
  if (listing.sellerUid === buyerUid) {
    throw new Error('You cannot buy your own listing.');
  }

  const transferId = makeId('tx');
  const path = `marketplaceListings/${listing.listingId} + ownershipLedger/${transferId}`;

  try {
    const [listingSnap, cardSnap, buyerWalletSnap, sellerWalletSnap] =
      await Promise.all([
        getDoc(doc(db, 'marketplaceListings', listing.listingId)),
        getDoc(doc(db, 'tradableCards', listing.cardId)),
        getDoc(doc(db, 'wallets', buyerUid)),
        getDoc(doc(db, 'wallets', listing.sellerUid)),
      ]);

    if (!listingSnap.exists()) throw new Error('Listing no longer exists.');
    const liveListing = listingSnap.data() as MarketplaceListingDoc;
    if (liveListing.status !== 'active') {
      throw new Error('This listing has already been sold or cancelled.');
    }
    if (!cardSnap.exists()) throw new Error('Canonical card record not found.');
    const liveCard = cardSnap.data() as TradableCardDoc;
    if (!buyerWalletSnap.exists()) {
      throw new Error('Your Oracle Shards wallet is still initializing.');
    }
    if (!sellerWalletSnap.exists()) {
      throw new Error('Seller wallet has not been initialized yet.');
    }

    const buyerWallet = buyerWalletSnap.data() as PlayerWalletDoc;
    const sellerWallet = sellerWalletSnap.data() as PlayerWalletDoc;
    const price = liveListing.priceShards;

    if (buyerWallet.shards < price) {
      throw new Error(
        `Insufficient Oracle Shards. You need ${price.toLocaleString()} Shards (balance: ${buyerWallet.shards.toLocaleString()}).`
      );
    }

    const safeBuyerName = clampString(buyerName, 2, 40, 'Arena Buyer');
    const transferredCardData = stripUndefinedDeep(
      applyOwnershipTransferToCard(liveCard.cardData, {
        fromUserId: liveListing.sellerUid,
        toUserId: buyerUid,
        reason: 'marketplace',
      })
    );

    const batch = writeBatch(db);

    batch.update(doc(db, 'marketplaceListings', liveListing.listingId), {
      status: 'sold',
      buyerUid,
      buyerName: safeBuyerName,
      finalPrice: price,
      transferId,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'tradableCards', liveListing.cardId), {
      ownerId: buyerUid,
      ownerName: safeBuyerName,
      activeListingId: '',
      lastTransferId: transferId,
      cardData: transferredCardData,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'wallets', buyerUid), {
      shards: buyerWallet.shards - price,
      totalSpent: buyerWallet.totalSpent + price,
      lastSettlementId: transferId,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'wallets', liveListing.sellerUid), {
      shards: sellerWallet.shards + price,
      totalEarned: sellerWallet.totalEarned + price,
      lastSettlementId: transferId,
      updatedAt: serverTimestamp(),
    });

    const ledgerEntry: OwnershipTransferDoc = {
      transferId,
      reason: 'marketplace',
      referenceId: liveListing.listingId,
      cardId: liveListing.cardId,
      cardName: clampString(liveListing.cardName, 2, 48, 'Champion'),
      counterCardId: '',
      counterCardName: '',
      fromUid: liveListing.sellerUid,
      fromName: clampString(liveListing.sellerName, 2, 40, 'Seller'),
      toUid: buyerUid,
      toName: safeBuyerName,
      shardsPayerUid: buyerUid,
      shardsReceiverUid: liveListing.sellerUid,
      priceShards: price,
      verified: true,
      createdAt: serverTimestamp(),
    };
    batch.set(doc(db, 'ownershipLedger', transferId), ledgerEntry);

    await batch.commit();
    return transferId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function submitMarketplaceOffer(params: {
  listing: MarketplaceListingDoc;
  buyerUid: string;
  buyerName: string;
  offerPriceShards: number;
  note: string;
}): Promise<string> {
  const { listing, buyerUid, buyerName, offerPriceShards, note } = params;
  const offerId = makeId('ofr');
  const path = `marketplaceListings/${listing.listingId}/offers/${offerId}`;
  const price = Math.max(
    MIN_LISTING_PRICE,
    Math.min(MAX_LISTING_PRICE, Math.floor(offerPriceShards))
  );

  try {
    const payload: MarketplaceOfferDoc = {
      offerId,
      listingId: listing.listingId,
      cardId: listing.cardId,
      sellerUid: listing.sellerUid,
      buyerUid,
      buyerName: clampString(buyerName, 2, 40, 'Arena Bidder'),
      offerPriceShards: price,
      note: note.trim().slice(0, 180),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(
      doc(db, 'marketplaceListings', listing.listingId, 'offers', offerId),
      payload
    );
    return offerId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

/**
 * Subscribes to offers on a specific listing using a single-field filter
 * (`sellerUid == uid` for sellers, `buyerUid == uid` for buyers) — zero composite indexes!
 */
export function subscribeListingOffers(
  listingId: string,
  uid: string,
  isSeller: boolean,
  onData: (offers: MarketplaceOfferDoc[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const field = isSeller ? 'sellerUid' : 'buyerUid';
  const q = query(
    collection(db, 'marketplaceListings', listingId, 'offers'),
    where(field, '==', uid),
    limit(25)
  );
  return onSnapshot(
    q,
    (snap) => {
      const offers = snap.docs
        .map((d) => d.data() as MarketplaceOfferDoc)
        .sort(
          (a, b) =>
            getEconomyTimestampMillis(b.createdAt) -
            getEconomyTimestampMillis(a.createdAt)
        );
      onData(offers);
    },
    (err) => {
      if (onError) onError(err);
      else console.error(`Listing offers listener error (${listingId}):`, err);
    }
  );
}

export async function updateMarketplaceOfferStatus(
  listingId: string,
  offerId: string,
  status: 'withdrawn' | 'declined'
): Promise<void> {
  const path = `marketplaceListings/${listingId}/offers/${offerId}`;
  try {
    await updateDoc(
      doc(db, 'marketplaceListings', listingId, 'offers', offerId),
      {
        status,
        updatedAt: serverTimestamp(),
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Seller accepts a verified pending buyer offer atomically across:
 * 1) /offers/{offerId} (status -> accepted)
 * 2) /marketplaceListings/{listingId} (status -> sold, acceptedOfferId, finalPrice)
 * 3) /tradableCards/{cardId} (ownership transfer)
 * 4) /wallets/{buyerUid} (debit offerPriceShards)
 * 5) /wallets/{sellerUid} (credit offerPriceShards)
 * 6) /ownershipLedger/{transferId} (immutable receipt)
 */
export async function acceptMarketplaceOffer(params: {
  listing: MarketplaceListingDoc;
  offer: MarketplaceOfferDoc;
}): Promise<string> {
  const { listing, offer } = params;
  const transferId = makeId('tx');
  const path = `marketplaceListings/${listing.listingId}/offers/${offer.offerId}`;

  try {
    const [listingSnap, offerSnap, cardSnap, buyerWalletSnap, sellerWalletSnap] =
      await Promise.all([
        getDoc(doc(db, 'marketplaceListings', listing.listingId)),
        getDoc(
          doc(
            db,
            'marketplaceListings',
            listing.listingId,
            'offers',
            offer.offerId
          )
        ),
        getDoc(doc(db, 'tradableCards', listing.cardId)),
        getDoc(doc(db, 'wallets', offer.buyerUid)),
        getDoc(doc(db, 'wallets', listing.sellerUid)),
      ]);

    if (!listingSnap.exists() || !offerSnap.exists() || !cardSnap.exists()) {
      throw new Error('Listing, offer, or canonical card record no longer exists.');
    }
    const liveListing = listingSnap.data() as MarketplaceListingDoc;
    const liveOffer = offerSnap.data() as MarketplaceOfferDoc;
    const liveCard = cardSnap.data() as TradableCardDoc;

    if (liveListing.status !== 'active') {
      throw new Error('This listing is no longer active.');
    }
    if (liveOffer.status !== 'pending') {
      throw new Error('This offer is no longer pending.');
    }
    if (!buyerWalletSnap.exists() || !sellerWalletSnap.exists()) {
      throw new Error('Buyer or seller wallet is not initialized.');
    }

    const buyerWallet = buyerWalletSnap.data() as PlayerWalletDoc;
    const sellerWallet = sellerWalletSnap.data() as PlayerWalletDoc;
    const price = liveOffer.offerPriceShards;

    if (buyerWallet.shards < price) {
      throw new Error(
        `${liveOffer.buyerName} no longer has enough Oracle Shards (${buyerWallet.shards.toLocaleString()} < ${price.toLocaleString()}).`
      );
    }

    const transferredCardData = stripUndefinedDeep(
      applyOwnershipTransferToCard(liveCard.cardData, {
        fromUserId: liveListing.sellerUid,
        toUserId: liveOffer.buyerUid,
        reason: 'marketplace',
      })
    );

    const batch = writeBatch(db);

    batch.update(
      doc(
        db,
        'marketplaceListings',
        liveListing.listingId,
        'offers',
        liveOffer.offerId
      ),
      {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      }
    );

    batch.update(doc(db, 'marketplaceListings', liveListing.listingId), {
      status: 'sold',
      buyerUid: liveOffer.buyerUid,
      buyerName: clampString(liveOffer.buyerName, 2, 40, 'Arena Buyer'),
      finalPrice: price,
      transferId,
      acceptedOfferId: liveOffer.offerId,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'tradableCards', liveListing.cardId), {
      ownerId: liveOffer.buyerUid,
      ownerName: clampString(liveOffer.buyerName, 2, 40, 'Arena Buyer'),
      activeListingId: '',
      lastTransferId: transferId,
      cardData: transferredCardData,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'wallets', liveOffer.buyerUid), {
      shards: buyerWallet.shards - price,
      totalSpent: buyerWallet.totalSpent + price,
      lastSettlementId: transferId,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'wallets', liveListing.sellerUid), {
      shards: sellerWallet.shards + price,
      totalEarned: sellerWallet.totalEarned + price,
      lastSettlementId: transferId,
      updatedAt: serverTimestamp(),
    });

    const ledgerEntry: OwnershipTransferDoc = {
      transferId,
      reason: 'marketplace',
      referenceId: liveListing.listingId,
      cardId: liveListing.cardId,
      cardName: clampString(liveListing.cardName, 2, 48, 'Champion'),
      counterCardId: '',
      counterCardName: '',
      fromUid: liveListing.sellerUid,
      fromName: clampString(liveListing.sellerName, 2, 40, 'Seller'),
      toUid: liveOffer.buyerUid,
      toName: clampString(liveOffer.buyerName, 2, 40, 'Arena Buyer'),
      shardsPayerUid: liveOffer.buyerUid,
      shardsReceiverUid: liveListing.sellerUid,
      priceShards: price,
      verified: true,
      createdAt: serverTimestamp(),
    };
    batch.set(doc(db, 'ownershipLedger', transferId), ledgerEntry);

    await batch.commit();
    return transferId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// ============================================================================
// 4. Direct Player-to-Player Trading Hub (/trades/{tradeId})
// ============================================================================

export function subscribeMyTrades(
  uid: string,
  onData: (trades: TradeProposalDoc[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  let proposedDocs: TradeProposalDoc[] = [];
  let receivedDocs: TradeProposalDoc[] = [];

  const emit = () => {
    const merged = new Map<string, TradeProposalDoc>();
    for (const t of [...proposedDocs, ...receivedDocs]) {
      merged.set(t.tradeId, t);
    }
    const sorted = Array.from(merged.values()).sort(
      (a, b) =>
        getEconomyTimestampMillis(b.updatedAt) -
        getEconomyTimestampMillis(a.updatedAt)
    );
    onData(sorted);
  };

  const unsubProposer = onSnapshot(
    query(collection(db, 'trades'), where('proposerUid', '==', uid), limit(30)),
    (snap) => {
      proposedDocs = snap.docs.map((d) => d.data() as TradeProposalDoc);
      emit();
    },
    (err) => {
      if (onError) onError(err);
      else console.error('Proposed trades listener error:', err);
    }
  );

  const unsubRecipient = onSnapshot(
    query(collection(db, 'trades'), where('recipientUid', '==', uid), limit(30)),
    (snap) => {
      receivedDocs = snap.docs.map((d) => d.data() as TradeProposalDoc);
      emit();
    },
    (err) => {
      if (onError) onError(err);
      else console.error('Received trades listener error:', err);
    }
  );

  return () => {
    unsubProposer();
    unsubRecipient();
  };
}

export async function createTradeProposal(params: {
  proposerUid: string;
  proposerName: string;
  proposerCard: TradableCardDoc;
  recipientCard: TradableCardDoc;
  proposerShards: number;
  recipientShards: number;
  message: string;
}): Promise<string> {
  const {
    proposerUid,
    proposerName,
    proposerCard,
    recipientCard,
    proposerShards,
    recipientShards,
    message,
  } = params;
  const tradeId = makeId('trd');
  const path = `trades/${tradeId}`;

  const cleanProposerShards = Math.max(
    0,
    Math.min(MAX_TRADE_SHARDS, Math.floor(proposerShards))
  );
  const cleanRecipientShards = Math.max(
    0,
    Math.min(MAX_TRADE_SHARDS, Math.floor(recipientShards))
  );

  try {
    const payload: TradeProposalDoc = {
      tradeId,
      proposerUid,
      proposerName: clampString(proposerName, 2, 40, 'Arena Proposer'),
      recipientUid: recipientCard.ownerId,
      recipientName: clampString(recipientCard.ownerName, 2, 40, 'Arena Rival'),
      proposerCardId: proposerCard.cardId,
      proposerCardName: clampString(proposerCard.name, 2, 48, 'Champion'),
      proposerCardData: stripUndefinedDeep(proposerCard.cardData),
      recipientCardId: recipientCard.cardId,
      recipientCardName: clampString(recipientCard.name, 2, 48, 'Champion'),
      recipientCardData: stripUndefinedDeep(recipientCard.cardData),
      proposerShards: cleanProposerShards,
      recipientShards: cleanRecipientShards,
      message: message.trim().slice(0, 200),
      status: 'pending',
      turnUid: recipientCard.ownerId,
      revision: 1,
      transferId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'trades', tradeId), payload);
    return tradeId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function submitTradeCounteroffer(params: {
  trade: TradeProposalDoc;
  actingUid: string;
  nextProposerCard: TradableCardDoc;
  nextRecipientCard: TradableCardDoc;
  nextProposerShards: number;
  nextRecipientShards: number;
  message: string;
}): Promise<void> {
  const {
    trade,
    actingUid,
    nextProposerCard,
    nextRecipientCard,
    nextProposerShards,
    nextRecipientShards,
    message,
  } = params;
  if (trade.turnUid !== actingUid) {
    throw new Error('It is not your turn to counter this trade.');
  }
  const nextTurnUid =
    actingUid === trade.proposerUid ? trade.recipientUid : trade.proposerUid;
  const path = `trades/${trade.tradeId}`;

  try {
    await updateDoc(doc(db, 'trades', trade.tradeId), {
      proposerCardId: nextProposerCard.cardId,
      proposerCardName: clampString(nextProposerCard.name, 2, 48, 'Champion'),
      proposerCardData: stripUndefinedDeep(nextProposerCard.cardData),
      recipientCardId: nextRecipientCard.cardId,
      recipientCardName: clampString(nextRecipientCard.name, 2, 48, 'Champion'),
      recipientCardData: stripUndefinedDeep(nextRecipientCard.cardData),
      proposerShards: Math.max(
        0,
        Math.min(MAX_TRADE_SHARDS, Math.floor(nextProposerShards))
      ),
      recipientShards: Math.max(
        0,
        Math.min(MAX_TRADE_SHARDS, Math.floor(nextRecipientShards))
      ),
      message: message.trim().slice(0, 200),
      status: 'countered',
      turnUid: nextTurnUid,
      revision: Math.min(25, trade.revision + 1),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateTradeStatus(
  tradeId: string,
  status: 'declined' | 'cancelled'
): Promise<void> {
  const path = `trades/${tradeId}`;
  try {
    await updateDoc(doc(db, 'trades', tradeId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Executes an atomic P2P Trade Acceptance across:
 * 1) /trades/{tradeId} (status -> accepted, transferId)
 * 2) /tradableCards/{proposerCardId} (ownership -> recipientUid)
 * 3) /tradableCards/{recipientCardId} (ownership -> proposerUid)
 * 4) Optional /wallets/{payer} & /wallets/{receiver} if net shards > 0
 * 5) /ownershipLedger/{transferId} (immutable verified receipt)
 */
export async function acceptTradeProposal(
  trade: TradeProposalDoc,
  actingUid: string
): Promise<string> {
  if (trade.turnUid !== actingUid) {
    throw new Error('Awaiting the other player before this trade can be accepted.');
  }
  const transferId = makeId('tx');
  const path = `trades/${trade.tradeId} + ownershipLedger/${transferId}`;

  try {
    const [tradeSnap, propCardSnap, recCardSnap] = await Promise.all([
      getDoc(doc(db, 'trades', trade.tradeId)),
      getDoc(doc(db, 'tradableCards', trade.proposerCardId)),
      getDoc(doc(db, 'tradableCards', trade.recipientCardId)),
    ]);

    if (!tradeSnap.exists()) throw new Error('Trade proposal no longer exists.');
    const liveTrade = tradeSnap.data() as TradeProposalDoc;
    if (liveTrade.status !== 'pending' && liveTrade.status !== 'countered') {
      throw new Error('This trade negotiation is already closed.');
    }
    if (liveTrade.turnUid !== actingUid) {
      throw new Error('It is not your turn to accept this trade.');
    }
    if (!propCardSnap.exists() || !recCardSnap.exists()) {
      throw new Error('One of the traded cards is no longer in the verified registry.');
    }

    const propCard = propCardSnap.data() as TradableCardDoc;
    const recCard = recCardSnap.data() as TradableCardDoc;

    if (propCard.ownerId !== liveTrade.proposerUid || propCard.activeListingId) {
      throw new Error(
        `${liveTrade.proposerCardName} is no longer owned or unlocked by ${liveTrade.proposerName}.`
      );
    }
    if (recCard.ownerId !== liveTrade.recipientUid || recCard.activeListingId) {
      throw new Error(
        `${liveTrade.recipientCardName} is no longer owned or unlocked by ${liveTrade.recipientName}.`
      );
    }

    const net = computeTradeNetShards(
      liveTrade.proposerUid,
      liveTrade.recipientUid,
      liveTrade.proposerShards,
      liveTrade.recipientShards
    );

    const batch = writeBatch(db);

    if (net.priceShards > 0) {
      const [payerSnap, receiverSnap] = await Promise.all([
        getDoc(doc(db, 'wallets', net.shardsPayerUid)),
        getDoc(doc(db, 'wallets', net.shardsReceiverUid)),
      ]);
      if (!payerSnap.exists() || !receiverSnap.exists()) {
        throw new Error('Both players must have initialized wallets for Shard sweeteners.');
      }
      const payerWallet = payerSnap.data() as PlayerWalletDoc;
      const receiverWallet = receiverSnap.data() as PlayerWalletDoc;
      if (payerWallet.shards < net.priceShards) {
        const payerLabel =
          net.shardsPayerUid === liveTrade.proposerUid
            ? liveTrade.proposerName
            : liveTrade.recipientName;
        throw new Error(
          `${payerLabel} does not have enough Oracle Shards (${payerWallet.shards.toLocaleString()} < ${net.priceShards.toLocaleString()}).`
        );
      }

      batch.update(doc(db, 'wallets', net.shardsPayerUid), {
        shards: payerWallet.shards - net.priceShards,
        totalSpent: payerWallet.totalSpent + net.priceShards,
        lastSettlementId: transferId,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'wallets', net.shardsReceiverUid), {
        shards: receiverWallet.shards + net.priceShards,
        totalEarned: receiverWallet.totalEarned + net.priceShards,
        lastSettlementId: transferId,
        updatedAt: serverTimestamp(),
      });
    }

    const nowIso = new Date().toISOString();
    const nextPropCardData = stripUndefinedDeep(
      applyOwnershipTransferToCard(propCard.cardData, {
        fromUserId: liveTrade.proposerUid,
        toUserId: liveTrade.recipientUid,
        reason: 'trade',
        timestamp: nowIso,
      })
    );
    const nextRecCardData = stripUndefinedDeep(
      applyOwnershipTransferToCard(recCard.cardData, {
        fromUserId: liveTrade.recipientUid,
        toUserId: liveTrade.proposerUid,
        reason: 'trade',
        timestamp: nowIso,
      })
    );

    batch.update(doc(db, 'trades', liveTrade.tradeId), {
      status: 'accepted',
      transferId,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'tradableCards', liveTrade.proposerCardId), {
      ownerId: liveTrade.recipientUid,
      ownerName: clampString(liveTrade.recipientName, 2, 40, 'Arena Rival'),
      lastTransferId: transferId,
      cardData: nextPropCardData,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'tradableCards', liveTrade.recipientCardId), {
      ownerId: liveTrade.proposerUid,
      ownerName: clampString(liveTrade.proposerName, 2, 40, 'Arena Proposer'),
      lastTransferId: transferId,
      cardData: nextRecCardData,
      updatedAt: serverTimestamp(),
    });

    const ledgerEntry: OwnershipTransferDoc = {
      transferId,
      reason: 'trade',
      referenceId: liveTrade.tradeId,
      cardId: liveTrade.proposerCardId,
      cardName: clampString(liveTrade.proposerCardName, 2, 48, 'Champion'),
      counterCardId: liveTrade.recipientCardId,
      counterCardName: clampString(liveTrade.recipientCardName, 2, 48, 'Champion'),
      fromUid: liveTrade.proposerUid,
      fromName: clampString(liveTrade.proposerName, 2, 40, 'Arena Proposer'),
      toUid: liveTrade.recipientUid,
      toName: clampString(liveTrade.recipientName, 2, 40, 'Arena Rival'),
      shardsPayerUid: net.shardsPayerUid,
      shardsReceiverUid: net.shardsReceiverUid,
      priceShards: net.priceShards,
      verified: true,
      createdAt: serverTimestamp(),
    };
    batch.set(doc(db, 'ownershipLedger', transferId), ledgerEntry);

    await batch.commit();
    return transferId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// ============================================================================
// 5. Verified Public Ownership Ledger (/ownershipLedger)
// ============================================================================

export function subscribeOwnershipLedger(
  onData: (transfers: OwnershipTransferDoc[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(
    collection(db, 'ownershipLedger'),
    where('verified', '==', true),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      const transfers = snap.docs
        .map((d) => d.data() as OwnershipTransferDoc)
        .sort(
          (a, b) =>
            getEconomyTimestampMillis(b.createdAt) -
            getEconomyTimestampMillis(a.createdAt)
        );
      onData(transfers);
    },
    (err) => {
      if (onError) onError(err);
      else console.error('Ownership ledger listener error:', err);
    }
  );
}
