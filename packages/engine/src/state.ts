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
   * Required primary entity (typically the primary character).
   * Must always refer to an id present in `entities`.
   * Hosts may treat it as the default actor; run-wide facts often live here.
   */
  readonly primaryEntityId: string;
}

export type EngineStateJSON = {
  tick: number;
  entities: EntityInstanceJSON[];
  spawnCounts: Record<string, number>;
  primaryEntityId: string;
};

export function createEngineState(input: {
  tick?: number;
  entities: readonly EntityInstance[];
  spawnCounts?: Readonly<Record<string, number>>;
  primaryEntityId: string;
}): EngineState {
  const entities = new Map<string, EntityInstance>();
  for (const entity of input.entities) {
    if (!entities.has(entity.id)) {
      entities.set(entity.id, entity);
    }
  }
  if (entities.size === 0) {
    throw new Error('createEngineState requires at least one entity');
  }
  const primaryEntityId = input.primaryEntityId;
  if (!entities.has(primaryEntityId)) {
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
    primaryEntityId: state.primaryEntityId,
  };
}

export function engineStateFromJSON(json: EngineStateJSON): EngineState {
  if (typeof json.primaryEntityId !== 'string' || !json.primaryEntityId) {
    throw new Error('engineStateFromJSON requires primaryEntityId');
  }
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

/** Retarget the required primary pointer; `entityId` must exist. */
export function withPrimaryEntityId(
  state: EngineState,
  primaryEntityId: string,
): EngineState {
  if (!state.entities.has(primaryEntityId)) {
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
  if (state.primaryEntityId === entityId) {
    throw new Error(
      `Cannot remove primary entity "${entityId}"; set-primary-entity to another entity first`,
    );
  }
  const next = new Map(state.entities);
  next.delete(entityId);
  return withEngineEntities(state, next);
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

/**
 * Build a valid engine with a required primary entity (and optional others).
 * Primary is included automatically; do not duplicate it in `others`.
 */
export function createPrimaryEngineState(
  primary: EntityInstance,
  options: {
    readonly tick?: number;
    readonly others?: readonly EntityInstance[];
    readonly spawnCounts?: Readonly<Record<string, number>>;
  } = {},
): EngineState {
  const others = (options.others ?? []).filter(
    (entity) => entity.id !== primary.id,
  );
  return createEngineState({
    tick: options.tick,
    entities: [primary, ...others],
    primaryEntityId: primary.id,
    spawnCounts: options.spawnCounts ?? { [primary.definitionId]: 1 },
  });
}
