import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const RULES_PATH = path.join(process.cwd(), 'firestore.rules');
const BLUEPRINT_PATH = path.join(process.cwd(), 'firebase-blueprint.json');
const rulesText = fs.readFileSync(RULES_PATH, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(BLUEPRINT_PATH, 'utf8'));

test('firestore.rules starts with rules_version 2 and global default-deny catch-all', () => {
  assert.match(rulesText, /rules_version\s*=\s*'2';/);
  assert.match(
    rulesText,
    /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/
  );
});

test('every collection in firebase-blueprint.json has an explicit match block in firestore.rules', () => {
  const paths = Object.keys(blueprint.firestore);
  assert.ok(paths.length >= 18, `Expected >= 18 blueprint paths, found ${paths.length}`);
  const expectedMatches = [
    'match /players/{userId}',
    'match /private/{docId}',
    'match /cards/{cardId}',
    'match /matches/{matchId}',
    'match /rooms/{roomId}',
    'match /moves/{moveId}',
    'match /wallets/{userId}',
    'match /tradableCards/{cardId}',
    'match /marketplaceListings/{listingId}',
    'match /offers/{offerId}',
    'match /trades/{tradeId}',
    'match /ownershipLedger/{transferId}',
    'match /friendships/{friendshipId}',
    'match /clans/{clanId}',
    'match /members/{memberUid}',
    'match /messages/{messageId}',
    'match /clanMemberships/{userId}',
    'match /clanInvites/{inviteId}',
  ];
  for (const m of expectedMatches) {
    assert.ok(rulesText.includes(m), `Missing security rule block: ${m}`);
  }
});

test('Phase 4, 5 & 6 Dirty Dozen security gates are present across all collections', () => {
  // 1. Verified users required on writes
  assert.match(rulesText, /request\.auth\.token\.email_verified\s*==\s*true/);
  // 2. PII isolation on /private/{docId}
  assert.match(rulesText, /match\s+\/private\/\{docId\}\s*\{[\s\S]*?allow\s+get:\s*if\s+isOwner\(userId\)/);
  assert.match(rulesText, /match\s+\/private\/\{docId\}\s*\{[\s\S]*?allow\s+list:\s*if\s+false;/);
  // 3. Immutable creator attribution on cards & tradableCards
  assert.match(rulesText, /incoming\(\)\.originalCreatorId\s*==\s*existing\(\)\.originalCreatorId/);
  assert.match(rulesText, /incoming\(\)\.originalCreatorName\s*==\s*existing\(\)\.originalCreatorName/);
  // 4. Terminal state locking on rooms, listings, offers, trades
  assert.match(rulesText, /existing\(\)\.status\s*!=\s*'finished'/);
  assert.match(rulesText, /existing\(\)\.status\s*!=\s*'cancelled'/);
  assert.match(rulesText, /existing\(\)\.status\s*==\s*'active'/);
  assert.match(rulesText, /existing\(\)\.status\s*==\s*'pending'\s*\|\|\s*existing\(\)\.status\s*==\s*'countered'/);
  // 5. Atomicity guarantee between /rooms and /moves
  assert.match(rulesText, /existsAfter\(\/databases\/\$\(database\)\/documents\/rooms\/\$\(roomId\)\/moves\//);
  assert.match(rulesText, /getAfter\(\/databases\/\$\(database\)\/documents\/rooms\/\$\(roomId\)\)\.data\.turnNumber/);
  // 6. Strict server timestamps
  assert.match(rulesText, /incoming\(\)\.createdAt\s*==\s*request\.time/);
  assert.match(rulesText, /incoming\(\)\.updatedAt\s*==\s*request\.time/);
  // 7. Strict ID regex guard
  assert.match(rulesText, /id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\)/);
  // 8. Strict self-forfeit prevention
  assert.match(rulesText, /request\.auth\.uid\s*==\s*existing\(\)\.hostUid\s*&&\s*incoming\(\)\.winnerSide\s*==\s*'enemy'/);
  // 9. Wallet starting balance, bounded battle rewards, and atomic ledger debit/credit verification
  assert.match(rulesText, /incoming\(\)\.shards\s*==\s*500/);
  assert.match(rulesText, /incoming\(\)\.shards\s*<=\s*existing\(\)\.shards\s*\+\s*100/);
  assert.match(rulesText, /getAfter\(\/databases\/\$\(database\)\/documents\/wallets\/\$\(incoming\(\)\.shardsPayerUid\)\)\.data\.lastSettlementId\s*==\s*transferId/);
  assert.match(rulesText, /getAfter\(\/databases\/\$\(database\)\/documents\/wallets\/\$\(incoming\(\)\.shardsReceiverUid\)\)\.data\.lastSettlementId\s*==\s*transferId/);
  // 10. Marketplace offer acceptance strictly bound to pending offer document
  assert.match(rulesText, /get\(\/databases\/\$\(database\)\/documents\/marketplaceListings\/\$\(listingId\)\/offers\/\$\(incoming\(\)\.acceptedOfferId\)\)\.data\.offerPriceShards\s*==\s*incoming\(\)\.finalPrice/);
  assert.match(rulesText, /getAfter\(\/databases\/\$\(database\)\/documents\/marketplaceListings\/\$\(listingId\)\/offers\/\$\(incoming\(\)\.acceptedOfferId\)\)\.data\.status\s*==\s*'accepted'/);
  // 11. P2P trade turn gating + dual card swap atomicity
  assert.match(rulesText, /request\.auth\.uid\s*==\s*existing\(\)\.turnUid/);
  assert.match(rulesText, /getAfter\(\/databases\/\$\(database\)\/documents\/tradableCards\/\$\(existing\(\)\.proposerCardId\)\)\.data\.ownerId\s*==\s*existing\(\)\.recipientUid/);
  assert.match(rulesText, /getAfter\(\/databases\/\$\(database\)\/documents\/tradableCards\/\$\(existing\(\)\.recipientCardId\)\)\.data\.ownerId\s*==\s*existing\(\)\.proposerUid/);
  // 12. Immutable ownership ledger (no update/delete)
  assert.match(rulesText, /match\s+\/ownershipLedger\/\{transferId\}[\s\S]*?allow\s+update,\s*delete:\s*if\s+false;/);
  // 13. Phase 6: Anti-self-friend & addressee-only accept/decline
  assert.match(rulesText, /data\.requesterUid\s*!=\s*data\.addresseeUid/);
  assert.match(rulesText, /request\.auth\.uid\s*==\s*existing\(\)\.addresseeUid/);
  // 14. Phase 6: Single-clan enforcement & atomic clan create/join/leave/disband
  assert.match(rulesText, /!exists\(\/databases\/\$\(database\)\/documents\/clanMemberships\/\$\(request\.auth\.uid\)\)/);
  assert.match(rulesText, /getAfter\(\/databases\/\$\(database\)\/documents\/clans\/\$\(incoming\(\)\.clanId\)\)\.data\.tag\s*==\s*incoming\(\)\.clanTag/);
  // 15. Phase 6: Leader-only RBAC on promotion/demotion, kick, transfer, and solo disband
  assert.match(rulesText, /existing\(\)\.role\s*!=\s*'leader'/);
  assert.match(rulesText, /existing\(\)\.memberCount\s*==\s*1/);
  // 16. Phase 6: Verified clan member warroom chat & leader/officer-only announcements
  assert.match(rulesText, /incoming\(\)\.authorRole\s*==\s*get\(\/databases\/\$\(database\)\/documents\/clans\/\$\(clanId\)\/members\/\$\(request\.auth\.uid\)\)\.data\.role/);
  assert.match(rulesText, /incoming\(\)\.kind\s*!=\s*'announcement'\s*\|\|\s*incoming\(\)\.authorRole\s*==\s*'leader'\s*\|\|\s*incoming\(\)\.authorRole\s*==\s*'officer'/);
  // 17. Phase 6: Leader/officer-only clan invites & invite-only join verification
  assert.match(rulesText, /get\(\/databases\/\$\(database\)\/documents\/clanInvites\/\$\(incoming\(\)\.lastEventRefId\)\)\.data\.status\s*==\s*'pending'/);
  assert.match(rulesText, /getAfter\(\/databases\/\$\(database\)\/documents\/clanInvites\/\$\(incoming\(\)\.lastEventRefId\)\)\.data\.status\s*==\s*'accepted'/);
  // 18. Phase 6: Clan Activity Feed supports bounded battle_result & achievement shares with badgeLabel guard
  assert.match(rulesText, /data\.kind\s*==\s*'battle_result'/);
  assert.match(rulesText, /data\.kind\s*==\s*'achievement'/);
  assert.match(rulesText, /isBoundedString\(data\.badgeLabel,\s*0,\s*60\)/);
});
