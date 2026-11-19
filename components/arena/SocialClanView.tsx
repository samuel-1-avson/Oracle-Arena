'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Award,
  Check,
  Crown,
  Edit3,
  Globe,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  MailPlus,
  MessageSquare,
  Plus,
  Search,
  Shield,
  Sparkles,
  Store,
  Swords,
  Trash2,
  Trophy,
  User,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  acceptClanInviteAtomic,
  createClanAtomic,
  deleteClanMessage,
  disbandSoloClanAtomic,
  joinOpenClanAtomic,
  kickClanMemberAtomic,
  leaveClanAtomic,
  postClanMessage,
  removeFriendship,
  respondToFriendRequest,
  sendClanInvite,
  sendFriendRequest,
  subscribeAllClanMemberships,
  subscribeClanDetail,
  subscribeClanMembers,
  subscribeClanMessages,
  subscribeClansDirectory,
  subscribeCommunityPlayers,
  subscribeMyClanInvites,
  subscribeMyFriendships,
  transferClanLeadershipAtomic,
  updateClanInviteStatus,
  updateClanMemberRoleAtomic,
  updateClanSettings,
  updatePlayerProfileIdentity,
} from '@/lib/firebase/social-repository';
import { TradableCardDoc } from '@/lib/game/economy';
import { PlayerProfileDoc } from '@/lib/game/multiplayer';
import {
  aggregateGlobalClanRankings,
  ARENA_TITLES,
  canManageClanRole,
  canSendClanInvite,
  CLAN_EMBLEMS,
  ClanDoc,
  ClanInviteDoc,
  ClanJoinPolicy,
  ClanMemberDoc,
  ClanMembershipDoc,
  ClanMessageDoc,
  ClanMessageKind,
  computeClanAverageRating,
  computeMemberActiveXp,
  FriendshipDoc,
  MAX_CLAN_MEMBERS,
  normalizeClanTag,
  summarizeFriendships,
  validateClanDraft,
} from '@/lib/game/social';
import {
  CharacterDefinition,
  ElementAffinity,
  MatchSummaryRecord,
} from '@/lib/game/types';
import { AccountBar } from './AccountBar';
import { ClanActivityFeed } from './ClanActivityFeed';
import { useFirebaseAuth } from './FirebaseProvider';
import { GlobalClanRankings } from './GlobalClanRankings';
import { PlayerLeaderboard } from './PlayerLeaderboard';
import { PlayerProfileModal } from './PlayerProfileModal';
import { ELEMENT_STYLES } from './ui-meta';

export type SocialTab =
  | 'leaderboard'
  | 'rankings'
  | 'activity'
  | 'clan-hq'
  | 'friends'
  | 'profile';

interface SocialClanViewProps {
  tradableCatalog: TradableCardDoc[];
  characters: CharacterDefinition[];
  recentMatches: MatchSummaryRecord[];
  syncingCloud: boolean;
  initialTab?: SocialTab;
  onOpenMultiplayer: (roomCode?: string) => void;
  onOpenMarketplace: () => void;
  onOpenTradingHub: () => void;
  onStartSoloBattle: () => void;
  onBackToTitle: () => void;
}

export function SocialClanView({
  tradableCatalog,
  characters,
  recentMatches,
  syncingCloud,
  initialTab = 'leaderboard',
  onOpenMultiplayer,
  onOpenMarketplace,
  onOpenTradingHub,
  onStartSoloBattle,
  onBackToTitle,
}: SocialClanViewProps) {
  const {
    user,
    profile,
    wallet,
    clanMembership,
    authReady,
    signingIn,
    authError,
    signInWithGoogle,
  } = useFirebaseAuth();

  const [activeTab, setActiveTab] = useState<SocialTab>(initialTab);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Live Firestore states
  const [players, setPlayers] = useState<PlayerProfileDoc[]>([]);
  const [clans, setClans] = useState<ClanDoc[]>([]);
  const [membershipsByUid, setMembershipsByUid] = useState<
    Record<string, ClanMembershipDoc>
  >({});
  const [friendships, setFriendships] = useState<FriendshipDoc[]>([]);
  const [clanInvites, setClanInvites] = useState<{
    incoming: ClanInviteDoc[];
    outgoing: ClanInviteDoc[];
  }>({ incoming: [], outgoing: [] });

  // Active Clan HQ subscriptions
  const [activeClanDetail, setActiveClanDetail] = useState<ClanDoc | null>(null);
  const [activeClanMembers, setActiveClanMembers] = useState<ClanMemberDoc[]>(
    []
  );
  const [activeClanMessages, setActiveClanMessages] = useState<
    ClanMessageDoc[]
  >([]);

  // Inspected player profile modal
  const [inspectedPlayerUid, setInspectedPlayerUid] = useState<string | null>(
    null
  );

  // Create Clan Form
  const [newClanName, setNewClanName] = useState('');
  const [newClanTag, setNewClanTag] = useState('');
  const [newClanMotto, setNewClanMotto] = useState('');
  const [newClanEmblem, setNewClanEmblem] = useState<ElementAffinity>('Solar');
  const [newClanPolicy, setNewClanPolicy] = useState<ClanJoinPolicy>('open');

  // Edit Clan Settings Form
  const [editingClan, setEditingClan] = useState(false);
  const [editClanName, setEditClanName] = useState('');
  const [editClanMotto, setEditClanMotto] = useState('');
  const [editClanEmblem, setEditClanEmblem] = useState<ElementAffinity>('Solar');
  const [editClanPolicy, setEditClanPolicy] = useState<ClanJoinPolicy>('open');

  // Confirmations (inline, zero window.confirm)
  const [confirmDisband, setConfirmDisband] = useState(false);
  const [confirmTransferUid, setConfirmTransferUid] = useState<string | null>(
    null
  );

  // Community search & Clan recruit filter
  const [communitySearch, setCommunitySearch] = useState('');
  const [showRecruitDrawer, setShowRecruitDrawer] = useState(false);

  // My Profile identity editor
  const [profileNameDraft, setProfileNameDraft] = useState<string | null>(null);
  const [profileTitleDraft, setProfileTitleDraft] = useState<string | null>(
    null
  );

  // Subscribe to global social collections once signed in
  useEffect(() => {
    if (!user) return;

    const unsubPlayers = subscribeCommunityPlayers(
      (list) => setPlayers(list),
      (err) => console.error('Community players listener warning:', err)
    );
    const unsubClans = subscribeClansDirectory(
      (list) => setClans(list),
      (err) => console.error('Clans directory listener warning:', err)
    );
    const unsubMemberships = subscribeAllClanMemberships(
      (map) => setMembershipsByUid(map),
      (err) => console.error('Clan memberships listener warning:', err)
    );
    const unsubFriends = subscribeMyFriendships(
      user.uid,
      (list) => setFriendships(list),
      (err) => console.error('Friendships listener warning:', err)
    );
    const unsubInvites = subscribeMyClanInvites(
      user.uid,
      (payload) => setClanInvites(payload),
      (err) => console.error('Clan invites listener warning:', err)
    );

    return () => {
      unsubPlayers();
      unsubClans();
      unsubMemberships();
      unsubFriends();
      unsubInvites();
    };
  }, [user]);

  // Subscribe to active Clan HQ subcollections when in a clan
  const activeClanId = user && clanMembership ? clanMembership.clanId : null;
  useEffect(() => {
    if (!activeClanId) return;

    const unsubClan = subscribeClanDetail(
      activeClanId,
      (detail) => setActiveClanDetail(detail),
      (err) => console.error('Clan detail listener warning:', err)
    );
    const unsubMembers = subscribeClanMembers(
      activeClanId,
      (list) => setActiveClanMembers(list),
      (err) => console.error('Clan members listener warning:', err)
    );
    const unsubMessages = subscribeClanMessages(
      activeClanId,
      (list) => setActiveClanMessages(list),
      (err) => console.error('Clan messages listener warning:', err)
    );

    return () => {
      unsubClan();
      unsubMembers();
      unsubMessages();
    };
  }, [activeClanId]);

  // Derived visibility (avoids synchronous setState inside useEffect)
  const visiblePlayers = useMemo(
    () => (user ? players : []),
    [user, players]
  );
  const visibleClans = useMemo(() => (user ? clans : []), [user, clans]);
  const visibleMemberships = useMemo(
    () => (user ? membershipsByUid : {}),
    [user, membershipsByUid]
  );
  const visibleFriendships = useMemo(
    () => (user ? friendships : []),
    [user, friendships]
  );
  const visibleInvites = useMemo(
    () => (user ? clanInvites : { incoming: [], outgoing: [] }),
    [user, clanInvites]
  );
  const myClan = useMemo(
    () =>
      activeClanId && activeClanDetail?.clanId === activeClanId
        ? activeClanDetail
        : null,
    [activeClanId, activeClanDetail]
  );
  const myClanMembers = useMemo(
    () =>
      activeClanId
        ? activeClanMembers.filter((m) => m.clanId === activeClanId)
        : [],
    [activeClanId, activeClanMembers]
  );
  const myClanMessages = useMemo(
    () =>
      activeClanId
        ? activeClanMessages.filter((m) => m.clanId === activeClanId)
        : [],
    [activeClanId, activeClanMessages]
  );

  const friendSummary = useMemo(
    () => summarizeFriendships(visibleFriendships, user?.uid ?? ''),
    [visibleFriendships, user]
  );

  const pendingIncomingClanInvites = useMemo(
    () => visibleInvites.incoming.filter((i) => i.status === 'pending'),
    [visibleInvites.incoming]
  );

  const pendingOutgoingClanInvites = useMemo(
    () =>
      visibleInvites.outgoing.filter(
        (i) => i.status === 'pending' && i.clanId === activeClanId
      ),
    [visibleInvites.outgoing, activeClanId]
  );

  const myClanRole = useMemo(() => {
    if (!user || !clanMembership) return null;
    const fromRoster = myClanMembers.find((m) => m.uid === user.uid)?.role;
    return fromRoster ?? clanMembership.role;
  }, [user, clanMembership, myClanMembers]);

  const myClanRankingEntry = useMemo(() => {
    if (!myClan) return null;
    const allRanked = aggregateGlobalClanRankings({
      clans: visibleClans,
      players: visiblePlayers,
      membershipsByUid: visibleMemberships,
      tradableCatalog,
      sortBy: 'composite',
    });
    return allRanked.find((r) => r.clan.clanId === myClan.clanId) ?? null;
  }, [myClan, visibleClans, visiblePlayers, visibleMemberships, tradableCatalog]);

  const playersByUid = useMemo(() => {
    const map: Record<string, PlayerProfileDoc> = {};
    for (const p of visiblePlayers) {
      map[p.uid] = p;
    }
    return map;
  }, [visiblePlayers]);

  const inspectedPlayer = inspectedPlayerUid
    ? playersByUid[inspectedPlayerUid] ?? null
    : null;

  const filteredCommunityPlayers = useMemo(() => {
    const q = communitySearch.trim().toLowerCase();
    return visiblePlayers.filter((p) => {
      if (!q) return true;
      const membership = visibleMemberships[p.uid];
      return (
        p.displayName.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        (membership?.clanTag.toLowerCase().includes(q) ?? false) ||
        (membership?.clanName.toLowerCase().includes(q) ?? false)
      );
    });
  }, [visiblePlayers, visibleMemberships, communitySearch]);

  const recruitCandidates = useMemo(() => {
    if (!user) return [];
    return visiblePlayers.filter(
      (p) => p.uid !== user.uid && !visibleMemberships[p.uid]
    );
  }, [user, visiblePlayers, visibleMemberships]);

  const currentDisplayName =
    profile?.displayName ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'Arena Tactician';

  const myOwnCustomCards = useMemo(
    () =>
      user ? tradableCatalog.filter((c) => c.ownerId === user.uid) : [],
    [user, tradableCatalog]
  );

  const myOwnXpStats = useMemo(
    () => computeMemberActiveXp(profile ?? undefined, myOwnCustomCards),
    [profile, myOwnCustomCards]
  );

  const flashSuccess = (msg: string) => {
    setBannerError(null);
    setBannerSuccess(msg);
  };

  const flashError = (err: unknown, fallback: string) => {
    setBannerSuccess(null);
    setBannerError(err instanceof Error ? err.message : fallback);
  };

  // =========================================================================
  // Action Handlers
  // =========================================================================

  const handleSendFriendRequest = async (target: PlayerProfileDoc) => {
    if (!user) return;
    setBusyAction(`friend-add-${target.uid}`);
    setBannerError(null);
    try {
      const existingRel = friendSummary.relationByUid[target.uid];
      if (existingRel?.kind === 'declined') {
        await removeFriendship(existingRel.doc.friendshipId);
      }
      await sendFriendRequest(
        user.uid,
        currentDisplayName,
        target.uid,
        target.displayName
      );
      flashSuccess(`Friend request sent to ${target.displayName}.`);
    } catch (err) {
      flashError(err, 'Could not send friend request.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRespondFriend = async (
    friendship: FriendshipDoc,
    status: 'accepted' | 'declined'
  ) => {
    setBusyAction(`friend-resp-${friendship.friendshipId}`);
    setBannerError(null);
    try {
      await respondToFriendRequest(friendship.friendshipId, status);
      flashSuccess(
        status === 'accepted'
          ? `You and ${friendship.requesterName} are now Arena Friends.`
          : `Declined friend request from ${friendship.requesterName}.`
      );
    } catch (err) {
      flashError(err, 'Unable to update friend request.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveFriend = async (
    friendship: FriendshipDoc,
    label: string
  ) => {
    setBusyAction(`friend-del-${friendship.friendshipId}`);
    setBannerError(null);
    try {
      await removeFriendship(friendship.friendshipId);
      flashSuccess(label);
    } catch (err) {
      flashError(err, 'Unable to remove friendship record.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateClan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    const draft = {
      name: newClanName,
      tag: newClanTag,
      motto: newClanMotto,
      emblem: newClanEmblem,
      joinPolicy: newClanPolicy,
    };
    const check = validateClanDraft(draft);
    if (!check.ok) {
      setBannerError(check.error || 'Please review your clan details.');
      return;
    }

    setBusyAction('create-clan');
    setBannerError(null);
    try {
      const created = await createClanAtomic(user, profile, draft);
      setNewClanName('');
      setNewClanTag('');
      setNewClanMotto('');
      setActiveTab('clan-hq');
      flashSuccess(`Clan [${created.tag}] ${created.name} forged!`);
    } catch (err) {
      flashError(err, 'Unable to create clan.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoinOpenClan = async (clan: ClanDoc) => {
    if (!user || !profile) return;
    setBusyAction(`join-clan-${clan.clanId}`);
    setBannerError(null);
    try {
      await joinOpenClanAtomic(clan, user, profile);
      setActiveTab('clan-hq');
      flashSuccess(`Joined [${clan.tag}] ${clan.name}!`);
    } catch (err) {
      flashError(err, 'Could not join clan.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleAcceptClanInvite = async (invite: ClanInviteDoc) => {
    if (!user || !profile) return;
    setBusyAction(`accept-inv-${invite.inviteId}`);
    setBannerError(null);
    try {
      await acceptClanInviteAtomic(invite, user, profile);
      setActiveTab('clan-hq');
      flashSuccess(`Accepted invite and joined [${invite.clanTag}] ${invite.clanName}!`);
    } catch (err) {
      flashError(err, 'Unable to accept clan invite.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleUpdateInviteStatus = async (
    invite: ClanInviteDoc,
    status: 'declined' | 'cancelled'
  ) => {
    setBusyAction(`inv-status-${invite.inviteId}`);
    setBannerError(null);
    try {
      await updateClanInviteStatus(invite.inviteId, status);
      flashSuccess(
        status === 'declined'
          ? `Declined invite from [${invite.clanTag}] ${invite.clanName}.`
          : `Cancelled invite to ${invite.inviteeName}.`
      );
    } catch (err) {
      flashError(err, 'Unable to update invite status.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleInvitePlayerToClan = async (target: PlayerProfileDoc) => {
    if (!user || !myClan || !myClanRole || !canSendClanInvite(myClanRole)) {
      return;
    }
    setBusyAction(`invite-${target.uid}`);
    setBannerError(null);
    try {
      await sendClanInvite(myClan, user.uid, currentDisplayName, target);
      flashSuccess(`Clan invitation sent to ${target.displayName}.`);
    } catch (err) {
      flashError(err, 'Could not send clan invitation.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveClanSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myClan) return;
    setBusyAction('save-clan-settings');
    setBannerError(null);
    try {
      await updateClanSettings(
        myClan.clanId,
        {
          name: editClanName,
          motto: editClanMotto,
          emblem: editClanEmblem,
          joinPolicy: editClanPolicy,
        },
        myClan.tag
      );
      setEditingClan(false);
      flashSuccess('Clan settings updated.');
    } catch (err) {
      flashError(err, 'Unable to save clan settings.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleMemberRole = async (member: ClanMemberDoc) => {
    if (!myClan || !myClanRole || !canManageClanRole(myClanRole, member.role)) {
      return;
    }
    const nextRole = member.role === 'officer' ? 'member' : 'officer';
    setBusyAction(`role-${member.uid}`);
    setBannerError(null);
    try {
      await updateClanMemberRoleAtomic(myClan.clanId, member.uid, nextRole);
      flashSuccess(
        `${member.displayName} is now a clan ${
          nextRole === 'officer' ? 'Officer' : 'Member'
        }.`
      );
    } catch (err) {
      flashError(err, 'Unable to update member role.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleKickMember = async (member: ClanMemberDoc) => {
    if (!myClan || !myClanRole || !canManageClanRole(myClanRole, member.role)) {
      return;
    }
    setBusyAction(`kick-${member.uid}`);
    setBannerError(null);
    try {
      await kickClanMemberAtomic(myClan, member);
      flashSuccess(`Removed ${member.displayName} from the clan roster.`);
    } catch (err) {
      flashError(err, 'Unable to remove clan member.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTransferLeadership = async (successor: ClanMemberDoc) => {
    if (!user || !myClan || myClan.leaderUid !== user.uid) return;
    setBusyAction(`transfer-${successor.uid}`);
    setBannerError(null);
    try {
      await transferClanLeadershipAtomic(myClan, user.uid, successor);
      setConfirmTransferUid(null);
      flashSuccess(
        `Transferred clan leadership to ${successor.displayName}. You are now an Officer.`
      );
    } catch (err) {
      flashError(err, 'Unable to transfer leadership.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleLeaveClan = async () => {
    if (!user || !myClan) return;
    const myMemberDoc = myClanMembers.find((m) => m.uid === user.uid);
    const myRating = myMemberDoc?.rating ?? profile?.rating ?? 1000;
    setBusyAction('leave-clan');
    setBannerError(null);
    try {
      await leaveClanAtomic(myClan, user.uid, myRating);
      flashSuccess(`You have left [${myClan.tag}] ${myClan.name}.`);
    } catch (err) {
      flashError(err, 'Unable to leave clan.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisbandClan = async () => {
    if (!user || !myClan) return;
    setBusyAction('disband-clan');
    setBannerError(null);
    try {
      await disbandSoloClanAtomic(myClan.clanId, user.uid);
      setConfirmDisband(false);
      flashSuccess(`Clan [${myClan.tag}] ${myClan.name} has been disbanded.`);
    } catch (err) {
      flashError(err, 'Unable to disband clan.');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePostActivity = async (payload: {
    kind: ClanMessageKind;
    body: string;
    roomCode?: string;
    badgeLabel?: string;
    highlightMeta?: string;
  }): Promise<boolean> => {
    if (!user || !myClan || !myClanRole) return false;
    setBusyAction('post-msg');
    setBannerError(null);
    try {
      await postClanMessage(
        myClan.clanId,
        user.uid,
        currentDisplayName,
        myClanRole,
        payload.kind,
        payload.body,
        payload.roomCode ?? '',
        payload.badgeLabel ?? '',
        payload.highlightMeta ?? ''
      );
      if (payload.kind === 'battle_result') {
        flashSuccess('Battle report shared to your Clan Activity Feed.');
      } else if (payload.kind === 'achievement') {
        flashSuccess('Achievement showcased in your Clan Activity Feed.');
      }
      return true;
    } catch (err) {
      flashError(err, 'Unable to post to the Clan Activity Feed.');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!myClan) return;
    setBusyAction(`del-msg-${messageId}`);
    try {
      await deleteClanMessage(myClan.clanId, messageId);
    } catch (err) {
      flashError(err, 'Unable to delete message.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveProfileIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    const nextName = (profileNameDraft ?? profile.displayName).trim();
    const nextTitle = (profileTitleDraft ?? profile.title).trim();
    setBusyAction('save-profile');
    setBannerError(null);
    try {
      await updatePlayerProfileIdentity(user.uid, nextName, nextTitle);
      setProfileNameDraft(null);
      setProfileTitleDraft(null);
      flashSuccess('Your Arena identity has been updated.');
    } catch (err) {
      flashError(err, 'Unable to update profile identity.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex flex-col">
      {/* Compact Single-Row Desktop Game Shell Toolbar */}
      <header className="sticky top-0 z-20 bg-[#0D101A]/95 border-b border-white/10 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToTitle}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#C4C9D8] hover:text-[#F5EFE0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>Title</span>
            </button>
            <div className="h-4 w-px bg-white/15 shrink-0" aria-hidden="true" />
            <h1 className="font-display text-base sm:text-lg font-bold text-[#F5DC8B] tracking-wide whitespace-nowrap">
              {activeTab === 'leaderboard'
                ? 'Arena Leaderboard'
                : 'Social & Clans'}
            </h1>
          </div>

          <div className="flex flex-wrap lg:flex-nowrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenMultiplayer()}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-sky-200 bg-sky-500/15 border border-sky-400/35 rounded-md hover:bg-sky-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Swords className="w-3.5 h-3.5 shrink-0" />
              <span>Multiplayer PvP</span>
            </button>

            <button
              type="button"
              onClick={onOpenMarketplace}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-[#F5DC8B] bg-[#D4AF37]/10 border border-[#D4AF37]/35 rounded-md hover:bg-[#D4AF37]/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Store className="w-3.5 h-3.5 shrink-0" />
              <span>Marketplace</span>
            </button>

            <button
              type="button"
              onClick={onOpenTradingHub}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-[#C4C9D8] hover:text-white border border-white/15 rounded-md hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
              <span>Trading Hub</span>
            </button>

            <AccountBar syncingCloud={syncingCloud} />
          </div>
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">
        {/* Alerts */}
        {(authError || bannerError) && (
          <div
            role="alert"
            className="rounded-md bg-rose-950/60 border border-rose-500/45 px-4 py-3 text-xs sm:text-sm text-rose-200 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{bannerError || authError}</span>
            </div>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setBannerError(null)}
              className="p-1 text-rose-200/70 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {bannerSuccess && (
          <div
            role="status"
            className="rounded-md bg-emerald-950/50 border border-emerald-400/40 px-4 py-3 text-xs sm:text-sm text-emerald-200 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              <Check className="w-4 h-4 shrink-0 text-emerald-300" />
              <span>{bannerSuccess}</span>
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setBannerSuccess(null)}
              className="p-1 text-emerald-200/70 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Auth Gate */}
        {!authReady ? (
          <div className="rounded-lg bg-[#111521] border border-white/10 p-12 flex flex-col items-center justify-center gap-3 text-sm text-[#9CA3B8]">
            <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
            <span>Connecting to Oracle Arena Social &amp; Clan servers...</span>
          </div>
        ) : !user ? (
          <section className="max-w-4xl mx-auto rounded-lg bg-[#111521] border border-[#D4AF37]/35 p-6 sm:p-10 space-y-6 shadow-2xl">
            <div className="space-y-2">
              <p className="text-xs font-mono uppercase tracking-[0.18em] text-[#D4AF37]">
                {initialTab === 'leaderboard'
                  ? 'Competitive Ladder · ELO Rating & Total Match Wins'
                  : 'Phase 6 · Leaderboard, Social & Global Clan Rankings'}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F5EFE0]">
                {initialTab === 'leaderboard'
                  ? 'Climb the Oracle Arena Player Leaderboard'
                  : 'Forge Alliances, Lead a Clan & Climb Global Rankings'}
              </h2>
              <p className="text-sm text-[#C4C9D8] leading-relaxed max-w-2xl">
                Sign in with Google to view the live Player Leaderboard ranked
                by ELO rating and total match wins, inspect Global Clan Rankings,
                share battle results and achievements in your Clan Activity
                Feed, and manage Arena Friends.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
              <div className="rounded-md bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <Trophy className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="text-sm font-semibold text-[#F5EFE0]">
                  Player Leaderboard
                </h3>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  Rank tacticians by ELO rating, total match wins, win rate, and
                  competitive tiers from Challenger to Oracle Sovereign.
                </p>
              </div>
              <div className="rounded-md bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <Crown className="w-4 h-4 text-violet-300" />
                <h3 className="text-sm font-semibold text-[#F5EFE0]">
                  Clan HQ &amp; RBAC
                </h3>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  Create a clan with custom tag and emblem, promote Officers,
                  issue invites, and manage a 30-player roster.
                </p>
              </div>
              <div className="rounded-md bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <MessageSquare className="w-4 h-4 text-sky-300" />
                <h3 className="text-sm font-semibold text-[#F5EFE0]">
                  Clan Chat &amp; Activity Feed
                </h3>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  Share 5v5 battle results, showcase earned achievements,
                  broadcast announcements, and post 1-click PvP spar codes.
                </p>
              </div>
              <div className="rounded-md bg-[#0B0E17] border border-white/10 p-4 space-y-1.5">
                <Users className="w-4 h-4 text-emerald-300" />
                <h3 className="text-sm font-semibold text-[#F5EFE0]">
                  Friends &amp; Dossiers
                </h3>
                <p className="text-xs text-[#9CA3B8] leading-relaxed">
                  Add Arena rivals as friends, inspect any player&apos;s 5-card
                  squad and custom creations, and customize your title.
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
                <span>Play Solo AI Battle</span>
              </button>
            </div>
          </section>
        ) : (
          /* Signed-in Social & Clan Workspace */
          <div className="space-y-6">
            {/* Primary Navigation Tabs + Pending Counters */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <nav
                role="tablist"
                aria-label="Social & Clan sections"
                className="flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'leaderboard'}
                  onClick={() => setActiveTab('leaderboard')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    activeTab === 'leaderboard'
                      ? 'bg-[#D4AF37] text-[#090B10]'
                      : 'bg-[#111521] text-[#C4C9D8] border border-white/10 hover:text-white'
                  }`}
                >
                  <Trophy className="w-4 h-4" />
                  <span>Leaderboard</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'rankings'}
                  onClick={() => setActiveTab('rankings')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    activeTab === 'rankings'
                      ? 'bg-[#D4AF37] text-[#090B10]'
                      : 'bg-[#111521] text-[#C4C9D8] border border-white/10 hover:text-white'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  <span>Global Clan Rankings</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'activity'}
                  onClick={() => setActiveTab('activity')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    activeTab === 'activity'
                      ? 'bg-[#D4AF37] text-[#090B10]'
                      : 'bg-[#111521] text-[#C4C9D8] border border-white/10 hover:text-white'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  <span>Clan Activity Feed</span>
                  {clanMembership && myClanMessages.length > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                        activeTab === 'activity'
                          ? 'bg-[#090B10]/20 text-[#090B10]'
                          : 'bg-white/10 text-[#F5DC8B]'
                      }`}
                    >
                      {myClanMessages.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'clan-hq'}
                  onClick={() => setActiveTab('clan-hq')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    activeTab === 'clan-hq'
                      ? 'bg-[#D4AF37] text-[#090B10]'
                      : 'bg-[#111521] text-[#C4C9D8] border border-white/10 hover:text-white'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>
                    {clanMembership ? `Clan HQ [${clanMembership.clanTag}]` : 'My Clan'}
                  </span>
                  {pendingIncomingClanInvites.length > 0 && !clanMembership && (
                    <span className="px-1.5 py-0.5 rounded bg-violet-500 text-white font-mono text-[10px]">
                      {pendingIncomingClanInvites.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'friends'}
                  onClick={() => setActiveTab('friends')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    activeTab === 'friends'
                      ? 'bg-[#D4AF37] text-[#090B10]'
                      : 'bg-[#111521] text-[#C4C9D8] border border-white/10 hover:text-white'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Friends &amp; Community</span>
                  {friendSummary.incomingRequests.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-[#090B10] font-mono text-[10px] font-bold">
                      {friendSummary.incomingRequests.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'profile'}
                  onClick={() => setActiveTab('profile')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    activeTab === 'profile'
                      ? 'bg-[#D4AF37] text-[#090B10]'
                      : 'bg-[#111521] text-[#C4C9D8] border border-white/10 hover:text-white'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>My Profile</span>
                </button>
              </nav>

              {!clanMembership && (
                <button
                  type="button"
                  onClick={() => setActiveTab('clan-hq')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-violet-500/20 border border-violet-400/45 text-violet-100 text-xs font-semibold hover:bg-violet-500/30 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Forge New Clan</span>
                </button>
              )}
            </div>

            {/* =============================================================== */}
            {/* TAB 0: GLOBAL PLAYER LEADERBOARD (ELO & TOTAL WINS)             */}
            {/* =============================================================== */}
            {activeTab === 'leaderboard' && (
              <PlayerLeaderboard
                players={visiblePlayers}
                membershipsByUid={visibleMemberships}
                tradableCatalog={tradableCatalog}
                currentUserUid={user.uid}
                onInspectPlayerUid={(uid) => setInspectedPlayerUid(uid)}
                onOpenMultiplayer={() => onOpenMultiplayer()}
              />
            )}

            {/* =============================================================== */}
            {/* TAB 1: GLOBAL CLAN RANKINGS                                     */}
            {/* =============================================================== */}
            {activeTab === 'rankings' && (
              <GlobalClanRankings
                clans={visibleClans}
                players={visiblePlayers}
                membershipsByUid={visibleMemberships}
                tradableCatalog={tradableCatalog}
                currentUserClanId={clanMembership?.clanId ?? null}
                busyAction={busyAction}
                onJoinOpenClan={(clan) => void handleJoinOpenClan(clan)}
                onInspectPlayerUid={(uid) => setInspectedPlayerUid(uid)}
              />
            )}

            {/* =============================================================== */}
            {/* TAB 2: CLAN CHAT & ACTIVITY FEED                                */}
            {/* =============================================================== */}
            {activeTab === 'activity' && (
              <>
                {!clanMembership ? (
                  <section className="rounded-lg bg-[#111521] border border-[#D4AF37]/30 p-8 text-center space-y-4 max-w-2xl mx-auto">
                    <Activity className="w-8 h-8 text-[#D4AF37] mx-auto" />
                    <div className="space-y-1.5">
                      <h2 className="font-display text-xl font-bold text-[#F5EFE0]">
                        Join or Forge a Clan to Unlock Clan Chat &amp; Activity Feed
                      </h2>
                      <p className="text-xs sm:text-sm text-[#9CA3B8] leading-relaxed">
                        Once you belong to a clan, this live feed streams every
                        5v5 battle report, earned Arena achievement, leadership
                        announcement, and PvP spar callout shared by your
                        clanmates.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveTab('rankings')}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#D4AF37] text-[#090B10] text-xs sm:text-sm font-semibold hover:bg-[#E5C454] cursor-pointer"
                      >
                        <Globe className="w-4 h-4" />
                        <span>Browse Open Clans</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('clan-hq')}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-violet-500/20 border border-violet-400/45 text-violet-100 text-xs sm:text-sm font-semibold hover:bg-violet-500/30 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Forge New Clan</span>
                      </button>
                    </div>
                  </section>
                ) : !myClan || !myClanRole ? (
                  <div className="rounded-lg bg-[#111521] border border-white/10 p-10 flex items-center justify-center gap-3 text-sm text-[#9CA3B8]">
                    <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
                    <span>Synchronizing Clan Activity Feed...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_0.9fr] gap-6">
                    <ClanActivityFeed
                      clan={myClan}
                      messages={myClanMessages}
                      currentUid={user.uid}
                      currentRole={myClanRole}
                      profile={profile}
                      clanMembership={clanMembership}
                      characters={characters}
                      recentMatches={recentMatches}
                      busyAction={busyAction}
                      onPostActivity={handlePostActivity}
                      onDeleteMessage={handleDeleteMessage}
                      onOpenMultiplayer={onOpenMultiplayer}
                      onStartSoloBattle={onStartSoloBattle}
                      onInspectPlayerUid={(uid) => setInspectedPlayerUid(uid)}
                      onValidationError={(msg) => setBannerError(msg)}
                    />

                    {/* Clan Pulse Sidebar */}
                    <aside className="rounded-lg bg-[#111521] border border-white/10 p-5 space-y-4 h-fit">
                      <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-[#D4AF37]" />
                          <h3 className="font-display text-sm font-bold text-[#F5EFE0]">
                            [{myClan.tag}] Clan Pulse
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('clan-hq')}
                          className="text-[11px] text-[#F5DC8B] hover:underline cursor-pointer"
                        >
                          Open HQ
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 font-mono">
                        <div className="rounded bg-[#0B0E17] border border-white/10 p-2.5">
                          <p className="text-[10px] uppercase text-[#7C849B]">
                            Win Rate
                          </p>
                          <p className="text-sm font-bold text-emerald-300">
                            {myClanRankingEntry &&
                            myClanRankingEntry.totalMatches > 0
                              ? `${myClanRankingEntry.winRatePct.toFixed(1)}%`
                              : '—'}
                          </p>
                        </div>
                        <div className="rounded bg-[#0B0E17] border border-white/10 p-2.5">
                          <p className="text-[10px] uppercase text-[#7C849B]">
                            Active XP
                          </p>
                          <p className="text-sm font-bold text-violet-300">
                            {(
                              myClanRankingEntry?.activeXpTotal ?? 0
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] font-mono uppercase text-[#8F96AB]">
                          Active Roster ({myClanMembers.length})
                        </p>
                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                          {myClanMembers.map((member) => {
                            const liveProfile = playersByUid[member.uid];
                            return (
                              <button
                                key={member.uid}
                                type="button"
                                onClick={() => setInspectedPlayerUid(member.uid)}
                                className="w-full text-left rounded bg-[#0B0E17] border border-white/10 hover:border-[#D4AF37]/40 px-3 py-2 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-[#F5EFE0] truncate">
                                    {liveProfile?.displayName || member.displayName}
                                  </p>
                                  <p className="text-[10px] font-mono text-[#8F96AB]">
                                    {liveProfile?.rating ?? member.rating} ELO ·{' '}
                                    {liveProfile?.wins ?? 0}W-
                                    {liveProfile?.losses ?? 0}L
                                  </p>
                                </div>
                                <span className="text-[10px] font-mono uppercase text-[#D4AF37] shrink-0">
                                  {member.role}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </aside>
                  </div>
                )}
              </>
            )}

            {/* =============================================================== */}
            {/* TAB 3: CLAN HQ (OR CREATE CLAN + INCOMING INVITES)              */}
            {/* =============================================================== */}
            {activeTab === 'clan-hq' && (
              <>
                {!clanMembership ? (
                  <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
                    {/* Forge New Clan Form */}
                    <section className="rounded-lg bg-[#111521] border border-[#D4AF37]/30 p-6 space-y-5">
                      <div className="space-y-1">
                        <p className="text-xs font-mono uppercase tracking-[0.16em] text-[#D4AF37]">
                          Establish Your Guild
                        </p>
                        <h2 className="font-display text-xl font-bold text-[#F5EFE0]">
                          Forge a New Oracle Arena Clan
                        </h2>
                        <p className="text-xs text-[#9CA3B8]">
                          Found a clan to recruit up to {MAX_CLAN_MEMBERS}{' '}
                          tacticians, coordinate Warroom sparring, and compete
                          on Global Clan Rankings.
                        </p>
                      </div>

                      <form
                        onSubmit={(e) => void handleCreateClan(e)}
                        className="space-y-4"
                      >
                        <div className="grid sm:grid-cols-[1fr_140px] gap-3">
                          <label className="block space-y-1.5">
                            <span className="text-xs font-medium text-[#C4C9D8]">
                              Clan Name (3–32 chars)
                            </span>
                            <input
                              type="text"
                              value={newClanName}
                              onChange={(e) => setNewClanName(e.target.value)}
                              maxLength={32}
                              placeholder="Obsidian Vanguard"
                              required
                              className="w-full rounded-md bg-[#090B10] border border-white/15 px-3.5 py-2 text-sm text-[#F5EFE0] placeholder:text-[#666E85] focus:outline-none focus:border-[#D4AF37]"
                            />
                          </label>

                          <label className="block space-y-1.5">
                            <span className="text-xs font-medium text-[#C4C9D8]">
                              Tag (2–5 chars)
                            </span>
                            <input
                              type="text"
                              value={newClanTag}
                              onChange={(e) =>
                                setNewClanTag(normalizeClanTag(e.target.value))
                              }
                              maxLength={5}
                              placeholder="OBSV"
                              required
                              className="w-full rounded-md bg-[#090B10] border border-white/15 px-3.5 py-2 font-mono text-sm uppercase tracking-wider text-[#F5DC8B] placeholder:text-[#666E85] focus:outline-none focus:border-[#D4AF37]"
                            />
                          </label>
                        </div>

                        <label className="block space-y-1.5">
                          <span className="text-xs font-medium text-[#C4C9D8]">
                            Clan Motto (4–140 chars)
                          </span>
                          <input
                            type="text"
                            value={newClanMotto}
                            onChange={(e) => setNewClanMotto(e.target.value)}
                            maxLength={140}
                            placeholder="Precision outlasts brute strength in every round."
                            required
                            className="w-full rounded-md bg-[#090B10] border border-white/15 px-3.5 py-2 text-sm text-[#F5EFE0] placeholder:text-[#666E85] focus:outline-none focus:border-[#D4AF37]"
                          />
                        </label>

                        <div className="space-y-1.5">
                          <span className="text-xs font-medium text-[#C4C9D8]">
                            Elemental Crest Emblem
                          </span>
                          <div className="grid grid-cols-4 gap-2">
                            {CLAN_EMBLEMS.map((el) => {
                              const st = ELEMENT_STYLES[el];
                              const selected = newClanEmblem === el;
                              return (
                                <button
                                  key={el}
                                  type="button"
                                  onClick={() => setNewClanEmblem(el)}
                                  className={`px-2.5 py-2 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                                    selected
                                      ? `${st.border} ${st.subtleBg} ${st.text} font-semibold`
                                      : 'bg-[#090B10] border-white/10 text-[#9CA3B8] hover:text-white'
                                  }`}
                                >
                                  {el}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-xs font-medium text-[#C4C9D8]">
                            Recruitment Policy
                          </span>
                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() => setNewClanPolicy('open')}
                              className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                                newClanPolicy === 'open'
                                  ? 'bg-[#D4AF37]/15 border-[#D4AF37]/60 text-[#F5EFE0]'
                                  : 'bg-[#090B10] border-white/10 text-[#9CA3B8]'
                              }`}
                            >
                              <p className="text-xs font-semibold">Open Clan</p>
                              <p className="text-[11px] text-[#8F96AB] mt-0.5">
                                Any unaffiliated player can join immediately.
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewClanPolicy('invite_only')}
                              className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                                newClanPolicy === 'invite_only'
                                  ? 'bg-violet-500/15 border-violet-400/60 text-[#F5EFE0]'
                                  : 'bg-[#090B10] border-white/10 text-[#9CA3B8]'
                              }`}
                            >
                              <p className="text-xs font-semibold">
                                Invite Only
                              </p>
                              <p className="text-[11px] text-[#8F96AB] mt-0.5">
                                Only Leaders &amp; Officers can invite new
                                members.
                              </p>
                            </button>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={busyAction === 'create-clan'}
                          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-[#D4AF37] text-[#090B10] font-semibold text-sm hover:bg-[#E5C454] transition-colors cursor-pointer disabled:opacity-60"
                        >
                          {busyAction === 'create-clan' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Shield className="w-4 h-4" />
                          )}
                          <span>Forge Clan &amp; Claim Leadership</span>
                        </button>
                      </form>
                    </section>

                    {/* Pending Clan Invites + Join Open Clan CTA */}
                    <div className="space-y-6">
                      <section className="rounded-lg bg-[#111521] border border-white/10 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="font-display text-lg font-bold text-[#F5EFE0]">
                            Pending Clan Invites
                          </h2>
                          <span className="text-xs font-mono text-[#8F96AB]">
                            {pendingIncomingClanInvites.length} Pending
                          </span>
                        </div>

                        {pendingIncomingClanInvites.length === 0 ? (
                          <p className="text-xs text-[#9CA3B8] py-4 leading-relaxed">
                            No clan invitations waiting right now. Browse{' '}
                            <button
                              type="button"
                              onClick={() => setActiveTab('rankings')}
                              className="text-[#F5DC8B] hover:underline cursor-pointer"
                            >
                              Global Clan Rankings
                            </button>{' '}
                            to join an Open clan immediately, or forge your own
                            guild on the left.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {pendingIncomingClanInvites.map((inv) => (
                              <div
                                key={inv.inviteId}
                                className="rounded-md bg-[#0B0E17] border border-violet-400/35 p-4 space-y-3"
                              >
                                <div>
                                  <p className="text-sm font-semibold text-[#F5EFE0]">
                                    <span className="font-mono text-[#F5DC8B] mr-1.5">
                                      [{inv.clanTag}]
                                    </span>
                                    {inv.clanName}
                                  </p>
                                  <p className="text-xs text-[#9CA3B8] mt-0.5">
                                    Invited by {inv.inviterName}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={
                                      busyAction === `accept-inv-${inv.inviteId}`
                                    }
                                    onClick={() =>
                                      void handleAcceptClanInvite(inv)
                                    }
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-emerald-500 text-[#090B10] text-xs font-semibold hover:bg-emerald-400 cursor-pointer disabled:opacity-60"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Accept &amp; Join</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      busyAction === `inv-status-${inv.inviteId}`
                                    }
                                    onClick={() =>
                                      void handleUpdateInviteStatus(
                                        inv,
                                        'declined'
                                      )
                                    }
                                    className="px-3 py-2 rounded-md border border-white/15 text-xs text-[#C4C9D8] hover:text-white hover:bg-white/5 cursor-pointer"
                                  >
                                    Decline
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  </div>
                ) : !myClan ? (
                  <div className="rounded-lg bg-[#111521] border border-white/10 p-10 flex items-center justify-center gap-3 text-sm text-[#9CA3B8]">
                    <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
                    <span>Loading Clan Headquarters...</span>
                  </div>
                ) : (
                  /* ACTIVE CLAN HEADQUARTERS */
                  <div className="space-y-6">
                    {/* Clan Hero Banner */}
                    {(() => {
                      const elem =
                        ELEMENT_STYLES[myClan.emblem] ?? ELEMENT_STYLES.Solar;
                      const isLeader = myClan.leaderUid === user.uid;
                      const canInvite =
                        myClanRole !== null && canSendClanInvite(myClanRole);
                      const avgElo = computeClanAverageRating(
                        myClan.totalRating,
                        myClan.memberCount
                      );

                      return (
                        <section
                          className={`rounded-lg bg-[#111521] border ${elem.border} p-5 sm:p-6 space-y-4`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span
                                  className={`font-mono text-sm font-bold px-2 py-0.5 rounded border ${elem.border} ${elem.subtleBg} ${elem.text}`}
                                >
                                  [{myClan.tag}]
                                </span>
                                <h2 className="font-display text-2xl font-bold text-[#F5EFE0]">
                                  {myClan.name}
                                </h2>
                                <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[#C4C9D8]">
                                  {myClan.joinPolicy === 'open'
                                    ? 'Open Recruitment'
                                    : 'Invite Only'}
                                </span>
                                {myClanRankingEntry && (
                                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#F5DC8B]">
                                    Global Rank #{myClanRankingEntry.rank}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-[#C4C9D8]">
                                &ldquo;{myClan.motto}&rdquo;
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {canInvite && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowRecruitDrawer((prev) => !prev)
                                  }
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-violet-500/20 border border-violet-400/45 text-violet-100 text-xs font-semibold hover:bg-violet-500/30 cursor-pointer"
                                >
                                  <MailPlus className="w-3.5 h-3.5" />
                                  <span>Recruit Players</span>
                                </button>
                              )}

                              {isLeader && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!editingClan) {
                                      setEditClanName(myClan.name);
                                      setEditClanMotto(myClan.motto);
                                      setEditClanEmblem(myClan.emblem);
                                      setEditClanPolicy(myClan.joinPolicy);
                                    }
                                    setEditingClan((prev) => !prev);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#192033] border border-white/15 text-xs font-medium text-[#ECEEF4] hover:border-[#D4AF37]/50 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>
                                    {editingClan ? 'Close Editor' : 'Edit Clan'}
                                  </span>
                                </button>
                              )}

                              {!isLeader && (
                                <button
                                  type="button"
                                  disabled={busyAction === 'leave-clan'}
                                  onClick={() => void handleLeaveClan()}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-rose-500/40 text-rose-300 text-xs font-medium hover:bg-rose-950/40 cursor-pointer disabled:opacity-60"
                                >
                                  <LogOut className="w-3.5 h-3.5" />
                                  <span>Leave Clan</span>
                                </button>
                              )}

                              {isLeader && myClan.memberCount === 1 && (
                                <>
                                  {!confirmDisband ? (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDisband(true)}
                                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-rose-500/40 text-rose-300 text-xs font-medium hover:bg-rose-950/40 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Disband Clan</span>
                                    </button>
                                  ) : (
                                    <div className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={busyAction === 'disband-clan'}
                                        onClick={() => void handleDisbandClan()}
                                        className="px-3 py-2 rounded-md bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 cursor-pointer"
                                      >
                                        Confirm Disband
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDisband(false)}
                                        className="px-2.5 py-2 rounded-md border border-white/15 text-xs text-[#C4C9D8] cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {/* Live Clan Metrics Strip */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums pt-1">
                            <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3">
                              <p className="text-[10px] uppercase text-[#7C849B]">
                                Roster
                              </p>
                              <p className="text-base font-bold text-[#F5EFE0]">
                                {myClan.memberCount} / {MAX_CLAN_MEMBERS}
                              </p>
                            </div>
                            <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3">
                              <p className="text-[10px] uppercase text-[#7C849B]">
                                Average ELO
                              </p>
                              <p className="text-base font-bold text-[#F5DC8B]">
                                {avgElo} ELO
                              </p>
                            </div>
                            <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3">
                              <p className="text-[10px] uppercase text-[#7C849B]">
                                Clan Win Rate
                              </p>
                              <p className="text-base font-bold text-emerald-300">
                                {myClanRankingEntry &&
                                myClanRankingEntry.totalMatches > 0
                                  ? `${myClanRankingEntry.winRatePct.toFixed(1)}%`
                                  : '—'}
                              </p>
                            </div>
                            <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3">
                              <p className="text-[10px] uppercase text-[#7C849B]">
                                Clan Active XP
                              </p>
                              <p className="text-base font-bold text-violet-300">
                                {(
                                  myClanRankingEntry?.activeXpTotal ?? 0
                                ).toLocaleString()}{' '}
                                XP
                              </p>
                            </div>
                          </div>

                          {/* Leader Inline Settings Editor */}
                          {isLeader && editingClan && (
                            <form
                              onSubmit={(e) => void handleSaveClanSettings(e)}
                              className="rounded-md bg-[#0B0E17] border border-[#D4AF37]/35 p-4 space-y-3"
                            >
                              <h3 className="font-display text-sm font-bold text-[#F5DC8B]">
                                Edit Clan Identity &amp; Recruitment
                              </h3>
                              <div className="grid sm:grid-cols-2 gap-3">
                                <label className="block space-y-1">
                                  <span className="text-[11px] text-[#9CA3B8]">
                                    Clan Name
                                  </span>
                                  <input
                                    type="text"
                                    value={editClanName}
                                    onChange={(e) =>
                                      setEditClanName(e.target.value)
                                    }
                                    maxLength={32}
                                    required
                                    className="w-full rounded bg-[#111521] border border-white/15 px-3 py-1.5 text-xs text-[#F5EFE0]"
                                  />
                                </label>
                                <label className="block space-y-1">
                                  <span className="text-[11px] text-[#9CA3B8]">
                                    Recruitment Policy
                                  </span>
                                  <select
                                    value={editClanPolicy}
                                    onChange={(e) =>
                                      setEditClanPolicy(
                                        e.target.value as ClanJoinPolicy
                                      )
                                    }
                                    className="w-full rounded bg-[#111521] border border-white/15 px-3 py-1.5 text-xs text-[#F5EFE0]"
                                  >
                                    <option value="open">Open Clan</option>
                                    <option value="invite_only">
                                      Invite Only
                                    </option>
                                  </select>
                                </label>
                              </div>
                              <label className="block space-y-1">
                                <span className="text-[11px] text-[#9CA3B8]">
                                  Clan Motto
                                </span>
                                <input
                                  type="text"
                                  value={editClanMotto}
                                  onChange={(e) =>
                                    setEditClanMotto(e.target.value)
                                  }
                                  maxLength={140}
                                  required
                                  className="w-full rounded bg-[#111521] border border-white/15 px-3 py-1.5 text-xs text-[#F5EFE0]"
                                />
                              </label>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {CLAN_EMBLEMS.map((el) => (
                                    <button
                                      key={el}
                                      type="button"
                                      onClick={() => setEditClanEmblem(el)}
                                      className={`px-2 py-1 rounded text-[11px] border cursor-pointer ${
                                        editClanEmblem === el
                                          ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5DC8B]'
                                          : 'border-white/10 text-[#9CA3B8]'
                                      }`}
                                    >
                                      {el}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  type="submit"
                                  disabled={busyAction === 'save-clan-settings'}
                                  className="px-4 py-1.5 rounded-md bg-[#D4AF37] text-[#090B10] text-xs font-semibold hover:bg-[#E5C454] cursor-pointer"
                                >
                                  Save Changes
                                </button>
                              </div>
                            </form>
                          )}

                          {/* Officer / Leader Recruitment Drawer */}
                          {canInvite && showRecruitDrawer && (
                            <div className="rounded-md bg-[#0B0E17] border border-violet-400/35 p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <h3 className="font-display text-sm font-bold text-violet-200">
                                  Recruit Unaffiliated Tacticians
                                </h3>
                                <button
                                  type="button"
                                  aria-label="Close recruit drawer"
                                  onClick={() => setShowRecruitDrawer(false)}
                                  className="text-[#9CA3B8] hover:text-white cursor-pointer"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              {recruitCandidates.length === 0 ? (
                                <p className="text-xs text-[#8F96AB]">
                                  All currently registered Arena players are
                                  already in a clan.
                                </p>
                              ) : (
                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                                  {recruitCandidates.map((cand) => {
                                    const alreadyInvited =
                                      pendingOutgoingClanInvites.some(
                                        (inv) => inv.inviteeUid === cand.uid
                                      );
                                    return (
                                      <div
                                        key={cand.uid}
                                        className="rounded bg-[#111521] border border-white/10 p-2.5 flex items-center justify-between gap-2"
                                      >
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold text-[#F5EFE0] truncate">
                                            {cand.displayName}
                                          </p>
                                          <p className="text-[10px] font-mono text-[#8F96AB]">
                                            {cand.rating} ELO · {cand.wins}W-
                                            {cand.losses}L
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          disabled={
                                            alreadyInvited ||
                                            busyAction === `invite-${cand.uid}`
                                          }
                                          onClick={() =>
                                            void handleInvitePlayerToClan(cand)
                                          }
                                          className="px-2.5 py-1 rounded bg-violet-500/20 border border-violet-400/45 text-[11px] font-semibold text-violet-100 hover:bg-violet-500/30 cursor-pointer disabled:opacity-50 shrink-0"
                                        >
                                          {alreadyInvited ? 'Invited' : 'Invite'}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </section>
                      );
                    })()}

                    {/* Two-Column HQ Body: Clan Chat & Activity Feed + Roster RBAC */}
                    <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-6">
                      {/* LEFT: Unified Clan Chat & Activity Feed */}
                      {myClanRole && (
                        <ClanActivityFeed
                          clan={myClan}
                          messages={myClanMessages}
                          currentUid={user.uid}
                          currentRole={myClanRole}
                          profile={profile}
                          clanMembership={clanMembership}
                          characters={characters}
                          recentMatches={recentMatches}
                          busyAction={busyAction}
                          onPostActivity={handlePostActivity}
                          onDeleteMessage={handleDeleteMessage}
                          onOpenMultiplayer={onOpenMultiplayer}
                          onStartSoloBattle={onStartSoloBattle}
                          onInspectPlayerUid={(uid) =>
                            setInspectedPlayerUid(uid)
                          }
                          onValidationError={(msg) => setBannerError(msg)}
                        />
                      )}

                      {/* RIGHT: Clan Roster & RBAC Management */}
                      <section className="rounded-lg bg-[#111521] border border-white/10 p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                          <div className="flex items-center gap-2">
                            <Crown className="w-4 h-4 text-[#D4AF37]" />
                            <h3 className="font-display text-base font-bold text-[#F5EFE0]">
                              Clan Roster &amp; Ranks
                            </h3>
                          </div>
                          <span className="text-xs font-mono text-[#8F96AB]">
                            {myClanMembers.length} Members
                          </span>
                        </div>

                        <div className="divide-y divide-white/8">
                          {myClanMembers.map((member) => {
                            const isSelf = member.uid === user.uid;
                            const canManage =
                              myClanRole !== null &&
                              canManageClanRole(myClanRole, member.role);
                            const liveProfile = playersByUid[member.uid];

                            return (
                              <div
                                key={member.uid}
                                className="py-3 flex flex-col gap-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setInspectedPlayerUid(member.uid)
                                    }
                                    className="text-left min-w-0 hover:underline cursor-pointer"
                                  >
                                    <p className="text-sm font-semibold text-[#F5EFE0] truncate">
                                      {liveProfile?.displayName ||
                                        member.displayName}
                                      {isSelf ? ' (You)' : ''}
                                    </p>
                                    <p className="text-[11px] text-[#8F96AB] truncate">
                                      {liveProfile?.title || member.title} ·{' '}
                                      <span className="font-mono text-[#F5DC8B]">
                                        {liveProfile?.rating ?? member.rating}{' '}
                                        ELO
                                      </span>
                                    </p>
                                  </button>

                                  <span
                                    className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border shrink-0 ${
                                      member.role === 'leader'
                                        ? 'bg-[#D4AF37]/20 border-[#D4AF37]/50 text-[#F5DC8B]'
                                        : member.role === 'officer'
                                          ? 'bg-violet-500/15 border-violet-400/40 text-violet-200'
                                          : 'bg-white/5 border-white/10 text-[#9CA3B8]'
                                    }`}
                                  >
                                    {member.role}
                                  </span>
                                </div>

                                {canManage && (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={
                                        busyAction === `role-${member.uid}`
                                      }
                                      onClick={() =>
                                        void handleToggleMemberRole(member)
                                      }
                                      className="px-2.5 py-1 rounded bg-[#182034] border border-white/15 text-[11px] text-[#D8DCE8] hover:border-[#D4AF37]/50 cursor-pointer"
                                    >
                                      {member.role === 'officer'
                                        ? 'Demote to Member'
                                        : 'Promote to Officer'}
                                    </button>

                                    {confirmTransferUid === member.uid ? (
                                      <>
                                        <button
                                          type="button"
                                          disabled={
                                            busyAction ===
                                            `transfer-${member.uid}`
                                          }
                                          onClick={() =>
                                            void handleTransferLeadership(
                                              member
                                            )
                                          }
                                          className="px-2.5 py-1 rounded bg-[#D4AF37] text-[#090B10] text-[11px] font-semibold cursor-pointer"
                                        >
                                          Confirm Leader Transfer
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setConfirmTransferUid(null)
                                          }
                                          className="px-2 py-1 rounded border border-white/15 text-[11px] text-[#9CA3B8] cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setConfirmTransferUid(member.uid)
                                        }
                                        className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-400/35 text-[11px] text-amber-200 hover:bg-amber-500/20 cursor-pointer"
                                      >
                                        Transfer Leader
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      disabled={
                                        busyAction === `kick-${member.uid}`
                                      }
                                      onClick={() =>
                                        void handleKickMember(member)
                                      }
                                      className="px-2.5 py-1 rounded border border-rose-500/35 text-[11px] text-rose-300 hover:bg-rose-950/40 cursor-pointer"
                                    >
                                      Kick
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {pendingOutgoingClanInvites.length > 0 && (
                          <div className="pt-3 border-t border-white/10 space-y-2">
                            <p className="text-[11px] font-mono uppercase text-[#8F96AB]">
                              Pending Sent Invites (
                              {pendingOutgoingClanInvites.length})
                            </p>
                            {pendingOutgoingClanInvites.map((inv) => (
                              <div
                                key={inv.inviteId}
                                className="flex items-center justify-between gap-2 text-xs bg-[#0B0E17] border border-white/10 rounded px-3 py-2"
                              >
                                <span className="text-[#D8DCE8] truncate">
                                  {inv.inviteeName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateInviteStatus(
                                      inv,
                                      'cancelled'
                                    )
                                  }
                                  className="text-[11px] text-rose-300 hover:underline cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* =============================================================== */}
            {/* TAB 3: FRIENDS & COMMUNITY DIRECTORY                            */}
            {/* =============================================================== */}
            {activeTab === 'friends' && (
              <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.25fr] gap-6">
                {/* LEFT: Friends & Requests */}
                <div className="space-y-6">
                  {/* Incoming Friend Requests */}
                  {friendSummary.incomingRequests.length > 0 && (
                    <section className="rounded-lg bg-[#141A29] border border-emerald-400/40 p-5 space-y-3">
                      <h2 className="font-display text-base font-bold text-emerald-200">
                        Incoming Friend Requests (
                        {friendSummary.incomingRequests.length})
                      </h2>
                      <div className="space-y-2.5">
                        {friendSummary.incomingRequests.map((req) => (
                          <div
                            key={req.friendshipId}
                            className="rounded-md bg-[#0B0E17] border border-white/10 p-3 flex flex-wrap items-center justify-between gap-2"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setInspectedPlayerUid(req.requesterUid)
                              }
                              className="text-sm font-semibold text-[#F5EFE0] hover:underline cursor-pointer"
                            >
                              {req.requesterName}
                            </button>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={
                                  busyAction ===
                                  `friend-resp-${req.friendshipId}`
                                }
                                onClick={() =>
                                  void handleRespondFriend(req, 'accepted')
                                }
                                className="px-3 py-1.5 rounded bg-emerald-500 text-[#090B10] text-xs font-semibold hover:bg-emerald-400 cursor-pointer"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                disabled={
                                  busyAction ===
                                  `friend-resp-${req.friendshipId}`
                                }
                                onClick={() =>
                                  void handleRespondFriend(req, 'declined')
                                }
                                className="px-2.5 py-1.5 rounded border border-white/15 text-xs text-[#C4C9D8] hover:text-white cursor-pointer"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Confirmed Arena Friends */}
                  <section className="rounded-lg bg-[#111521] border border-white/10 p-5 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-[#D4AF37]" />
                        <h2 className="font-display text-base font-bold text-[#F5EFE0]">
                          Arena Friends
                        </h2>
                      </div>
                      <span className="text-xs font-mono text-[#8F96AB]">
                        {friendSummary.friends.length} Connected
                      </span>
                    </div>

                    {friendSummary.friends.length === 0 ? (
                      <p className="text-xs text-[#9CA3B8] py-4 leading-relaxed">
                        No confirmed Arena Friends yet. Find fellow tacticians
                        in the Community Directory on the right to send friend
                        requests.
                      </p>
                    ) : (
                      <div className="divide-y divide-white/8">
                        {friendSummary.friends.map((fr) => {
                          const otherUid =
                            fr.requesterUid === user.uid
                              ? fr.addresseeUid
                              : fr.requesterUid;
                          const otherName =
                            playersByUid[otherUid]?.displayName ||
                            (fr.requesterUid === user.uid
                              ? fr.addresseeName
                              : fr.requesterName);
                          const otherClan = visibleMemberships[otherUid];

                          return (
                            <div
                              key={fr.friendshipId}
                              className="py-3 flex items-center justify-between gap-3"
                            >
                              <button
                                type="button"
                                onClick={() => setInspectedPlayerUid(otherUid)}
                                className="text-left min-w-0 hover:underline cursor-pointer"
                              >
                                <p className="text-sm font-semibold text-[#F5EFE0] truncate">
                                  {otherClan && (
                                    <span className="font-mono text-xs text-[#F5DC8B] mr-1.5">
                                      [{otherClan.clanTag}]
                                    </span>
                                  )}
                                  {otherName}
                                </p>
                                <p className="text-[11px] font-mono text-[#8F96AB]">
                                  {playersByUid[otherUid]?.rating ?? 1000} ELO ·{' '}
                                  {playersByUid[otherUid]?.wins ?? 0}W–
                                  {playersByUid[otherUid]?.losses ?? 0}L
                                </p>
                              </button>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInspectedPlayerUid(otherUid)
                                  }
                                  className="px-2.5 py-1.5 rounded bg-[#182034] border border-white/15 text-xs text-[#D8DCE8] hover:border-[#D4AF37]/50 cursor-pointer"
                                >
                                  Profile
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Remove ${otherName} from friends`}
                                  disabled={
                                    busyAction ===
                                    `friend-del-${fr.friendshipId}`
                                  }
                                  onClick={() =>
                                    void handleRemoveFriend(
                                      fr,
                                      `Removed ${otherName} from Arena Friends.`
                                    )
                                  }
                                  className="p-1.5 rounded border border-rose-500/35 text-rose-300 hover:bg-rose-950/40 cursor-pointer"
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Outgoing Requests */}
                  {friendSummary.outgoingRequests.length > 0 && (
                    <section className="rounded-lg bg-[#111521] border border-white/10 p-5 space-y-3">
                      <h2 className="font-display text-sm font-bold text-[#F5EFE0]">
                        Sent Requests ({friendSummary.outgoingRequests.length})
                      </h2>
                      <div className="space-y-2">
                        {friendSummary.outgoingRequests.map((req) => (
                          <div
                            key={req.friendshipId}
                            className="flex items-center justify-between gap-2 text-xs bg-[#0B0E17] border border-white/10 rounded px-3 py-2"
                          >
                            <span className="text-[#D8DCE8]">
                              {req.addresseeName}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                void handleRemoveFriend(
                                  req,
                                  `Cancelled friend request to ${req.addresseeName}.`
                                )
                              }
                              className="text-rose-300 hover:underline cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                {/* RIGHT: Arena Tacticians Community Directory */}
                <section className="rounded-lg bg-[#111521] border border-white/10 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#D4AF37]" />
                      <h2 className="font-display text-base font-bold text-[#F5EFE0]">
                        Arena Tacticians Directory
                      </h2>
                    </div>

                    <div className="relative min-w-[210px] flex-1 sm:flex-initial">
                      <Search className="w-3.5 h-3.5 text-[#7C849B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={communitySearch}
                        onChange={(e) => setCommunitySearch(e.target.value)}
                        placeholder="Search player, title, or [TAG]..."
                        aria-label="Search Arena Tacticians"
                        className="w-full rounded-md bg-[#090B10] border border-white/15 pl-8 pr-3 py-1.5 text-xs text-[#F5EFE0] placeholder:text-[#666E85] focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  </div>

                  {filteredCommunityPlayers.length === 0 ? (
                    <p className="text-xs text-[#9CA3B8] py-6 text-center">
                      No tacticians match your search query.
                    </p>
                  ) : (
                    <div className="divide-y divide-white/8 max-h-[540px] overflow-y-auto pr-1">
                      {filteredCommunityPlayers.map((p) => {
                        const isSelf = p.uid === user.uid;
                        const membership = visibleMemberships[p.uid];
                        const rel = friendSummary.relationByUid[p.uid];
                        const totalM = p.wins + p.losses;
                        const wr =
                          totalM > 0
                            ? `${Math.round((p.wins / totalM) * 100)}%`
                            : '—';

                        return (
                          <div
                            key={p.uid}
                            className="py-3 flex flex-wrap items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {membership && (
                                  <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#F5DC8B]">
                                    [{membership.clanTag}]
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setInspectedPlayerUid(p.uid)}
                                  className="text-sm font-semibold text-[#F5EFE0] hover:text-[#F5DC8B] transition-colors cursor-pointer truncate"
                                >
                                  {p.displayName}
                                  {isSelf ? ' (You)' : ''}
                                </button>
                              </div>
                              <p className="text-[11px] text-[#8F96AB] mt-0.5 font-mono tabular-nums">
                                <span className="font-sans">{p.title}</span> ·{' '}
                                <span className="text-[#F5DC8B]">
                                  {p.rating} ELO
                                </span>{' '}
                                · {wr} WR ({p.wins}W–{p.losses}L)
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setInspectedPlayerUid(p.uid)}
                                className="px-2.5 py-1.5 rounded bg-[#182034] border border-white/15 text-xs text-[#D8DCE8] hover:border-[#D4AF37]/50 cursor-pointer"
                              >
                                Inspect
                              </button>

                              {!isSelf &&
                                (!rel || rel.kind === 'declined') && (
                                  <button
                                    type="button"
                                    disabled={
                                      busyAction === `friend-add-${p.uid}`
                                    }
                                    onClick={() =>
                                      void handleSendFriendRequest(p)
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#D4AF37] text-[#090B10] text-xs font-semibold hover:bg-[#E5C454] cursor-pointer disabled:opacity-60"
                                  >
                                    <UserPlus className="w-3 h-3" />
                                    <span>Add</span>
                                  </button>
                                )}

                              {!isSelf && rel?.kind === 'friend' && (
                                <span className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-400/35 text-[11px] text-emerald-200 font-mono">
                                  Friend
                                </span>
                              )}

                              {!isSelf && rel?.kind === 'outgoing_pending' && (
                                <span className="px-2 py-1 rounded bg-amber-500/15 border border-amber-400/35 text-[11px] text-amber-200 font-mono">
                                  Pending
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* =============================================================== */}
            {/* TAB 4: MY PUBLIC ARENA PROFILE                                  */}
            {/* =============================================================== */}
            {activeTab === 'profile' && profile && (
              <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
                <section className="rounded-lg bg-[#111521] border border-[#D4AF37]/30 p-6 space-y-5">
                  <div className="space-y-1">
                    <p className="text-xs font-mono uppercase tracking-[0.16em] text-[#D4AF37]">
                      Public Arena Identity
                    </p>
                    <h2 className="font-display text-xl font-bold text-[#F5EFE0]">
                      Customize Your Tactician Profile
                    </h2>
                    <p className="text-xs text-[#9CA3B8]">
                      Your Display Name and Arena Title are visible to other
                      players in Global Clan Rankings, Leaderboards, and
                      Multiplayer PvP lobbies. Your email remains strictly
                      private.
                    </p>
                  </div>

                  <form
                    onSubmit={(e) => void handleSaveProfileIdentity(e)}
                    className="space-y-4"
                  >
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-[#C4C9D8]">
                        Display Name (2–40 chars)
                      </span>
                      <input
                        type="text"
                        value={profileNameDraft ?? profile.displayName}
                        onChange={(e) => setProfileNameDraft(e.target.value)}
                        maxLength={40}
                        required
                        className="w-full rounded-md bg-[#090B10] border border-white/15 px-3.5 py-2 text-sm text-[#F5EFE0] focus:outline-none focus:border-[#D4AF37]"
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-[#C4C9D8]">
                        Arena Title (2–48 chars)
                      </span>
                      <input
                        type="text"
                        value={profileTitleDraft ?? profile.title}
                        onChange={(e) => setProfileTitleDraft(e.target.value)}
                        maxLength={48}
                        required
                        className="w-full rounded-md bg-[#090B10] border border-white/15 px-3.5 py-2 text-sm text-[#F5EFE0] focus:outline-none focus:border-[#D4AF37]"
                      />
                    </label>

                    <div className="space-y-1.5">
                      <span className="text-[11px] font-mono uppercase text-[#8F96AB]">
                        Preset Titles
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {ARENA_TITLES.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setProfileTitleDraft(t)}
                            className={`px-2.5 py-1 rounded text-xs border transition-colors cursor-pointer ${
                              (profileTitleDraft ?? profile.title) === t
                                ? 'bg-[#D4AF37]/20 border-[#D4AF37]/60 text-[#F5DC8B]'
                                : 'bg-[#0B0E17] border-white/10 text-[#9CA3B8] hover:text-white'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={busyAction === 'save-profile'}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#D4AF37] text-[#090B10] text-sm font-semibold hover:bg-[#E5C454] cursor-pointer disabled:opacity-60"
                    >
                      {busyAction === 'save-profile' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Award className="w-4 h-4" />
                      )}
                      <span>Save Arena Identity</span>
                    </button>
                  </form>
                </section>

                {/* Public Dossier Summary */}
                <section className="rounded-lg bg-[#111521] border border-white/10 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg font-bold text-[#F5EFE0]">
                      Your Public Dossier
                    </h3>
                    <button
                      type="button"
                      onClick={() => setInspectedPlayerUid(user.uid)}
                      className="text-xs text-[#F5DC8B] hover:underline cursor-pointer"
                    >
                      Preview Modal
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 font-mono tabular-nums">
                    <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3.5">
                      <p className="text-[10px] uppercase text-[#7C849B]">
                        Arena ELO
                      </p>
                      <p className="text-xl font-bold text-[#F5DC8B]">
                        {profile.rating}
                      </p>
                    </div>
                    <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3.5">
                      <p className="text-[10px] uppercase text-[#7C849B]">
                        Record
                      </p>
                      <p className="text-xl font-bold text-emerald-300">
                        {profile.wins}W – {profile.losses}L
                      </p>
                    </div>
                    <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3.5">
                      <p className="text-[10px] uppercase text-[#7C849B]">
                        Active XP Contribution
                      </p>
                      <p className="text-xl font-bold text-violet-300">
                        {myOwnXpStats.activeXp.toLocaleString()} XP
                      </p>
                    </div>
                    <div className="rounded-md bg-[#0B0E17] border border-white/10 p-3.5">
                      <p className="text-[10px] uppercase text-[#7C849B]">
                        Oracle Shards
                      </p>
                      <p className="text-xl font-bold text-sky-300">
                        {(wallet?.shards ?? 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md bg-[#0B0E17] border border-white/10 p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-mono uppercase text-[#7C849B]">
                        Clan Affiliation
                      </p>
                      <p className="text-sm font-semibold text-[#F5EFE0] mt-0.5">
                        {clanMembership
                          ? `[${clanMembership.clanTag}] ${clanMembership.clanName}`
                          : 'Unaffiliated Tactician'}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-mono text-[#D4AF37]">
                      {clanMembership ? (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span className="uppercase">
                            {clanMembership.role}
                          </span>
                        </>
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-[#7C849B]" />
                      )}
                    </span>
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Player Profile Inspector Modal */}
      {user && inspectedPlayer && (
        <PlayerProfileModal
          player={inspectedPlayer}
          clanMembership={visibleMemberships[inspectedPlayer.uid] ?? null}
          tradableCatalog={tradableCatalog}
          isSelf={inspectedPlayer.uid === user.uid}
          friendRelation={
            friendSummary.relationByUid[inspectedPlayer.uid]?.kind ?? 'none'
          }
          canInviteToMyClan={Boolean(
            myClan && myClanRole && canSendClanInvite(myClanRole)
          )}
          alreadyInvitedToMyClan={pendingOutgoingClanInvites.some(
            (inv) => inv.inviteeUid === inspectedPlayer.uid
          )}
          busyAction={busyAction}
          onClose={() => setInspectedPlayerUid(null)}
          onSendFriendRequest={() => void handleSendFriendRequest(inspectedPlayer)}
          onAcceptFriendRequest={() => {
            const rel = friendSummary.relationByUid[inspectedPlayer.uid];
            if (rel?.doc) {
              void handleRespondFriend(rel.doc, 'accepted');
            }
          }}
          onInviteToClan={() => void handleInvitePlayerToClan(inspectedPlayer)}
        />
      )}
    </main>
  );
}
