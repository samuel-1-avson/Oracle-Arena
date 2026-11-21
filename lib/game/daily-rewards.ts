export interface DailyRewardTier {
  day: number; // 1..7
  shards: number; // Strictly bounded 1..100 for live Firestore wallet rule compliance
  title: string;
  subtitle: string;
  isGrandMilestone?: boolean;
}

export const DAILY_REWARD_SCHEDULE: readonly DailyRewardTier[] = [
  {
    day: 1,
    shards: 35,
    title: 'Welcome Spark',
    subtitle: 'Kick off your streak',
  },
  {
    day: 2,
    shards: 45,
    title: 'Returning Tactician',
    subtitle: 'Momentum builds',
  },
  {
    day: 3,
    shards: 55,
    title: 'Arena Momentum',
    subtitle: 'Three days strong',
  },
  {
    day: 4,
    shards: 65,
    title: 'Tactical Focus',
    subtitle: 'Mid-week vault drop',
  },
  {
    day: 5,
    shards: 75,
    title: 'Oracle Dedication',
    subtitle: 'Closer to the trove',
  },
  {
    day: 6,
    shards: 85,
    title: 'Ascendant Cadence',
    subtitle: 'One day from Day 7',
  },
  {
    day: 7,
    shards: 100,
    title: 'Grand Weekly Trove',
    subtitle: 'Maximum 7-day bonus!',
    isGrandMilestone: true,
  },
] as const;

export interface DailyLoginRewardState {
  streakDay: number; // 0 before first claim; 1..7 current streak day in active cycle
  lastClaimDateKey: string | null; // YYYY-MM-DD in local calendar
  totalClaims: number;
  longestStreak: number;
  totalShardsClaimed: number;
  claimedDaysInCycle: number[]; // Day numbers 1..7 claimed in the active 7-day cycle
}

export interface DailyRewardStatus {
  todayKey: string;
  canClaimToday: boolean;
  alreadyClaimedToday: boolean;
  nextClaimDay: number; // 1..7
  nextRewardTier: DailyRewardTier;
  effectiveStreak: number; // Displayed active streak count (0 if broken or never claimed)
  streakBroken: boolean;
  claimedDaysDisplay: number[]; // Days currently marked completed in the 7-day calendar
  msUntilReset: number;
}

export interface ClaimDailyRewardResult {
  ok: boolean;
  error?: string;
  shardsAwarded: number;
  claimedDay: number;
  isMilestoneDay: boolean;
  rewardTier?: DailyRewardTier;
  nextState: DailyLoginRewardState;
}

const DAILY_REWARD_STORAGE_PREFIX = 'oracle_arena_daily_rewards_v1_';

export function createInitialDailyRewardState(): DailyLoginRewardState {
  return {
    streakDay: 0,
    lastClaimDateKey: null,
    totalClaims: 0,
    longestStreak: 0,
    totalShardsClaimed: 0,
    claimedDaysInCycle: [],
  };
}

/**
 * Formats a Date into a deterministic local calendar key (YYYY-MM-DD).
 */
export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes whole-day calendar difference (toDateKey - fromDateKey) using UTC noon
 * to avoid Daylight Saving Time 23h/25h edge cases.
 */
export function getCalendarDayDiff(
  fromDateKey: string,
  toDateKey: string
): number {
  const [fy, fm, fd] = fromDateKey.split('-').map(Number);
  const [ty, tm, td] = toDateKey.split('-').map(Number);
  if (
    !Number.isFinite(fy) ||
    !Number.isFinite(fm) ||
    !Number.isFinite(fd) ||
    !Number.isFinite(ty) ||
    !Number.isFinite(tm) ||
    !Number.isFinite(td)
  ) {
    return 0;
  }
  const fromUtc = Date.UTC(fy, fm - 1, fd, 12, 0, 0);
  const toUtc = Date.UTC(ty, tm - 1, td, 12, 0, 0);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/**
 * Milliseconds remaining until the start of the next local calendar day (00:00:00).
 */
export function getMsUntilNextLocalDay(now: Date = new Date()): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(0, nextMidnight.getTime() - now.getTime());
}

/**
 * Human-readable countdown for next daily reward reset (e.g. "11h 24m" or "42m").
 */
export function formatResetCountdown(ms: number): string {
  if (ms <= 0) return 'Ready now';
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function getRewardTierForDay(day: number): DailyRewardTier {
  const clampedIndex = Math.max(0, Math.min(DAILY_REWARD_SCHEDULE.length - 1, day - 1));
  return DAILY_REWARD_SCHEDULE[clampedIndex];
}

/**
 * Evaluates current daily login reward eligibility, active streak, and next reward tier.
 */
export function getDailyRewardStatus(
  state: DailyLoginRewardState,
  now: Date = new Date()
): DailyRewardStatus {
  const todayKey = getLocalDateKey(now);
  const msUntilReset = getMsUntilNextLocalDay(now);

  if (!state.lastClaimDateKey) {
    return {
      todayKey,
      canClaimToday: true,
      alreadyClaimedToday: false,
      nextClaimDay: 1,
      nextRewardTier: getRewardTierForDay(1),
      effectiveStreak: 0,
      streakBroken: false,
      claimedDaysDisplay: [],
      msUntilReset,
    };
  }

  const dayDiff = getCalendarDayDiff(state.lastClaimDateKey, todayKey);

  // Already claimed today (or clock skewed backward)
  if (dayDiff <= 0) {
    const nextDayAfterToday = state.streakDay >= 7 ? 1 : state.streakDay + 1;
    return {
      todayKey,
      canClaimToday: false,
      alreadyClaimedToday: true,
      nextClaimDay: nextDayAfterToday,
      nextRewardTier: getRewardTierForDay(nextDayAfterToday),
      effectiveStreak: Math.max(1, state.streakDay),
      streakBroken: false,
      claimedDaysDisplay: state.claimedDaysInCycle,
      msUntilReset,
    };
  }

  // Consecutive next calendar day!
  if (dayDiff === 1) {
    const startingNewCycle = state.streakDay >= 7;
    const nextClaimDay = startingNewCycle ? 1 : state.streakDay + 1;
    return {
      todayKey,
      canClaimToday: true,
      alreadyClaimedToday: false,
      nextClaimDay,
      nextRewardTier: getRewardTierForDay(nextClaimDay),
      effectiveStreak: state.streakDay,
      streakBroken: false,
      claimedDaysDisplay: startingNewCycle ? [] : state.claimedDaysInCycle,
      msUntilReset,
    };
  }

  // Missed 1+ full calendar days -> streak resets cleanly to Day 1
  return {
    todayKey,
    canClaimToday: true,
    alreadyClaimedToday: false,
    nextClaimDay: 1,
    nextRewardTier: getRewardTierForDay(1),
    effectiveStreak: 0,
    streakBroken: state.streakDay > 0,
    claimedDaysDisplay: [],
    msUntilReset,
  };
}

/**
 * Claims today's daily login Oracle Shard reward once per calendar day.
 */
export function claimDailyLoginReward(
  state: DailyLoginRewardState,
  now: Date = new Date()
): ClaimDailyRewardResult {
  const status = getDailyRewardStatus(state, now);

  if (!status.canClaimToday) {
    return {
      ok: false,
      error: `Today's Oracle Shards have already been claimed. Come back in ${formatResetCountdown(status.msUntilReset)}.`,
      shardsAwarded: 0,
      claimedDay: state.streakDay,
      isMilestoneDay: false,
      nextState: state,
    };
  }

  const claimedDay = status.nextClaimDay;
  const rewardTier = getRewardTierForDay(claimedDay);
  const nextClaimedDays =
    claimedDay === 1
      ? [1]
      : Array.from(new Set([...status.claimedDaysDisplay, claimedDay])).sort(
          (a, b) => a - b
        );

  const nextStreakCount =
    status.streakBroken || state.lastClaimDateKey === null
      ? 1
      : claimedDay === 1 && state.streakDay >= 7
        ? 1
        : claimedDay;

  // Track continuous consecutive streak for longestStreak (even across 7-day cycles!)
  const continuousStreak =
    state.lastClaimDateKey !== null &&
    getCalendarDayDiff(state.lastClaimDateKey, status.todayKey) === 1
      ? Math.max(state.streakDay + 1, nextStreakCount)
      : 1;

  const nextState: DailyLoginRewardState = {
    streakDay: claimedDay,
    lastClaimDateKey: status.todayKey,
    totalClaims: state.totalClaims + 1,
    longestStreak: Math.max(state.longestStreak, continuousStreak, claimedDay),
    totalShardsClaimed: state.totalShardsClaimed + rewardTier.shards,
    claimedDaysInCycle: nextClaimedDays,
  };

  return {
    ok: true,
    shardsAwarded: rewardTier.shards,
    claimedDay,
    isMilestoneDay: Boolean(rewardTier.isGrandMilestone),
    rewardTier,
    nextState,
  };
}

function sanitizeAccountKey(accountKey?: string): string {
  const cleaned = (accountKey || 'local').replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned.length > 0 ? cleaned : 'local';
}

export function loadDailyRewardState(
  accountKey?: string
): DailyLoginRewardState {
  if (typeof window === 'undefined') {
    return createInitialDailyRewardState();
  }
  const key = `${DAILY_REWARD_STORAGE_PREFIX}${sanitizeAccountKey(accountKey)}`;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return createInitialDailyRewardState();
    const parsed = JSON.parse(raw) as Partial<DailyLoginRewardState>;
    const streakDay =
      typeof parsed.streakDay === 'number' &&
      parsed.streakDay >= 0 &&
      parsed.streakDay <= 7
        ? Math.floor(parsed.streakDay)
        : 0;
    const lastClaimDateKey =
      typeof parsed.lastClaimDateKey === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.lastClaimDateKey)
        ? parsed.lastClaimDateKey
        : null;
    const claimedDaysInCycle = Array.isArray(parsed.claimedDaysInCycle)
      ? parsed.claimedDaysInCycle
          .filter((d): d is number => typeof d === 'number' && d >= 1 && d <= 7)
          .map((d) => Math.floor(d))
      : [];

    return {
      streakDay,
      lastClaimDateKey,
      totalClaims:
        typeof parsed.totalClaims === 'number' && parsed.totalClaims >= 0
          ? Math.floor(parsed.totalClaims)
          : 0,
      longestStreak:
        typeof parsed.longestStreak === 'number' && parsed.longestStreak >= 0
          ? Math.floor(parsed.longestStreak)
          : streakDay,
      totalShardsClaimed:
        typeof parsed.totalShardsClaimed === 'number' &&
        parsed.totalShardsClaimed >= 0
          ? Math.floor(parsed.totalShardsClaimed)
          : 0,
      claimedDaysInCycle,
    };
  } catch {
    return createInitialDailyRewardState();
  }
}

export function saveDailyRewardState(
  state: DailyLoginRewardState,
  accountKey?: string
): void {
  if (typeof window === 'undefined') return;
  const key = `${DAILY_REWARD_STORAGE_PREFIX}${sanitizeAccountKey(accountKey)}`;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors cleanly
  }
}
