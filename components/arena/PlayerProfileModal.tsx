'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import {
  Check,
  Crown,
  MailPlus,
  Shield,
  Sparkles,
  Trophy,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { TradableCardDoc } from '@/lib/game/economy';
import { PlayerProfileDoc } from '@/lib/game/multiplayer';
import { STARTER_CHARACTERS } from '@/lib/game/roster';
import {
  ClanMembershipDoc,
  computeMemberActiveXp,
  FriendRelationKind,
} from '@/lib/game/social';
import { CharacterDefinition } from '@/lib/game/types';

interface PlayerProfileModalProps {
  player: PlayerProfileDoc;
  clanMembership: ClanMembershipDoc | null;
  tradableCatalog: TradableCardDoc[];
  isSelf: boolean;
  friendRelation: FriendRelationKind;
  canInviteToMyClan: boolean;
  alreadyInvitedToMyClan: boolean;
  busyAction: string | null;
  onClose: () => void;
  onSendFriendRequest: () => void;
  onAcceptFriendRequest: () => void;
  onInviteToClan: () => void;
}

export function PlayerProfileModal({
  player,
  clanMembership,
  tradableCatalog,
  isSelf,
  friendRelation,
  canInviteToMyClan,
  alreadyInvitedToMyClan,
  busyAction,
  onClose,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onInviteToClan,
}: PlayerProfileModalProps) {
  const ownedCustomCards = useMemo(
    () => tradableCatalog.filter((c) => c.ownerId === player.uid),
    [tradableCatalog, player.uid]
  );

  const squadCards = useMemo<CharacterDefinition[]>(() => {
    const byId = new Map<string, CharacterDefinition>();
    for (const starter of STARTER_CHARACTERS) {
      byId.set(starter.id, starter);
    }
    for (const custom of ownedCustomCards) {
      if (custom.cardData) {
        byId.set(custom.cardId, custom.cardData);
      }
    }
    return (player.activeSquadIds ?? [])
      .map((id) => byId.get(id))
      .filter((c): c is CharacterDefinition => Boolean(c));
  }, [ownedCustomCards, player.activeSquadIds]);

  const totalMatches = player.wins + player.losses;
  const winRatePct =
    totalMatches > 0 ? Math.round((player.wins / totalMatches) * 1000) / 10 : 0;
  const xpStats = useMemo(
    () => computeMemberActiveXp(player, ownedCustomCards),
    [player, ownedCustomCards]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-dossier-title"
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111521] border border-[#D4AF37]/40 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-white/10 bg-gradient-to-r from-[#181C2E] to-[#111521] flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-md bg-[#221D12] border border-[#D4AF37]/70 flex items-center justify-center font-display text-lg font-bold text-[#F5DC8B] shrink-0">
              {player.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {clanMembership && (
                  <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/45 text-[#F5DC8B]">
                    [{clanMembership.clanTag}]
                  </span>
                )}
                <h2
                  id="player-dossier-title"
                  className="font-display text-xl font-bold text-[#F5EFE0] truncate"
                >
                  {player.displayName}
                  {isSelf ? ' (You)' : ''}
                </h2>
              </div>
              <p className="text-xs text-[#9CA3B8] mt-0.5">
                {player.title}
                {clanMembership
                  ? ` · ${clanMembership.clanName} (${clanMembership.role})`
                  : ' · Unaffiliated Tactician'}
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close player profile"
            onClick={onClose}
            className="p-2 rounded-md text-[#9CA3B8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-6">
          {/* Combat Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
            <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3">
              <p className="text-[10px] uppercase text-[#7C849B] flex items-center gap-1">
                <Trophy className="w-3 h-3 text-[#D4AF37]" />
                Arena ELO
              </p>
              <p className="text-lg font-bold text-[#F5DC8B] mt-0.5">
                {player.rating}
              </p>
            </div>
            <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3">
              <p className="text-[10px] uppercase text-[#7C849B]">Win Rate</p>
              <p className="text-lg font-bold text-emerald-300 mt-0.5">
                {totalMatches > 0 ? `${winRatePct.toFixed(1)}%` : '—'}
              </p>
              <p className="text-[10px] text-[#8F96AB]">
                {player.wins}W – {player.losses}L
              </p>
            </div>
            <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3">
              <p className="text-[10px] uppercase text-[#7C849B] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-violet-300" />
                Active XP
              </p>
              <p className="text-lg font-bold text-violet-300 mt-0.5">
                {xpStats.activeXp.toLocaleString()}
              </p>
              <p className="text-[10px] text-[#8F96AB]">
                {xpStats.championCardXp.toLocaleString()} Card XP
              </p>
            </div>
            <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3">
              <p className="text-[10px] uppercase text-[#7C849B] flex items-center gap-1">
                <Shield className="w-3 h-3 text-sky-300" />
                Custom Cards
              </p>
              <p className="text-lg font-bold text-sky-300 mt-0.5">
                {Math.max(player.customCardCount, ownedCustomCards.length)}
              </p>
            </div>
          </div>

          {/* Active 5-Champion Formation */}
          <div className="space-y-2.5">
            <h3 className="font-display text-sm font-bold text-[#F5EFE0] uppercase tracking-wider">
              Active 5-Champion Squad
            </h3>
            {squadCards.length === 0 ? (
              <p className="text-xs text-[#8F96AB]">
                Squad details unavailable.
              </p>
            ) : (
              <div className="grid grid-cols-5 gap-2">
                {squadCards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-md bg-[#0B0E17] border border-white/10 overflow-hidden"
                  >
                    <div className="relative aspect-[4/4] w-full">
                      <Image
                        src={card.artworkUrl}
                        alt={card.name}
                        fill
                        sizes="110px"
                        referrerPolicy="no-referrer"
                        className="object-cover object-top"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 py-1">
                        <p className="text-[10px] font-semibold text-[#F5EFE0] truncate">
                          {card.name}
                        </p>
                        <p className="text-[9px] font-mono text-[#D4AF37]">
                          {card.role}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Verified Custom Oracle Creations */}
          <div className="space-y-2.5">
            <h3 className="font-display text-sm font-bold text-[#F5EFE0] uppercase tracking-wider">
              Verified Custom Champions ({ownedCustomCards.length})
            </h3>
            {ownedCustomCards.length === 0 ? (
              <p className="text-xs text-[#8F96AB] bg-[#0B0E17] border border-white/10 rounded-md p-3">
                This tactician has not registered custom Oracle champions on the
                verified ledger yet.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                {ownedCustomCards.map((card) => (
                  <div
                    key={card.cardId}
                    className="rounded-md bg-[#0B0E17] border border-white/10 p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F5EFE0] truncate">
                        {card.name}
                      </p>
                      <p className="text-[11px] text-[#8F96AB] truncate">
                        {card.element} {card.role} · {card.rarity}
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <p className="text-xs font-bold text-[#F5DC8B]">
                        Lv.{card.level}
                      </p>
                      <p className="text-[10px] text-violet-300">
                        {(card.cardData?.xp ?? 0).toLocaleString()} XP
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Social Actions */}
          {!isSelf && (
            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-white/10">
              {friendRelation === 'friend' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-emerald-500/15 border border-emerald-400/35 text-xs font-medium text-emerald-200">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Arena Friend</span>
                </span>
              )}
              {friendRelation === 'outgoing_pending' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-amber-500/15 border border-amber-400/35 text-xs font-medium text-amber-200">
                  <span>Friend Request Sent</span>
                </span>
              )}
              {friendRelation === 'incoming_pending' && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={onAcceptFriendRequest}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-500 text-[#090B10] text-xs font-semibold hover:bg-emerald-400 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Accept Friend Request</span>
                </button>
              )}
              {(friendRelation === 'none' || friendRelation === 'declined') && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={onSendFriendRequest}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D4AF37] text-[#090B10] text-xs font-semibold hover:bg-[#E5C454] transition-colors cursor-pointer disabled:opacity-60"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Friend</span>
                </button>
              )}

              {canInviteToMyClan && !clanMembership && (
                <button
                  type="button"
                  disabled={busyAction !== null || alreadyInvitedToMyClan}
                  onClick={onInviteToClan}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-violet-500/20 border border-violet-400/45 text-violet-100 text-xs font-semibold hover:bg-violet-500/30 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {alreadyInvitedToMyClan ? (
                    <>
                      <Crown className="w-3.5 h-3.5" />
                      <span>Clan Invite Sent</span>
                    </>
                  ) : (
                    <>
                      <MailPlus className="w-3.5 h-3.5" />
                      <span>Invite to Clan</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
