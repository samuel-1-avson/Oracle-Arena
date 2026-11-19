'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpCircle,
  Check,
  Copy,
  Crown,
  KeyRound,
  Layers,
  Link2,
  Loader2,
  LogIn,
  Plus,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  cancelWaitingRoom,
  createBattleRoom,
  findWaitingRoomByCode,
  joinBattleRoom,
  subscribeLeaderboard,
  subscribeLobbyRooms,
} from '@/lib/firebase/repository';
import {
  BattleRoomDoc,
  normalizeRoomCode,
  PlayerProfileDoc,
} from '@/lib/game/multiplayer';
import { CharacterDefinition } from '@/lib/game/types';
import { AccountBar } from './AccountBar';
import { useFirebaseAuth } from './FirebaseProvider';

interface MultiplayerLobbyProps {
  activeSquad: CharacterDefinition[];
  initialRoomCode?: string;
  syncingCloud: boolean;
  onEnterRoom: (roomId: string) => void;
  onStartSoloBattle: () => void;
  onOpenCollection: () => void;
  onOpenEvolutionChamber: () => void;
  onBackToTitle: () => void;
}

export function MultiplayerLobby({
  activeSquad,
  initialRoomCode = '',
  syncingCloud,
  onEnterRoom,
  onStartSoloBattle,
  onOpenCollection,
  onOpenEvolutionChamber,
  onBackToTitle,
}: MultiplayerLobbyProps) {
  const {
    user,
    profile,
    authReady,
    signingIn,
    authError,
    signInWithGoogle,
  } = useFirebaseAuth();

  const [openRooms, setOpenRooms] = useState<BattleRoomDoc[]>([]);
  const [myRooms, setMyRooms] = useState<BattleRoomDoc[]>([]);
  const [leaderboard, setLeaderboard] = useState<PlayerProfileDoc[]>([]);
  const [roomCodeInput, setRoomCodeInput] = useState(() =>
    normalizeRoomCode(initialRoomCode)
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [copiedMode, setCopiedMode] = useState<'code' | 'link' | null>(null);
  const hostedRoomIdToWatchRef = useRef<string | null>(null);

  // Live Firestore subscriptions once signed in
  useEffect(() => {
    if (!user) return;

    const unsubRooms = subscribeLobbyRooms(
      user.uid,
      ({ openRooms: open, myRooms: mine }) => {
        setOpenRooms(open);
        setMyRooms(mine);

        const watchId = hostedRoomIdToWatchRef.current;
        if (watchId) {
          const matched = mine.find((r) => r.roomId === watchId);
          if (matched && matched.status === 'active') {
            hostedRoomIdToWatchRef.current = null;
            onEnterRoom(matched.roomId);
          }
        }
      },
      (err) => {
        console.error('Lobby room subscription error:', err);
        setLobbyError(
          'Live room updates encountered a permission or network issue.'
        );
      }
    );

    const unsubBoard = subscribeLeaderboard(
      (players) => setLeaderboard(players),
      (err) => console.error('Leaderboard listener warning:', err)
    );

    return () => {
      unsubRooms();
      unsubBoard();
    };
  }, [user, onEnterRoom]);

  const visibleOpenRooms = useMemo(
    () => (user ? openRooms : []),
    [user, openRooms]
  );
  const visibleMyRooms = useMemo(
    () => (user ? myRooms : []),
    [user, myRooms]
  );
  const visibleLeaderboard = useMemo(
    () => (user ? leaderboard : []),
    [user, leaderboard]
  );

  const activeWaitingHostedRoom = useMemo(
    () =>
      visibleMyRooms.find(
        (r) => r.status === 'waiting' && user && r.hostUid === user.uid
      ) ?? null,
    [visibleMyRooms, user]
  );

  const activeMatches = useMemo(
    () => visibleMyRooms.filter((r) => r.status === 'active'),
    [visibleMyRooms]
  );

  const recentFinishedMatches = useMemo(
    () => visibleMyRooms.filter((r) => r.status === 'finished').slice(0, 5),
    [visibleMyRooms]
  );

  const displayName =
    profile?.displayName ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'Arena Tactician';

  const handleCreateRoom = async () => {
    if (!user) return;
    setLobbyError(null);
    if (activeSquad.length !== 5) {
      setLobbyError('Select a complete 5-champion squad before creating a room.');
      return;
    }
    setBusyAction('create');
    try {
      const created = await createBattleRoom(user, displayName, activeSquad);
      hostedRoomIdToWatchRef.current = created.roomId;
    } catch (err) {
      setLobbyError(
        err instanceof Error
          ? err.message
          : 'Could not create battle room. Please retry.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoinRoomDoc = async (room: BattleRoomDoc) => {
    if (!user) return;
    setLobbyError(null);
    if (room.hostUid === user.uid) {
      setLobbyError(
        'You are the host of this room. Share its 6-character code with a rival player.'
      );
      return;
    }
    setBusyAction(`join-${room.roomId}`);
    try {
      const joined = await joinBattleRoom(
        room.roomId,
        user,
        displayName,
        activeSquad
      );
      onEnterRoom(joined.roomId);
    } catch (err) {
      setLobbyError(
        err instanceof Error
          ? err.message
          : 'Unable to join battle room. It may already be full.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLobbyError(null);
    const code = normalizeRoomCode(roomCodeInput);
    if (code.length !== 6) {
      setLobbyError('Enter a 6-character alphanumeric room code.');
      return;
    }
    setBusyAction('join-code');
    try {
      const found = await findWaitingRoomByCode(code);
      if (!found) {
        setLobbyError(
          `No open waiting room was found for code "${code}". Verify the code or browse Open Rooms.`
        );
        return;
      }
      await handleJoinRoomDoc(found);
    } catch (err) {
      setLobbyError(
        err instanceof Error ? err.message : 'Unable to look up room code.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCancelHostedRoom = async (roomId: string) => {
    setLobbyError(null);
    setBusyAction(`cancel-${roomId}`);
    try {
      await cancelWaitingRoom(roomId);
      if (hostedRoomIdToWatchRef.current === roomId) {
        hostedRoomIdToWatchRef.current = null;
      }
    } catch (err) {
      setLobbyError(
        err instanceof Error ? err.message : 'Failed to cancel waiting room.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopy = async (mode: 'code' | 'link', roomCode: string) => {
    try {
      const text =
        mode === 'code'
          ? roomCode
          : `${window.location.origin}/?room=${roomCode}`;
      await navigator.clipboard.writeText(text);
      setCopiedMode(mode);
      window.setTimeout(() => setCopiedMode(null), 1800);
    } catch {
      setLobbyError('Clipboard access unavailable — copy the code manually.');
    }
  };

  return (
    <main className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col">
      {/* Top Game Shell Toolbar */}
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
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#F5DC8B] tracking-wide whitespace-nowrap">
              Multiplayer Arena
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenCollection}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-[#C4C9D8] hover:text-white border border-white/15 rounded-md hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>Squad</span>
            </button>

            <button
              type="button"
              onClick={onOpenEvolutionChamber}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-emerald-200 bg-emerald-500/15 border border-emerald-400/35 rounded-md hover:bg-emerald-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Evolution</span>
            </button>

            <AccountBar syncingCloud={syncingCloud} />
          </div>
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 flex-1 space-y-6">
        {(authError || lobbyError) && (
          <div
            role="alert"
            className="rounded-md bg-rose-950/60 border border-rose-500/45 px-4 py-3 text-xs sm:text-sm text-rose-200 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{lobbyError || authError}</span>
            </div>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setLobbyError(null)}
              className="p-1 text-rose-200/70 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Auth Gate when not signed in */}
        {!authReady ? (
          <div className="rounded-lg bg-[#111521] border border-white/10 p-12 flex flex-col items-center justify-center gap-3 text-sm text-[#9CA3B8]">
            <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
            <span>Connecting to Oracle Arena multiplayer services...</span>
          </div>
        ) : !user ? (
          <section className="max-w-3xl mx-auto rounded-lg bg-[#111521] border border-[#D4AF37]/35 p-6 sm:p-10 space-y-6 shadow-2xl">
            <div className="space-y-2">
              <p className="text-xs font-mono uppercase tracking-[0.18em] text-[#D4AF37]">
                Real-Time 5v5 PvP · Cloud Account
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F5EFE0]">
                Sign In to Challenge Live Players
              </h2>
              <p className="text-sm text-[#C4C9D8] leading-relaxed">
                Sign in with your Google account to sync your custom Oracle
                champions, progression levels, and match history to Cloud
                Firestore, create or join live 5v5 PvP rooms, and climb the
                Arena Leaderboard.
              </p>
            </div>

            {roomCodeInput.length === 6 && (
              <div className="rounded-md bg-violet-950/40 border border-violet-400/40 px-4 py-3 text-xs sm:text-sm text-violet-200">
                Room invite detected:{' '}
                <span className="font-mono font-bold text-[#F5DC8B]">
                  {roomCodeInput}
                </span>
                . Sign in below to enter this 5v5 match immediately.
              </div>
            )}

            <div className="grid sm:grid-cols-3 gap-4 pt-1">
              <div className="rounded-md bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <Users className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="text-sm font-semibold text-[#F5EFE0]">
                  Live 5v5 Rooms
                </h3>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  Host a battle room with a 6-character code or join an open
                  challenger in real time.
                </p>
              </div>
              <div className="rounded-md bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <ShieldCheck className="w-4 h-4 text-sky-300" />
                <h3 className="text-sm font-semibold text-[#F5EFE0]">
                  Server-Validated Turns
                </h3>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  Every PvP move is checked against Ruleset 1.0 legality and
                  committed atomically.
                </p>
              </div>
              <div className="rounded-md bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <Trophy className="w-4 h-4 text-violet-300" />
                <h3 className="text-sm font-semibold text-[#F5EFE0]">
                  Ranked ELO & XP
                </h3>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  Earn validated champion XP and ranked ELO points synced across
                  sessions.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-sm hover:bg-[#E5C454] transition-colors cursor-pointer disabled:opacity-60"
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
                onClick={onStartSoloBattle}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-[#161B2B] border border-white/15 text-[#ECEEF4] text-sm font-medium hover:bg-[#1E253A] transition-colors cursor-pointer"
              >
                <Swords className="w-4 h-4 text-sky-300" />
                <span>Play Solo AI Battle Instead</span>
              </button>
            </div>
          </section>
        ) : (
          /* Signed-in Multiplayer Workspace */
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1.15fr] gap-6">
            {/* LEFT COLUMN: Squad, Create Room / Active Waiting Room, Join by Code */}
            <div className="space-y-6">
              {/* Active PvP Squad Preview */}
              <section className="rounded-lg bg-[#111521] border border-[#D4AF37]/30 p-5 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-base font-bold text-[#F5EFE0]">
                      Your PvP Squad
                    </h2>
                    <p className="text-xs text-[#9CA3B8]">
                      Deployed automatically when you host or join a 5v5 room.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenCollection}
                    className="text-xs font-semibold text-[#F5DC8B] hover:underline cursor-pointer"
                  >
                    Edit Formation
                  </button>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {activeSquad.map((card) => (
                    <div
                      key={card.id}
                      className="rounded-md bg-[#0B0E17] border border-white/10 overflow-hidden"
                    >
                      <div className="relative aspect-[4/4] w-full">
                        <Image
                          src={card.artworkUrl}
                          alt={card.name}
                          fill
                          sizes="100px"
                          referrerPolicy="no-referrer"
                          className="object-cover object-top"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 py-1">
                          <p className="text-[10px] font-semibold text-[#F5EFE0] truncate">
                            {card.name}
                          </p>
                          <p className="text-[9px] font-mono text-[#D4AF37]">
                            Lv.{card.level}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Host a New Room OR Active Waiting Room */}
              {activeWaitingHostedRoom ? (
                <section className="rounded-lg bg-[#151326] border border-[#D4AF37]/55 p-5 space-y-4 shadow-[0_0_28px_rgba(212,175,55,0.12)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-amber-300">
                        Waiting for Challenger
                      </p>
                      <h2 className="font-display text-xl font-bold text-[#F5EFE0]">
                        Your Room is Open
                      </h2>
                    </div>
                    <Loader2 className="w-5 h-5 text-[#D4AF37] animate-spin shrink-0 mt-1" />
                  </div>

                  <div className="rounded-md bg-[#0B0E17] border border-white/10 p-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-mono text-[#8F96AB]">
                        ROOM CODE
                      </p>
                      <p className="font-mono text-3xl font-bold tracking-[0.22em] text-[#F5DC8B]">
                        {activeWaitingHostedRoom.roomCode}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopy('code', activeWaitingHostedRoom.roomCode)
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#1A2030] border border-white/15 text-xs font-medium text-[#ECEEF4] hover:bg-[#232B40] cursor-pointer"
                      >
                        {copiedMode === 'code' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {copiedMode === 'code' ? 'Copied' : 'Copy Code'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void handleCopy('link', activeWaitingHostedRoom.roomCode)
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-violet-500/20 border border-violet-400/40 text-xs font-medium text-violet-100 hover:bg-violet-500/30 cursor-pointer"
                      >
                        {copiedMode === 'link' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                        ) : (
                          <Link2 className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {copiedMode === 'link' ? 'Link Copied' : 'Invite Link'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-xs text-[#9CA3B8]">
                    <span>
                      The 5v5 battle launches automatically as soon as an
                      opponent joins.
                    </span>
                    <button
                      type="button"
                      disabled={
                        busyAction === `cancel-${activeWaitingHostedRoom.roomId}`
                      }
                      onClick={() =>
                        void handleCancelHostedRoom(
                          activeWaitingHostedRoom.roomId
                        )
                      }
                      className="px-3 py-1.5 rounded border border-rose-500/40 text-rose-300 hover:bg-rose-950/40 transition-colors shrink-0 cursor-pointer disabled:opacity-60"
                    >
                      Cancel Room
                    </button>
                  </div>
                </section>
              ) : (
                <section className="rounded-lg bg-[#111521] border border-white/10 p-5 space-y-4">
                  <div className="space-y-1">
                    <h2 className="font-display text-base font-bold text-[#F5EFE0]">
                      Host a 5v5 PvP Match
                    </h2>
                    <p className="text-xs text-[#9CA3B8]">
                      Open a live room listed in the lobby and generate a
                      shareable 6-character invite code.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction === 'create'}
                    onClick={() => void handleCreateRoom()}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-[#D4AF37] text-[#0B0D13] font-semibold text-sm hover:bg-[#E5C454] transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {busyAction === 'create' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span>Create 5v5 Battle Room</span>
                  </button>
                </section>
              )}

              {/* Join by 6-Character Code */}
              <section className="rounded-lg bg-[#111521] border border-white/10 p-5 space-y-3.5">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-sky-300" />
                  <h2 className="font-display text-base font-bold text-[#F5EFE0]">
                    Join by Room Code
                  </h2>
                </div>
                <form
                  onSubmit={(e) => void handleJoinByCode(e)}
                  className="flex items-center gap-2.5"
                >
                  <input
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) =>
                      setRoomCodeInput(normalizeRoomCode(e.target.value))
                    }
                    placeholder="e.g. K7M9Q2"
                    maxLength={6}
                    aria-label="6-character battle room code"
                    className="flex-1 rounded-md bg-[#090B10] border border-white/15 px-3.5 py-2.5 font-mono text-sm tracking-[0.18em] uppercase text-[#F5EFE0] placeholder:text-[#666E85] placeholder:tracking-normal focus:outline-none focus:border-[#D4AF37]"
                  />
                  <button
                    type="submit"
                    disabled={
                      busyAction === 'join-code' || roomCodeInput.length !== 6
                    }
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md bg-sky-500/20 border border-sky-400/50 text-sky-100 text-sm font-semibold hover:bg-sky-500/30 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {busyAction === 'join-code' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Swords className="w-4 h-4" />
                    )}
                    <span>Join Match</span>
                  </button>
                </form>
              </section>
            </div>

            {/* RIGHT COLUMN: Your Active Matches, Open Rooms Lobby, Arena Leaderboard */}
            <div className="space-y-6">
              {/* Active PvP Matches (Rejoin) */}
              {activeMatches.length > 0 && (
                <section className="rounded-lg bg-[#141A29] border border-emerald-400/40 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-bold text-emerald-200">
                      Your Active PvP Matches
                    </h2>
                    <span className="text-xs font-mono tabular-nums text-emerald-300">
                      {activeMatches.length} Live
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {activeMatches.map((room) => {
                      const isHost = room.hostUid === user.uid;
                      const opponent = isHost ? room.guestName : room.hostName;
                      const isYourTurn =
                        (isHost && room.activeSide === 'player') ||
                        (!isHost && room.activeSide === 'enemy');
                      return (
                        <div
                          key={room.roomId}
                          className="rounded-md bg-[#0B0E17] border border-white/10 p-3.5 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="space-y-0.5">
                            <p className="text-sm font-semibold text-[#F5EFE0]">
                              vs {opponent || 'Challenger'}{' '}
                              <span className="font-mono text-xs text-[#8F96AB]">
                                #{room.roomCode}
                              </span>
                            </p>
                            <p className="text-xs font-mono tabular-nums text-[#9CA3B8]">
                              Round {room.round} · Turn {room.turnNumber} ·{' '}
                              <span
                                className={
                                  isYourTurn
                                    ? 'text-[#F5DC8B] font-semibold'
                                    : 'text-sky-300'
                                }
                              >
                                {isYourTurn ? 'Your Turn' : 'Opponent Acting'}
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onEnterRoom(room.roomId)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-500 text-[#090B10] text-xs font-semibold hover:bg-emerald-400 transition-colors cursor-pointer"
                          >
                            <Swords className="w-3.5 h-3.5" />
                            <span>Rejoin Battle</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Open Rooms Lobby */}
              <section className="rounded-lg bg-[#111521] border border-white/10 p-5 space-y-3.5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#D4AF37]" />
                    <h2 className="font-display text-base font-bold text-[#F5EFE0]">
                      Open Battle Rooms
                    </h2>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[#8F96AB]">
                    {visibleOpenRooms.length} Available
                  </span>
                </div>

                {visibleOpenRooms.length === 0 ? (
                  <p className="text-xs sm:text-sm text-[#9CA3B8] py-4 leading-relaxed">
                    No open rooms from other tacticians right now. Host a room
                    on the left and share the 6-character code or invite link
                    with a friend (or open a second browser profile) to battle
                    in real time.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {visibleOpenRooms.map((room) => (
                      <div
                        key={room.roomId}
                        className="rounded-md bg-[#0B0E17] border border-white/10 p-3.5 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-[#F5EFE0]">
                            {room.hostName}
                            <span className="ml-2 font-mono text-xs text-[#D4AF37]">
                              #{room.roomCode}
                            </span>
                          </p>
                          <p className="text-[11px] text-[#8F96AB]">
                            {room.hostSquad
                              .slice(0, 5)
                              .map((c) => c.name)
                              .join(' · ')}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={busyAction === `join-${room.roomId}`}
                          onClick={() => void handleJoinRoomDoc(room)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D4AF37] text-[#0B0D13] text-xs font-semibold hover:bg-[#E5C454] transition-colors cursor-pointer disabled:opacity-60"
                        >
                          {busyAction === `join-${room.roomId}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Swords className="w-3.5 h-3.5" />
                          )}
                          <span>Join 5v5</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Arena Leaderboard (Zero PII) */}
              <section className="rounded-lg bg-[#111521] border border-white/10 p-5 space-y-3.5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-[#D4AF37]" />
                    <h2 className="font-display text-base font-bold text-[#F5EFE0]">
                      Arena Leaderboard
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-[#8F96AB]">
                    Top Tacticians by ELO
                  </span>
                </div>

                {visibleLeaderboard.length === 0 ? (
                  <p className="text-xs text-[#9CA3B8] py-3">
                    Leaderboard rankings appear as tacticians join Oracle Arena.
                  </p>
                ) : (
                  <div className="divide-y divide-white/8 text-xs">
                    {visibleLeaderboard.slice(0, 10).map((entry, idx) => {
                      const isSelf = entry.uid === user.uid;
                      return (
                        <div
                          key={entry.uid}
                          className={`py-2.5 flex items-center justify-between gap-3 ${
                            isSelf ? 'text-[#F5DC8B]' : 'text-[#D8DCE8]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono tabular-nums text-[#8F96AB] w-5 shrink-0">
                              #{idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold truncate">
                                {entry.displayName}
                                {isSelf ? ' (You)' : ''}
                              </p>
                              <p className="text-[11px] text-[#7C849B] truncate">
                                {entry.title} · {entry.customCardCount} Custom
                              </p>
                            </div>
                          </div>

                          <div className="text-right font-mono tabular-nums shrink-0">
                            <p className="font-bold text-[#F5DC8B]">
                              {entry.rating} ELO
                            </p>
                            <p className="text-[11px] text-[#8F96AB]">
                              {entry.wins}W – {entry.losses}L
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Recent Completed PvP Matches */}
              {recentFinishedMatches.length > 0 && (
                <section className="rounded-lg bg-[#111521] border border-white/10 p-5 space-y-3">
                  <h2 className="font-display text-sm font-bold text-[#F5EFE0]">
                    Recent PvP Results
                  </h2>
                  <div className="divide-y divide-white/8 text-xs font-mono tabular-nums">
                    {recentFinishedMatches.map((room) => {
                      const isHost = room.hostUid === user.uid;
                      const opponent = isHost ? room.guestName : room.hostName;
                      const won = room.winnerUid === user.uid;
                      return (
                        <div
                          key={room.roomId}
                          className="py-2 flex items-center justify-between gap-3"
                        >
                          <span className="font-sans text-[#C4C9D8]">
                            vs {opponent || 'Rival'}{' '}
                            <span className="font-mono text-[#7C849B]">
                              #{room.roomCode}
                            </span>
                          </span>
                          <span
                            className={
                              won
                                ? 'text-emerald-300 font-semibold'
                                : 'text-rose-300 font-semibold'
                            }
                          >
                            {won ? 'VICTORY' : 'DEFEAT'} · R{room.round}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
