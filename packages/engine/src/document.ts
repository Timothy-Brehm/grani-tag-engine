import { TagCollection, type TagCollectionJSON } from './tag-collection';
import {
  createEngineState,
  engineStateToJSON,
  type EngineState,
  type EngineStateJSON,
} from './state';
import {
  createEntityInstance,
  entityInstanceFromJSON,
  type EntityInstance,
} from './entity';
import {
  continuousActionsFromJSON,
  continuousProgressFromJSON,
} from './continuous-types';
import {
  assertCompatibleEngineVersion,
  ENGINE_VERSION,
} from './version';
import { createTag, type Tag } from './tag';

/** Reserved holder id for Settings.universalTags in slot selections. */
export const UNIVERSAL_TAGS_HOLDER_ID = 'settings' as const;

export const DEFAULT_GAME_ID = 'game-0' as const;

export type GameMeta = {
  readonly label?: string;
  readonly archivedSeq?: number;
  readonly createdTick?: number;
  readonly lastActiveTick?: number;
};

export type EngineSettings = {
  readonly activeGameId: string;
  readonly universalTags: TagCollection;
};

export type EngineDocument = {
  readonly engineVersion: string;
  readonly settings: EngineSettings;
  readonly games: ReadonlyMap<string, EngineState>;
  readonly gameMeta: ReadonlyMap<string, GameMeta>;
};

export type EngineSettingsJSON = {
  activeGameId: string;
  universalTags: TagCollectionJSON;
};

export type EngineDocumentJSON = {
  engineVersion: string;
  settings: EngineSettingsJSON;
  games: Record<string, EngineStateJSON>;
  gameMeta?: Record<string, GameMeta>;
};

export function createUniversalHolderEntity(
  universalTags: TagCollection,
): EntityInstance {
  return createEntityInstance({
    id: UNIVERSAL_TAGS_HOLDER_ID,
    definitionId: UNIVERSAL_TAGS_HOLDER_ID,
    tags: universalTags,
    pools: {},
  });
}

/** Entity map including the synthetic universal holder for slot resolution. */
export function entitiesWithUniversal(
  state: EngineState,
  universalTags: TagCollection,
): Map<string, EntityInstance> {
  const next = new Map(state.entities);
  next.set(UNIVERSAL_TAGS_HOLDER_ID, createUniversalHolderEntity(universalTags));
  return next;
}

export function getActiveGame(doc: EngineDocument): EngineState {
  const game = doc.games.get(doc.settings.activeGameId);
  if (!game) {
    throw new Error(
      `activeGameId "${doc.settings.activeGameId}" is not present in games`,
    );
  }
  return game;
}

function assertNoReservedEntityIds(game: EngineState): void {
  if (game.entities.has(UNIVERSAL_TAGS_HOLDER_ID)) {
    throw new Error(
      `Game entities must not use reserved id "${UNIVERSAL_TAGS_HOLDER_ID}"`,
    );
  }
}

export function createEngineDocument(input: {
  gameId?: string;
  game?: EngineState;
  universalTags?: TagCollection | readonly Tag[];
  gameMeta?: ReadonlyMap<string, GameMeta> | Record<string, GameMeta>;
  games?: ReadonlyMap<string, EngineState> | Record<string, EngineState>;
  activeGameId?: string;
}): EngineDocument {
  const games = new Map<string, EngineState>();
  if (input.games) {
    if (input.games instanceof Map) {
      for (const [id, game] of input.games) {
        games.set(id, game);
      }
    } else {
      for (const [id, game] of Object.entries(input.games)) {
        games.set(id, game);
      }
    }
  }
  const gameId = input.gameId ?? DEFAULT_GAME_ID;
  if (input.game && !games.has(gameId)) {
    games.set(gameId, input.game);
  }
  if (games.size === 0) {
    throw new Error('createEngineDocument requires at least one game');
  }
  for (const game of games.values()) {
    assertNoReservedEntityIds(game);
  }
  const activeGameId = input.activeGameId ?? gameId;
  if (!games.has(activeGameId)) {
    throw new Error(
      `activeGameId "${activeGameId}" is not present in games`,
    );
  }
  const universalTags =
    input.universalTags instanceof TagCollection
      ? input.universalTags
      : TagCollection.create(input.universalTags ?? []);
  const gameMeta = new Map<string, GameMeta>();
  if (input.gameMeta) {
    if (input.gameMeta instanceof Map) {
      for (const [id, meta] of input.gameMeta) {
        gameMeta.set(id, meta);
      }
    } else {
      for (const [id, meta] of Object.entries(input.gameMeta)) {
        gameMeta.set(id, meta);
      }
    }
  }
  return {
    engineVersion: ENGINE_VERSION,
    settings: {
      activeGameId,
      universalTags,
    },
    games,
    gameMeta,
  };
}

/** Wrap a single playthrough as a document (empty universal tags). */
export function wrapGameAsDocument(
  game: EngineState,
  gameId: string = DEFAULT_GAME_ID,
): EngineDocument {
  return createEngineDocument({ gameId, game });
}

/** Load a nested game JSON without epoch checks (used for migration / nest). */
export function gameStateFromJSON(json: EngineStateJSON): EngineState {
  if (typeof json.primaryEntityId !== 'string' || !json.primaryEntityId) {
    throw new Error('gameStateFromJSON requires primaryEntityId');
  }
  return createEngineState({
    tick: json.tick ?? 0,
    entities: (json.entities ?? []).map(entityInstanceFromJSON),
    spawnCounts: json.spawnCounts ?? {},
    primaryEntityId: json.primaryEntityId,
    continuousActions: continuousActionsFromJSON(json.continuousActions),
    continuousProgress: continuousProgressFromJSON(json.continuousProgress),
  });
}

/**
 * Upgrade a 0.1 bare `EngineStateJSON` into a 0.2 document.
 * Does not require the saved epoch to match current ENGINE_VERSION.
 */
export function migrateEngineStateToDocument(
  json: EngineStateJSON,
  gameId: string = DEFAULT_GAME_ID,
): EngineDocument {
  return createEngineDocument({
    gameId,
    game: gameStateFromJSON(json),
  });
}

export function engineDocumentToJSON(doc: EngineDocument): EngineDocumentJSON {
  const games: Record<string, EngineStateJSON> = {};
  for (const [id, game] of doc.games) {
    games[id] = engineStateToJSON(game);
  }
  const gameMeta: Record<string, GameMeta> = {};
  for (const [id, meta] of doc.gameMeta) {
    gameMeta[id] = { ...meta };
  }
  return {
    engineVersion: doc.engineVersion,
    settings: {
      activeGameId: doc.settings.activeGameId,
      universalTags: doc.settings.universalTags.toJSON(),
    },
    games,
    ...(doc.gameMeta.size > 0 ? { gameMeta } : {}),
  };
}

export function engineDocumentFromJSON(json: EngineDocumentJSON): EngineDocument {
  assertCompatibleEngineVersion(json.engineVersion);
  if (!json.settings?.activeGameId) {
    throw new Error('engineDocumentFromJSON requires settings.activeGameId');
  }
  const games = new Map<string, EngineState>();
  for (const [id, gameJson] of Object.entries(json.games ?? {})) {
    games.set(id, gameStateFromJSON(gameJson));
  }
  return createEngineDocument({
    games,
    activeGameId: json.settings.activeGameId,
    universalTags: TagCollection.fromJSON(json.settings.universalTags ?? { tags: [] }),
    gameMeta: json.gameMeta,
  });
}

export function withActiveGame(
  doc: EngineDocument,
  game: EngineState,
): EngineDocument {
  assertNoReservedEntityIds(game);
  const games = new Map(doc.games);
  games.set(doc.settings.activeGameId, game);
  return { ...doc, engineVersion: ENGINE_VERSION, games };
}

export function withUniversalTags(
  doc: EngineDocument,
  universalTags: TagCollection,
): EngineDocument {
  return {
    ...doc,
    engineVersion: ENGINE_VERSION,
    settings: { ...doc.settings, universalTags },
  };
}

export function withActiveGameId(
  doc: EngineDocument,
  activeGameId: string,
): EngineDocument {
  if (!doc.games.has(activeGameId)) {
    throw new Error(`activeGameId "${activeGameId}" is not present in games`);
  }
  const prevId = doc.settings.activeGameId;
  const gameMeta = new Map(doc.gameMeta);
  const prev = doc.games.get(prevId);
  if (prev) {
    gameMeta.set(prevId, {
      ...gameMeta.get(prevId),
      lastActiveTick: prev.tick,
    });
  }
  return {
    ...doc,
    engineVersion: ENGINE_VERSION,
    settings: { ...doc.settings, activeGameId },
    gameMeta,
  };
}

export function collectionHasHeldSlot(
  tags: TagCollection,
  slotId: string,
): boolean {
  return tags.list().some((tag) => tag.slot === slotId);
}

/** Unslotted universal roots + dependents (for tag presence / primary passives). */
export function selectUniversalUnslottedActiveTags(
  universalTags: TagCollection,
): readonly Tag[] {
  const out: Tag[] = [];
  const seen = new Set<string>();
  const flatten = (root: Tag): void => {
    for (const child of root.dependentTags ?? []) {
      if (seen.has(child.name)) {
        continue;
      }
      seen.add(child.name);
      out.push(createTag(child));
      flatten(child);
    }
  };
  for (const tag of universalTags.list()) {
    if (tag.slot) {
      continue;
    }
    if (!seen.has(tag.name)) {
      seen.add(tag.name);
      out.push(createTag(tag));
    }
    flatten(tag);
  }
  return out;
}
