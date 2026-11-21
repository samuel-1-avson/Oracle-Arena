import { BattleRoomDoc } from './multiplayer';

export interface QuickMatchCandidate {
  room: BattleRoomDoc;
  hostRating: number;
  ratingDiff: number;
}

/**
 * Progressive ranked ELO search window: starts tight (±150) and widens smoothly
 * every 10 seconds in queue so players find fair matches quickly without waiting indefinitely.
 */
export function getExpandedEloWindow(elapsedSeconds: number): number {
  const safeSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const steps = Math.floor(safeSeconds / 10);
  return Math.min(1500, 150 + steps * 75);
}

/**
 * Selects the closest-ELO open PvP waiting room (excluding the player's own room)
 * for one-click Quick-Match ranked matchmaking.
 */
export function selectBestQuickMatchRoom(
  openRooms: BattleRoomDoc[],
  playerUid: string,
  playerRating: number,
  ratingsByUid: Record<string, number>,
  elapsedSeconds = 0
): QuickMatchCandidate | null {
  const maxWindow = getExpandedEloWindow(elapsedSeconds);

  const eligible: QuickMatchCandidate[] = openRooms
    .filter(
      (room) =>
        room.status === 'waiting' &&
        room.hostUid !== playerUid &&
        room.hostSquad.length === 5
    )
    .map((room) => {
      const hostRating = ratingsByUid[room.hostUid] ?? 1000;
      const ratingDiff = Math.abs(hostRating - playerRating);
      return { room, hostRating, ratingDiff };
    })
    .sort((a, b) => a.ratingDiff - b.ratingDiff);

  if (eligible.length === 0) return null;

  const withinWindow = eligible.find((c) => c.ratingDiff <= maxWindow);
  if (withinWindow) return withinWindow;

  // If queue has been waiting >= 20s or fallback requested, allow best available opponent
  return elapsedSeconds >= 20 ? eligible[0] : null;
}
