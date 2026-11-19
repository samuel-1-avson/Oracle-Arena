# Oracle Arena — Firestore Security Specification (Phases 4, 5 & 6)

## 1. Data Invariants
1. **Default-Deny Safety Net**: Every path not explicitly matched is denied (`allow read, write: if false`).
2. **Zero PII Exposure**: Player email addresses live solely under `/players/{userId}/private/account` (strictly `isOwner(userId)`). Public `/players/{userId}`, `/wallets/{userId}`, `/clans/{clanId}`, and `/clanMemberships/{userId}` contain zero PII.
3. **Master Gate**: No subcollection write (`/private`, `/cards`, `/matches`, `/moves`, `/offers`, `/clans/{clanId}/members`, `/clans/{clanId}/messages`) or relational social/economy document can be created without verifying parent profile/clan existence via `exists()`.
4. **Canonical Single-Owner Card Registry (Anti-Duplication)**: Every custom Oracle card has a single canonical record at `/tradableCards/{cardId}` (`isCustom == true`). Its `originalCreatorId` and `originalCreatorName` are strictly immutable forever. Ownership (`ownerId`) can ONLY change inside an atomic batch accompanied by a matching `/ownershipLedger/{transferId}` and settled `/marketplaceListings/{listingId}` or `/trades/{tradeId}`.
5. **No Double-Listing or Listed-Card Trading**: A card in `/tradableCards/{cardId}` can only be listed if `activeListingId == ''` (and listing atomically sets `activeListingId = listingId`). A card with `activeListingId != ''` cannot be transferred via a P2P trade.
6. **Balanced Shard Economy**: Every `/wallets/{userId}` initializes at exactly `500` Oracle Shards (`totalEarned == 500`, `totalSpent == 0`). Match rewards are bounded to `[+1, +100]` Shards per write. Marketplace/Trade shard debits and credits must match the atomic `/ownershipLedger/{transferId}` `priceShards` and payer/receiver UIDs via `getAfter()`, and balances can never drop below `0`.
7. **Turn-Based Trade Negotiation & Terminal State Locking**: In `/trades/{tradeId}`, only `existing().turnUid == request.auth.uid` can counteroffer or accept. Once `/rooms`, `/marketplaceListings`, `/offers`, `/trades`, `/friendships` (for status update), or `/clanInvites` reach a terminal state, no further status mutations are permitted.
8. **Single-Clan Atomicity & Role-Based Access Control (RBAC)**:
   - A player can belong to at most ONE clan at a time via `/clanMemberships/{userId}` (document ID == `userId`).
   - Creating a clan atomically creates `/clans/{clanId}`, `/clans/{clanId}/members/{leaderUid}` (`role == 'leader'`), and `/clanMemberships/{leaderUid}` (`role == 'leader'`).
   - Joining an `open` clan or accepting a `/clanInvites/{inviteId}` atomically increments `/clans/{clanId}.memberCount`, creates `/clans/{clanId}/members/{uid}` (`role == 'member'`), and creates `/clanMemberships/{uid}`.
   - Only a clan's `leader` can edit clan settings, promote/demote officers, kick non-leader members, transfer leadership, or disband a solo clan (`memberCount == 1`).
   - Only a clan's `leader` or `officer` can post `kind == 'announcement'` warroom messages or issue `/clanInvites/{inviteId}` invitations.
   - Only verified current members (`exists(/clans/{clanId}/members/$(request.auth.uid))`) can post to `/clans/{clanId}/messages/{messageId}`.
9. **Strict Timestamps & Key Allow-Lists**: All `createdAt`/`updatedAt`/`joinedAt` timestamps must equal `request.time`. Every entity validates `hasAll` + `hasOnly`, and every update action enforces `affectedKeys().hasOnly(...)` + `isValid[Entity](incoming())`.

## 2. Adversarial "Dirty Dozen" Payloads (Must Return PERMISSION_DENIED)
1. **Shadow Field Injection**: Updating `/players/{uid}`, `/clans/{clanId}`, or `/friendships/{id}` with an undocumented ghost key (`isAdmin: true`).
2. **Unverified Email Bypass**: Attempting any write with `request.auth.token.email_verified == false`.
3. **PII Cross-Read**: Reading `/players/{otherUid}/private/account` as a non-owner.
4. **ELO / Shard Inflation Attack**: Updating `/players/{uid}` with `rating: existing.rating + 500` or `/wallets/{uid}` with `+9999` shards outside bounded rules.
5. **Self-Friend / Self-Accept Friend Request**: Creating a `/friendships/{id}` where `requesterUid == addresseeUid`, or requester accepting their own pending friend request.
6. **Self-Promotion in Clan**: A regular `'member'` updating `/clans/{clanId}/members/{uid}` or `/clanMemberships/{uid}` to set `role: 'leader'` or `role: 'officer'`.
7. **Unauthorized Invite-Only Clan Join**: Joining a clan with `joinPolicy == 'invite_only'` without a verified pending `/clanInvites/{inviteId}` document.
8. **Non-Member Warroom Post / Member Announcement Spoof**: Posting a message to `/clans/{clanId}/messages/{id}` while not a clan member, or a `'member'` posting `kind: 'announcement'`.
9. **Orphaned Roster Count Manipulation**: Incrementing/decrementing `/clans/{clanId}.memberCount` without atomically creating/deleting the corresponding `/clans/{clanId}/members/{uid}` and `/clanMemberships/{uid}` docs.
10. **Leader Abandonment Without Disband/Transfer**: A clan leader deleting their own member record while `memberCount > 1`, stranding the clan without a leader.
11. **Fake Card Theft / Creator Attribution Erasure**: Mutating `/tradableCards/{cardId}.ownerId` without an atomic ledger settlement or altering `originalCreatorId`.
12. **Terminal State Resurrection**: Mutating a `sold` listing, `accepted` trade, `finished` room, or `declined` clan invite back to an active/pending state.
