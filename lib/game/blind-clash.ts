import { STARTER_CHARACTERS } from './roster';
import { getElementalMatchup } from './synergy';
import {
  getCardTraits,
  getCardVisualStats,
  resolveTraitCounter,
  TraitId,
} from './traits';
import { CharacterDefinition } from './types';

export const BLIND_CLASH_DECK_SIZE = 6;

export interface BlindClashRivalProfile {
  id: string;
  name: string;
  rating: number;
  tierLabel: string;
  hintText: string;
  hiddenDeck: CharacterDefinition[];
}

export interface BlindClashRoundResult {
  roundNumber: number;
  playerCard: CharacterDefinition;
  enemyCard: CharacterDefinition;
  playerTraits: TraitId[];
  enemyTraits: TraitId[];
  playerBasePower: number;
  enemyBasePower: number;
  playerFinalPower: number;
  enemyFinalPower: number;
  winner: 'player' | 'enemy' | 'draw';
  winReason: 'trait_counter' | 'power_clash' | 'elemental_edge' | 'draw';
  headline: string;
  detail: string;
}

export interface BlindClashMatchState {
  rival: BlindClashRivalProfile;
  playerRemaining: CharacterDefinition[];
  enemyRemaining: CharacterDefinition[];
  rounds: BlindClashRoundResult[];
  playerScore: number;
  enemyScore: number;
  status: 'active' | 'finished';
  winner: 'player' | 'enemy' | 'draw' | null;
}

const RIVAL_PRESETS: Array<{
  id: string;
  name: string;
  rating: number;
  tierLabel: string;
  hintText: string;
  preferredIds: string[];
}> = [
  {
    id: 'rival-dimple',
    name: 'Dimple the Alchemist',
    rating: 1060,
    tierLabel: 'Rookie Tactician',
    hintText: 'Rumor says Dimple likes Poison & Shadow tricks — bring a counter!',
    preferredIds: [
      'chr-kora',
      'chr-nyx',
      'chr-lyra',
      'chr-vex',
      'chr-ignis',
      'chr-freya',
    ],
  },
  {
    id: 'rival-ironclad',
    name: 'Marshal Ironclad',
    rating: 1210,
    tierLabel: 'Arena Veteran',
    hintText: 'High Rating · Known for heavy Iron Armor and Super Strength.',
    preferredIds: [
      'chr-malakor',
      'chr-kaelen',
      'chr-ignis',
      'chr-orion',
      'chr-freya',
      'chr-seraphina',
    ],
  },
  {
    id: 'rival-vespera',
    name: 'Grandmaster Vespera',
    rating: 1385,
    tierLabel: 'Mythic Gambler',
    hintText: 'Top Rating · Unpredictable mix of Telekinesis, Stealth, and Burst!',
    preferredIds: [
      'chr-lyra',
      'chr-vex',
      'chr-nyx',
      'chr-orion',
      'chr-kaelen',
      'chr-malakor',
    ],
  },
];

function deterministicHash(seed: number): number {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export function getBlindClashRivals(
  allKnownCards: CharacterDefinition[] = STARTER_CHARACTERS
): BlindClashRivalProfile[] {
  const byId = new Map<string, CharacterDefinition>();
  for (const c of [...STARTER_CHARACTERS, ...allKnownCards]) {
    byId.set(c.id, c);
  }

  return RIVAL_PRESETS.map((preset) => {
    const deck: CharacterDefinition[] = [];
    for (const id of preset.preferredIds) {
      const card = byId.get(id);
      if (card) deck.push(card);
    }
    for (const fallback of STARTER_CHARACTERS) {
      if (deck.length >= BLIND_CLASH_DECK_SIZE) break;
      if (!deck.some((c) => c.id === fallback.id)) deck.push(fallback);
    }
    return {
      id: preset.id,
      name: preset.name,
      rating: preset.rating,
      tierLabel: preset.tierLabel,
      hintText: preset.hintText,
      hiddenDeck: deck.slice(0, BLIND_CLASH_DECK_SIZE),
    };
  });
}

export function createBlindClashMatch(
  playerDeck: CharacterDefinition[],
  rival: BlindClashRivalProfile
): BlindClashMatchState {
  if (playerDeck.length !== BLIND_CLASH_DECK_SIZE) {
    throw new Error(
      `Blind Clash requires exactly ${BLIND_CLASH_DECK_SIZE} selected champions.`
    );
  }
  return {
    rival,
    playerRemaining: [...playerDeck],
    enemyRemaining: [...rival.hiddenDeck],
    rounds: [],
    playerScore: 0,
    enemyScore: 0,
    status: 'active',
    winner: null,
  };
}

/**
 * Resolves a single face-down card reveal clash:
 * 1. Hard Trait Counter auto-wins (e.g., Venom Resistant beats Venom Touch!).
 * 2. Otherwise Elemental Resonance (+12% Power) + Visual Power Rating decides!
 */
export function resolveBlindClashRound(
  roundNumber: number,
  playerCard: CharacterDefinition,
  enemyCard: CharacterDefinition
): BlindClashRoundResult {
  const playerTraits = getCardTraits(playerCard);
  const enemyTraits = getCardTraits(enemyCard);
  const playerVisual = getCardVisualStats(playerCard);
  const enemyVisual = getCardVisualStats(enemyCard);

  const counter = resolveTraitCounter(playerTraits, enemyTraits);

  const pElementMatchup = getElementalMatchup(
    playerCard.element,
    enemyCard.element
  );
  const eElementMatchup = getElementalMatchup(
    enemyCard.element,
    playerCard.element
  );
  const pElementRel = pElementMatchup.relation;
  const eElementRel = eElementMatchup.relation;

  const playerFinalPower = Math.round(
    playerVisual.powerRating * pElementMatchup.multiplier
  );
  const enemyFinalPower = Math.round(
    enemyVisual.powerRating * eElementMatchup.multiplier
  );

  // 1. Automatic Trait Counter Victory!
  if (counter.winner === 'player') {
    return {
      roundNumber,
      playerCard,
      enemyCard,
      playerTraits,
      enemyTraits,
      playerBasePower: playerVisual.powerRating,
      enemyBasePower: enemyVisual.powerRating,
      playerFinalPower,
      enemyFinalPower,
      winner: 'player',
      winReason: 'trait_counter',
      headline: counter.headline,
      detail: `${playerCard.name} automatically won the clash by countering ${enemyCard.name}'s skill set!`,
    };
  }

  if (counter.winner === 'enemy') {
    return {
      roundNumber,
      playerCard,
      enemyCard,
      playerTraits,
      enemyTraits,
      playerBasePower: playerVisual.powerRating,
      enemyBasePower: enemyVisual.powerRating,
      playerFinalPower,
      enemyFinalPower,
      winner: 'enemy',
      winReason: 'trait_counter',
      headline: counter.headline,
      detail: `${enemyCard.name} countered ${playerCard.name}'s skill set for an instant round victory.`,
    };
  }

  // 2. Power + Elemental Resonance comparison
  if (playerFinalPower > enemyFinalPower) {
    const usedElement =
      pElementRel === 'advantage' && playerVisual.powerRating <= enemyVisual.powerRating;
    return {
      roundNumber,
      playerCard,
      enemyCard,
      playerTraits,
      enemyTraits,
      playerBasePower: playerVisual.powerRating,
      enemyBasePower: enemyVisual.powerRating,
      playerFinalPower,
      enemyFinalPower,
      winner: 'player',
      winReason: usedElement ? 'elemental_edge' : 'power_clash',
      headline: usedElement
        ? `ELEMENTAL WIN! ${playerCard.element} boosted ${playerCard.name} to ${playerFinalPower} PWR!`
        : `CLASH VICTORY! ${playerFinalPower} PWR beats ${enemyFinalPower} PWR!`,
      detail: `${playerCard.name} overpowered ${enemyCard.name} in the reveal.`,
    };
  }

  if (enemyFinalPower > playerFinalPower) {
    const usedElement =
      eElementRel === 'advantage' && enemyVisual.powerRating <= playerVisual.powerRating;
    return {
      roundNumber,
      playerCard,
      enemyCard,
      playerTraits,
      enemyTraits,
      playerBasePower: playerVisual.powerRating,
      enemyBasePower: enemyVisual.powerRating,
      playerFinalPower,
      enemyFinalPower,
      winner: 'enemy',
      winReason: usedElement ? 'elemental_edge' : 'power_clash',
      headline: usedElement
        ? `RIVAL ELEMENTAL WIN! ${enemyCard.element} boosted ${enemyCard.name} to ${enemyFinalPower} PWR.`
        : `RIVAL WINS CLASH! ${enemyFinalPower} PWR beats ${playerFinalPower} PWR.`,
      detail: `${enemyCard.name} edged out ${playerCard.name} in this round.`,
    };
  }

  return {
    roundNumber,
    playerCard,
    enemyCard,
    playerTraits,
    enemyTraits,
    playerBasePower: playerVisual.powerRating,
    enemyBasePower: enemyVisual.powerRating,
    playerFinalPower,
    enemyFinalPower,
    winner: 'draw',
    winReason: 'draw',
    headline: `CLASH DRAW! Both champions struck for ${playerFinalPower} PWR!`,
    detail: 'Evenly matched gamble — zero points awarded.',
  };
}

/**
 * Throws the player's selected card against a hidden face-down rival card,
 * revealing both simultaneously and updating the match state.
 */
export function playBlindClashCard(
  state: BlindClashMatchState,
  playerCardId: string,
  seed = 77
): {
  nextState: BlindClashMatchState;
  roundResult: BlindClashRoundResult;
} {
  if (state.status !== 'active') {
    throw new Error('This Blind Clash match is already finished.');
  }
  const playerCard = state.playerRemaining.find((c) => c.id === playerCardId);
  if (!playerCard) {
    throw new Error('That champion is not available in your remaining Blind Clash hand.');
  }

  // Opponent blindly picks one of their remaining hidden cards (never peeks at your throw!)
  const enemyIdx =
    deterministicHash(seed + state.rounds.length * 31 + state.rival.rating) %
    state.enemyRemaining.length;
  const enemyCard = state.enemyRemaining[enemyIdx];

  const roundNumber = state.rounds.length + 1;
  const roundResult = resolveBlindClashRound(roundNumber, playerCard, enemyCard);

  const nextPlayerRemaining = state.playerRemaining.filter(
    (c) => c.id !== playerCard.id
  );
  const nextEnemyRemaining = state.enemyRemaining.filter(
    (_, idx) => idx !== enemyIdx
  );
  const nextRounds = [...state.rounds, roundResult];
  const nextPlayerScore =
    state.playerScore + (roundResult.winner === 'player' ? 1 : 0);
  const nextEnemyScore =
    state.enemyScore + (roundResult.winner === 'enemy' ? 1 : 0);

  const finished = nextPlayerRemaining.length === 0 || nextEnemyRemaining.length === 0;
  let winner: 'player' | 'enemy' | 'draw' | null = null;
  if (finished) {
    if (nextPlayerScore > nextEnemyScore) {
      winner = 'player';
    } else if (nextEnemyScore > nextPlayerScore) {
      winner = 'enemy';
    } else {
      // Tiebreaker: total revealed power across all 6 clashes
      const playerTotalPower = nextRounds.reduce(
        (sum, r) => sum + r.playerFinalPower,
        0
      );
      const enemyTotalPower = nextRounds.reduce(
        (sum, r) => sum + r.enemyFinalPower,
        0
      );
      winner =
        playerTotalPower > enemyTotalPower
          ? 'player'
          : enemyTotalPower > playerTotalPower
            ? 'enemy'
            : 'draw';
    }
  }

  return {
    roundResult,
    nextState: {
      ...state,
      playerRemaining: nextPlayerRemaining,
      enemyRemaining: nextEnemyRemaining,
      rounds: nextRounds,
      playerScore: nextPlayerScore,
      enemyScore: nextEnemyScore,
      status: finished ? 'finished' : 'active',
      winner,
    },
  };
}
