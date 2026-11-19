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
  History,
  Layers,
  Loader2,
  LogIn,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import {
  acceptTradeProposal,
  createTradeProposal,
  getEconomyTimestampMillis,
  submitTradeCounteroffer,
  subscribeMyTrades,
  updateTradeStatus,
} from '@/lib/firebase/economy-repository';
import {
  computeTradeNetShards,
  MAX_TRADE_SHARDS,
  TradableCardDoc,
  TradeProposalDoc,
  validateTradeProposalDraft,
} from '@/lib/game/economy';
import { CharacterDefinition } from '@/lib/game/types';
import { AccountBar } from './AccountBar';
import { CharacterDetailModal } from './CharacterDetailModal';
import { useFirebaseAuth } from './FirebaseProvider';
import { ELEMENT_STYLES } from './ui-meta';

interface TradingHubViewProps {
  tradableCatalog: TradableCardDoc[];
  syncingCloud?: boolean;
  onOpenMarketplace: () => void;
  onOpenStudio: () => void;
  onOpenCollection: () => void;
  onBackToTitle: () => void;
}

type TradeTab = 'negotiations' | 'propose' | 'history';

function formatTime(ts: unknown): string {
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

export function TradingHubView({
  tradableCatalog,
  syncingCloud = false,
  onOpenMarketplace,
  onOpenStudio,
  onOpenCollection,
  onBackToTitle,
}: TradingHubViewProps) {
  const { user, profile, wallet, signingIn, signInWithGoogle } =
    useFirebaseAuth();

  const [tab, setTab] = useState<TradeTab>('negotiations');
  const [trades, setTrades] = useState<TradeProposalDoc[]>([]);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);

  // Inspect modal
  const [inspectCard, setInspectCard] = useState<CharacterDefinition | null>(
    null
  );
  const [banner, setBanner] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  // Propose Trade Builder state
  const [myOfferCardId, setMyOfferCardId] = useState<string>('');
  const [rivalCardId, setRivalCardId] = useState<string>('');
  const [rivalSearch, setRivalSearch] = useState('');
  const [proposerShards, setProposerShards] = useState('0');
  const [recipientShards, setRecipientShards] = useState('0');
  const [proposalMessage, setProposalMessage] = useState('');
  const [submittingProposal, setSubmittingProposal] = useState(false);

  // Active Negotiation interactive state
  const [busyTradeId, setBusyTradeId] = useState<string | null>(null);
  const [confirmAcceptId, setConfirmAcceptId] = useState<string | null>(null);
  const [counterTradeId, setCounterTradeId] = useState<string | null>(null);
  const [counterPropCardId, setCounterPropCardId] = useState('');
  const [counterRecCardId, setCounterRecCardId] = useState('');
  const [counterPropShards, setCounterPropShards] = useState('0');
  const [counterRecShards, setCounterRecShards] = useState('0');
  const [counterMessage, setCounterMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const unsub = subscribeMyTrades(
      uid,
      (list) => {
        setTrades(list);
        setLoadedUid(uid);
      },
      (err) => {
        console.error('Trades listener error:', err);
        setLoadedUid(uid);
      }
    );
    return () => unsub();
  }, [user]);

  const loadingTrades = Boolean(user && loadedUid !== user.uid);
  const visibleTrades = useMemo(() => (user ? trades : []), [user, trades]);

  const myUnlockedCards = useMemo(() => {
    if (!user) return [];
    return tradableCatalog.filter(
      (c) => c.ownerId === user.uid && !c.activeListingId
    );
  }, [tradableCatalog, user]);

  const rivalUnlockedCards = useMemo(() => {
    if (!user) return [];
    const q = rivalSearch.trim().toLowerCase();
    return tradableCatalog.filter((c) => {
      if (c.ownerId === user.uid || c.activeListingId) return false;
      if (!q) return true;
      return `${c.name} ${c.ownerName} ${c.originalCreatorName} ${c.role} ${c.element}`
        .toLowerCase()
        .includes(q);
    });
  }, [tradableCatalog, user, rivalSearch]);

  const effectiveMyOfferCardId = useMemo(() => {
    if (myUnlockedCards.some((c) => c.cardId === myOfferCardId)) {
      return myOfferCardId;
    }
    return myUnlockedCards[0]?.cardId ?? '';
  }, [myUnlockedCards, myOfferCardId]);

  const activeTrades = useMemo(
    () =>
      visibleTrades.filter(
        (t) => t.status === 'pending' || t.status === 'countered'
      ),
    [visibleTrades]
  );

  const historyTrades = useMemo(
    () =>
      visibleTrades.filter(
        (t) =>
          t.status === 'accepted' ||
          t.status === 'declined' ||
          t.status === 'cancelled'
      ),
    [visibleTrades]
  );

  const displayName =
    profile?.displayName ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'Arena Tactician';
  const myShards = wallet?.shards ?? 0;

  const selectedMyCard =
    myUnlockedCards.find((c) => c.cardId === effectiveMyOfferCardId) ?? null;
  const selectedRivalCard =
    tradableCatalog.find((c) => c.cardId === rivalCardId) ?? null;

  const openCounterEditor = (trade: TradeProposalDoc) => {
    setCounterTradeId(trade.tradeId);
    setCounterPropCardId(trade.proposerCardId);
    setCounterRecCardId(trade.recipientCardId);
    setCounterPropShards(String(trade.proposerShards));
    setCounterRecShards(String(trade.recipientShards));
    setCounterMessage('');
  };

  const handleProposeTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const pShards = Number.parseInt(proposerShards || '0', 10);
    const rShards = Number.parseInt(recipientShards || '0', 10);

    const check = validateTradeProposalDraft({
      proposerUid: user.uid,
      proposerCard: selectedMyCard,
      recipientCard: selectedRivalCard,
      proposerShards: pShards,
      recipientShards: rShards,
      proposerBalance: myShards,
    });
    if (!check.ok || !selectedMyCard || !selectedRivalCard) {
      setBanner({
        kind: 'error',
        text: check.error || 'Please review your trade selection.',
      });
      return;
    }

    setSubmittingProposal(true);
    setBanner(null);
    try {
      await createTradeProposal({
        proposerUid: user.uid,
        proposerName: displayName,
        proposerCard: selectedMyCard,
        recipientCard: selectedRivalCard,
        proposerShards: pShards,
        recipientShards: rShards,
        message: proposalMessage,
      });
      setProposalMessage('');
      setProposerShards('0');
      setRecipientShards('0');
      setRivalCardId('');
      setTab('negotiations');
      setBanner({
        kind: 'success',
        text: `Trade proposal sent to ${selectedRivalCard.ownerName} (${selectedMyCard.name} ⇄ ${selectedRivalCard.name}).`,
      });
    } catch (err) {
      setBanner({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to submit trade proposal.',
      });
    } finally {
      setSubmittingProposal(false);
    }
  };

  const handleAcceptTrade = async (trade: TradeProposalDoc) => {
    if (!user) return;
    setBusyTradeId(trade.tradeId);
    setBanner(null);
    try {
      await acceptTradeProposal(trade, user.uid);
      setConfirmAcceptId(null);
      setBanner({
        kind: 'success',
        text: `Trade settled atomically! ${trade.proposerCardName} and ${trade.recipientCardName} have swapped verified owners.`,
      });
    } catch (err) {
      setBanner({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to settle this trade proposal.',
      });
    } finally {
      setBusyTradeId(null);
    }
  };

  const handleSubmitCounter = async (
    e: React.FormEvent,
    trade: TradeProposalDoc
  ) => {
    e.preventDefault();
    if (!user) return;
    const nextPropCard = tradableCatalog.find(
      (c) =>
        c.cardId === counterPropCardId &&
        c.ownerId === trade.proposerUid &&
        !c.activeListingId
    );
    const nextRecCard = tradableCatalog.find(
      (c) =>
        c.cardId === counterRecCardId &&
        c.ownerId === trade.recipientUid &&
        !c.activeListingId
    );
    if (!nextPropCard || !nextRecCard) {
      setBanner({
        kind: 'error',
        text: 'Both selected cards must still be owned and unlocked by their respective players.',
      });
      return;
    }

    const pShards = Number.parseInt(counterPropShards || '0', 10);
    const rShards = Number.parseInt(counterRecShards || '0', 10);
    if (
      !Number.isInteger(pShards) ||
      pShards < 0 ||
      pShards > MAX_TRADE_SHARDS ||
      !Number.isInteger(rShards) ||
      rShards < 0 ||
      rShards > MAX_TRADE_SHARDS
    ) {
      setBanner({
        kind: 'error',
        text: `Shard sweeteners must be integers between 0 and ${MAX_TRADE_SHARDS.toLocaleString()}.`,
      });
      return;
    }

    setBusyTradeId(trade.tradeId);
    setBanner(null);
    try {
      await submitTradeCounteroffer({
        trade,
        actingUid: user.uid,
        nextProposerCard: nextPropCard,
        nextRecipientCard: nextRecCard,
        nextProposerShards: pShards,
        nextRecipientShards: rShards,
        message: counterMessage,
      });
      setCounterTradeId(null);
      setBanner({
        kind: 'success',
        text: `Counteroffer (Rev #${trade.revision + 1}) sent! Waiting for the other tactician to respond.`,
      });
    } catch (err) {
      setBanner({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to send counteroffer.',
      });
    } finally {
      setBusyTradeId(null);
    }
  };

  const handleDeclineOrCancel = async (
    trade: TradeProposalDoc,
    status: 'declined' | 'cancelled'
  ) => {
    setBusyTradeId(trade.tradeId);
    setBanner(null);
    try {
      await updateTradeStatus(trade.tradeId, status);
      setBanner({
        kind: 'success',
        text:
          status === 'cancelled'
            ? 'Trade proposal cancelled.'
            : 'Trade proposal declined.',
      });
    } catch (err) {
      setBanner({
        kind: 'error',
        text:
          err instanceof Error ? err.message : 'Unable to update trade status.',
      });
    } finally {
      setBusyTradeId(null);
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
              <ArrowLeftRight className="w-5 h-5 text-sky-300 shrink-0" />
              <h1 className="font-display text-lg sm:text-xl font-bold text-[#F5EFE0] tracking-wide whitespace-nowrap">
                Trading Hub
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenMarketplace}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-[#F5DC8B] bg-[#D4AF37]/15 border border-[#D4AF37]/40 rounded-md hover:bg-[#D4AF37]/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Store className="w-3.5 h-3.5 shrink-0" />
              <span>Marketplace</span>
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
        {!user ? (
          <section className="max-w-3xl mx-auto mt-6 rounded-xl bg-[#111521] border border-sky-400/35 p-8 sm:p-10 space-y-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#121D31] border border-sky-400/50 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-6 h-6 text-sky-300" />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-2xl font-bold text-[#F5EFE0]">
                  Sign In to Open Player-to-Player Trading
                </h2>
                <p className="text-sm text-[#B8C0D4] leading-relaxed">
                  Negotiate direct 1-for-1 custom Oracle champion swaps with
                  other players, send multi-round counteroffers, balance trades
                  with optional Oracle Shard sweeteners, and settle ownership
                  atomically.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 pt-2">
              <div className="rounded-lg bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-sky-300 text-xs font-semibold">
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>Direct Card Swaps</span>
                </div>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  Browse unlocked custom champions owned by real tacticians and
                  propose targeted swaps.
                </p>
              </div>
              <div className="rounded-lg bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-[#F5DC8B] text-xs font-semibold">
                  <RefreshCw className="w-4 h-4" />
                  <span>Counteroffers</span>
                </div>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  Turn-gated revisions let both players adjust cards and Shard
                  sweeteners until terms are fair.
                </p>
              </div>
              <div className="rounded-lg bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Atomic Settlement</span>
                </div>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  Both cards and net Shards swap in a single Firestore batch
                  with immutable provenance receipts.
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
                onClick={onOpenMarketplace}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-md border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F5DC8B] text-sm font-medium hover:bg-[#D4AF37]/20 transition-colors cursor-pointer"
              >
                <Store className="w-4 h-4" />
                <span>Visit Marketplace</span>
              </button>
            </div>
          </section>
        ) : (
          <>
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

            {/* Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3">
              <div
                role="tablist"
                aria-label="Trading Hub sections"
                className="flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'negotiations'}
                  onClick={() => setTab('negotiations')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    tab === 'negotiations'
                      ? 'bg-[#D4AF37] text-[#0B0D13]'
                      : 'bg-[#111521] text-[#B8C0D4] border border-white/10 hover:text-white'
                  }`}
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>Active Negotiations ({activeTrades.length})</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'propose'}
                  onClick={() => setTab('propose')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    tab === 'propose'
                      ? 'bg-[#D4AF37] text-[#0B0D13]'
                      : 'bg-[#111521] text-[#B8C0D4] border border-white/10 hover:text-white'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>Propose Trade ({rivalUnlockedCards.length} rival cards)</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'history'}
                  onClick={() => setTab('history')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    tab === 'history'
                      ? 'bg-[#D4AF37] text-[#0B0D13]'
                      : 'bg-[#111521] text-[#B8C0D4] border border-white/10 hover:text-white'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Trade History ({historyTrades.length})</span>
                </button>
              </div>

              <span className="text-xs font-mono tabular-nums text-violet-300 inline-flex items-center gap-1.5">
                <Gem className="w-3.5 h-3.5" />
                Balance: {myShards.toLocaleString()} Shards
              </span>
            </div>

            {/* TAB 1: ACTIVE NEGOTIATIONS */}
            {tab === 'negotiations' && (
              <section className="space-y-4">
                {loadingTrades ? (
                  <div className="rounded-lg bg-[#111521] border border-white/10 p-12 flex items-center justify-center gap-3 text-sm text-[#9CA3B8]">
                    <Loader2 className="w-5 h-5 animate-spin text-sky-300" />
                    <span>Loading active trade negotiations...</span>
                  </div>
                ) : activeTrades.length === 0 ? (
                  <div className="rounded-lg bg-[#111521] border border-white/10 p-10 text-center space-y-3">
                    <ArrowLeftRight className="w-8 h-8 text-sky-300 mx-auto" />
                    <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                      No Active Trade Negotiations
                    </h2>
                    <p className="text-sm text-[#9CA3B8] max-w-md mx-auto">
                      Browse unlocked custom champions from other tacticians to
                      propose a direct 1-for-1 trade with optional Shard
                      sweeteners.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab('propose')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-[#D4AF37] text-[#0B0D13] text-xs sm:text-sm font-semibold hover:bg-[#E5C454] cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      <span>Propose a Trade</span>
                    </button>
                  </div>
                ) : (
                  activeTrades.map((trade) => {
                    const isMyTurn = trade.turnUid === user.uid;
                    const amProposer = trade.proposerUid === user.uid;
                    const isBusy = busyTradeId === trade.tradeId;
                    const isConfirming = confirmAcceptId === trade.tradeId;
                    const isCountering = counterTradeId === trade.tradeId;
                    const net = computeTradeNetShards(
                      trade.proposerUid,
                      trade.recipientUid,
                      trade.proposerShards,
                      trade.recipientShards
                    );

                    const proposerCardsPool = tradableCatalog.filter(
                      (c) =>
                        c.ownerId === trade.proposerUid && !c.activeListingId
                    );
                    const recipientCardsPool = tradableCatalog.filter(
                      (c) =>
                        c.ownerId === trade.recipientUid && !c.activeListingId
                    );

                    return (
                      <article
                        key={trade.tradeId}
                        className={`rounded-lg bg-[#121622] border p-5 space-y-4 ${
                          isMyTurn
                            ? 'border-[#D4AF37]/55'
                            : 'border-white/12'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                          <div className="flex flex-wrap items-center gap-2.5 text-xs">
                            <span className="font-mono text-[#8F96AB]">
                              Rev #{trade.revision}
                            </span>
                            <span
                              className={`font-semibold px-2 py-0.5 rounded border ${
                                isMyTurn
                                  ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#F5DC8B]'
                                  : 'bg-white/5 border-white/15 text-[#9CA3B8]'
                              }`}
                            >
                              {isMyTurn
                                ? 'Your Turn to Respond'
                                : `Awaiting ${
                                    amProposer
                                      ? trade.recipientName
                                      : trade.proposerName
                                  }`}
                            </span>
                            <span className="text-[#8F96AB]">
                              Updated {formatTime(trade.updatedAt)}
                            </span>
                          </div>

                          <span className="text-xs font-mono text-violet-300">
                            {net.priceShards === 0
                              ? 'Even Card Swap (0 net Shards)'
                              : `${
                                  net.shardsPayerUid === trade.proposerUid
                                    ? trade.proposerName
                                    : trade.recipientName
                                } pays ${net.priceShards.toLocaleString()} net Shards`}
                          </span>
                        </div>

                        {/* Side-by-Side Card Comparison */}
                        <div className="grid md:grid-cols-2 gap-4 items-center">
                          {/* Proposer Side */}
                          <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3.5 flex items-center gap-3">
                            <div className="relative w-16 h-20 rounded overflow-hidden border border-white/15 shrink-0">
                              <Image
                                src={trade.proposerCardData.artworkUrl}
                                alt={trade.proposerCardName}
                                fill
                                sizes="64px"
                                referrerPolicy="no-referrer"
                                className="object-cover object-top"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] text-[#8F96AB] font-mono">
                                {amProposer
                                  ? 'You Offer'
                                  : `${trade.proposerName} Offers`}
                              </p>
                              <h3 className="font-display text-base font-bold text-[#F5EFE0] truncate">
                                {trade.proposerCardName}
                              </h3>
                              <p className="text-xs text-[#9CA3B8]">
                                {trade.proposerCardData.role} ·{' '}
                                {trade.proposerCardData.element} · Lv.
                                {trade.proposerCardData.level}
                              </p>
                              {trade.proposerShards > 0 && (
                                <p className="text-xs font-mono tabular-nums text-violet-300 mt-1">
                                  + {trade.proposerShards.toLocaleString()} Shards
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setInspectCard(trade.proposerCardData)
                              }
                              className="p-2 rounded border border-white/12 text-[#9CA3B8] hover:text-white cursor-pointer shrink-0"
                              aria-label={`Inspect ${trade.proposerCardName}`}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Recipient Side */}
                          <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3.5 flex items-center gap-3">
                            <div className="relative w-16 h-20 rounded overflow-hidden border border-white/15 shrink-0">
                              <Image
                                src={trade.recipientCardData.artworkUrl}
                                alt={trade.recipientCardName}
                                fill
                                sizes="64px"
                                referrerPolicy="no-referrer"
                                className="object-cover object-top"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] text-[#8F96AB] font-mono">
                                {!amProposer
                                  ? 'You Give'
                                  : `${trade.recipientName} Gives`}
                              </p>
                              <h3 className="font-display text-base font-bold text-[#F5EFE0] truncate">
                                {trade.recipientCardName}
                              </h3>
                              <p className="text-xs text-[#9CA3B8]">
                                {trade.recipientCardData.role} ·{' '}
                                {trade.recipientCardData.element} · Lv.
                                {trade.recipientCardData.level}
                              </p>
                              {trade.recipientShards > 0 && (
                                <p className="text-xs font-mono tabular-nums text-violet-300 mt-1">
                                  + {trade.recipientShards.toLocaleString()}{' '}
                                  Shards
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setInspectCard(trade.recipientCardData)
                              }
                              className="p-2 rounded border border-white/12 text-[#9CA3B8] hover:text-white cursor-pointer shrink-0"
                              aria-label={`Inspect ${trade.recipientCardName}`}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {trade.message && (
                          <p className="text-xs text-[#C4C9D8] bg-[#0B0E17] border border-white/10 rounded px-3 py-2 italic">
                            &ldquo;{trade.message}&rdquo;
                          </p>
                        )}

                        {/* Counteroffer Form */}
                        {isCountering && isMyTurn && (
                          <form
                            onSubmit={(e) => void handleSubmitCounter(e, trade)}
                            className="rounded-md bg-[#0B0E17] border border-sky-400/35 p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-sky-300">
                                Compose Counteroffer (Rev #{trade.revision + 1})
                              </span>
                              <button
                                type="button"
                                onClick={() => setCounterTradeId(null)}
                                className="text-xs text-[#8F96AB] hover:text-white cursor-pointer"
                              >
                                Close
                              </button>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <label className="text-[11px] text-[#9CA3B8]">
                                  {trade.proposerName}&apos;s Card & Shards
                                </label>
                                <select
                                  value={counterPropCardId}
                                  onChange={(e) =>
                                    setCounterPropCardId(e.target.value)
                                  }
                                  className="w-full rounded bg-[#121622] border border-white/15 px-2.5 py-2 text-xs text-[#F5EFE0]"
                                >
                                  {proposerCardsPool.map((c) => (
                                    <option key={c.cardId} value={c.cardId}>
                                      {c.name} (Lv.{c.level} {c.role})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min={0}
                                  max={MAX_TRADE_SHARDS}
                                  value={counterPropShards}
                                  onChange={(e) =>
                                    setCounterPropShards(e.target.value)
                                  }
                                  className="w-full rounded bg-[#121622] border border-white/15 px-2.5 py-1.5 text-xs font-mono text-[#F5EFE0]"
                                  placeholder="Proposer Shards"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[11px] text-[#9CA3B8]">
                                  {trade.recipientName}&apos;s Card & Shards
                                </label>
                                <select
                                  value={counterRecCardId}
                                  onChange={(e) =>
                                    setCounterRecCardId(e.target.value)
                                  }
                                  className="w-full rounded bg-[#121622] border border-white/15 px-2.5 py-2 text-xs text-[#F5EFE0]"
                                >
                                  {recipientCardsPool.map((c) => (
                                    <option key={c.cardId} value={c.cardId}>
                                      {c.name} (Lv.{c.level} {c.role})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min={0}
                                  max={MAX_TRADE_SHARDS}
                                  value={counterRecShards}
                                  onChange={(e) =>
                                    setCounterRecShards(e.target.value)
                                  }
                                  className="w-full rounded bg-[#121622] border border-white/15 px-2.5 py-1.5 text-xs font-mono text-[#F5EFE0]"
                                  placeholder="Recipient Shards"
                                />
                              </div>
                            </div>

                            <input
                              type="text"
                              maxLength={200}
                              value={counterMessage}
                              onChange={(e) =>
                                setCounterMessage(e.target.value)
                              }
                              placeholder="Explain your counteroffer terms..."
                              className="w-full rounded bg-[#121622] border border-white/15 px-3 py-2 text-xs text-[#F5EFE0]"
                            />

                            <div className="flex justify-end">
                              <button
                                type="submit"
                                disabled={isBusy}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-sky-500 text-[#090B10] text-xs font-bold hover:bg-sky-400 cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Send Counteroffer</span>
                              </button>
                            </div>
                          </form>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          {isMyTurn ? (
                            isConfirming ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleAcceptTrade(trade)}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-500 text-[#090B10] text-xs font-bold hover:bg-emerald-400 cursor-pointer disabled:opacity-50"
                                >
                                  {isBusy ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                  <span>Confirm Atomic Swap</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmAcceptId(null)}
                                  className="px-3 py-2 rounded-md border border-white/15 text-xs text-[#9CA3B8] hover:text-white cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    setConfirmAcceptId(trade.tradeId)
                                  }
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D4AF37] text-[#0B0D13] text-xs font-bold hover:bg-[#E5C454] cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Accept Trade</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    isCountering
                                      ? setCounterTradeId(null)
                                      : openCounterEditor(trade)
                                  }
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-sky-500/15 border border-sky-400/40 text-sky-200 text-xs font-semibold hover:bg-sky-500/25 cursor-pointer"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Counteroffer</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleDeclineOrCancel(
                                      trade,
                                      'declined'
                                    )
                                  }
                                  className="px-3 py-2 rounded-md border border-rose-400/35 text-rose-200 text-xs hover:bg-rose-500/15 cursor-pointer"
                                >
                                  Decline
                                </button>
                              </>
                            )
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleDeclineOrCancel(trade, 'cancelled')
                              }
                              className="px-3.5 py-2 rounded-md border border-white/15 text-xs text-[#C4C9D8] hover:text-rose-300 hover:border-rose-400/40 cursor-pointer"
                            >
                              Cancel Proposal
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </section>
            )}

            {/* TAB 2: PROPOSE NEW TRADE */}
            {tab === 'propose' && (
              <form onSubmit={handleProposeTrade} className="space-y-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Left: Your Offered Card */}
                  <div className="rounded-lg bg-[#111521] border border-white/12 p-5 space-y-4">
                    <h2 className="font-display text-base font-bold text-[#F5EFE0]">
                      1. Your Custom Champion to Offer
                    </h2>

                    {myUnlockedCards.length === 0 ? (
                      <div className="rounded-md bg-[#0B0E17] border border-white/10 p-6 text-center space-y-3">
                        <p className="text-sm text-[#ECEEF4]">
                          You need an unlocked custom Oracle champion to propose
                          a trade.
                        </p>
                        <button
                          type="button"
                          onClick={onOpenStudio}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Forge in Oracle Studio</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="grid sm:grid-cols-2 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                          {myUnlockedCards.map((card) => {
                            const selected =
                              card.cardId === effectiveMyOfferCardId;
                            const elem = ELEMENT_STYLES[card.element];
                            return (
                              <button
                                key={card.cardId}
                                type="button"
                                onClick={() => setMyOfferCardId(card.cardId)}
                                className={`text-left rounded-md p-2.5 border flex items-center gap-2.5 transition-colors cursor-pointer ${
                                  selected
                                    ? 'bg-[#1A2033] border-[#D4AF37]'
                                    : 'bg-[#0B0E17] border-white/10 hover:border-white/25'
                                }`}
                              >
                                <div className="relative w-11 h-14 rounded overflow-hidden shrink-0 border border-white/15">
                                  <Image
                                    src={card.cardData.artworkUrl}
                                    alt={card.name}
                                    fill
                                    sizes="44px"
                                    referrerPolicy="no-referrer"
                                    className="object-cover object-top"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-[#F5EFE0] truncate">
                                    {card.name}
                                  </p>
                                  <p className={`text-[11px] ${elem.text}`}>
                                    {card.role} · Lv.{card.level}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="space-y-1 pt-2 border-t border-white/10">
                          <label
                            htmlFor="proposer-shards-input"
                            className="text-xs text-[#C4C9D8]"
                          >
                            Optional Oracle Shards You Add (0–
                            {MAX_TRADE_SHARDS.toLocaleString()})
                          </label>
                          <input
                            id="proposer-shards-input"
                            type="number"
                            min={0}
                            max={MAX_TRADE_SHARDS}
                            value={proposerShards}
                            onChange={(e) => setProposerShards(e.target.value)}
                            className="w-40 rounded-md bg-[#0B0E17] border border-white/15 px-3 py-2 text-sm font-mono tabular-nums text-[#F5EFE0]"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right: Rival Card to Request */}
                  <div className="rounded-lg bg-[#111521] border border-white/12 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-display text-base font-bold text-[#F5EFE0]">
                        2. Rival Champion to Request
                      </h2>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[#7E869B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={rivalSearch}
                          onChange={(e) => setRivalSearch(e.target.value)}
                          placeholder="Filter player or card..."
                          className="rounded bg-[#0B0E17] border border-white/12 pl-8 pr-2.5 py-1.5 text-xs text-[#F5EFE0] placeholder:text-[#6B7287]"
                        />
                      </div>
                    </div>

                    {rivalUnlockedCards.length === 0 ? (
                      <div className="rounded-md bg-[#0B0E17] border border-white/10 p-6 text-center text-xs text-[#9CA3B8]">
                        No unlocked custom champions owned by other tacticians
                        are currently available. Once another player signs in
                        and forges a custom card, it appears here automatically.
                      </div>
                    ) : (
                      <>
                        <div className="grid sm:grid-cols-2 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                          {rivalUnlockedCards.map((card) => {
                            const selected = card.cardId === rivalCardId;
                            const elem = ELEMENT_STYLES[card.element];
                            return (
                              <div
                                key={card.cardId}
                                className={`rounded-md p-2.5 border flex items-center gap-2.5 transition-colors ${
                                  selected
                                    ? 'bg-[#142033] border-sky-400'
                                    : 'bg-[#0B0E17] border-white/10 hover:border-white/25'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => setRivalCardId(card.cardId)}
                                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                                >
                                  <div className="relative w-11 h-14 rounded overflow-hidden shrink-0 border border-white/15">
                                    <Image
                                      src={card.cardData.artworkUrl}
                                      alt={card.name}
                                      fill
                                      sizes="44px"
                                      referrerPolicy="no-referrer"
                                      className="object-cover object-top"
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-[#F5EFE0] truncate">
                                      {card.name}
                                    </p>
                                    <p className={`text-[11px] ${elem.text}`}>
                                      {card.role} · Lv.{card.level}
                                    </p>
                                    <p className="text-[11px] text-[#8F96AB] truncate">
                                      Owner: {card.ownerName}
                                    </p>
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Inspect ${card.name}`}
                                  onClick={() => setInspectCard(card.cardData)}
                                  className="p-1.5 rounded text-[#8F96AB] hover:text-white cursor-pointer shrink-0"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        <div className="space-y-1 pt-2 border-t border-white/10">
                          <label
                            htmlFor="recipient-shards-input"
                            className="text-xs text-[#C4C9D8]"
                          >
                            Optional Oracle Shards You Request (0–
                            {MAX_TRADE_SHARDS.toLocaleString()})
                          </label>
                          <input
                            id="recipient-shards-input"
                            type="number"
                            min={0}
                            max={MAX_TRADE_SHARDS}
                            value={recipientShards}
                            onChange={(e) => setRecipientShards(e.target.value)}
                            className="w-40 rounded-md bg-[#0B0E17] border border-white/15 px-3 py-2 text-sm font-mono tabular-nums text-[#F5EFE0]"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Proposal Note & Submit */}
                <div className="rounded-lg bg-[#111521] border border-[#D4AF37]/30 p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <input
                    type="text"
                    maxLength={200}
                    value={proposalMessage}
                    onChange={(e) => setProposalMessage(e.target.value)}
                    placeholder="Optional trade note (e.g. 'Looking for an Arcanist to anchor my PvP squad')..."
                    className="flex-1 rounded-md bg-[#0B0E17] border border-white/15 px-3.5 py-2.5 text-sm text-[#F5EFE0] placeholder:text-[#6B7287] focus:border-[#D4AF37] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={
                      submittingProposal || !selectedMyCard || !selectedRivalCard
                    }
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-sm hover:bg-[#E5C454] transition-colors cursor-pointer disabled:opacity-45 shrink-0"
                  >
                    {submittingProposal ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>Send Trade Proposal</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: TRADE HISTORY */}
            {tab === 'history' && (
              <section className="space-y-3">
                {historyTrades.length === 0 ? (
                  <div className="rounded-lg bg-[#111521] border border-white/10 p-10 text-center text-sm text-[#9CA3B8]">
                    No completed or closed trade negotiations yet.
                  </div>
                ) : (
                  <div className="rounded-lg bg-[#111521] border border-white/10 divide-y divide-white/10">
                    {historyTrades.map((t) => (
                      <div
                        key={t.tradeId}
                        className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`font-mono uppercase text-[11px] px-2 py-0.5 rounded border ${
                                t.status === 'accepted'
                                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                                  : 'bg-white/5 border-white/15 text-[#8F96AB]'
                              }`}
                            >
                              {t.status}
                            </span>
                            <span className="font-display font-bold text-[#F5EFE0]">
                              {t.proposerCardName}
                            </span>
                            <ArrowLeftRight className="w-3.5 h-3.5 text-sky-300" />
                            <span className="font-display font-bold text-[#F5EFE0]">
                              {t.recipientCardName}
                            </span>
                          </div>
                          <p className="text-xs text-[#9CA3B8]">
                            {t.proposerName} ⇄ {t.recipientName} · Rev #
                            {t.revision}
                          </p>
                        </div>
                        <span className="text-xs font-mono text-[#8F96AB]">
                          {formatTime(t.updatedAt)}
                        </span>
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
