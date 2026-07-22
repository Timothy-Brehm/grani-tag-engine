import { TagCollection } from './tag-collection';
import type { Tag } from './tag';
import type { EngineContext } from './context';
import {
  createEntityInstance,
  entityInstanceFromJSON,
  entityInstanceToJSON,
  type EntityInstance,
  type EntityInstanceJSON,
} from './entity';

/** Serializable, framework-neutral engine slice owned by the core package. */
export interface EngineState {
  /** Monotonic tick counter advanced by the `tick` command. */
  readonly tick: number;
  /** In-play entity instances keyed by stable instance id. */
  readonly entities: ReadonlyMap<string, EntityInstance>;
  /** Lifetime spawn counts keyed by definition id. */
  readonly spawnCounts: Readonly<Record<string, number>>;
  /**
   * Optional primary entity (e.g. the player). First-class engine concept;
   * hosts may treat it as the default actor.
   */
  readonly primaryEntityId: string | undefined;
}

export type EngineStateJSON = {
  tick: number;
  entities: EntityInstanceJSON[];
  spawnCounts: Record<string, number>;
  primaryEntityId?: string;
};

export function createEngineState(
  input: {
    tick?: number;
    entities?: readonly EntityInstance[];
    spawnCounts?: Readonly<Record<string, number>>;
    primaryEntityId?: string;
  } = {},
): EngineState {
  const entities = new Map<string, EntityInstance>();
  for (const entity of input.entities ?? []) {
    if (!entities.has(entity.id)) {
      entities.set(entity.id, entity);
    }
  }
  const primaryEntityId = input.primaryEntityId;
  if (primaryEntityId !== undefined && !entities.has(primaryEntityId)) {
    throw new Error(
      `primaryEntityId "${primaryEntityId}" is not present in entities`,
    );
  }
  return {
    tick: input.tick ?? 0,
    entities,
    spawnCounts: Object.freeze({ ...(input.spawnCounts ?? {}) }),
    primaryEntityId,
  };
}

export function engineStateToJSON(state: EngineState): EngineStateJSON {
  return {
    tick: state.tick,
    entities: [...state.entities.values()].map(entityInstanceToJSON),
    spawnCounts: { ...state.spawnCounts },
    ...(state.primaryEntityId !== undefined
      ? { primaryEntityId: state.primaryEntityId }
      : {}),
  };
}

export function engineStateFromJSON(json: EngineStateJSON): EngineState {
  return createEngineState({
    tick: json.tick ?? 0,
    entities: (json.entities ?? []).map(entityInstanceFromJSON),
    spawnCounts: json.spawnCounts ?? {},
    primaryEntityId: json.primaryEntityId,
  });
}

export type ActionRoles = {
  readonly actorEntityId?: string;
  readonly sourceEntityId?: string;
  readonly targetEntityId?: string;
};

/** View engine state as an evaluation context for a host payload. */
export function toEngineContext<THost>(
  state: EngineState,
  host: THost,
  roles: ActionRoles = {},
): EngineContext<THost> {
  const focusId =
    roles.actorEntityId ?? roles.sourceEntityId ?? roles.targetEntityId;
  const focus = focusId ? state.entities.get(focusId) : undefined;
  return {
    engine: state,
    host,
    tags: focus?.tags ?? TagCollection.create(),
    actorEntityId: roles.actorEntityId,
    sourceEntityId: roles.sourceEntityId,
    targetEntityId: roles.targetEntityId,
  };
}

export function withEngineTick(state: EngineState, tick: number): EngineState {
  return { ...state, tick };
}

export function withEngineEntities(
  state: EngineState,
  entities: ReadonlyMap<string, EntityInstance>,
): EngineState {
  return { ...state, entities };
}

export function withEngineSpawnCounts(
  state: EngineState,
  spawnCounts: Readonly<Record<string, number>>,
): EngineState {
  return { ...state, spawnCounts: Object.freeze({ ...spawnCounts }) };
}

export function withPrimaryEntityId(
  state: EngineState,
  primaryEntityId: string | undefined,
): EngineState {
  if (primaryEntityId !== undefined && !state.entities.has(primaryEntityId)) {
    throw new Error(
      `primaryEntityId "${primaryEntityId}" is not present in entities`,
    );
  }
  return { ...state, primaryEntityId };
}

export function upsertEntity(
  state: EngineState,
  entity: EntityInstance,
): EngineState {
  const next = new Map(state.entities);
  next.set(entity.id, entity);
  return withEngineEntities(state, next);
}

export function removeEntity(
  state: EngineState,
  entityId: string,
): EngineState {
  if (!state.entities.has(entityId)) {
    return state;
  }
  const next = new Map(state.entities);
  next.delete(entityId);
  const clearedPrimary =
    state.primaryEntityId === entityId
      ? { ...withEngineEntities(state, next), primaryEntityId: undefined }
      : withEngineEntities(state, next);
  return clearedPrimary;
}

/** Convenience when constructing a one-off entity for tests. */
export function createTaggedEntity(input: {
  id: string;
  definitionId?: string;
  tags?: readonly Tag[] | TagCollection;
}): EntityInstance {
  return createEntityInstance({
    id: input.id,
    definitionId: input.definitionId ?? input.id,
    tags: input.tags,
  });
}
