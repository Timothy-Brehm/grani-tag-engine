import { TagCollection, type TagCollectionJSON } from './tag-collection';
import type { Tag } from './tag';
import type { ActionDefinition } from './action';
import type { ActiveEffect } from './effect';
import type { Requirement } from './requirement';
import type { NoveltyAck } from './novelty-types';
import {
  emptyEntityMetrics,
  entityMetricsFromJSON,
  entityMetricsToJSON,
  recordPoolLifetimeUsed,
  recordTagGrants,
  refreshEntityHighWaters,
  seedPoolHighWatersFromPools,
  seedPoolLowWatersFromPools,
  seedTagGrantedAt,
  type EntityMetrics,
  type EntityMetricsJSON,
} from './metrics';

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
  /** Tracked counters and water marks for gates/effects. */
  readonly metrics: EntityMetrics;
}

export type EntityInstanceJSON = {
  id: string;
  definitionId: string;
  tags: TagCollectionJSON;
  pools: Record<string, number>;
  metrics?: EntityMetricsJSON;
  /** @deprecated Ignored; novelty is tag-based now. */
  novelty?: unknown;
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
  /**
   * When set, the entity instance is novel while `seenTag` is absent on scope.
   */
  readonly novelty?: NoveltyAck;
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
  metrics?: EntityMetrics;
  /** Engine tick used to stamp initial watermarks / tag grants. Default 0. */
  tick?: number;
}): EntityInstance {
  const tick = input.tick ?? 0;
  const tags =
    input.tags instanceof TagCollection
      ? input.tags
      : TagCollection.create(input.tags ?? []);
  const pools = Object.freeze({ ...(input.pools ?? {}) });
  const baseMetrics = input.metrics ?? {
    ...emptyEntityMetrics(),
    poolHighWater: seedPoolHighWatersFromPools(pools),
    poolLowWater: seedPoolLowWatersFromPools(pools),
    tagGrantedAt: seedTagGrantedAt(tags, tick),
  };
  const base: EntityInstance = {
    id: input.id,
    definitionId: input.definitionId,
    tags,
    pools,
    metrics: baseMetrics,
  };
  return refreshEntityHighWaters(recordTagGrants(base, tags, tick), tick);
}

export function entityInstanceToJSON(
  entity: EntityInstance,
): EntityInstanceJSON {
  return {
    id: entity.id,
    definitionId: entity.definitionId,
    tags: entity.tags.toJSON(),
    pools: { ...entity.pools },
    metrics: entityMetricsToJSON(entity.metrics),
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
    metrics: json.metrics ? entityMetricsFromJSON(json.metrics) : undefined,
  });
}

export function withEntityTags(
  entity: EntityInstance,
  tags: TagCollection,
  tick = 0,
): EntityInstance {
  const withGrants = recordTagGrants(entity, tags, tick);
  return refreshEntityHighWaters({ ...withGrants, tags }, tick);
}

export function withEntityPools(
  entity: EntityInstance,
  pools: EntityPoolMap,
  tick = 0,
): EntityInstance {
  return refreshEntityHighWaters(
    {
      ...entity,
      pools: Object.freeze({ ...pools }),
    },
    tick,
  );
}

export function withEntityMetrics(
  entity: EntityInstance,
  metrics: EntityMetrics,
): EntityInstance {
  return { ...entity, metrics };
}

export function adjustEntityPool(
  entity: EntityInstance,
  poolId: string,
  delta: number,
  max: number,
  tick = 0,
): EntityInstance {
  const current = entity.pools[poolId] ?? 0;
  const next = Math.min(
    max,
    Math.max(0, Number((current + delta).toFixed(2))),
  );
  const actualDelta = next - current;
  let updated = withEntityPools(
    entity,
    { ...entity.pools, [poolId]: next },
    tick,
  );
  if (actualDelta < 0) {
    updated = recordPoolLifetimeUsed(updated, poolId, -actualDelta, tick);
  }
  return updated;
}

/** Instantiate an entity from a definition (does not enforce spawn limits). */
export function instantiateEntity(
  definition: EntityDefinition,
  id: string,
  tick = 0,
): EntityInstance {
  return createEntityInstance({
    id,
    definitionId: definition.id,
    tags: definition.initialTags,
    pools: definition.initialPools,
    tick,
  });
}
