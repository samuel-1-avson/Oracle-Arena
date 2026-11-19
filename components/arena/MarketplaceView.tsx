'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  BadgeCheck,
  Check,
  Eye,
  Gem,
  Handshake,
  Layers,
  Loader2,
  LogIn,
  PlusCircle,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  X,
} from 'lucide-react';
import {
  acceptMarketplaceOffer,
  buyMarketplaceListing,
  cancelMarketplaceListing,
  createMarketplaceListing,
  getEconomyTimestampMillis,
  submitMarketplaceOffer,
  subscribeListingOffers,
  subscribeMarketplaceListings,
  subscribeOwnershipLedger,
  updateMarketplaceOfferStatus,
} from '@/lib/firebase/economy-repository';
import {
  MarketplaceListingDoc,
  MarketplaceOfferDoc,
  MAX_LISTING_PRICE,
  MIN_LISTING_PRICE,
  OwnershipTransferDoc,
  TradableCardDoc,
  validateListingDraft,
  validateOfferDraft,
} from '@/lib/game/economy';
import {
  CharacterDefinition,
  CombatRole,
  ElementAffinity,
} from '@/lib/game/types';
import { AccountBar } from './AccountBar';
import { CharacterDetailModal } from './CharacterDetailModal';
import { useFirebaseAuth } from './FirebaseProvider';
import { ELEMENT_STYLES } from './ui-meta';

interface MarketplaceViewProps {
  tradableCatalog: TradableCardDoc[];
  syncingCloud?: boolean;
  onOpenTradingHub: () => void;
  onOpenStudio: () => void;
  onOpenCollection: () => void;
  onBackToTitle: () => void;
}

type MarketTab = 'browse' | 'sell' | 'ledger';
type PriceSort = 'newest' | 'price_asc' | 'price_desc';

const ROLES: Array<'All' | CombatRole> = [
  'All',
  'Vanguard',
  'Striker',
  'Arcanist',
  'Warden',
  'Tactician',
];

const ELEMENTS: Array<'All' | ElementAffinity> = [
  'All',
  'Solar',
  'Void',
  'Storm',
  'Aether',
  'Cyber',
  'Iron',
  'Ember',
  'Frost',
];

function formatRelativeTime(ts: unknown): string {
  const ms = getEconomyTimestampMillis(ts);
  if (!ms) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function SellerOffersPanel({
  listing,
  sellerUid,
  onStatusMessage,
}: {
  listing: MarketplaceListingDoc;
  sellerUid: string;
  onStatusMessage: (msg: { kind: 'success' | 'error'; text: string }) => void;
}) {
  const [offers, setOffers] = useState<MarketplaceOfferDoc[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeListingOffers(
      listing.listingId,
      sellerUid,
      true,
      setOffers,
      (err) => console.error('Seller offers subscription warning:', err)
    );
    return () => unsub();
  }, [listing.listingId, sellerUid]);

  const pendingOffers = offers.filter((o) => o.status === 'pending');

  if (offers.length === 0) {
    return (
      <p className="text-xs text-[#7E869B] pt-2 border-t border-white/10">
        No buyer offers received yet.
      </p>
    );
  }

  const handleAccept = async (offer: MarketplaceOfferDoc) => {
    setBusyId(offer.offerId);
    try {
      await acceptMarketplaceOffer({ listing, offer });
      onStatusMessage({
        kind: 'success',
        text: `Accepted ${offer.buyerName}'s offer of ${offer.offerPriceShards.toLocaleString()} Shards for ${listing.cardName}. Ownership & Shards settled atomically.`,
      });
    } catch (err) {
      onStatusMessage({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to settle this marketplace offer.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (offer: MarketplaceOfferDoc) => {
    setBusyId(offer.offerId);
    try {
      await updateMarketplaceOfferStatus(
        listing.listingId,
        offer.offerId,
        'declined'
      );
      onStatusMessage({
        kind: 'success',
        text: `Declined offer from ${offer.buyerName}.`,
      });
    } catch (err) {
      onStatusMessage({
        kind: 'error',
        text:
          err instanceof Error ? err.message : 'Unable to decline this offer.',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="pt-3 border-t border-white/10 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-[#F5EFE0]">
          Incoming Offers ({pendingOffers.length} pending)
        </span>
      </div>
      <div className="space-y-2">
        {offers.map((offer) => {
          const isPending = offer.status === 'pending';
          const isBusy = busyId === offer.offerId;
          return (
            <div
              key={offer.offerId}
              className="rounded-md bg-[#0B0E17] border border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-[#F5EFE0]">
                    {offer.buyerName}
                  </span>
                  <span className="font-mono tabular-nums text-violet-300 font-semibold inline-flex items-center gap-1">
                    <Gem className="w-3 h-3" />
                    {offer.offerPriceShards.toLocaleString()} Shards
                  </span>
                  <span className="text-[11px] uppercase tracking-wider text-[#8F96AB] font-mono">
                    {offer.status}
                  </span>
                </div>
                {offer.note && (
                  <p className="text-xs text-[#9CA3B8] mt-0.5 truncate max-w-md">
                    &ldquo;{offer.note}&rdquo;
                  </p>
                )}
              </div>

              {isPending && listing.status === 'active' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleAccept(offer)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-emerald-500/20 border border-emerald-400/45 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/30 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isBusy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    <span>Accept</span>
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleDecline(offer)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white/5 border border-white/15 text-[#C4C9D8] text-xs hover:text-rose-300 hover:border-rose-400/40 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                    <span>Decline</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BuyerOfferDrawer({
  listing,
  buyerUid,
  buyerName,
  buyerShards,
  onClose,
  onStatusMessage,
}: {
  listing: MarketplaceListingDoc;
  buyerUid: string;
  buyerName: string;
  buyerShards: number;
  onClose: () => void;
  onStatusMessage: (msg: { kind: 'success' | 'error'; text: string }) => void;
}) {
  const suggested = Math.max(
    MIN_LISTING_PRICE,
    Math.min(buyerShards, Math.round(listing.priceShards * 0.85))
  );
  const [offerPrice, setOfferPrice] = useState<string>(String(suggested));
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myOffers, setMyOffers] = useState<MarketplaceOfferDoc[]>([]);

  useEffect(() => {
    const unsub = subscribeListingOffers(
      listing.listingId,
      buyerUid,
      false,
      setMyOffers,
      (err) => console.error('Buyer offers subscription warning:', err)
    );
    return () => unsub();
  }, [listing.listingId, buyerUid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = Number.parseInt(offerPrice, 10);
    const check = validateOfferDraft(
      listing,
      parsedPrice,
      buyerUid,
      buyerShards
    );
    if (!check.ok) {
      onStatusMessage({
        kind: 'error',
        text: check.error || 'Invalid offer.',
      });
      return;
    }

    setSubmitting(true);
    try {
      await submitMarketplaceOffer({
        listing,
        buyerUid,
        buyerName,
        offerPriceShards: parsedPrice,
        note,
      });
      setNote('');
      onStatusMessage({
        kind: 'success',
        text: `Offer of ${parsedPrice.toLocaleString()} Shards sent to ${listing.sellerName} for ${listing.cardName}.`,
      });
    } catch (err) {
      onStatusMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to submit offer.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (offerId: string) => {
    try {
      await updateMarketplaceOfferStatus(
        listing.listingId,
        offerId,
        'withdrawn'
      );
      onStatusMessage({
        kind: 'success',
        text: 'Offer withdrawn.',
      });
    } catch (err) {
      onStatusMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to withdraw offer.',
      });
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#F5DC8B]">
          Submit Offer to {listing.sellerName}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-[#8F96AB] hover:text-white cursor-pointer"
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={MIN_LISTING_PRICE}
            max={MAX_LISTING_PRICE}
            value={offerPrice}
            onChange={(e) => setOfferPrice(e.target.value)}
            aria-label="Offer amount in Oracle Shards"
            className="w-28 rounded bg-[#0B0E17] border border-white/15 px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#F5EFE0] focus:border-[#D4AF37] focus:outline-none"
          />
          <input
            type="text"
            maxLength={180}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note to seller..."
            className="flex-1 min-w-0 rounded bg-[#0B0E17] border border-white/15 px-2.5 py-1.5 text-xs text-[#F5EFE0] placeholder:text-[#6B7287] focus:border-[#D4AF37] focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1.5 rounded bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          >
            {submitting ? 'Sending...' : 'Send Offer'}
          </button>
        </div>
      </form>

      {myOffers.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-[#8F96AB] font-mono uppercase tracking-wider">
            Your Offers on This Card
          </p>
          {myOffers.map((o) => (
            <div
              key={o.offerId}
              className="flex items-center justify-between gap-2 text-xs bg-[#0B0E17] border border-white/10 rounded px-2.5 py-1.5"
            >
              <span className="font-mono tabular-nums text-violet-300">
                {o.offerPriceShards.toLocaleString()} Shards ·{' '}
                <span className="text-[#9CA3B8] uppercase">{o.status}</span>
              </span>
              {o.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => void handleWithdraw(o.offerId)}
                  className="text-[11px] text-rose-300 hover:underline cursor-pointer"
                >
                  Withdraw
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MarketplaceView({
  tradableCatalog,
  syncingCloud = false,
  onOpenTradingHub,
  onOpenStudio,
  onOpenCollection,
  onBackToTitle,
}: MarketplaceViewProps) {
  const { user, profile, wallet, signingIn, signInWithGoogle } =
    useFirebaseAuth();

  const [tab, setTab] = useState<MarketTab>('browse');
  const [activeListings, setActiveListings] = useState<MarketplaceListingDoc[]>(
    []
  );
  const [myListings, setMyListings] = useState<MarketplaceListingDoc[]>([]);
  const [myPurchases, setMyPurchases] = useState<MarketplaceListingDoc[]>([]);
  const [ledger, setLedger] = useState<OwnershipTransferDoc[]>([]);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'All' | CombatRole>('All');
  const [elementFilter, setElementFilter] = useState<'All' | ElementAffinity>(
    'All'
  );
  const [priceSort, setPriceSort] = useState<PriceSort>('newest');

  // Interactive states
  const [inspectCard, setInspectCard] = useState<CharacterDefinition | null>(
    null
  );
  const [confirmBuyId, setConfirmBuyId] = useState<string | null>(null);
  const [busyListingId, setBusyListingId] = useState<string | null>(null);
  const [offerDrawerListingId, setOfferDrawerListingId] = useState<
    string | null
  >(null);
  const [banner, setBanner] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  // Create Listing form state
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [listPrice, setListPrice] = useState<string>('250');
  const [allowOffers, setAllowOffers] = useState<boolean>(true);
  const [creatingListing, setCreatingListing] = useState(false);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    const unsubListings = subscribeMarketplaceListings(
      uid,
      (payload) => {
        setActiveListings(payload.activeListings);
        setMyListings(payload.myListings);
        setMyPurchases(payload.myPurchases);
        setLoadedUid(uid);
      },
      (err) => {
        console.error('Marketplace listings error:', err);
        setLoadedUid(uid);
      }
    );

    const unsubLedger = subscribeOwnershipLedger(
      (entries) => setLedger(entries),
      (err) => console.error('Ownership ledger error:', err)
    );

    return () => {
      unsubListings();
      unsubLedger();
    };
  }, [user]);

  const loadingMarket = Boolean(user && loadedUid !== user.uid);
  const visibleActiveListings = useMemo(
    () => (user ? activeListings : []),
    [user, activeListings]
  );
  const visibleMyListings = useMemo(
    () => (user ? myListings : []),
    [user, myListings]
  );
  const visibleMyPurchases = useMemo(
    () => (user ? myPurchases : []),
    [user, myPurchases]
  );
  const visibleLedger = useMemo(() => (user ? ledger : []), [user, ledger]);

  const myTradableCards = useMemo(() => {
    if (!user) return [];
    return tradableCatalog.filter((c) => c.ownerId === user.uid);
  }, [tradableCatalog, user]);

  const myUnlockedCards = useMemo(
    () => myTradableCards.filter((c) => !c.activeListingId),
    [myTradableCards]
  );

  const effectiveSelectedCardId = useMemo(() => {
    if (myUnlockedCards.some((c) => c.cardId === selectedCardId)) {
      return selectedCardId;
    }
    return myUnlockedCards[0]?.cardId ?? '';
  }, [myUnlockedCards, selectedCardId]);

  const filteredListings = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = visibleActiveListings.filter((item) => {
      if (roleFilter !== 'All' && item.cardRole !== roleFilter) return false;
      if (elementFilter !== 'All' && item.cardElement !== elementFilter)
        return false;
      if (q) {
        const hay =
          `${item.cardName} ${item.sellerName} ${item.originalCreatorName} ${item.cardRole} ${item.cardElement}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (priceSort === 'price_asc') {
      return [...list].sort((a, b) => a.priceShards - b.priceShards);
    }
    if (priceSort === 'price_desc') {
      return [...list].sort((a, b) => b.priceShards - a.priceShards);
    }
    return list;
  }, [visibleActiveListings, searchTerm, roleFilter, elementFilter, priceSort]);

  const displayName =
    profile?.displayName ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'Arena Tactician';
  const myShards = wallet?.shards ?? 0;

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cardDoc =
      myUnlockedCards.find((c) => c.cardId === effectiveSelectedCardId) ?? null;
    const parsedPrice = Number.parseInt(listPrice, 10);

    const check = validateListingDraft(
      cardDoc?.cardData ?? null,
      parsedPrice,
      cardDoc?.activeListingId ?? ''
    );
    if (!check.ok || !cardDoc) {
      setBanner({
        kind: 'error',
        text: check.error || 'Select a valid custom champion and price.',
      });
      return;
    }

    setCreatingListing(true);
    setBanner(null);
    try {
      await createMarketplaceListing({
        sellerUid: user.uid,
        sellerName: displayName,
        card: cardDoc,
        priceShards: parsedPrice,
        allowOffers,
      });
      setBanner({
        kind: 'success',
        text: `${cardDoc.name} is now live on the Oracle Marketplace for ${parsedPrice.toLocaleString()} Shards.`,
      });
    } catch (err) {
      setBanner({
        kind: 'error',
        text:
          err instanceof Error ? err.message : 'Unable to create listing.',
      });
    } finally {
      setCreatingListing(false);
    }
  };

  const handleBuyListing = async (listing: MarketplaceListingDoc) => {
    if (!user) return;
    setBusyListingId(listing.listingId);
    setBanner(null);
    try {
      await buyMarketplaceListing({
        listing,
        buyerUid: user.uid,
        buyerName: displayName,
      });
      setConfirmBuyId(null);
      setBanner({
        kind: 'success',
        text: `Acquired ${listing.cardName} for ${listing.priceShards.toLocaleString()} Shards! Added to your playable collection with verified ownership provenance.`,
      });
    } catch (err) {
      setBanner({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to complete marketplace purchase.',
      });
    } finally {
      setBusyListingId(null);
    }
  };

  const handleCancelListing = async (listing: MarketplaceListingDoc) => {
    setBusyListingId(listing.listingId);
    setBanner(null);
    try {
      await cancelMarketplaceListing(listing);
      setBanner({
        kind: 'success',
        text: `Cancelled listing for ${listing.cardName}. Your champion is unlocked and ready for battle or trading.`,
      });
    } catch (err) {
      setBanner({
        kind: 'error',
        text:
          err instanceof Error ? err.message : 'Unable to cancel listing.',
      });
    } finally {
      setBusyListingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col">
      {/* Compact Game Shell Toolbar */}
      <header className="sticky top-0 z-20 bg-[#0D101A]/95 border-b border-white/10 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBackToTitle}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C4C9D8] hover:text-[#F5EFE0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>Title</span>
            </button>
            <div className="h-4 w-px bg-white/15" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-[#D4AF37] shrink-0" />
              <h1 className="font-display text-lg sm:text-xl font-bold text-[#F5EFE0] tracking-wide whitespace-nowrap">
                Oracle Marketplace
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenTradingHub}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-sky-200 bg-sky-500/15 border border-sky-400/40 rounded-md hover:bg-sky-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
              <span>Trading Hub</span>
            </button>

            <button
              type="button"
              onClick={onOpenStudio}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-violet-200 bg-violet-500/15 border border-violet-400/40 rounded-md hover:bg-violet-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Oracle Studio</span>
            </button>

            <button
              type="button"
              onClick={onOpenCollection}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-[#C4C9D8] border border-white/15 rounded-md hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>Collection</span>
            </button>

            <AccountBar syncingCloud={syncingCloud} />
          </div>
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6 flex-1">
        {/* Auth Gate when Signed Out */}
        {!user ? (
          <section className="max-w-3xl mx-auto mt-6 rounded-xl bg-[#111521] border border-[#D4AF37]/35 p-8 sm:p-10 space-y-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#221D12] border border-[#D4AF37]/50 flex items-center justify-center shrink-0">
                <Store className="w-6 h-6 text-[#F5DC8B]" />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-2xl font-bold text-[#F5EFE0]">
                  Sign In to Enter the Oracle Marketplace
                </h2>
                <p className="text-sm text-[#B8C0D4] leading-relaxed">
                  Buy, sell, and negotiate original player-forged Oracle
                  champions using Oracle Shards. Every transaction settles
                  atomically in Cloud Firestore with single-owner custody and
                  immutable creator attribution.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 pt-2">
              <div className="rounded-lg bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-violet-300 text-xs font-semibold">
                  <Gem className="w-4 h-4" />
                  <span>500 Starting Shards</span>
                </div>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  New verified tacticians receive 500 Oracle Shards plus match
                  rewards (+60 Solo Win / +85 PvP Win).
                </p>
              </div>
              <div className="rounded-lg bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-[#F5DC8B] text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verified Ownership</span>
                </div>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  Each custom card has one canonical owner at a time, preventing
                  duplication while preserving its original creator forever.
                </p>
              </div>
              <div className="rounded-lg bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                  <Handshake className="w-4 h-4" />
                  <span>Buyout or Offers</span>
                </div>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  Purchase instantly at the listed Shard price or submit custom
                  offers directly to the seller.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-sm hover:bg-[#E5C454] transition-colors cursor-pointer disabled:opacity-60"
              >
                {signingIn ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>Sign in with Google</span>
              </button>
              <button
                type="button"
                onClick={onOpenStudio}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-md border border-violet-400/40 bg-violet-500/10 text-violet-200 text-sm font-medium hover:bg-violet-500/20 transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Forge a Custom Card First</span>
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Treasury & Market Overview Bar */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg bg-[#111521] border border-violet-400/35 px-4 py-3.5">
                <p className="text-[11px] uppercase tracking-wider text-[#9CA3B8] font-mono">
                  Oracle Shards Balance
                </p>
                <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-violet-300 inline-flex items-center gap-2">
                  <Gem className="w-5 h-5" />
                  {myShards.toLocaleString()}
                </p>
                <p className="text-[11px] text-[#7E869B] mt-0.5 font-mono tabular-nums">
                  Earned {(wallet?.totalEarned ?? 0).toLocaleString()} · Spent{' '}
                  {(wallet?.totalSpent ?? 0).toLocaleString()}
                </p>
              </div>

              <div className="rounded-lg bg-[#111521] border border-[#D4AF37]/30 px-4 py-3.5">
                <p className="text-[11px] uppercase tracking-wider text-[#9CA3B8] font-mono">
                  Live Market Listings
                </p>
                <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#F5DC8B]">
                  {visibleActiveListings.length}
                </p>
                <p className="text-[11px] text-[#7E869B] mt-0.5">
                  Verified player-owned champions
                </p>
              </div>

              <div className="rounded-lg bg-[#111521] border border-white/10 px-4 py-3.5">
                <p className="text-[11px] uppercase tracking-wider text-[#9CA3B8] font-mono">
                  Your Tradable Cards
                </p>
                <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#F5EFE0]">
                  {myTradableCards.length}
                </p>
                <p className="text-[11px] text-[#7E869B] mt-0.5">
                  {myUnlockedCards.length} unlocked ·{' '}
                  {myTradableCards.length - myUnlockedCards.length} listed
                </p>
              </div>

              <div className="rounded-lg bg-[#111521] border border-white/10 px-4 py-3.5">
                <p className="text-[11px] uppercase tracking-wider text-[#9CA3B8] font-mono">
                  Verified Transfers
                </p>
                <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-emerald-300">
                  {visibleLedger.length}
                </p>
                <p className="text-[11px] text-[#7E869B] mt-0.5">
                  Recorded on public ownership ledger
                </p>
              </div>
            </section>

            {/* Status Banner */}
            {banner && (
              <div
                role="alert"
                className={`rounded-lg px-4 py-3 border flex items-center justify-between gap-3 text-sm ${
                  banner.kind === 'success'
                    ? 'bg-emerald-500/12 border-emerald-400/40 text-emerald-200'
                    : 'bg-rose-500/12 border-rose-400/40 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {banner.kind === 'success' ? (
                    <BadgeCheck className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{banner.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBanner(null)}
                  className="p-1 rounded hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3">
              <div
                role="tablist"
                aria-label="Marketplace sections"
                className="flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'browse'}
                  onClick={() => setTab('browse')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    tab === 'browse'
                      ? 'bg-[#D4AF37] text-[#0B0D13]'
                      : 'bg-[#111521] text-[#B8C0D4] border border-white/10 hover:text-white'
                  }`}
                >
                  <Store className="w-4 h-4" />
                  <span>Browse Listings ({visibleActiveListings.length})</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'sell'}
                  onClick={() => setTab('sell')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    tab === 'sell'
                      ? 'bg-[#D4AF37] text-[#0B0D13]'
                      : 'bg-[#111521] text-[#B8C0D4] border border-white/10 hover:text-white'
                  }`}
                >
                  <Tag className="w-4 h-4" />
                  <span>
                    Sell & My Listings (
                    {visibleMyListings.filter((l) => l.status === 'active').length})
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'ledger'}
                  onClick={() => setTab('ledger')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    tab === 'ledger'
                      ? 'bg-[#D4AF37] text-[#0B0D13]'
                      : 'bg-[#111521] text-[#B8C0D4] border border-white/10 hover:text-white'
                  }`}
                >
                  <ScrollText className="w-4 h-4" />
                  <span>Ownership Ledger ({visibleLedger.length})</span>
                </button>
              </div>

              {visibleMyPurchases.length > 0 && (
                <span className="text-xs text-[#9CA3B8] font-mono tabular-nums">
                  Your Purchases: {visibleMyPurchases.length}
                </span>
              )}
            </div>

            {/* TAB 1: BROWSE LISTINGS */}
            {tab === 'browse' && (
              <section className="space-y-4">
                {/* Filter Bar */}
                <div className="flex flex-wrap items-center gap-3 bg-[#111521] border border-white/10 rounded-lg p-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-[#7E869B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search champion, creator, or seller..."
                      className="w-full rounded-md bg-[#0B0E17] border border-white/12 pl-9 pr-3 py-2 text-xs sm:text-sm text-[#F5EFE0] placeholder:text-[#6B7287] focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>

                  <select
                    aria-label="Filter by role"
                    value={roleFilter}
                    onChange={(e) =>
                      setRoleFilter(e.target.value as 'All' | CombatRole)
                    }
                    className="rounded-md bg-[#0B0E17] border border-white/12 px-3 py-2 text-xs sm:text-sm text-[#ECEEF4] focus:border-[#D4AF37] focus:outline-none"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        Role: {r}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filter by element"
                    value={elementFilter}
                    onChange={(e) =>
                      setElementFilter(
                        e.target.value as 'All' | ElementAffinity
                      )
                    }
                    className="rounded-md bg-[#0B0E17] border border-white/12 px-3 py-2 text-xs sm:text-sm text-[#ECEEF4] focus:border-[#D4AF37] focus:outline-none"
                  >
                    {ELEMENTS.map((el) => (
                      <option key={el} value={el}>
                        Element: {el}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Sort listings"
                    value={priceSort}
                    onChange={(e) => setPriceSort(e.target.value as PriceSort)}
                    className="rounded-md bg-[#0B0E17] border border-white/12 px-3 py-2 text-xs sm:text-sm text-[#ECEEF4] focus:border-[#D4AF37] focus:outline-none"
                  >
                    <option value="newest">Sort: Newest</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                  </select>
                </div>

                {loadingMarket ? (
                  <div className="rounded-lg bg-[#111521] border border-white/10 p-12 flex items-center justify-center gap-3 text-sm text-[#9CA3B8]">
                    <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
                    <span>Loading verified Marketplace listings...</span>
                  </div>
                ) : filteredListings.length === 0 ? (
                  <div className="rounded-lg bg-[#111521] border border-white/10 p-10 text-center space-y-3">
                    <Store className="w-8 h-8 text-[#D4AF37] mx-auto" />
                    <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                      No Active Marketplace Listings Match Your Filter
                    </h2>
                    <p className="text-sm text-[#9CA3B8] max-w-md mx-auto">
                      Only real player-owned custom Oracle champions appear
                      here. Forge an original champion in Oracle Studio or list
                      one of your custom cards to open the market.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setTab('sell')}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-[#D4AF37] text-[#0B0D13] text-xs sm:text-sm font-semibold hover:bg-[#E5C454] cursor-pointer"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>List a Custom Champion</span>
                      </button>
                      <button
                        type="button"
                        onClick={onOpenStudio}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-violet-400/40 bg-violet-500/15 text-violet-200 text-xs sm:text-sm font-medium hover:bg-violet-500/25 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Open Oracle Studio</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredListings.map((listing) => {
                      const isMine = listing.sellerUid === user.uid;
                      const elem = ELEMENT_STYLES[listing.cardElement];
                      const canAfford = myShards >= listing.priceShards;
                      const isBusy = busyListingId === listing.listingId;
                      const isConfirming = confirmBuyId === listing.listingId;
                      const showOfferDrawer =
                        offerDrawerListingId === listing.listingId;

                      return (
                        <article
                          key={listing.listingId}
                          className="rounded-lg bg-[#121622] border border-white/12 hover:border-[#D4AF37]/45 transition-colors overflow-hidden flex flex-col"
                        >
                          <div className="flex gap-3 p-4">
                            <div className="relative w-24 h-28 rounded-md overflow-hidden shrink-0 border border-white/15 bg-[#0B0E17]">
                              <Image
                                src={listing.cardData.artworkUrl}
                                alt={listing.cardName}
                                fill
                                sizes="96px"
                                referrerPolicy="no-referrer"
                                className="object-cover object-top"
                              />
                            </div>

                            <div className="min-w-0 flex-1 flex flex-col justify-between">
                              <div>
                                <p className={`text-[11px] font-medium ${elem.text}`}>
                                  {listing.cardRole} · {listing.cardElement} ·
                                  Lv.{listing.cardLevel}
                                </p>
                                <h3 className="font-display text-base font-bold text-[#F5EFE0] truncate">
                                  {listing.cardName}
                                </h3>
                                <p className="text-xs text-[#9CA3B8] mt-1 truncate">
                                  Seller:{' '}
                                  <span className="text-[#ECEEF4]">
                                    {isMine ? 'You' : listing.sellerName}
                                  </span>
                                </p>
                                <p className="text-[11px] text-[#7E869B] truncate inline-flex items-center gap-1 mt-0.5">
                                  <BadgeCheck className="w-3 h-3 text-[#D4AF37] shrink-0" />
                                  Creator: {listing.originalCreatorName}
                                </p>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-white/10 mt-2">
                                <span className="font-mono tabular-nums text-base font-bold text-[#F5DC8B] inline-flex items-center gap-1.5">
                                  <Gem className="w-4 h-4 text-violet-300" />
                                  {listing.priceShards.toLocaleString()}
                                </span>
                                <span className="text-[11px] text-[#8F96AB] font-mono">
                                  {listing.allowOffers
                                    ? 'Offers Open'
                                    : 'Fixed Price'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="px-4 pb-4 mt-auto">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setInspectCard(listing.cardData)}
                                className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md border border-white/15 text-xs text-[#C4C9D8] hover:text-white hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Inspect</span>
                              </button>

                              {isMine ? (
                                <button
                                  type="button"
                                  onClick={() => setTab('sell')}
                                  className="flex-1 px-3 py-2 rounded-md bg-white/5 border border-white/15 text-xs font-medium text-[#F5DC8B] hover:bg-white/10 cursor-pointer"
                                >
                                  Manage in My Listings
                                </button>
                              ) : isConfirming ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleBuyListing(listing)}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-emerald-500 text-[#090B10] text-xs font-bold hover:bg-emerald-400 cursor-pointer disabled:opacity-50"
                                  >
                                    {isBusy ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5" />
                                    )}
                                    <span>Confirm Buy</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmBuyId(null)}
                                    className="px-2.5 py-2 rounded-md border border-white/15 text-xs text-[#9CA3B8] hover:text-white cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled={!canAfford || isBusy}
                                    onClick={() =>
                                      setConfirmBuyId(listing.listingId)
                                    }
                                    title={
                                      canAfford
                                        ? 'Buy instantly at listed price'
                                        : 'Insufficient Oracle Shards'
                                    }
                                    className="flex-1 px-3 py-2 rounded-md bg-[#D4AF37] text-[#0B0D13] text-xs font-bold hover:bg-[#E5C454] transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                                  >
                                    {canAfford ? 'Buy Now' : 'Need Shards'}
                                  </button>

                                  {listing.allowOffers && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setOfferDrawerListingId(
                                          showOfferDrawer
                                            ? null
                                            : listing.listingId
                                        )
                                      }
                                      className="px-3 py-2 rounded-md bg-violet-500/15 border border-violet-400/40 text-violet-200 text-xs font-semibold hover:bg-violet-500/25 transition-colors cursor-pointer shrink-0"
                                    >
                                      Offer
                                    </button>
                                  )}
                                </>
                              )}
                            </div>

                            {showOfferDrawer && !isMine && (
                              <BuyerOfferDrawer
                                listing={listing}
                                buyerUid={user.uid}
                                buyerName={displayName}
                                buyerShards={myShards}
                                onClose={() => setOfferDrawerListingId(null)}
                                onStatusMessage={setBanner}
                              />
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* TAB 2: SELL & MY LISTINGS */}
            {tab === 'sell' && (
              <section className="grid lg:grid-cols-12 gap-6 items-start">
                {/* Create New Listing Form */}
                <div className="lg:col-span-5 rounded-lg bg-[#111521] border border-[#D4AF37]/30 p-5 space-y-4">
                  <div className="space-y-1">
                    <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                      List a Custom Champion
                    </h2>
                    <p className="text-xs text-[#9CA3B8]">
                      Only custom Oracle Studio cards can be listed. Founding
                      Starter Champions remain permanently bound to your
                      account.
                    </p>
                  </div>

                  {myUnlockedCards.length === 0 ? (
                    <div className="rounded-md bg-[#0B0E17] border border-white/10 p-5 text-center space-y-3">
                      <p className="text-sm font-medium text-[#ECEEF4]">
                        No Unlocked Custom Champions Available
                      </p>
                      <p className="text-xs text-[#9CA3B8]">
                        Forge a unique champion in Oracle Studio (or cancel an
                        existing listing) to put a card on the Marketplace.
                      </p>
                      <button
                        type="button"
                        onClick={onOpenStudio}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Open Oracle Studio</span>
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleCreateListing} className="space-y-4">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="market-card-select"
                          className="block text-xs font-medium text-[#C4C9D8]"
                        >
                          Select Champion Card
                        </label>
                        <select
                          id="market-card-select"
                          value={effectiveSelectedCardId}
                          onChange={(e) => setSelectedCardId(e.target.value)}
                          className="w-full rounded-md bg-[#0B0E17] border border-white/15 px-3 py-2.5 text-sm text-[#F5EFE0] focus:border-[#D4AF37] focus:outline-none"
                        >
                          {myUnlockedCards.map((c) => (
                            <option key={c.cardId} value={c.cardId}>
                              {c.name} — {c.role} · {c.element} · Lv.{c.level}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="market-price-input"
                          className="block text-xs font-medium text-[#C4C9D8]"
                        >
                          Buyout Price (Oracle Shards)
                        </label>
                        <div className="relative">
                          <Gem className="w-4 h-4 text-violet-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="market-price-input"
                            type="number"
                            min={MIN_LISTING_PRICE}
                            max={MAX_LISTING_PRICE}
                            value={listPrice}
                            onChange={(e) => setListPrice(e.target.value)}
                            className="w-full rounded-md bg-[#0B0E17] border border-white/15 pl-9 pr-3 py-2.5 text-sm font-mono tabular-nums text-[#F5EFE0] focus:border-[#D4AF37] focus:outline-none"
                          />
                        </div>
                        <p className="text-[11px] text-[#7E869B]">
                          Allowed range: {MIN_LISTING_PRICE} to{' '}
                          {MAX_LISTING_PRICE.toLocaleString()} Shards.
                        </p>
                      </div>

                      <label className="flex items-center gap-2.5 text-xs text-[#C4C9D8] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowOffers}
                          onChange={(e) => setAllowOffers(e.target.checked)}
                          className="rounded border-white/25 bg-[#0B0E17] accent-[#D4AF37]"
                        />
                        <span>
                          Allow buyers to submit negotiated Shard offers
                        </span>
                      </label>

                      <button
                        type="submit"
                        disabled={creatingListing}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-sm hover:bg-[#E5C454] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {creatingListing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Tag className="w-4 h-4" />
                        )}
                        <span>
                          {creatingListing
                            ? 'Locking Card & Publishing...'
                            : 'Publish Marketplace Listing'}
                        </span>
                      </button>
                    </form>
                  )}
                </div>

                {/* Seller's Active & Historical Listings + Incoming Offers */}
                <div className="lg:col-span-7 space-y-3">
                  <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                    Your Marketplace Listings ({visibleMyListings.length})
                  </h2>

                  {visibleMyListings.length === 0 ? (
                    <div className="rounded-lg bg-[#111521] border border-white/10 p-8 text-center text-sm text-[#9CA3B8]">
                      You have not listed any custom champions yet.
                    </div>
                  ) : (
                    visibleMyListings.map((listing) => {
                      const isActive = listing.status === 'active';
                      const isBusy = busyListingId === listing.listingId;
                      return (
                        <article
                          key={listing.listingId}
                          className="rounded-lg bg-[#121622] border border-white/12 p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative w-12 h-14 rounded overflow-hidden border border-white/15 shrink-0 bg-[#0B0E17]">
                                <Image
                                  src={listing.cardData.artworkUrl}
                                  alt={listing.cardName}
                                  fill
                                  sizes="48px"
                                  referrerPolicy="no-referrer"
                                  className="object-cover object-top"
                                />
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-display text-base font-bold text-[#F5EFE0] truncate">
                                  {listing.cardName}
                                </h3>
                                <p className="text-xs text-[#9CA3B8]">
                                  Listed at{' '}
                                  <span className="font-mono tabular-nums text-[#F5DC8B]">
                                    {listing.priceShards.toLocaleString()} Shards
                                  </span>{' '}
                                  ·{' '}
                                  <span
                                    className={
                                      isActive
                                        ? 'text-emerald-300 font-semibold'
                                        : listing.status === 'sold'
                                          ? 'text-violet-300 font-semibold'
                                          : 'text-[#8F96AB]'
                                    }
                                  >
                                    {listing.status.toUpperCase()}
                                  </span>
                                  {listing.status === 'sold' &&
                                    listing.buyerName && (
                                      <>
                                        {' '}
                                        to {listing.buyerName} for{' '}
                                        {listing.finalPrice.toLocaleString()}{' '}
                                        Shards
                                      </>
                                    )}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => setInspectCard(listing.cardData)}
                                className="px-2.5 py-1.5 rounded border border-white/15 text-xs text-[#C4C9D8] hover:text-white hover:bg-white/5 cursor-pointer"
                              >
                                Inspect
                              </button>
                              {isActive && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleCancelListing(listing)
                                  }
                                  className="px-3 py-1.5 rounded bg-rose-500/15 border border-rose-400/40 text-rose-200 text-xs font-medium hover:bg-rose-500/25 cursor-pointer disabled:opacity-50"
                                >
                                  {isBusy ? 'Cancelling...' : 'Cancel Listing'}
                                </button>
                              )}
                            </div>
                          </div>

                          {listing.allowOffers && (
                            <SellerOffersPanel
                              listing={listing}
                              sellerUid={user.uid}
                              onStatusMessage={setBanner}
                            />
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            )}

            {/* TAB 3: PUBLIC VERIFIED OWNERSHIP LEDGER */}
            {tab === 'ledger' && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#9CA3B8]">
                    Immutable Cloud Firestore provenance receipts for every
                    settled Marketplace sale and P2P Trade.
                  </p>
                </div>

                {visibleLedger.length === 0 ? (
                  <div className="rounded-lg bg-[#111521] border border-white/10 p-10 text-center text-sm text-[#9CA3B8]">
                    No verified transfers have been settled yet. Complete a
                    Marketplace purchase or Trading Hub swap to record the first
                    provenance entry.
                  </div>
                ) : (
                  <div className="rounded-lg bg-[#111521] border border-white/10 divide-y divide-white/10">
                    {visibleLedger.map((tx) => (
                      <div
                        key={tx.transferId}
                        className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`font-mono uppercase text-[11px] px-2 py-0.5 rounded border ${
                                tx.reason === 'marketplace'
                                  ? 'bg-[#D4AF37]/15 border-[#D4AF37]/40 text-[#F5DC8B]'
                                  : 'bg-sky-500/15 border-sky-400/40 text-sky-200'
                              }`}
                            >
                              {tx.reason === 'marketplace'
                                ? 'Marketplace Sale'
                                : 'P2P Trade'}
                            </span>
                            <span className="font-display font-bold text-[#F5EFE0]">
                              {tx.cardName}
                            </span>
                            {tx.counterCardName && (
                              <>
                                <ArrowLeftRight className="w-3.5 h-3.5 text-sky-300" />
                                <span className="font-display font-bold text-[#F5EFE0]">
                                  {tx.counterCardName}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-[#9CA3B8]">
                            {tx.fromName} → {tx.toName}
                            {tx.priceShards > 0 && (
                              <>
                                {' '}
                                ·{' '}
                                <span className="font-mono tabular-nums text-violet-300">
                                  {tx.priceShards.toLocaleString()} Shards
                                </span>
                              </>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 text-xs font-mono text-[#8F96AB] shrink-0">
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <BadgeCheck className="w-3.5 h-3.5" />
                            Verified
                          </span>
                          <span>{formatRelativeTime(tx.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <CharacterDetailModal
        character={inspectCard}
        onClose={() => setInspectCard(null)}
      />
    </main>
  );
}
