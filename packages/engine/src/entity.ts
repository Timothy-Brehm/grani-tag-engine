import { TagCollection, type TagCollectionJSON } from './tag-collection';
import type { Tag } from './tag';
import type { ActionDefinition } from './action';
import type { ActiveEffect } from './effect';
import type { Requirement } from './requirement';

/** Who an effect or requirement resolves against. */
export type EntityScope = 'actor' | 'source' | 'target';

export type EntityPoolMap = Readonly<Record<string, number>>;

/** Serializable in-play entity instance. */
export interface EntityInstance {
  readonly id: string;
  readonly definitionId: string;
  readonly tags: TagCollection;
  /** Current pool amounts keyed by pool id. */
  readonly pools: EntityPoolMap;
}

export type EntityInstanceJSON = {
  id: string;
  definitionId: string;
  tags: TagCollectionJSON;
  pools: Record<string, number>;
};

/** Catalog definition used when spawning or listing actions. */
export interface EntityDefinition {
  readonly id: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly initialTags?: readonly Tag[];
  /** Starting current pool values (maxima still come from tags). */
  readonly initialPools?: EntityPoolMap;
  readonly actions?: readonly ActionDefinition<
    Requirement,
    ActiveEffect,
    unknown
  >[];
  /** Max concurrent instances of this definition. */
  readonly maxActive?: number;
  /** Max lifetime spawns of this definition. */
  readonly maxCreated?: number;
}

export function createEntityInstance(input: {
  id: string;
  definitionId: string;
  tags?: readonly Tag[] | TagCollection;
  pools?: EntityPoolMap;
}): EntityInstance {
  const tags =
    input.tags instanceof TagCollection
      ? input.tags
      : TagCollection.create(input.tags ?? []);
  return {
    id: input.id,
    definitionId: input.definitionId,
    tags,
    pools: Object.freeze({ ...(input.pools ?? {}) }),
  };
}

export function entityInstanceToJSON(
  entity: EntityInstance,
): EntityInstanceJSON {
  return {
    id: entity.id,
    definitionId: entity.definitionId,
    tags: entity.tags.toJSON(),
    pools: { ...entity.pools },
  };
}

export function entityInstanceFromJSON(
  json: EntityInstanceJSON,
): EntityInstance {
  return createEntityInstance({
    id: json.id,
    definitionId: json.definitionId,
    tags: TagCollection.fromJSON(json.tags ?? { tags: [] }),
    pools: json.pools ?? {},
  });
}

export function withEntityTags(
  entity: EntityInstance,
  tags: TagCollection,
): EntityInstance {
  return { ...entity, tags };
}

export function withEntityPools(
  entity: EntityInstance,
  pools: EntityPoolMap,
): EntityInstance {
  return { ...entity, pools: Object.freeze({ ...pools }) };
}

export function adjustEntityPool(
  entity: EntityInstance,
  poolId: string,
  delta: number,
  max: number,
): EntityInstance {
  const current = entity.pools[poolId] ?? 0;
  const next = Math.min(
    max,
    Math.max(0, Number((current + delta).toFixed(2))),
  );
  return withEntityPools(entity, { ...entity.pools, [poolId]: next });
}

/** Instantiate an entity from a definition (does not enforce spawn limits). */
export function instantiateEntity(
  definition: EntityDefinition,
  id: string,
): EntityInstance {
  return createEntityInstance({
    id,
    definitionId: definition.id,
    tags: definition.initialTags,
    pools: definition.initialPools,
  });
}
