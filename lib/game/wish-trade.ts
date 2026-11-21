import { getCardTraits, TRAIT_MAP, TraitId } from './traits';
import {
  CharacterDefinition,
  CombatRole,
  ElementAffinity,
} from './types';

export type WishTradeStatus = 'open' | 'fulfilled' | 'declined' | 'cancelled';

export interface WishTradeRequest {
  wishId: string;
  senderUid: string;
  senderName: string;
  recipientUid: string;
  recipientName: string;
  /** The ONLY card revealed publicly to the friend is the card being offered */
  offeredCard: CharacterDefinition;
  offeredTraits: TraitId[];
  offeredShards: number;
  /** Blind trait/skill request — sender cannot browse recipient's private cards */
  desiredTraits: TraitId[];
  desiredElement: ElementAffinity | 'Any';
  desiredRole: CombatRole | 'Any';
  note: string;
  status: WishTradeStatus;
  fulfilledCardName?: string;
  createdAtIso: string;
}

export const LOCAL_WISH_TRADES_KEY = 'oracle_arena_friend_wish_trades_v1';

/**
 * Checks ONLY the current player's private collection to highlight which cards
 * match a friend's Blind Wish-Trade request. Never exposes private cards externally.
 */
export function findMatchingPrivateCards(
  myPrivateCards: CharacterDefinition[],
  wish: Pick<
    WishTradeRequest,
    'desiredTraits' | 'desiredElement' | 'desiredRole'
  >
): Array<{
  card: CharacterDefinition;
  matchedTraits: TraitId[];
  exactMatch: boolean;
}> {
  const results: Array<{
    card: CharacterDefinition;
    matchedTraits: TraitId[];
    exactMatch: boolean;
  }> = [];

  for (const card of myPrivateCards) {
    const cardTraits = getCardTraits(card);
    const matchedTraits = wish.desiredTraits.filter((t) =>
      cardTraits.includes(t)
    );
    const elementOk =
      wish.desiredElement === 'Any' || card.element === wish.desiredElement;
    const roleOk = wish.desiredRole === 'Any' || card.role === wish.desiredRole;

    const allTraitsMatched =
      wish.desiredTraits.length === 0 ||
      matchedTraits.length === wish.desiredTraits.length;

    if (allTraitsMatched && elementOk && roleOk) {
      results.push({ card, matchedTraits, exactMatch: true });
    } else if (matchedTraits.length > 0 && (elementOk || roleOk)) {
      results.push({ card, matchedTraits, exactMatch: false });
    }
  }

  return results.sort((a, b) => {
    if (a.exactMatch !== b.exactMatch) return a.exactMatch ? -1 : 1;
    return b.matchedTraits.length - a.matchedTraits.length;
  });
}

export function formatWishSummaryLine(
  wish: Pick<
    WishTradeRequest,
    'desiredTraits' | 'desiredElement' | 'desiredRole'
  >
): string {
  const parts: string[] = [];
  if (wish.desiredTraits.length > 0) {
    parts.push(
      wish.desiredTraits
        .map((id) => TRAIT_MAP[id]?.name ?? id)
        .join(' + ')
    );
  }
  if (wish.desiredElement !== 'Any') {
    parts.push(`${wish.desiredElement} Element`);
  }
  if (wish.desiredRole !== 'Any') {
    parts.push(wish.desiredRole);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Any Champion';
}

export function buildSampleFriendWish(
  recipientUid: string,
  recipientName: string,
  sampleCard: CharacterDefinition
): WishTradeRequest {
  return {
    wishId: 'wish-dimple-intro',
    senderUid: 'friend-dimple-npc',
    senderName: 'Dimple (Friend)',
    recipientUid,
    recipientName,
    offeredCard: sampleCard,
    offeredTraits: getCardTraits(sampleCard),
    offeredShards: 40,
    desiredTraits: ['super_strength'],
    desiredElement: 'Any',
    desiredRole: 'Any',
    note: "Hey! I'm offering my Poison/Shadow champion + 40 Shards. Do you have any card with Super Strength to trade? If not, feel free to decline!",
    status: 'open',
    createdAtIso: new Date().toISOString(),
  };
}

export function loadLocalWishTrades(): WishTradeRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_WISH_TRADES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WishTradeRequest[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalWishTrades(wishes: WishTradeRequest[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LOCAL_WISH_TRADES_KEY,
      JSON.stringify(wishes.slice(0, 30))
    );
  } catch {
    // Ignore quota issues
  }
}
