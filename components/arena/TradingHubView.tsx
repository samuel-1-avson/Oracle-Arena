'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Coins,
  Layers,
  Lock,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { subscribeMyFriendships } from '@/lib/firebase/social-repository';
import { FriendshipDoc } from '@/lib/game/social';
import { STARTER_CHARACTERS } from '@/lib/game/roster';
import {
  getCardTraits,
  TRAIT_CATALOG,
  TRAIT_MAP,
  TraitId,
} from '@/lib/game/traits';
import {
  CharacterDefinition,
  CombatRole,
  ElementAffinity,
} from '@/lib/game/types';
import {
  buildSampleFriendWish,
  findMatchingPrivateCards,
  formatWishSummaryLine,
  loadLocalWishTrades,
  saveLocalWishTrades,
  WishTradeRequest,
} from '@/lib/game/wish-trade';
import { AccountBar } from './AccountBar';
import { useFirebaseAuth } from './FirebaseProvider';
import { VisualStatBars } from './VisualStatBars';

interface TradingHubViewProps {
  ownedCharacters: CharacterDefinition[];
  onSwapLocalCard: (giveCardId: string, receiveCard: CharacterDefinition) => void;
  onOpenMarketplace: () => void;
  onOpenSocial: () => void;
  onOpenStudio: () => void;
  onOpenCollection: () => void;
  onBackToTitle: () => void;
}

interface AcceptedFriendOption {
  uid: string;
  name: string;
  isDemoFriend?: boolean;
}

const ELEMENTS: Array<'Any' | ElementAffinity> = [
  'Any',
  'Solar',
  'Void',
  'Storm',
  'Aether',
  'Cyber',
  'Iron',
  'Ember',
  'Frost',
];

const ROLES: Array<'Any' | CombatRole> = [
  'Any',
  'Vanguard',
  'Striker',
  'Arcanist',
  'Warden',
  'Tactician',
];

export function TradingHubView({
  ownedCharacters,
  onSwapLocalCard,
  onOpenMarketplace,
  onOpenSocial,
  onOpenStudio,
  onOpenCollection,
  onBackToTitle,
}: TradingHubViewProps) {
  const { user, profile } = useFirebaseAuth();

  const [friendships, setFriendships] = useState<FriendshipDoc[]>([]);
  const [wishes, setWishes] = useState<WishTradeRequest[]>([]);

  // Composer State (Send a Blind Trait-Wish Offer to a Friend)
  const [selectedFriendUid, setSelectedFriendUid] = useState<string>('');
  const [offeredCardId, setOfferedCardId] = useState<string>(
    ownedCharacters[0]?.id ?? ''
  );
  const [offeredShards, setOfferedShards] = useState<number>(25);
  const [desiredTraits, setDesiredTraits] = useState<TraitId[]>([
    'super_strength',
  ]);
  const [desiredElement, setDesiredElement] = useState<'Any' | ElementAffinity>(
    'Any'
  );
  const [desiredRole, setDesiredRole] = useState<'Any' | CombatRole>('Any');
  const [note, setNote] = useState(
    'Trading my card for a hero with these skills — decline if you do not have one!'
  );

  // Fulfill picker per incoming wishId
  const [selectedFulfillCardByWish, setSelectedFulfillCardByWish] = useState<
    Record<string, string>
  >({});

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myUid = user?.uid ?? 'local-player';
  const myName =
    profile?.displayName || user?.displayName || 'You (Arena Tactician)';

  // Subscribe to real accepted friendships when signed in
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeMyFriendships(user.uid, setFriendships);
    return () => unsub();
  }, [user]);

  // Hydrate persisted blind wish-trades + seed 1 friendly Dimple request so players immediately experience the flow
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const saved = loadLocalWishTrades();
      if (saved.length > 0) {
        setWishes(saved);
      } else {
        const sampleCard =
          STARTER_CHARACTERS.find((c) => c.id === 'chr-kora') ??
          STARTER_CHARACTERS[0];
        const seed = [buildSampleFriendWish(myUid, myName, sampleCard)];
        setWishes(seed);
        saveLocalWishTrades(seed);
      }
    });
    return () => {
      active = false;
    };
  }, [myUid, myName]);

  // Accepted Friends list ONLY (no strangers, no public browsing!)
  const acceptedFriends: AcceptedFriendOption[] = useMemo(() => {
    const liveFriends: AcceptedFriendOption[] = friendships
      .filter((f) => f.status === 'accepted')
      .map((f) =>
        f.requesterUid === myUid
          ? { uid: f.addresseeUid, name: f.addresseeName }
          : { uid: f.requesterUid, name: f.requesterName }
      );

    // Always include practice friend Dimple when user has no live accepted friends yet
    if (liveFriends.length === 0) {
      return [
        {
          uid: 'friend-dimple-npc',
          name: 'Dimple (Arena Friend)',
          isDemoFriend: true,
        },
      ];
    }
    return liveFriends;
  }, [friendships, myUid]);

  const effectiveFriendUid =
    selectedFriendUid &&
    acceptedFriends.some((f) => f.uid === selectedFriendUid)
      ? selectedFriendUid
      : acceptedFriends[0]?.uid ?? '';

  const effectiveOfferedCard =
    ownedCharacters.find((c) => c.id === offeredCardId) ?? ownedCharacters[0];

  const toggleDesiredTrait = (tid: TraitId) => {
    setError(null);
    if (desiredTraits.includes(tid)) {
      setDesiredTraits(desiredTraits.filter((id) => id !== tid));
    } else if (desiredTraits.length < 3) {
      setDesiredTraits([...desiredTraits, tid]);
    } else {
      setError('Pick up to 3 requested skills for your friend wish request.');
    }
  };

  const handleSendWishRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const targetFriend = acceptedFriends.find(
      (f) => f.uid === effectiveFriendUid
    );
    if (!targetFriend) {
      setError('Add an accepted Friend first in Social & Clans to trade!');
      return;
    }
    if (!effectiveOfferedCard) {
      setError('Open your Starter Pack first so you have a card to offer!');
      return;
    }
    if (desiredTraits.length === 0) {
      setError('Pick at least 1 Skill/Trait you are looking for from your friend.');
      return;
    }

    const newWish: WishTradeRequest = {
      wishId: `wish-${Date.now().toString(36)}`,
      senderUid: myUid,
      senderName: myName,
      recipientUid: targetFriend.uid,
      recipientName: targetFriend.name,
      offeredCard: effectiveOfferedCard,
      offeredTraits: getCardTraits(effectiveOfferedCard),
      offeredShards: Math.max(0, Math.min(500, Math.floor(offeredShards))),
      desiredTraits: [...desiredTraits],
      desiredElement,
      desiredRole,
      note: note.trim().slice(0, 200),
      status: 'open',
      createdAtIso: new Date().toISOString(),
    };

    const next = [newWish, ...wishes];
    setWishes(next);
    saveLocalWishTrades(next);
    setNotice(
      `Sent private Blind Wish-Trade to ${targetFriend.name}! Only ${targetFriend.name} can inspect their own hidden cards to see if they have a match.`
    );
  };

  const handleFulfillIncomingWish = (
    wish: WishTradeRequest,
    myChosenCardId: string
  ) => {
    setError(null);
    setNotice(null);
    const myCard = ownedCharacters.find((c) => c.id === myChosenCardId);
    if (!myCard) {
      setError('Select one of your private cards to complete the swap.');
      return;
    }

    // Clone incoming card cleanly under new local ID if needed so player receives it
    const receivedCard: CharacterDefinition = {
      ...wish.offeredCard,
      id: wish.offeredCard.id.startsWith('chr-custom-')
        ? wish.offeredCard.id
        : `chr-custom-traded-${wish.offeredCard.id}-${wish.wishId.slice(-6)}`,
      currentOwnerId: myUid,
    };

    onSwapLocalCard(myCard.id, receivedCard);

    const next = wishes.map((w) =>
      w.wishId === wish.wishId
        ? {
            ...w,
            status: 'fulfilled' as const,
            fulfilledCardName: myCard.name,
          }
        : w
    );
    setWishes(next);
    saveLocalWishTrades(next);
    setNotice(
      `Trade Completed with ${wish.senderName}! You gave "${myCard.name}" and received "${wish.offeredCard.name}".`
    );
  };

  const handleUpdateWishStatus = (
    wishId: string,
    status: 'declined' | 'cancelled'
  ) => {
    const next = wishes.map((w) =>
      w.wishId === wishId ? { ...w, status } : w
    );
    setWishes(next);
    saveLocalWishTrades(next);
    setNotice(
      status === 'declined'
        ? 'Trade request declined — your private inventory remains hidden.'
        : 'Cancelled your outgoing wish-trade request.'
    );
  };

  const incomingWishes = wishes.filter((w) => w.senderUid !== myUid);
  const outgoingWishes = wishes.filter((w) => w.senderUid === myUid);

  return (
    <main className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col">
      {/* Top Toolbar */}
      <div className="sticky top-0 z-20 bg-[#0D101A]/95 border-b border-white/10 px-4 sm:px-8 py-3.5">
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
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#F5EFE0] tracking-wide whitespace-nowrap">
              Friends-Only Private Trading Hub
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenSocial}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-violet-500/15 border border-violet-400/40 text-violet-200 hover:bg-violet-500/25 cursor-pointer whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Friends List</span>
            </button>
            <button
              type="button"
              onClick={onOpenMarketplace}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-[#D4AF37]/40 text-[#F5DC8B] hover:bg-[#D4AF37]/15 cursor-pointer whitespace-nowrap"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Marketplace</span>
            </button>
            <button
              type="button"
              onClick={onOpenStudio}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-white/15 text-[#C4C9D8] hover:text-white cursor-pointer whitespace-nowrap"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Oracle Studio</span>
            </button>
            <button
              type="button"
              onClick={onOpenCollection}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-white/15 text-[#C4C9D8] hover:text-white cursor-pointer whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>My Private Cards ({ownedCharacters.length})</span>
            </button>
            <AccountBar compact />
          </div>
        </div>
      </div>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6 flex-1">
        {/* Private Inventory Guarantee Banner */}
        <section
          data-testid="private-inventory-banner"
          className="rounded-lg bg-[#111521] border border-sky-400/35 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-sky-300 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="font-display text-base font-bold text-[#F5EFE0]">
                Private Cards · Friends-Only Blind Wish Trading
              </h2>
              <p className="text-xs text-[#C4C9D8] max-w-3xl leading-relaxed">
                Your cards are <strong className="text-white">strictly private</strong> —
                no stranger or friend can peek at your collection! Instead,
                trade with <strong className="text-sky-300">accepted Friends</strong> by
                showing the card you are offering and listing the{' '}
                <strong className="text-[#F5DC8B]">Skills &amp; Traits</strong> you want
                in return. If your friend owns a matching card, they can swap;
                otherwise they simply decline!
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-300">
            <ShieldCheck className="w-4 h-4" />
            <span>{acceptedFriends.length} Friend Partner Ready</span>
          </span>
        </section>

        {notice && (
          <div className="rounded-md bg-emerald-500/15 border border-emerald-400/45 px-4 py-3 text-sm text-emerald-200">
            {notice}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-md bg-rose-500/15 border border-rose-400/45 px-4 py-3 text-sm text-rose-200"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* LEFT: INCOMING FRIEND WISH REQUESTS (Private Local Matcher!) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#F5EFE0] flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-[#F5DC8B]" />
                <span>Incoming Friend Trade Requests</span>
              </h2>
              <span className="text-xs font-mono text-[#9CA3B8]">
                {incomingWishes.filter((w) => w.status === 'open').length} Open
              </span>
            </div>

            {incomingWishes.length === 0 ? (
              <div className="rounded-lg bg-[#111521] border border-white/10 p-6 text-center text-sm text-[#9CA3B8]">
                No incoming requests from friends yet.
              </div>
            ) : (
              <div className="space-y-4">
                {incomingWishes.map((wish) => {
                  const privateMatches = findMatchingPrivateCards(
                    ownedCharacters,
                    wish
                  );
                  const chosenId =
                    selectedFulfillCardByWish[wish.wishId] ??
                    privateMatches[0]?.card.id ??
                    ownedCharacters[0]?.id ??
                    '';

                  return (
                    <article
                      key={wish.wishId}
                      data-testid={`incoming-wish-${wish.wishId}`}
                      className="rounded-lg bg-[#121622] border border-[#D4AF37]/35 p-5 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                        <div>
                          <p className="font-display text-base font-bold text-[#F5EFE0]">
                            From {wish.senderName}
                          </p>
                          <p className="text-xs text-sky-300">
                            Looking for: {formatWishSummaryLine(wish)}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-mono uppercase font-semibold ${
                            wish.status === 'open'
                              ? 'text-[#F5DC8B]'
                              : wish.status === 'fulfilled'
                                ? 'text-emerald-300'
                                : 'text-[#8F96AB]'
                          }`}
                        >
                          {wish.status}
                        </span>
                      </div>

                      {wish.note && (
                        <p className="text-xs text-[#D0D5E2] italic">
                          &ldquo;{wish.note}&rdquo;
                        </p>
                      )}

                      {/* Offered Card Revealed by Friend */}
                      <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3 grid sm:grid-cols-[96px_1fr] gap-3 items-center">
                        <div className="relative h-28 w-24 rounded overflow-hidden border border-white/15 shrink-0">
                          <Image
                            src={wish.offeredCard.artworkUrl}
                            alt={wish.offeredCard.name}
                            fill
                            sizes="96px"
                            referrerPolicy="no-referrer"
                            className="object-cover object-top"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-display text-sm font-bold text-[#F5EFE0]">
                              Friend Offers: {wish.offeredCard.name}
                            </p>
                            {wish.offeredShards > 0 && (
                              <span className="text-xs font-mono text-[#F5DC8B]">
                                +{wish.offeredShards} Shards
                              </span>
                            )}
                          </div>
                          <VisualStatBars character={wish.offeredCard} compact />
                        </div>
                      </div>

                      {/* Private Local Match Check (Only Visible to You!) */}
                      {wish.status === 'open' && (
                        <div className="space-y-3 pt-2 border-t border-white/10">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>
                                Private Check: {privateMatches.length} of your
                                cards match!
                              </span>
                            </span>
                            <span className="text-[11px] text-[#8F96AB]">
                              Only you can see your matches
                            </span>
                          </div>

                          {privateMatches.length > 0 ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {privateMatches.slice(0, 4).map(({ card, exactMatch }) => {
                                  const picked = chosenId === card.id;
                                  return (
                                    <button
                                      key={card.id}
                                      type="button"
                                      onClick={() =>
                                        setSelectedFulfillCardByWish((prev) => ({
                                          ...prev,
                                          [wish.wishId]: card.id,
                                        }))
                                      }
                                      className={`text-left rounded-md p-2.5 border text-xs flex items-center justify-between gap-2 cursor-pointer ${
                                        picked
                                          ? 'bg-emerald-500/15 border-emerald-400 text-white'
                                          : 'bg-[#0B0E17] border-white/10 text-[#C4C9D8]'
                                      }`}
                                    >
                                      <div className="min-w-0">
                                        <p className="font-semibold truncate">
                                          {card.name}
                                        </p>
                                        <p className="text-[11px] text-emerald-300">
                                          {exactMatch
                                            ? 'Exact Skill Match'
                                            : 'Partial Skill Match'}
                                        </p>
                                      </div>
                                      {picked && (
                                        <Check className="w-4 h-4 text-emerald-300 shrink-0" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  data-testid={`fulfill-wish-${wish.wishId}`}
                                  onClick={() =>
                                    handleFulfillIncomingWish(wish, chosenId)
                                  }
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-500 text-[#090B10] font-bold text-xs hover:bg-emerald-400 cursor-pointer"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>Accept &amp; Swap Cards</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateWishStatus(
                                      wish.wishId,
                                      'declined'
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-md border border-white/15 text-xs text-[#C4C9D8] hover:text-rose-200 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Decline</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs text-[#9CA3B8]">
                                None of your private cards have those exact
                                skills right now.
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateWishStatus(
                                    wish.wishId,
                                    'declined'
                                  )
                                }
                                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-md border border-rose-400/40 text-xs text-rose-200 hover:bg-rose-500/15 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Decline Request</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {wish.status === 'fulfilled' && wish.fulfilledCardName && (
                        <p className="text-xs text-emerald-300 font-medium">
                          Swapped your &ldquo;{wish.fulfilledCardName}&rdquo; for{' '}
                          {wish.senderName}&apos;s &ldquo;{wish.offeredCard.name}
                          &rdquo;!
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* RIGHT: SEND A NEW BLIND WISH-TRADE REQUEST TO AN ACCEPTED FRIEND */}
          <section className="space-y-5">
            <form
              onSubmit={handleSendWishRequest}
              className="rounded-lg bg-[#111521] border border-white/12 p-5 space-y-4"
            >
              <div>
                <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                  Send a Blind Wish-Trade to a Friend
                </h2>
                <p className="text-xs text-[#9CA3B8]">
                  Show your friend which card you&apos;re offering, and pick the
                  Skills you want in return!
                </p>
              </div>

              {/* 1. Pick Accepted Friend */}
              <label className="space-y-1.5 block">
                <span className="text-xs font-semibold text-[#C4C9D8]">
                  1. Choose Accepted Friend
                </span>
                <select
                  value={effectiveFriendUid}
                  onChange={(e) => setSelectedFriendUid(e.target.value)}
                  className="w-full rounded-md bg-[#0B0E17] border border-white/15 px-3 py-2 text-sm text-[#F5EFE0]"
                >
                  {acceptedFriends.map((f) => (
                    <option key={f.uid} value={f.uid}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* 2. Choose Your Offered Card */}
              <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_0.8fr] gap-3">
                <label className="space-y-1.5 block">
                  <span className="text-xs font-semibold text-[#C4C9D8]">
                    2. Card You Are Offering
                  </span>
                  <select
                    value={effectiveOfferedCard?.id ?? ''}
                    onChange={(e) => setOfferedCardId(e.target.value)}
                    className="w-full rounded-md bg-[#0B0E17] border border-white/15 px-3 py-2 text-sm text-[#F5EFE0]"
                  >
                    {ownedCharacters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.role} · {c.element})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 block">
                  <span className="text-xs font-semibold text-[#C4C9D8] inline-flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-[#F5DC8B]" />
                    <span>+ Bonus Shards</span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={offeredShards}
                    onChange={(e) =>
                      setOfferedShards(Number(e.target.value) || 0)
                    }
                    className="w-full rounded-md bg-[#0B0E17] border border-white/15 px-3 py-2 text-sm font-mono text-[#F5EFE0]"
                  />
                </label>
              </div>

              {/* 3. Choose Desired Skills / Traits (1-3) */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#C4C9D8]">
                  3. Skills You Want From Your Friend ({desiredTraits.length}/3)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto pr-1">
                  {TRAIT_CATALOG.map((trait) => {
                    const active = desiredTraits.includes(trait.id);
                    return (
                      <button
                        key={trait.id}
                        type="button"
                        onClick={() => toggleDesiredTrait(trait.id)}
                        className={`px-2.5 py-1.5 rounded text-left text-xs border transition-colors cursor-pointer truncate ${
                          active
                            ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#F5DC8B] font-semibold'
                            : 'bg-[#0B0E17] border-white/10 text-[#A6ADC2] hover:text-white'
                        }`}
                      >
                        {trait.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Element & Role Filter */}
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="text-xs text-[#9CA3B8]">
                    Preferred Element
                  </span>
                  <select
                    value={desiredElement}
                    onChange={(e) =>
                      setDesiredElement(
                        e.target.value as 'Any' | ElementAffinity
                      )
                    }
                    className="w-full rounded-md bg-[#0B0E17] border border-white/15 px-2.5 py-1.5 text-xs text-[#F5EFE0]"
                  >
                    {ELEMENTS.map((el) => (
                      <option key={el} value={el}>
                        {el}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 block">
                  <span className="text-xs text-[#9CA3B8]">Preferred Role</span>
                  <select
                    value={desiredRole}
                    onChange={(e) =>
                      setDesiredRole(e.target.value as 'Any' | CombatRole)
                    }
                    className="w-full rounded-md bg-[#0B0E17] border border-white/15 px-2.5 py-1.5 text-xs text-[#F5EFE0]"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-1.5 block">
                <span className="text-xs font-semibold text-[#C4C9D8]">
                  Message to Friend
                </span>
                <textarea
                  rows={2}
                  value={note}
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-md bg-[#0B0E17] border border-white/15 px-3 py-2 text-xs text-[#F5EFE0]"
                />
              </label>

              <button
                type="submit"
                data-testid="send-wish-trade-btn"
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-[#D4AF37] text-[#0B0D13] font-bold text-sm hover:bg-[#E5C454] cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Send Private Friend Wish-Trade</span>
              </button>
            </form>

            {/* Outgoing Sent Wish Requests */}
            {outgoingWishes.length > 0 && (
              <div className="rounded-lg bg-[#111521] border border-white/12 p-4 space-y-3">
                <h3 className="font-display text-sm font-bold text-[#F5EFE0]">
                  Your Sent Friend Wish Requests ({outgoingWishes.length})
                </h3>
                <div className="space-y-2.5">
                  {outgoingWishes.map((w) => (
                    <div
                      key={w.wishId}
                      className="rounded-md bg-[#0B0E17] border border-white/10 p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <p className="font-semibold text-[#F5EFE0]">
                          To {w.recipientName} · Offering {w.offeredCard.name}
                        </p>
                        <p className="text-sky-300">
                          Wanted: {w.desiredTraits.map((t) => TRAIT_MAP[t]?.name).join(' + ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono uppercase text-[11px] text-[#F5DC8B]">
                          {w.status}
                        </span>
                        {w.status === 'open' && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateWishStatus(w.wishId, 'cancelled')
                            }
                            className="px-2 py-1 rounded border border-white/15 text-[#9CA3B8] hover:text-white cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
