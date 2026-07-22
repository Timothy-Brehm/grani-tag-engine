import type { EntityInstance, EntityPoolMap } from './entity';
import { selectPoolCurrent, selectPoolMax, selectStatValue } from './selectors';
import type { Tag } from './tag';

function withMetrics(
  entity: EntityInstance,
  metrics: EntityMetrics,
): EntityInstance {
  return { ...entity, metrics };
}

/** Per-action execution counters on an entity (usually the actor). */
export type ActionCountMetric = {
  readonly manual: number;
  readonly automatic: number;
  readonly total: number;
  /** Engine tick when this action first ran on the entity. */
  readonly firstTick: number;
  /** Engine tick when this action last ran on the entity. */
  readonly lastTick: number;
};

/** Lifetime spend from a pool (not current stock). */
export type LifetimeUsedMetric = {
  readonly amount: number;
  readonly firstTick: number;
  readonly lastTick: number;
};

/**
 * Engine-owned metrics for hanging requirements/effects off history,
 * not only live UI values. Timing uses engine `tick`, not wall-clock.
 */
export type EntityMetrics = {
  readonly actionCounts: Readonly<Record<string, ActionCountMetric>>;
  /** High-water mark of pool current values. */
  readonly poolHighWater: Readonly<Record<string, number>>;
  /** Tick when each pool high-water last rose. */
  readonly poolHighWaterAtTick: Readonly<Record<string, number>>;
  /** Low-water mark of pool current values (e.g. ever hit 0 Life). */
  readonly poolLowWater: Readonly<Record<string, number>>;
  /** Tick when each pool low-water last fell. */
  readonly poolLowWaterAtTick: Readonly<Record<string, number>>;
  /** High-water mark of derived pool maxima. */
  readonly poolMaxHighWater: Readonly<Record<string, number>>;
  readonly poolMaxHighWaterAtTick: Readonly<Record<string, number>>;
  /** High-water mark of derived stat/trait values. */
  readonly statHighWater: Readonly<Record<string, number>>;
  readonly statHighWaterAtTick: Readonly<Record<string, number>>;
  /** Low-water mark of derived stat/trait values. */
  readonly statLowWater: Readonly<Record<string, number>>;
  readonly statLowWaterAtTick: Readonly<Record<string, number>>;
  /**
   * Lifetime amount spent from each pool (sum of actual decreases).
   * Does not include current holdings or gains.
   */
  readonly poolLifetimeUsed: Readonly<Record<string, LifetimeUsedMetric>>;
  /**
   * Tick when each tag name was first granted on this entity.
   * Kept after removal so history remains queryable.
   */
  readonly tagGrantedAt: Readonly<Record<string, number>>;
};

export type EntityMetricsJSON = {
  actionCounts?: Record<string, Partial<ActionCountMetric> & object>;
  poolHighWater?: Record<string, number>;
  poolHighWaterAtTick?: Record<string, number>;
  poolLowWater?: Record<string, number>;
  poolLowWaterAtTick?: Record<string, number>;
  poolMaxHighWater?: Record<string, number>;
  poolMaxHighWaterAtTick?: Record<string, number>;
  statHighWater?: Record<string, number>;
  statHighWaterAtTick?: Record<string, number>;
  statLowWater?: Record<string, number>;
  statLowWaterAtTick?: Record<string, number>;
  poolLifetimeUsed?: Record<string, number | LifetimeUsedMetric>;
  tagGrantedAt?: Record<string, number>;
};

export type ActionExecutionKind = 'manual' | 'automatic';

export function emptyEntityMetrics(): EntityMetrics {
  return {
    actionCounts: Object.freeze({}),
    poolHighWater: Object.freeze({}),
    poolHighWaterAtTick: Object.freeze({}),
    poolLowWater: Object.freeze({}),
    poolLowWaterAtTick: Object.freeze({}),
    poolMaxHighWater: Object.freeze({}),
    poolMaxHighWaterAtTick: Object.freeze({}),
    statHighWater: Object.freeze({}),
    statHighWaterAtTick: Object.freeze({}),
    statLowWater: Object.freeze({}),
    statLowWaterAtTick: Object.freeze({}),
    poolLifetimeUsed: Object.freeze({}),
    tagGrantedAt: Object.freeze({}),
  };
}

export function entityMetricsToJSON(metrics: EntityMetrics): EntityMetricsJSON {
  return {
    actionCounts: { ...metrics.actionCounts },
    poolHighWater: { ...metrics.poolHighWater },
    poolHighWaterAtTick: { ...metrics.poolHighWaterAtTick },
    poolLowWater: { ...metrics.poolLowWater },
    poolLowWaterAtTick: { ...metrics.poolLowWaterAtTick },
    poolMaxHighWater: { ...metrics.poolMaxHighWater },
    poolMaxHighWaterAtTick: { ...metrics.poolMaxHighWaterAtTick },
    statHighWater: { ...metrics.statHighWater },
    statHighWaterAtTick: { ...metrics.statHighWaterAtTick },
    statLowWater: { ...metrics.statLowWater },
    statLowWaterAtTick: { ...metrics.statLowWaterAtTick },
    poolLifetimeUsed: { ...metrics.poolLifetimeUsed },
    tagGrantedAt: { ...metrics.tagGrantedAt },
  };
}

function lifetimeUsedFromJSON(
  value: number | LifetimeUsedMetric | undefined,
): LifetimeUsedMetric | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number') {
    return { amount: value, firstTick: 0, lastTick: 0 };
  }
  return {
    amount: value.amount ?? 0,
    firstTick: value.firstTick ?? 0,
    lastTick: value.lastTick ?? value.firstTick ?? 0,
  };
}

export function entityMetricsFromJSON(
  json: EntityMetricsJSON | undefined,
): EntityMetrics {
  if (!json) {
    return emptyEntityMetrics();
  }
  const actionCounts: Record<string, ActionCountMetric> = {};
  for (const [actionId, counts] of Object.entries(json.actionCounts ?? {})) {
    const manual = counts?.manual ?? 0;
    const automatic = counts?.automatic ?? 0;
    const total = counts?.total ?? manual + automatic;
    actionCounts[actionId] = {
      manual,
      automatic,
      total,
      firstTick: counts?.firstTick ?? 0,
      lastTick: counts?.lastTick ?? counts?.firstTick ?? 0,
    };
  }
  const poolLifetimeUsed: Record<string, LifetimeUsedMetric> = {};
  for (const [pool, value] of Object.entries(json.poolLifetimeUsed ?? {})) {
    const parsed = lifetimeUsedFromJSON(value);
    if (parsed) {
      poolLifetimeUsed[pool] = parsed;
    }
  }
  return {
    actionCounts: Object.freeze(actionCounts),
    poolHighWater: Object.freeze({ ...(json.poolHighWater ?? {}) }),
    poolHighWaterAtTick: Object.freeze({ ...(json.poolHighWaterAtTick ?? {}) }),
    poolLowWater: Object.freeze({ ...(json.poolLowWater ?? {}) }),
    poolLowWaterAtTick: Object.freeze({ ...(json.poolLowWaterAtTick ?? {}) }),
    poolMaxHighWater: Object.freeze({ ...(json.poolMaxHighWater ?? {}) }),
    poolMaxHighWaterAtTick: Object.freeze({
      ...(json.poolMaxHighWaterAtTick ?? {}),
    }),
    statHighWater: Object.freeze({ ...(json.statHighWater ?? {}) }),
    statHighWaterAtTick: Object.freeze({ ...(json.statHighWaterAtTick ?? {}) }),
    statLowWater: Object.freeze({ ...(json.statLowWater ?? {}) }),
    statLowWaterAtTick: Object.freeze({ ...(json.statLowWaterAtTick ?? {}) }),
    poolLifetimeUsed: Object.freeze(poolLifetimeUsed),
    tagGrantedAt: Object.freeze({ ...(json.tagGrantedAt ?? {}) }),
  };
}

function hasOwn(
  record: Readonly<Record<string, number>>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function maxRecord(
  previous: Readonly<Record<string, number>>,
  key: string,
  value: number,
): Record<string, number> {
  if (!hasOwn(previous, key)) {
    return { ...previous, [key]: value };
  }
  if (value <= previous[key]!) {
    return previous as Record<string, number>;
  }
  return { ...previous, [key]: value };
}

function minRecord(
  previous: Readonly<Record<string, number>>,
  key: string,
  value: number,
): Record<string, number> {
  if (!hasOwn(previous, key)) {
    return { ...previous, [key]: value };
  }
  if (value >= previous[key]!) {
    return previous as Record<string, number>;
  }
  return { ...previous, [key]: value };
}

function collectTaggedKeys(
  tags: Iterable<Tag>,
  effectType: string,
  field: string,
): Set<string> {
  const keys = new Set<string>();
  for (const tag of tags) {
    for (const effect of tag.effects) {
      if (effect.type !== effectType) {
        continue;
      }
      const payload = effect as Tag['effects'][number] & Record<string, unknown>;
      const key = payload[field];
      if (typeof key === 'string') {
        keys.add(key);
      }
    }
  }
  return keys;
}

export function seedTagGrantedAt(
  tags: { list(): readonly Tag[] },
  tick: number,
): Readonly<Record<string, number>> {
  const granted: Record<string, number> = {};
  for (const tag of tags.list()) {
    granted[tag.name] = tick;
  }
  return Object.freeze(granted);
}

/**
 * Update high- and low-water marks from current pools, pool-max, and stats.
 * High-waters only rise; low-waters only fall (after first observation).
 * When a mark changes, its `*AtTick` map stores `tick`.
 */
export function refreshEntityHighWaters(
  entity: EntityInstance,
  tick = 0,
): EntityInstance {
  let poolHighWater = entity.metrics.poolHighWater as Record<string, number>;
  let poolHighWaterAtTick = entity.metrics
    .poolHighWaterAtTick as Record<string, number>;
  let poolLowWater = entity.metrics.poolLowWater as Record<string, number>;
  let poolLowWaterAtTick = entity.metrics
    .poolLowWaterAtTick as Record<string, number>;
  let poolMaxHighWater = entity.metrics
    .poolMaxHighWater as Record<string, number>;
  let poolMaxHighWaterAtTick = entity.metrics
    .poolMaxHighWaterAtTick as Record<string, number>;
  let statHighWater = entity.metrics.statHighWater as Record<string, number>;
  let statHighWaterAtTick = entity.metrics
    .statHighWaterAtTick as Record<string, number>;
  let statLowWater = entity.metrics.statLowWater as Record<string, number>;
  let statLowWaterAtTick = entity.metrics
    .statLowWaterAtTick as Record<string, number>;
  let changed = false;

  const touchPool = (pool: string, value: number) => {
    const nextHigh = maxRecord(poolHighWater, pool, value);
    if (nextHigh !== poolHighWater) {
      poolHighWater = nextHigh;
      poolHighWaterAtTick = { ...poolHighWaterAtTick, [pool]: tick };
      changed = true;
    }
    const nextLow = minRecord(poolLowWater, pool, value);
    if (nextLow !== poolLowWater) {
      poolLowWater = nextLow;
      poolLowWaterAtTick = { ...poolLowWaterAtTick, [pool]: tick };
      changed = true;
    }
  };
  const raisePoolMax = (pool: string, value: number) => {
    const next = maxRecord(poolMaxHighWater, pool, value);
    if (next !== poolMaxHighWater) {
      poolMaxHighWater = next;
      poolMaxHighWaterAtTick = { ...poolMaxHighWaterAtTick, [pool]: tick };
      changed = true;
    }
  };
  const touchStat = (stat: string, value: number) => {
    const nextHigh = maxRecord(statHighWater, stat, value);
    if (nextHigh !== statHighWater) {
      statHighWater = nextHigh;
      statHighWaterAtTick = { ...statHighWaterAtTick, [stat]: tick };
      changed = true;
    }
    const nextLow = minRecord(statLowWater, stat, value);
    if (nextLow !== statLowWater) {
      statLowWater = nextLow;
      statLowWaterAtTick = { ...statLowWaterAtTick, [stat]: tick };
      changed = true;
    }
  };

  for (const pool of Object.keys(entity.pools)) {
    touchPool(pool, selectPoolCurrent(entity, pool));
  }

  const poolKeys = collectTaggedKeys(entity.tags.list(), 'pool-max', 'pool');
  for (const pool of poolKeys) {
    touchPool(pool, selectPoolCurrent(entity, pool));
    raisePoolMax(pool, selectPoolMax(entity, pool));
  }

  const statKeys = collectTaggedKeys(entity.tags.list(), 'stat', 'stat');
  for (const stat of statKeys) {
    touchStat(stat, selectStatValue(entity, stat));
  }

  if (!changed) {
    return entity;
  }

  return withMetrics(entity, {
    ...entity.metrics,
    poolHighWater: Object.freeze(poolHighWater),
    poolHighWaterAtTick: Object.freeze(poolHighWaterAtTick),
    poolLowWater: Object.freeze(poolLowWater),
    poolLowWaterAtTick: Object.freeze(poolLowWaterAtTick),
    poolMaxHighWater: Object.freeze(poolMaxHighWater),
    poolMaxHighWaterAtTick: Object.freeze(poolMaxHighWaterAtTick),
    statHighWater: Object.freeze(statHighWater),
    statHighWaterAtTick: Object.freeze(statHighWaterAtTick),
    statLowWater: Object.freeze(statLowWater),
    statLowWaterAtTick: Object.freeze(statLowWaterAtTick),
  });
}

/** Seed pool high/low water from starting currents before full tag-derived refresh. */
export function seedPoolHighWatersFromPools(
  pools: EntityPoolMap,
): Readonly<Record<string, number>> {
  return Object.freeze({ ...pools });
}

export function seedPoolLowWatersFromPools(
  pools: EntityPoolMap,
): Readonly<Record<string, number>> {
  return Object.freeze({ ...pools });
}

/**
 * Ensure every current tag name has a first-granted tick (new names get `tick`).
 * Does not clear timestamps when tags are removed.
 */
export function recordTagGrants(
  entity: EntityInstance,
  tags: { list(): readonly Tag[] },
  tick: number,
): EntityInstance {
  let tagGrantedAt = entity.metrics.tagGrantedAt as Record<string, number>;
  let changed = false;
  for (const tag of tags.list()) {
    if (!hasOwn(tagGrantedAt, tag.name)) {
      tagGrantedAt = { ...tagGrantedAt, [tag.name]: tick };
      changed = true;
    }
  }
  if (!changed) {
    return entity;
  }
  return withMetrics(entity, {
    ...entity.metrics,
    tagGrantedAt: Object.freeze(tagGrantedAt),
  });
}

export function recordActionExecution(
  entity: EntityInstance,
  actionId: string,
  kind: ActionExecutionKind,
  tick: number,
): EntityInstance {
  const previous = entity.metrics.actionCounts[actionId];
  const nextCounts: ActionCountMetric = {
    manual: (previous?.manual ?? 0) + (kind === 'manual' ? 1 : 0),
    automatic: (previous?.automatic ?? 0) + (kind === 'automatic' ? 1 : 0),
    total: (previous?.total ?? 0) + 1,
    firstTick: previous?.firstTick ?? tick,
    lastTick: tick,
  };
  return withMetrics(entity, {
    ...entity.metrics,
    actionCounts: Object.freeze({
      ...entity.metrics.actionCounts,
      [actionId]: nextCounts,
    }),
  });
}

/**
 * Add to lifetime pool usage. `amount` should be the actual spent quantity
 * (positive). Does not change the current pool.
 */
export function recordPoolLifetimeUsed(
  entity: EntityInstance,
  poolId: string,
  amount: number,
  tick: number,
): EntityInstance {
  if (amount <= 0) {
    return entity;
  }
  const previous = entity.metrics.poolLifetimeUsed[poolId];
  const next: LifetimeUsedMetric = {
    amount: Number(((previous?.amount ?? 0) + amount).toFixed(2)),
    firstTick: previous?.firstTick ?? tick,
    lastTick: tick,
  };
  return withMetrics(entity, {
    ...entity.metrics,
    poolLifetimeUsed: Object.freeze({
      ...entity.metrics.poolLifetimeUsed,
      [poolId]: next,
    }),
  });
}

export function selectActionCount(
  entity: EntityInstance,
  actionId: string,
  channel: 'manual' | 'automatic' | 'total' = 'total',
): number {
  const counts = entity.metrics.actionCounts[actionId];
  if (!counts) {
    return 0;
  }
  return counts[channel];
}

export function selectActionFirstTick(
  entity: EntityInstance,
  actionId: string,
): number | undefined {
  return entity.metrics.actionCounts[actionId]?.firstTick;
}

export function selectActionLastTick(
  entity: EntityInstance,
  actionId: string,
): number | undefined {
  return entity.metrics.actionCounts[actionId]?.lastTick;
}

export function selectPoolLifetimeUsed(
  entity: EntityInstance,
  pool: string,
): number {
  return entity.metrics.poolLifetimeUsed[pool]?.amount ?? 0;
}

export function selectPoolLifetimeUsedFirstTick(
  entity: EntityInstance,
  pool: string,
): number | undefined {
  return entity.metrics.poolLifetimeUsed[pool]?.firstTick;
}

export function selectPoolLifetimeUsedLastTick(
  entity: EntityInstance,
  pool: string,
): number | undefined {
  return entity.metrics.poolLifetimeUsed[pool]?.lastTick;
}

export function selectTagGrantedAt(
  entity: EntityInstance,
  tagName: string,
): number | undefined {
  return hasOwn(entity.metrics.tagGrantedAt, tagName)
    ? entity.metrics.tagGrantedAt[tagName]
    : undefined;
}

export function selectPoolHighWater(
  entity: EntityInstance,
  pool: string,
): number {
  return entity.metrics.poolHighWater[pool] ?? 0;
}

/** Lowest pool current observed; `undefined` if never tracked. */
export function selectPoolLowWater(
  entity: EntityInstance,
  pool: string,
): number | undefined {
  return hasOwn(entity.metrics.poolLowWater, pool)
    ? entity.metrics.poolLowWater[pool]
    : undefined;
}

export function selectPoolMaxHighWater(
  entity: EntityInstance,
  pool: string,
): number {
  return entity.metrics.poolMaxHighWater[pool] ?? 0;
}

export function selectStatHighWater(
  entity: EntityInstance,
  stat: string,
): number {
  return entity.metrics.statHighWater[stat] ?? 0;
}

/** Lowest stat observed; `undefined` if never tracked. */
export function selectStatLowWater(
  entity: EntityInstance,
  stat: string,
): number | undefined {
  return hasOwn(entity.metrics.statLowWater, stat)
    ? entity.metrics.statLowWater[stat]
    : undefined;
}
