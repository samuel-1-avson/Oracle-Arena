import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimDailyLoginReward,
  createInitialDailyRewardState,
  DAILY_REWARD_SCHEDULE,
  formatResetCountdown,
  getCalendarDayDiff,
  getDailyRewardStatus,
  getLocalDateKey,
  getMsUntilNextLocalDay,
} from './daily-rewards';

test('daily reward schedule stays within 1..100 Firestore wallet rule bounds and escalates cleanly', () => {
  assert.equal(DAILY_REWARD_SCHEDULE.length, 7);
  for (let i = 0; i < DAILY_REWARD_SCHEDULE.length; i += 1) {
    const tier = DAILY_REWARD_SCHEDULE[i];
    assert.equal(tier.day, i + 1);
    assert.ok(tier.shards >= 1 && tier.shards <= 100);
    if (i > 0) {
      assert.ok(tier.shards > DAILY_REWARD_SCHEDULE[i - 1].shards);
    }
  }
  assert.equal(DAILY_REWARD_SCHEDULE[6].isGrandMilestone, true);
  assert.equal(DAILY_REWARD_SCHEDULE[6].shards, 100);
});

test('first-time claim awards Day 1 shards and prevents same-day double claiming', () => {
  const initial = createInitialDailyRewardState();
  const day1Morning = new Date(2026, 4, 10, 9, 30, 0);

  const statusBefore = getDailyRewardStatus(initial, day1Morning);
  assert.equal(statusBefore.canClaimToday, true);
  assert.equal(statusBefore.nextClaimDay, 1);
  assert.equal(statusBefore.nextRewardTier.shards, 35);

  const firstClaim = claimDailyLoginReward(initial, day1Morning);
  assert.equal(firstClaim.ok, true);
  assert.equal(firstClaim.claimedDay, 1);
  assert.equal(firstClaim.shardsAwarded, 35);
  assert.equal(firstClaim.isMilestoneDay, false);
  assert.equal(firstClaim.nextState.streakDay, 1);
  assert.equal(firstClaim.nextState.totalClaims, 1);
  assert.equal(firstClaim.nextState.totalShardsClaimed, 35);
  assert.deepEqual(firstClaim.nextState.claimedDaysInCycle, [1]);

  // Same calendar day evening attempt must be rejected
  const day1Evening = new Date(2026, 4, 10, 22, 15, 0);
  const statusAfter = getDailyRewardStatus(firstClaim.nextState, day1Evening);
  assert.equal(statusAfter.canClaimToday, false);
  assert.equal(statusAfter.alreadyClaimedToday, true);
  assert.equal(statusAfter.nextClaimDay, 2);

  const duplicate = claimDailyLoginReward(firstClaim.nextState, day1Evening);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.shardsAwarded, 0);
  assert.equal(duplicate.nextState.totalClaims, 1);
});

test('7 consecutive days escalate to Day 7 Grand Weekly Trove and roll cleanly to Day 1 on Day 8', () => {
  let state = createInitialDailyRewardState();
  let expectedTotalShards = 0;

  for (let d = 0; d < 7; d += 1) {
    const date = new Date(2026, 4, 1 + d, 10, 0, 0);
    const res = claimDailyLoginReward(state, date);
    assert.equal(res.ok, true);
    assert.equal(res.claimedDay, d + 1);
    assert.equal(res.shardsAwarded, DAILY_REWARD_SCHEDULE[d].shards);
    assert.equal(res.isMilestoneDay, d === 6);
    expectedTotalShards += DAILY_REWARD_SCHEDULE[d].shards;
    state = res.nextState;
  }

  assert.equal(state.streakDay, 7);
  assert.equal(state.longestStreak, 7);
  assert.equal(state.totalClaims, 7);
  assert.equal(state.totalShardsClaimed, expectedTotalShards);
  assert.deepEqual(state.claimedDaysInCycle, [1, 2, 3, 4, 5, 6, 7]);

  // Day 8 starts a fresh 7-day cycle on Day 1 while preserving totalClaims & longestStreak
  const day8 = new Date(2026, 4, 8, 10, 0, 0);
  const statusDay8 = getDailyRewardStatus(state, day8);
  assert.equal(statusDay8.canClaimToday, true);
  assert.equal(statusDay8.nextClaimDay, 1);
  assert.equal(statusDay8.streakBroken, false);
  assert.deepEqual(statusDay8.claimedDaysDisplay, []);

  const claimDay8 = claimDailyLoginReward(state, day8);
  assert.equal(claimDay8.ok, true);
  assert.equal(claimDay8.claimedDay, 1);
  assert.equal(claimDay8.shardsAwarded, 35);
  assert.equal(claimDay8.nextState.totalClaims, 8);
  assert.equal(claimDay8.nextState.longestStreak, 8);
  assert.deepEqual(claimDay8.nextState.claimedDaysInCycle, [1]);
});

test('skipping 1 or more full calendar days resets streak back to Day 1 cleanly', () => {
  let state = createInitialDailyRewardState();
  state = claimDailyLoginReward(state, new Date(2026, 4, 1, 10, 0, 0)).nextState;
  state = claimDailyLoginReward(state, new Date(2026, 4, 2, 10, 0, 0)).nextState;
  state = claimDailyLoginReward(state, new Date(2026, 4, 3, 10, 0, 0)).nextState;
  assert.equal(state.streakDay, 3);

  // Skip May 4, return on May 5 -> diff is 2 days
  const returnDate = new Date(2026, 4, 5, 11, 0, 0);
  assert.equal(getCalendarDayDiff(getLocalDateKey(new Date(2026, 4, 3)), getLocalDateKey(returnDate)), 2);

  const status = getDailyRewardStatus(state, returnDate);
  assert.equal(status.canClaimToday, true);
  assert.equal(status.streakBroken, true);
  assert.equal(status.effectiveStreak, 0);
  assert.equal(status.nextClaimDay, 1);

  const claim = claimDailyLoginReward(state, returnDate);
  assert.equal(claim.ok, true);
  assert.equal(claim.claimedDay, 1);
  assert.equal(claim.shardsAwarded, 35);
  assert.equal(claim.nextState.streakDay, 1);
  assert.equal(claim.nextState.longestStreak, 3);
  assert.equal(claim.nextState.totalClaims, 4);
  assert.deepEqual(claim.nextState.claimedDaysInCycle, [1]);
});

test('countdown helpers produce valid positive reset timings', () => {
  const sample = new Date(2026, 4, 10, 21, 30, 0);
  const ms = getMsUntilNextLocalDay(sample);
  assert.equal(ms, 2.5 * 3_600_000);
  assert.equal(formatResetCountdown(ms), '2h 30m');
  assert.equal(formatResetCountdown(45 * 60_000), '45m');
  assert.equal(formatResetCountdown(0), 'Ready now');
});
