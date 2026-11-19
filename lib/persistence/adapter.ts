import { normalizeCharacterProgression } from '../game/progression';
import {
  DEFAULT_PLAYER_SQUAD_IDS,
  STARTER_CHARACTERS,
} from '../game/roster';
import {
  CharacterDefinition,
  CharacterDefinitionSchema,
  MatchSummaryRecord,
} from '../game/types';

/**
 * Persistence Abstraction Layer.
 * Phases 1-3 use LocalStoragePersistenceAdapter.
 * Designed so Phase 4 can swap in Cloud Firestore or PostgreSQL repositories
 * without modifying combat, Oracle, progression, or UI components.
 */
export interface PersistenceAdapter {
  getCollection(): CharacterDefinition[];
  getCustomCharacters(): CharacterDefinition[];
  saveCustomCharacter(card: CharacterDefinition): CharacterDefinition[];
  deleteCustomCharacter(cardId: string): CharacterDefinition[];
  saveCharacterProgression(card: CharacterDefinition): CharacterDefinition[];
  saveCharacterProgressions(cards: CharacterDefinition[]): CharacterDefinition[];
  getPlayerSquadIds(): string[];
  savePlayerSquadIds(ids: string[]): void;
  getMatchHistory(): MatchSummaryRecord[];
  recordMatchSummary(summary: MatchSummaryRecord): void;
}

const CUSTOM_CARDS_KEY = 'oracle_arena_custom_characters_v1';
const PROGRESSION_OVERRIDES_KEY = 'oracle_arena_progression_v1';
const SQUAD_KEY = 'oracle_arena_player_squad_v1';
const HISTORY_KEY = 'oracle_arena_match_history_v1';

export class LocalStoragePersistenceAdapter implements PersistenceAdapter {
  private getProgressionOverrides(): Record<string, CharacterDefinition> {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(PROGRESSION_OVERRIDES_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const valid: Record<string, CharacterDefinition> = {};
      for (const [id, item] of Object.entries(parsed)) {
        const res = CharacterDefinitionSchema.safeParse(item);
        if (res.success) {
          valid[id] = normalizeCharacterProgression(res.data);
        }
      }
      return valid;
    } catch {
      return {};
    }
  }

  private writeProgressionOverrides(
    map: Record<string, CharacterDefinition>
  ): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        PROGRESSION_OVERRIDES_KEY,
        JSON.stringify(map)
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  getCustomCharacters(): CharacterDefinition[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(CUSTOM_CARDS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const valid: CharacterDefinition[] = [];
      for (const item of parsed) {
        const res = CharacterDefinitionSchema.safeParse(item);
        if (res.success) {
          valid.push(normalizeCharacterProgression(res.data));
        }
      }
      return valid;
    } catch {
      return [];
    }
  }

  saveCustomCharacter(card: CharacterDefinition): CharacterDefinition[] {
    const validated = normalizeCharacterProgression(
      CharacterDefinitionSchema.parse(card)
    );
    const existing = this.getCustomCharacters().filter(
      (c) => c.id !== validated.id
    );
    const next = [validated, ...existing];
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
    }
    return next;
  }

  deleteCustomCharacter(cardId: string): CharacterDefinition[] {
    const next = this.getCustomCharacters().filter((c) => c.id !== cardId);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
    }
    const overrides = this.getProgressionOverrides();
    if (overrides[cardId]) {
      delete overrides[cardId];
      this.writeProgressionOverrides(overrides);
    }
    return next;
  }

  saveCharacterProgression(card: CharacterDefinition): CharacterDefinition[] {
    return this.saveCharacterProgressions([card]);
  }

  saveCharacterProgressions(cards: CharacterDefinition[]): CharacterDefinition[] {
    if (cards.length === 0) return this.getCollection();
    const customCards = this.getCustomCharacters();
    const customIds = new Set(customCards.map((c) => c.id));
    const overrides = this.getProgressionOverrides();
    let customChanged = false;

    const updatedCustomMap = new Map(customCards.map((c) => [c.id, c]));

    for (const rawCard of cards) {
      const validated = normalizeCharacterProgression(
        CharacterDefinitionSchema.parse(rawCard)
      );
      if (customIds.has(validated.id)) {
        updatedCustomMap.set(validated.id, validated);
        customChanged = true;
      } else {
        overrides[validated.id] = validated;
      }
    }

    if (customChanged && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          CUSTOM_CARDS_KEY,
          JSON.stringify(Array.from(updatedCustomMap.values()))
        );
      } catch {
        // Ignore storage quota errors
      }
    }

    this.writeProgressionOverrides(overrides);
    return this.getCollection();
  }

  getCollection(): CharacterDefinition[] {
    const custom = this.getCustomCharacters();
    const overrides = this.getProgressionOverrides();
    const starters = STARTER_CHARACTERS.map((starter) =>
      overrides[starter.id]
        ? normalizeCharacterProgression(overrides[starter.id])
        : normalizeCharacterProgression(starter)
    );
    return [...custom, ...starters];
  }

  getPlayerSquadIds(): string[] {
    if (typeof window === 'undefined') return [...DEFAULT_PLAYER_SQUAD_IDS];
    try {
      const raw = window.localStorage.getItem(SQUAD_KEY);
      if (!raw) return [...DEFAULT_PLAYER_SQUAD_IDS];
      const parsed = JSON.parse(raw);
      const validIds = new Set(this.getCollection().map((c) => c.id));
      if (
        Array.isArray(parsed) &&
        parsed.length === 5 &&
        parsed.every((id) => typeof id === 'string' && validIds.has(id))
      ) {
        return parsed;
      }
    } catch {
      // Fallback to default squad
    }
    return [...DEFAULT_PLAYER_SQUAD_IDS];
  }

  savePlayerSquadIds(ids: string[]): void {
    if (typeof window === 'undefined') return;
    if (ids.length !== 5) return;
    try {
      window.localStorage.setItem(SQUAD_KEY, JSON.stringify(ids));
    } catch {
      // Ignore storage quota errors
    }
  }

  getMatchHistory(): MatchSummaryRecord[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 20);
    } catch {
      // Ignore malformed storage
    }
    return [];
  }

  recordMatchSummary(summary: MatchSummaryRecord): void {
    if (typeof window === 'undefined') return;
    try {
      const current = this.getMatchHistory();
      const next = [summary, ...current].slice(0, 20);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }
}

export const persistence: PersistenceAdapter =
  new LocalStoragePersistenceAdapter();
