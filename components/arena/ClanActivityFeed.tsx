'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Flame,
  Megaphone,
  MessageSquare,
  Send,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  Trophy,
} from 'lucide-react';
import { normalizeRoomCode, PlayerProfileDoc } from '@/lib/game/multiplayer';
import {
  canPostClanAnnouncement,
  ClanActivityFilter,
  ClanDoc,
  ClanMembershipDoc,
  ClanMessageDoc,
  ClanMessageKind,
  ClanRole,
  derivePlayerAchievements,
  filterClanActivityFeed,
  formatAchievementShare,
  formatBattleResultShare,
  validateClanMessageDraft,
} from '@/lib/game/social';
import { CharacterDefinition, MatchSummaryRecord } from '@/lib/game/types';

interface ClanActivityFeedProps {
  clan: ClanDoc;
  messages: ClanMessageDoc[];
  currentUid: string;
  currentRole: ClanRole;
  profile: PlayerProfileDoc | null;
  clanMembership: ClanMembershipDoc | null;
  characters: CharacterDefinition[];
  recentMatches: MatchSummaryRecord[];
  busyAction: string | null;
  onPostActivity: (payload: {
    kind: ClanMessageKind;
    body: string;
    roomCode?: string;
    badgeLabel?: string;
    highlightMeta?: string;
  }) => Promise<boolean>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onOpenMultiplayer: (roomCode?: string) => void;
  onStartSoloBattle: () => void;
  onInspectPlayerUid: (uid: string) => void;
  onValidationError: (message: string) => void;
}

function formatMessageTime(createdAt: unknown): string {
  if (
    createdAt &&
    typeof createdAt === 'object' &&
    'toDate' in createdAt &&
    typeof (createdAt as { toDate: () => Date }).toDate === 'function'
  ) {
    const date = (createdAt as { toDate: () => Date }).toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return 'Just now';
}

export function ClanActivityFeed({
  clan,
  messages,
  currentUid,
  currentRole,
  profile,
  clanMembership,
  characters,
  recentMatches,
  busyAction,
  onPostActivity,
  onDeleteMessage,
  onOpenMultiplayer,
  onStartSoloBattle,
  onInspectPlayerUid,
  onValidationError,
}: ClanActivityFeedProps) {
  const [feedFilter, setFeedFilter] = useState<ClanActivityFilter>('all');
  const [composerKind, setComposerKind] = useState<ClanMessageKind>('chat');
  const [msgBody, setMsgBody] = useState('');
  const [msgRoomCode, setMsgRoomCode] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState<string>(
    recentMatches[0]?.matchId ?? ''
  );
  const [selectedAchievementId, setSelectedAchievementId] = useState<string>('');

  const earnedAchievements = useMemo(
    () =>
      derivePlayerAchievements({
        profile,
        characters,
        recentMatches,
        clanMembership,
      }),
    [profile, characters, recentMatches, clanMembership]
  );

  const activeMatch = useMemo(() => {
    if (recentMatches.length === 0) return null;
    return (
      recentMatches.find((m) => m.matchId === selectedMatchId) ??
      recentMatches[0]
    );
  }, [recentMatches, selectedMatchId]);

  const activeAchievement = useMemo(() => {
    if (earnedAchievements.length === 0) return null;
    return (
      earnedAchievements.find((a) => a.id === selectedAchievementId) ??
      earnedAchievements[0]
    );
  }, [earnedAchievements, selectedAchievementId]);

  const filteredMessages = useMemo(
    () => filterClanActivityFeed(messages, feedFilter),
    [messages, feedFilter]
  );

  const counts = useMemo(() => {
    let battles = 0;
    let achievements = 0;
    let chatAndSpars = 0;
    for (const m of messages) {
      if (m.kind === 'battle_result') battles += 1;
      else if (m.kind === 'achievement') achievements += 1;
      else chatAndSpars += 1;
    }
    return {
      all: messages.length,
      battles,
      achievements,
      chatAndSpars,
    };
  }, [messages]);

  const canModerate = currentRole === 'leader' || currentRole === 'officer';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (composerKind === 'battle_result') {
      if (!activeMatch) {
        onValidationError(
          'Complete a 5v5 battle first to share an official battle result.'
        );
        return;
      }
      const share = formatBattleResultShare(activeMatch, msgBody);
      const check = validateClanMessageDraft(
        share.body,
        share.kind,
        currentRole,
        '',
        share.badgeLabel,
        share.highlightMeta
      );
      if (!check.ok) {
        onValidationError(check.error || 'Unable to format battle share.');
        return;
      }
      const ok = await onPostActivity({
        kind: share.kind,
        body: share.body,
        badgeLabel: share.badgeLabel,
        highlightMeta: share.highlightMeta,
      });
      if (ok) {
        setMsgBody('');
      }
      return;
    }

    if (composerKind === 'achievement') {
      if (!activeAchievement) {
        onValidationError(
          'Earn an Arena milestone first to share an achievement.'
        );
        return;
      }
      const share = formatAchievementShare(activeAchievement, msgBody);
      const check = validateClanMessageDraft(
        share.body,
        share.kind,
        currentRole,
        '',
        share.badgeLabel,
        share.highlightMeta
      );
      if (!check.ok) {
        onValidationError(check.error || 'Unable to format achievement share.');
        return;
      }
      const ok = await onPostActivity({
        kind: share.kind,
        body: share.body,
        badgeLabel: share.badgeLabel,
        highlightMeta: share.highlightMeta,
      });
      if (ok) {
        setMsgBody('');
      }
      return;
    }

    const check = validateClanMessageDraft(
      msgBody,
      composerKind,
      currentRole,
      msgRoomCode
    );
    if (!check.ok) {
      onValidationError(check.error || 'Please check your Warroom message.');
      return;
    }

    const ok = await onPostActivity({
      kind: composerKind,
      body: msgBody,
      roomCode: composerKind === 'challenge' ? msgRoomCode : '',
    });
    if (ok) {
      setMsgBody('');
      if (composerKind === 'challenge') setMsgRoomCode('');
    }
  };

  return (
    <section
      aria-label="Clan Chat and Activity Feed"
      className="rounded-lg bg-[#111521] border border-white/10 p-5 flex flex-col gap-4"
    >
      {/* Header + Filter Controls */}
      <div className="flex flex-col gap-3 border-b border-white/10 pb-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#D4AF37]" />
            <h3 className="font-display text-base font-bold text-[#F5EFE0]">
              Clan Chat &amp; Activity Feed
            </h3>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/35 text-[#F5DC8B]">
              [{clan.tag}]
            </span>
          </div>
          <span className="text-xs font-mono text-[#8F96AB]">
            Live · {counts.battles} Battles · {counts.achievements} Feats ·{' '}
            {counts.chatAndSpars} Chat
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Filter clan activity feed"
          className="flex flex-wrap items-center gap-1.5"
        >
          {(
            [
              { id: 'all', label: `All (${counts.all})` },
              { id: 'battle_result', label: `Battle Results (${counts.battles})` },
              { id: 'achievement', label: `Achievements (${counts.achievements})` },
              { id: 'chat', label: `Chat & Spars (${counts.chatAndSpars})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={feedFilter === tab.id}
              onClick={() => setFeedFilter(tab.id)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                feedFilter === tab.id
                  ? 'bg-[#D4AF37]/20 border border-[#D4AF37]/60 text-[#F5DC8B]'
                  : 'bg-[#0B0E17] border border-white/10 text-[#9CA3B8] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Chronological Feed */}
      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 flex-1">
        {filteredMessages.length === 0 ? (
          <div className="rounded-md bg-[#0B0E17] border border-dashed border-white/10 px-5 py-9 text-center space-y-2">
            <MessageSquare className="w-6 h-6 text-[#D4AF37]/60 mx-auto" />
            <p className="text-xs sm:text-sm font-medium text-[#C4C9D8]">
              {feedFilter === 'battle_result'
                ? 'No battle reports shared yet.'
                : feedFilter === 'achievement'
                  ? 'No achievements showcased yet.'
                  : 'The Clan Activity Feed is quiet.'}
            </p>
            <p className="text-xs text-[#8F96AB] max-w-md mx-auto">
              Share a recent 5v5 battle outcome, showcase an unlocked Arena
              achievement, post a strategy note, or drop a PvP spar code below.
            </p>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isAnnouncement = msg.kind === 'announcement';
            const isChallenge = msg.kind === 'challenge';
            const isBattleResult = msg.kind === 'battle_result';
            const isAchievement = msg.kind === 'achievement';
            const isVictoryShare =
              isBattleResult &&
              (msg.badgeLabel ?? '').toUpperCase().startsWith('VICTORY');

            const canDelete = msg.authorUid === currentUid || canModerate;

            const cardClass = isBattleResult
              ? isVictoryShare
                ? 'bg-emerald-950/25 border-emerald-400/40'
                : 'bg-rose-950/25 border-rose-400/35'
              : isAchievement
                ? 'bg-[#17122A] border-violet-400/45'
                : isAnnouncement
                  ? 'bg-[#1D1810] border-[#D4AF37]/45'
                  : isChallenge
                    ? 'bg-[#0F1828] border-sky-400/45'
                    : 'bg-[#0B0E17] border-white/10';

            return (
              <article
                key={msg.messageId}
                className={`rounded-md p-3.5 border space-y-2 ${cardClass}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onInspectPlayerUid(msg.authorUid)}
                      className="text-xs font-semibold text-[#F5EFE0] hover:text-[#F5DC8B] hover:underline cursor-pointer"
                    >
                      {msg.authorName}
                    </button>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-[#D4AF37]">
                      {msg.authorRole}
                    </span>

                    {isBattleResult && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                          isVictoryShare
                            ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                            : 'bg-rose-500/20 text-rose-200 border border-rose-400/35'
                        }`}
                      >
                        {isVictoryShare ? (
                          <Trophy className="w-3 h-3" />
                        ) : (
                          <Swords className="w-3 h-3" />
                        )}
                        Battle Report
                      </span>
                    )}

                    {isAchievement && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200 border border-violet-400/35">
                        <Award className="w-3 h-3" />
                        Achievement
                      </span>
                    )}

                    {isAnnouncement && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-amber-300">
                        <Megaphone className="w-3 h-3" />
                        Announcement
                      </span>
                    )}

                    {isChallenge && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-sky-300">
                        <Swords className="w-3 h-3" />
                        5v5 Spar Callout
                      </span>
                    )}

                    <span className="text-[10px] font-mono text-[#7C849B]">
                      {formatMessageTime(msg.createdAt)}
                    </span>
                  </div>

                  {canDelete && (
                    <button
                      type="button"
                      aria-label="Delete clan feed item"
                      disabled={busyAction === `del-msg-${msg.messageId}`}
                      onClick={() => void onDeleteMessage(msg.messageId)}
                      className="p-1 text-[#7C849B] hover:text-rose-300 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Structured Highlight Plaque for Battle Results & Achievements */}
                {(isBattleResult || isAchievement) && msg.badgeLabel && (
                  <div
                    className={`rounded px-3 py-2 border flex flex-wrap items-center justify-between gap-2 ${
                      isBattleResult
                        ? isVictoryShare
                          ? 'bg-[#09120E]/80 border-emerald-400/30'
                          : 'bg-[#160B10]/80 border-rose-400/30'
                        : 'bg-[#0E0B1C]/80 border-violet-400/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isBattleResult ? (
                        isVictoryShare ? (
                          <Trophy className="w-4 h-4 text-[#F5DC8B] shrink-0" />
                        ) : (
                          <Flame className="w-4 h-4 text-rose-300 shrink-0" />
                        )
                      ) : (
                        <Sparkles className="w-4 h-4 text-violet-300 shrink-0" />
                      )}
                      <span
                        className={`text-xs font-bold tracking-wide ${
                          isBattleResult
                            ? isVictoryShare
                              ? 'text-emerald-200'
                              : 'text-rose-200'
                            : 'text-[#F5DC8B]'
                        }`}
                      >
                        {msg.badgeLabel}
                      </span>
                    </div>
                    {msg.highlightMeta && (
                      <span className="text-[11px] font-mono text-[#C4C9D8]">
                        {msg.highlightMeta}
                      </span>
                    )}
                  </div>
                )}

                <p className="text-xs sm:text-sm text-[#D8DCE8] leading-relaxed">
                  {msg.body}
                </p>

                {isChallenge && msg.roomCode && (
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-sky-200">
                      Room Code:{' '}
                      <strong className="text-[#F5DC8B] tracking-widest">
                        {msg.roomCode}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenMultiplayer(msg.roomCode)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-500 text-[#090B10] text-xs font-semibold hover:bg-sky-400 cursor-pointer"
                    >
                      <Swords className="w-3 h-3" />
                      <span>Join Spar #{msg.roomCode}</span>
                    </button>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* Unified Activity & Chat Composer */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-3 pt-3 border-t border-white/10"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setComposerKind('chat')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
              composerKind === 'chat'
                ? 'bg-[#D4AF37] text-[#090B10] font-semibold'
                : 'bg-[#0B0E17] border border-white/10 text-[#9CA3B8] hover:text-white'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>Chat</span>
          </button>

          <button
            type="button"
            onClick={() => setComposerKind('battle_result')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
              composerKind === 'battle_result'
                ? 'bg-emerald-400 text-[#090B10] font-semibold'
                : 'bg-[#0B0E17] border border-white/10 text-[#9CA3B8] hover:text-white'
            }`}
          >
            <Trophy className="w-3 h-3" />
            <span>Share Battle</span>
          </button>

          <button
            type="button"
            onClick={() => setComposerKind('achievement')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
              composerKind === 'achievement'
                ? 'bg-violet-400 text-[#090B10] font-semibold'
                : 'bg-[#0B0E17] border border-white/10 text-[#9CA3B8] hover:text-white'
            }`}
          >
            <Award className="w-3 h-3" />
            <span>Share Achievement</span>
          </button>

          <button
            type="button"
            onClick={() => setComposerKind('challenge')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
              composerKind === 'challenge'
                ? 'bg-sky-400 text-[#090B10] font-semibold'
                : 'bg-[#0B0E17] border border-white/10 text-[#9CA3B8] hover:text-white'
            }`}
          >
            <Swords className="w-3 h-3" />
            <span>Spar Callout</span>
          </button>

          {canPostClanAnnouncement(currentRole) && (
            <button
              type="button"
              onClick={() => setComposerKind('announcement')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                composerKind === 'announcement'
                  ? 'bg-amber-400 text-[#090B10] font-semibold'
                  : 'bg-[#0B0E17] border border-white/10 text-[#9CA3B8] hover:text-white'
              }`}
            >
              <Megaphone className="w-3 h-3" />
              <span>Announcement</span>
            </button>
          )}
        </div>

        {/* Share Battle Picker */}
        {composerKind === 'battle_result' && (
          <div className="rounded-md bg-[#0B0E17] border border-emerald-400/30 p-3 space-y-2.5">
            {recentMatches.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[#9CA3B8]">
                  No completed 5v5 matches logged yet. Finish a battle to share
                  your official report with [{clan.tag}].
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onStartSoloBattle}
                    className="px-3 py-1.5 rounded bg-[#D4AF37] text-[#090B10] text-xs font-semibold hover:bg-[#E5C454] cursor-pointer"
                  >
                    Play Solo Battle
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenMultiplayer()}
                    className="px-3 py-1.5 rounded bg-sky-500/20 border border-sky-400/40 text-sky-200 text-xs font-semibold hover:bg-sky-500/30 cursor-pointer"
                  >
                    PvP Lobby
                  </button>
                </div>
              </div>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-[11px] font-mono uppercase text-emerald-300">
                    Select Recent Match to Share
                  </span>
                  <select
                    value={activeMatch?.matchId ?? ''}
                    onChange={(e) => setSelectedMatchId(e.target.value)}
                    className="w-full rounded bg-[#111521] border border-white/15 px-3 py-2 text-xs text-[#F5EFE0] focus:outline-none focus:border-emerald-400"
                  >
                    {recentMatches.slice(0, 10).map((m) => (
                      <option key={m.matchId} value={m.matchId}>
                        {m.winner === 'player' ? 'VICTORY' : 'DEFEAT'} ·{' '}
                        {m.rounds}R / {m.turns}T · {m.playerSurvivors}/5
                        Standing · Seed #{m.seed}
                      </option>
                    ))}
                  </select>
                </label>
                {activeMatch && (
                  <p className="text-[11px] font-mono text-[#9CA3B8]">
                    Preview Badge:{' '}
                    <span className="text-emerald-300">
                      {formatBattleResultShare(activeMatch).badgeLabel}
                    </span>{' '}
                    · {formatBattleResultShare(activeMatch).highlightMeta}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Share Achievement Picker */}
        {composerKind === 'achievement' && (
          <div className="rounded-md bg-[#0B0E17] border border-violet-400/30 p-3 space-y-2.5">
            {earnedAchievements.length === 0 ? (
              <p className="text-xs text-[#9CA3B8]">
                Win a battle, forge a custom champion in Oracle Studio, or level
                a unit to unlock shareable Arena achievements.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                {earnedAchievements.map((ach) => {
                  const selected = activeAchievement?.id === ach.id;
                  return (
                    <button
                      key={ach.id}
                      type="button"
                      onClick={() => setSelectedAchievementId(ach.id)}
                      className={`text-left rounded p-2.5 border transition-colors cursor-pointer space-y-0.5 ${
                        selected
                          ? 'bg-violet-500/20 border-violet-400/70'
                          : 'bg-[#111521] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-[#F5DC8B] shrink-0" />
                        <span className="text-xs font-semibold text-[#F5EFE0] truncate">
                          {ach.title}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-[#9CA3B8] truncate">
                        {ach.summaryMeta}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Spar Room Code Input */}
        {composerKind === 'challenge' && (
          <input
            type="text"
            value={msgRoomCode}
            onChange={(e) => setMsgRoomCode(normalizeRoomCode(e.target.value))}
            maxLength={6}
            placeholder="6-character PvP Room Code (e.g. K7M9Q2)"
            aria-label="PvP spar room code"
            className="w-full rounded-md bg-[#090B10] border border-sky-400/40 px-3 py-2 font-mono text-xs uppercase tracking-widest text-[#F5DC8B] placeholder:text-[#666E85] placeholder:tracking-normal focus:outline-none focus:border-sky-300"
          />
        )}

        {/* Text Note + Submit */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={msgBody}
            onChange={(e) => setMsgBody(e.target.value)}
            maxLength={280}
            placeholder={
              composerKind === 'battle_result'
                ? 'Optional battle commentary (leave blank for auto summary)...'
                : composerKind === 'achievement'
                  ? 'Optional shoutout note (leave blank for auto summary)...'
                  : composerKind === 'announcement'
                    ? 'Post an official clan announcement...'
                    : composerKind === 'challenge'
                      ? 'Challenge your clanmates to a 5v5 spar...'
                      : 'Message the Clan Chat & Activity Feed...'
            }
            aria-label="Clan activity feed message"
            className="flex-1 rounded-md bg-[#090B10] border border-white/15 px-3 py-2 text-xs sm:text-sm text-[#F5EFE0] placeholder:text-[#666E85] focus:outline-none focus:border-[#D4AF37]"
          />
          <button
            type="submit"
            disabled={
              busyAction === 'post-msg' ||
              (composerKind === 'battle_result' && !activeMatch) ||
              (composerKind === 'achievement' && !activeAchievement)
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D4AF37] text-[#090B10] text-xs font-semibold hover:bg-[#E5C454] cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {composerKind === 'battle_result'
                ? 'Share Result'
                : composerKind === 'achievement'
                  ? 'Share Feat'
                  : 'Post'}
            </span>
          </button>
        </div>
      </form>
    </section>
  );
}
