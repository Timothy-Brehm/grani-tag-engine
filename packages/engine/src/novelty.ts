import type { EntityInstance } from './entity';
import { selectPoolMax, selectStatValue } from './selectors';
import type { Tag } from './tag';

/** Ticks a pool/stat must be sheet-shown before auto `seen` (≈seconds at 1 tick/sec). */
export const NOVELTY_AUTO_SEEN_TICKS = 30;

export type EntityNovelty = {
  /** False until host acknowledges the entity (bootstrap should set true). */
  readonly entitySeen: boolean;
  /** Action ids acknowledged as seen. Offered + missing ⇒ new. */
  readonly seenActions: Readonly<Record<string, true>>;
  readonly seenPools: Readonly<Record<string, true>>;
  readonly seenStats: Readonly<Record<string, true>>;
  /** Cumulative ticks while reported shown on the selected entity sheet. */
  readonly poolShownTicks: Readonly<Record<string, number>>;
  readonly statShownTicks: Readonly<Record<string, number>>;
};

export type EntityNoveltyJSON = {
  entitySeen?: boolean;
  seenActions?: Record<string, true | boolean>;
  seenPools?: Record<string, true | boolean>;
  seenStats?: Record<string, true | boolean>;
  poolShownTicks?: Record<string, number>;
  statShownTicks?: Record<string, number>;
};

export function emptyEntityNovelty(entitySeen = false): EntityNovelty {
  return {
    entitySeen,
    seenActions: Object.freeze({}),
    seenPools: Object.freeze({}),
    seenStats: Object.freeze({}),
    poolShownTicks: Object.freeze({}),
    statShownTicks: Object.freeze({}),
  };
}

function freezeTrueMap(
  input: Readonly<Record<string, true | boolean>> | undefined,
): Readonly<Record<string, true>> {
  const out: Record<string, true> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value) {
      out[key] = true;
    }
  }
  return Object.freeze(out);
}

export function entityNoveltyToJSON(novelty: EntityNovelty): EntityNoveltyJSON {
  return {
    entitySeen: novelty.entitySeen,
    seenActions: { ...novelty.seenActions },
    seenPools: { ...novelty.seenPools },
    seenStats: { ...novelty.seenStats },
    poolShownTicks: { ...novelty.poolShownTicks },
    statShownTicks: { ...novelty.statShownTicks },
  };
}

export function entityNoveltyFromJSON(
  json: EntityNoveltyJSON | undefined,
): EntityNovelty {
  if (!json) {
    return emptyEntityNovelty(false);
  }
  return {
    entitySeen: json.entitySeen ?? false,
    seenActions: freezeTrueMap(json.seenActions),
    seenPools: freezeTrueMap(json.seenPools),
    seenStats: freezeTrueMap(json.seenStats),
    poolShownTicks: Object.freeze({ ...(json.poolShownTicks ?? {}) }),
    statShownTicks: Object.freeze({ ...(json.statShownTicks ?? {}) }),
  };
}

function withNovelty(
  entity: EntityInstance,
  novelty: EntityNovelty,
): EntityInstance {
  return { ...entity, novelty };
}

function collectStatKeys(tags: { list(): readonly Tag[] }): string[] {
  const keys = new Set<string>();
  for (const tag of tags.list()) {
    for (const effect of tag.effects) {
      if (effect.type !== 'stat') {
        continue;
      }
      const payload = effect as Tag['effects'][number] & Record<string, unknown>;
      if (typeof payload.stat === 'string') {
        keys.add(payload.stat);
      }
    }
  }
  return [...keys];
}

function collectPoolKeys(entity: EntityInstance): string[] {
  const keys = new Set<string>(Object.keys(entity.pools));
  for (const tag of entity.tags.list()) {
    for (const effect of tag.effects) {
      if (effect.type !== 'pool-max') {
        continue;
      }
      const payload = effect as Tag['effects'][number] & Record<string, unknown>;
      if (typeof payload.pool === 'string') {
        keys.add(payload.pool);
      }
    }
  }
  return [...keys];
}

/**
 * Mark the entity and its current actions/pools/stats as seen.
 * Use for bootstrap loadout so starting content is not badged.
 */
export function markEntityNoveltySeen(
  entity: EntityInstance,
  offeredActionIds: readonly string[] = [],
): EntityInstance {
  const seenActions: Record<string, true> = { ...entity.novelty.seenActions };
  for (const actionId of offeredActionIds) {
    seenActions[actionId] = true;
  }
  const seenPools: Record<string, true> = { ...entity.novelty.seenPools };
  for (const pool of collectPoolKeys(entity)) {
    seenPools[pool] = true;
  }
  const seenStats: Record<string, true> = { ...entity.novelty.seenStats };
  for (const stat of collectStatKeys(entity.tags)) {
    seenStats[stat] = true;
  }
  return withNovelty(entity, {
    ...entity.novelty,
    entitySeen: true,
    seenActions: Object.freeze(seenActions),
    seenPools: Object.freeze(seenPools),
    seenStats: Object.freeze(seenStats),
  });
}

export function markEntitySeen(entity: EntityInstance): EntityInstance {
  if (entity.novelty.entitySeen) {
    return entity;
  }
  return withNovelty(entity, { ...entity.novelty, entitySeen: true });
}

export function markActionSeen(
  entity: EntityInstance,
  actionId: string,
): EntityInstance {
  if (entity.novelty.seenActions[actionId]) {
    return entity;
  }
  return withNovelty(entity, {
    ...entity.novelty,
    seenActions: Object.freeze({
      ...entity.novelty.seenActions,
      [actionId]: true,
    }),
  });
}

export function markPoolSeen(
  entity: EntityInstance,
  pool: string,
): EntityInstance {
  if (entity.novelty.seenPools[pool]) {
    return entity;
  }
  return withNovelty(entity, {
    ...entity.novelty,
    seenPools: Object.freeze({
      ...entity.novelty.seenPools,
      [pool]: true,
    }),
  });
}

export function markStatSeen(
  entity: EntityInstance,
  stat: string,
): EntityInstance {
  if (entity.novelty.seenStats[stat]) {
    return entity;
  }
  return withNovelty(entity, {
    ...entity.novelty,
    seenStats: Object.freeze({
      ...entity.novelty.seenStats,
      [stat]: true,
    }),
  });
}

/**
 * Accumulate one tick of “shown on character sheet” for the given pools/stats.
 * Auto-marks seen when shown ticks reach {@link NOVELTY_AUTO_SEEN_TICKS}.
 */
export function accumulateNoveltySheetShown(
  entity: EntityInstance,
  input: {
    readonly pools?: readonly string[];
    readonly stats?: readonly string[];
  },
): EntityInstance {
  let novelty = entity.novelty;
  let changed = false;

  const poolShownTicks = {
    ...novelty.poolShownTicks,
  } as Record<string, number>;
  const seenPools = { ...novelty.seenPools } as Record<string, true>;
  for (const pool of input.pools ?? []) {
    if (seenPools[pool]) {
      continue;
    }
    const next = (poolShownTicks[pool] ?? 0) + 1;
    poolShownTicks[pool] = next;
    changed = true;
    if (next >= NOVELTY_AUTO_SEEN_TICKS) {
      seenPools[pool] = true;
    }
  }

  const statShownTicks = {
    ...novelty.statShownTicks,
  } as Record<string, number>;
  const seenStats = { ...novelty.seenStats } as Record<string, true>;
  for (const stat of input.stats ?? []) {
    if (seenStats[stat]) {
      continue;
    }
    const next = (statShownTicks[stat] ?? 0) + 1;
    statShownTicks[stat] = next;
    changed = true;
    if (next >= NOVELTY_AUTO_SEEN_TICKS) {
      seenStats[stat] = true;
    }
  }

  if (!changed) {
    return entity;
  }

  return withNovelty(entity, {
    ...novelty,
    poolShownTicks: Object.freeze(poolShownTicks),
    statShownTicks: Object.freeze(statShownTicks),
    seenPools: Object.freeze(seenPools),
    seenStats: Object.freeze(seenStats),
  });
}

export function selectEntityIsNew(entity: EntityInstance): boolean {
  return !entity.novelty.entitySeen;
}

export function selectActionIsNew(
  entity: EntityInstance,
  actionId: string,
): boolean {
  return !entity.novelty.seenActions[actionId];
}

export function selectPoolIsNew(
  entity: EntityInstance,
  pool: string,
): boolean {
  if (entity.novelty.seenPools[pool]) {
    return false;
  }
  // Only badge pools that actually exist / have capacity on the entity.
  return (
    Object.prototype.hasOwnProperty.call(entity.pools, pool) ||
    selectPoolMax(entity, pool) > 0
  );
}

export function selectStatIsNew(
  entity: EntityInstance,
  stat: string,
): boolean {
  if (entity.novelty.seenStats[stat]) {
    return false;
  }
  return selectStatValue(entity, stat) !== 0 || collectStatKeys(entity.tags).includes(stat);
}

/**
 * True if the entity itself is new or it has any unseen offered actions /
 * present pools / present stats.
 */
export function selectEntityHasNew(
  entity: EntityInstance,
  offeredActionIds: readonly string[] = [],
): boolean {
  if (selectEntityIsNew(entity)) {
    return true;
  }
  for (const actionId of offeredActionIds) {
    if (selectActionIsNew(entity, actionId)) {
      return true;
    }
  }
  for (const pool of collectPoolKeys(entity)) {
    if (selectPoolIsNew(entity, pool)) {
      return true;
    }
  }
  for (const stat of collectStatKeys(entity.tags)) {
    if (selectStatIsNew(entity, stat)) {
      return true;
    }
  }
  return false;
}
