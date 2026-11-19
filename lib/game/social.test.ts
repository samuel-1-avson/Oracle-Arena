import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFriendshipId,
  canManageClanRole,
  canPostClanAnnouncement,
  canSendClanInvite,
  ClanMemberDoc,
  computeClanAverageRating,
  FriendshipDoc,
  normalizeClanTag,
  sortClanMembersByRole,
  summarizeFriendships,
  validateClanDraft,
  validateClanMessageDraft,
} from './social';

test('buildFriendshipId produces identical sorted key regardless of argument order and rejects self-friend', () => {
  const ab = buildFriendshipId('uid-alpha', 'uid-zeta');
  const ba = buildFriendshipId('uid-zeta', 'uid-alpha');
  assert.equal(ab, ba);
  assert.equal(ab, 'fr-uid-alpha_uid-zeta');

  assert.throws(() => buildFriendshipId('uid-same', 'uid-same'), /themselves/i);
  assert.throws(() => buildFriendshipId('', 'uid-zeta'), /required/i);
});

test('normalizeClanTag strips invalid characters, uppercases, and caps at 5 chars', () => {
  assert.equal(normalizeClanTag('aex-99!'), 'AEX99');
  assert.equal(normalizeClanTag('solaris'), 'SOLAR');
  assert.equal(normalizeClanTag('  v1 '), 'V1');
});

test('validateClanDraft enforces name, tag, motto, emblem, and joinPolicy constraints', () => {
  assert.equal(
    validateClanDraft({
      name: 'Obsidian Vanguard',
      tag: 'OBSV',
      motto: 'Precision beats power in every 5v5 round.',
      emblem: 'Void',
      joinPolicy: 'open',
    }).ok,
    true
  );

  assert.equal(
    validateClanDraft({
      name: 'Ab',
      tag: 'OBSV',
      motto: 'Valid motto text',
      emblem: 'Solar',
      joinPolicy: 'open',
    }).ok,
    false
  );

  assert.equal(
    validateClanDraft({
      name: 'Valid Clan',
      tag: 'A',
      motto: 'Valid motto text',
      emblem: 'Solar',
      joinPolicy: 'invite_only',
    }).ok,
    false
  );

  assert.equal(
    validateClanDraft({
      name: 'Valid Clan',
      tag: 'SOL',
      motto: 'Hi',
      emblem: 'Solar',
      joinPolicy: 'open',
    }).ok,
    false
  );
});

test('RBAC helpers strictly isolate leader/officer privileges from regular members', () => {
  assert.equal(canManageClanRole('leader', 'officer'), true);
  assert.equal(canManageClanRole('leader', 'member'), true);
  assert.equal(canManageClanRole('leader', 'leader'), false);
  assert.equal(canManageClanRole('officer', 'member'), false);
  assert.equal(canManageClanRole('member', 'member'), false);

  assert.equal(canSendClanInvite('leader'), true);
  assert.equal(canSendClanInvite('officer'), true);
  assert.equal(canSendClanInvite('member'), false);

  assert.equal(canPostClanAnnouncement('leader'), true);
  assert.equal(canPostClanAnnouncement('officer'), true);
  assert.equal(canPostClanAnnouncement('member'), false);
});

test('validateClanMessageDraft blocks member announcements and validates spar challenge room codes', () => {
  assert.equal(
    validateClanMessageDraft('GG everyone!', 'chat', 'member').ok,
    true
  );
  assert.equal(
    validateClanMessageDraft('Tournament tonight!', 'announcement', 'member').ok,
    false
  );
  assert.equal(
    validateClanMessageDraft('Tournament tonight!', 'announcement', 'officer').ok,
    true
  );
  assert.equal(
    validateClanMessageDraft('Join my spar lobby!', 'challenge', 'member', 'K7M9Q2').ok,
    true
  );
  assert.equal(
    validateClanMessageDraft('Join my spar lobby!', 'challenge', 'member', 'BAD').ok,
    false
  );
  assert.equal(validateClanMessageDraft('   ', 'chat', 'leader').ok, false);
});

test('computeClanAverageRating and sortClanMembersByRole order roster deterministically', () => {
  assert.equal(computeClanAverageRating(3350, 3), 1117);
  assert.equal(computeClanAverageRating(1000, 0), 0);

  const roster: ClanMemberDoc[] = [
    {
      uid: 'u3',
      clanId: 'clan-1',
      displayName: 'Zara',
      title: 'Rift Strategist',
      rating: 1450,
      role: 'member',
    },
    {
      uid: 'u2',
      clanId: 'clan-1',
      displayName: 'Kael',
      title: 'Guild Marshal',
      rating: 1180,
      role: 'officer',
    },
    {
      uid: 'u1',
      clanId: 'clan-1',
      displayName: 'Lyra',
      title: 'Arena Sovereign',
      rating: 1100,
      role: 'leader',
    },
    {
      uid: 'u4',
      clanId: 'clan-1',
      displayName: 'Aegis',
      title: 'Solar Vanguard',
      rating: 1290,
      role: 'officer',
    },
  ];

  const sorted = sortClanMembersByRole(roster);
  assert.deepEqual(
    sorted.map((m) => m.uid),
    ['u1', 'u4', 'u2', 'u3']
  );
});

test('summarizeFriendships partitions friends, incoming, outgoing, and relation map cleanly', () => {
  const docs: FriendshipDoc[] = [
    {
      friendshipId: 'fr-a_me',
      requesterUid: 'a',
      requesterName: 'Aria',
      addresseeUid: 'me',
      addresseeName: 'Commander',
      status: 'accepted',
    },
    {
      friendshipId: 'fr-b_me',
      requesterUid: 'b',
      requesterName: 'Bram',
      addresseeUid: 'me',
      addresseeName: 'Commander',
      status: 'pending',
    },
    {
      friendshipId: 'fr-c_me',
      requesterUid: 'me',
      requesterName: 'Commander',
      addresseeUid: 'c',
      addresseeName: 'Cyrus',
      status: 'pending',
    },
    {
      friendshipId: 'fr-d_me',
      requesterUid: 'me',
      requesterName: 'Commander',
      addresseeUid: 'd',
      addresseeName: 'Dax',
      status: 'declined',
    },
  ];

  const summary = summarizeFriendships(docs, 'me');
  assert.equal(summary.friends.length, 1);
  assert.equal(summary.incomingRequests.length, 1);
  assert.equal(summary.outgoingRequests.length, 1);
  assert.equal(summary.relationByUid['a'].kind, 'friend');
  assert.equal(summary.relationByUid['b'].kind, 'incoming_pending');
  assert.equal(summary.relationByUid['c'].kind, 'outgoing_pending');
  assert.equal(summary.relationByUid['d'].kind, 'declined');
});

test('aggregateGlobalClanRankings aggregates member win rates and active XP totals accurately across sort modes', async () => {
  const { aggregateGlobalClanRankings } = await import('./social');

  const clans = [
    {
      clanId: 'clan-solar',
      name: 'Solar Vanguard',
      tag: 'SOL',
      motto: 'Light conquers all.',
      emblem: 'Solar' as const,
      joinPolicy: 'open' as const,
      leaderUid: 'u1',
      leaderName: 'Lyra',
      memberCount: 2,
      totalRating: 2400,
      lastEventMemberUid: 'u2',
      lastEventRefId: '',
    },
    {
      clanId: 'clan-void',
      name: 'Void Syndicate',
      tag: 'VOID',
      motto: 'Silence before the strike.',
      emblem: 'Void' as const,
      joinPolicy: 'invite_only' as const,
      leaderUid: 'u3',
      leaderName: 'Nyx',
      memberCount: 1,
      totalRating: 1350,
      lastEventMemberUid: 'u3',
      lastEventRefId: '',
    },
  ];

  const players = [
    {
      uid: 'u1',
      displayName: 'Lyra',
      avatarUrl: '',
      title: 'Solar Vanguard',
      rating: 1250,
      wins: 8,
      losses: 2,
      matchesPlayed: 10,
      customCardCount: 1,
      activeSquadIds: ['a', 'b', 'c', 'd', 'e'],
    },
    {
      uid: 'u2',
      displayName: 'Kael',
      avatarUrl: '',
      title: 'Guild Marshal',
      rating: 1150,
      wins: 4,
      losses: 6,
      matchesPlayed: 10,
      customCardCount: 1,
      activeSquadIds: ['a', 'b', 'c', 'd', 'e'],
    },
    {
      uid: 'u3',
      displayName: 'Nyx',
      avatarUrl: '',
      title: 'Void Weaver',
      rating: 1350,
      wins: 9,
      losses: 1,
      matchesPlayed: 10,
      customCardCount: 0,
      activeSquadIds: ['a', 'b', 'c', 'd', 'e'],
    },
  ];

  const membershipsByUid = {
    u1: { uid: 'u1', clanId: 'clan-solar', clanName: 'Solar Vanguard', clanTag: 'SOL', role: 'leader' as const },
    u2: { uid: 'u2', clanId: 'clan-solar', clanName: 'Solar Vanguard', clanTag: 'SOL', role: 'member' as const },
    u3: { uid: 'u3', clanId: 'clan-void', clanName: 'Void Syndicate', clanTag: 'VOID', role: 'leader' as const },
  };

  const tradableCatalog = [
    {
      cardId: 'chr-custom-1',
      ownerId: 'u1',
      ownerName: 'Lyra',
      originalCreatorId: 'u1',
      originalCreatorName: 'Lyra',
      name: 'Helios Prime',
      role: 'Striker',
      element: 'Solar',
      rarity: 'Mythic',
      level: 4,
      evolutionStage: 1,
      isCustom: true,
      activeListingId: '',
      lastTransferId: '',
      cardData: { xp: 520 } as never,
    },
    {
      cardId: 'chr-custom-2',
      ownerId: 'u2',
      ownerName: 'Kael',
      originalCreatorId: 'u2',
      originalCreatorName: 'Kael',
      name: 'Aegis Rook',
      role: 'Vanguard',
      element: 'Iron',
      rarity: 'Epic',
      level: 3,
      evolutionStage: 0,
      isCustom: true,
      activeListingId: '',
      lastTransferId: '',
      cardData: { xp: 280 } as never,
    },
  ];

  const byWinRate = aggregateGlobalClanRankings({
    clans,
    players,
    membershipsByUid,
    tradableCatalog,
    sortBy: 'winRate',
  });

  // Void: 9W/1L = 90.0%, Solar: 12W/8L = 60.0%
  assert.equal(byWinRate[0].clan.clanId, 'clan-void');
  assert.equal(byWinRate[0].winRatePct, 90);
  assert.equal(byWinRate[1].clan.clanId, 'clan-solar');
  assert.equal(byWinRate[1].winRatePct, 60);

  // Solar XP: custom cards (520 + 280 = 800) + matches (12*120 + 8*55 = 1440 + 440 = 1880) = 2680
  // Void XP: custom cards (0) + matches (9*120 + 1*55 = 1135) = 1135
  const byActiveXp = aggregateGlobalClanRankings({
    clans,
    players,
    membershipsByUid,
    tradableCatalog,
    sortBy: 'activeXp',
  });

  assert.equal(byActiveXp[0].clan.clanId, 'clan-solar');
  assert.equal(byActiveXp[0].championCardXpTotal, 800);
  assert.equal(byActiveXp[0].battleRecordXpTotal, 1880);
  assert.equal(byActiveXp[0].activeXpTotal, 2680);
  assert.equal(byActiveXp[0].topContributors[0].uid, 'u1');
  assert.equal(byActiveXp[1].clan.clanId, 'clan-void');
  assert.equal(byActiveXp[1].activeXpTotal, 1135);
});

test('Clan Activity Feed derives real achievements, formats battle shares, validates badges, and filters cleanly', async () => {
  const {
    derivePlayerAchievements,
    filterClanActivityFeed,
    formatAchievementShare,
    formatBattleResultShare,
  } = await import('./social');

  const sampleMatch = {
    matchId: 'match-1',
    playedAt: '2026-11-19T12:00:00Z',
    winner: 'player' as const,
    rounds: 4,
    turns: 14,
    playerSurvivors: 4,
    enemySurvivors: 0,
    seed: 42026,
    rulesetVersion: '1.0.0',
    playerSquadIds: ['a', 'b', 'c', 'd', 'e'],
    enemySquadIds: ['f', 'g', 'h', 'i', 'j'],
  };

  const battleShare = formatBattleResultShare(sampleMatch, 'GG team, Kaelen carried!');
  assert.equal(battleShare.kind, 'battle_result');
  assert.match(battleShare.badgeLabel, /^VICTORY/);
  assert.match(battleShare.highlightMeta, /4\/5 Allies Standing/);
  assert.equal(battleShare.body, 'GG team, Kaelen carried!');

  assert.equal(
    validateClanMessageDraft(
      battleShare.body,
      'battle_result',
      'member',
      '',
      battleShare.badgeLabel,
      battleShare.highlightMeta
    ).ok,
    true
  );
  // Missing badgeLabel must fail for battle_result/achievement
  assert.equal(
    validateClanMessageDraft('Shared a win', 'battle_result', 'member', '', '', '').ok,
    false
  );
  assert.equal(
    validateClanMessageDraft('Shared feat', 'achievement', 'member', '', '', '').ok,
    false
  );

  const achievements = derivePlayerAchievements({
    profile: {
      rating: 1120,
      wins: 6,
      losses: 2,
      matchesPlayed: 8,
      customCardCount: 1,
    },
    characters: [
      {
        id: 'chr-custom-sol',
        name: 'Solarius',
        role: 'Striker',
        level: 4,
        xp: 480,
        evolutionStage: 1,
      } as never,
    ],
    recentMatches: [sampleMatch],
    clanMembership: {
      uid: 'u1',
      clanId: 'clan-1',
      clanName: 'Solar Vanguard',
      clanTag: 'SOL',
      role: 'leader',
    },
  });

  assert.ok(achievements.some((a) => a.id === 'ach-arena-victor'));
  assert.ok(achievements.some((a) => a.id === 'ach-tactical-dominance'));
  assert.ok(achievements.some((a) => a.id === 'ach-oracle-architect'));
  assert.ok(achievements.some((a) => a.id === 'ach-champion-ascension'));
  assert.ok(achievements.some((a) => a.id === 'ach-ranked-climber'));
  assert.ok(achievements.some((a) => a.id === 'ach-clan-vanguard'));

  const achShare = formatAchievementShare(achievements[0]);
  assert.equal(achShare.kind, 'achievement');
  assert.ok(achShare.badgeLabel.length >= 2);
  assert.equal(
    validateClanMessageDraft(
      achShare.body,
      'achievement',
      'member',
      '',
      achShare.badgeLabel,
      achShare.highlightMeta
    ).ok,
    true
  );

  const feed = [
    { messageId: 'm1', clanId: 'c1', authorUid: 'u1', authorName: 'A', authorRole: 'leader' as const, kind: 'chat' as const, body: 'hi', roomCode: '' },
    { messageId: 'm2', clanId: 'c1', authorUid: 'u2', authorName: 'B', authorRole: 'member' as const, kind: 'battle_result' as const, body: 'won', roomCode: '', badgeLabel: 'VICTORY', highlightMeta: '4/5' },
    { messageId: 'm3', clanId: 'c1', authorUid: 'u3', authorName: 'C', authorRole: 'officer' as const, kind: 'achievement' as const, body: 'evolved', roomCode: '', badgeLabel: 'Evolution', highlightMeta: 'Lv.4' },
    { messageId: 'm4', clanId: 'c1', authorUid: 'u1', authorName: 'A', authorRole: 'leader' as const, kind: 'challenge' as const, body: 'spar', roomCode: 'K7M9Q2' },
  ];

  assert.equal(filterClanActivityFeed(feed, 'all').length, 4);
  assert.equal(filterClanActivityFeed(feed, 'battle_result').length, 1);
  assert.equal(filterClanActivityFeed(feed, 'achievement').length, 1);
  assert.equal(filterClanActivityFeed(feed, 'chat').length, 2);
});

test('aggregatePlayerLeaderboard ranks players by ELO and total match wins with tiers and preserved global ranks under filters', async () => {
  const { aggregatePlayerLeaderboard, getCompetitiveTier } = await import(
    './social'
  );

  assert.equal(getCompetitiveTier(1450).id, 'sovereign');
  assert.equal(getCompetitiveTier(1280).id, 'grandmaster');
  assert.equal(getCompetitiveTier(1140).id, 'vanguard');
  assert.equal(getCompetitiveTier(1040).id, 'tactician');
  assert.equal(getCompetitiveTier(980).id, 'challenger');

  const players = [
    {
      uid: 'p1',
      displayName: 'Aurelia',
      avatarUrl: '',
      title: 'Solar Vanguard',
      rating: 1420,
      wins: 12,
      losses: 3,
      matchesPlayed: 15,
      customCardCount: 2,
      activeSquadIds: ['a', 'b', 'c', 'd', 'e'],
    },
    {
      uid: 'p2',
      displayName: 'Bramwell',
      avatarUrl: '',
      title: 'Rift Strategist',
      rating: 1260,
      wins: 25,
      losses: 10,
      matchesPlayed: 35,
      customCardCount: 1,
      activeSquadIds: ['a', 'b', 'c', 'd', 'e'],
    },
    {
      uid: 'p3',
      displayName: 'Cinder',
      avatarUrl: '',
      title: 'Founding Tactician',
      rating: 1010,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      customCardCount: 0,
      activeSquadIds: ['a', 'b', 'c', 'd', 'e'],
    },
  ];

  const membershipsByUid = {
    p1: {
      uid: 'p1',
      clanId: 'c1',
      clanName: 'Solar Vanguard',
      clanTag: 'SOL',
      role: 'leader' as const,
    },
  };

  // Default sort by ELO
  const byElo = aggregatePlayerLeaderboard({
    players,
    membershipsByUid,
    tradableCatalog: [],
    sortBy: 'elo',
  });
  assert.equal(byElo[0].player.uid, 'p1');
  assert.equal(byElo[0].rank, 1);
  assert.equal(byElo[0].tier.id, 'sovereign');
  assert.equal(byElo[0].clanTag, 'SOL');
  assert.equal(byElo[1].player.uid, 'p2');
  assert.equal(byElo[1].rank, 2);
  assert.equal(byElo[2].player.uid, 'p3');
  assert.equal(byElo[2].rank, 3);

  // Sort by Total Match Wins
  const byWins = aggregatePlayerLeaderboard({
    players,
    membershipsByUid,
    tradableCatalog: [],
    sortBy: 'wins',
  });
  assert.equal(byWins[0].player.uid, 'p2');
  assert.equal(byWins[0].wins, 25);
  assert.equal(byWins[1].player.uid, 'p1');
  assert.equal(byWins[1].wins, 12);

  // Search filter preserves canonical global rank (#2 for Bramwell under ELO sort)
  const filtered = aggregatePlayerLeaderboard({
    players,
    membershipsByUid,
    tradableCatalog: [],
    sortBy: 'elo',
    search: 'bram',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].player.uid, 'p2');
  assert.equal(filtered[0].rank, 2);

  // Tier filter isolates Grandmaster tier cleanly
  const grandmasters = aggregatePlayerLeaderboard({
    players,
    membershipsByUid,
    tradableCatalog: [],
    sortBy: 'elo',
    tierFilter: 'grandmaster',
  });
  assert.equal(grandmasters.length, 1);
  assert.equal(grandmasters[0].player.uid, 'p2');
});


