import type { EntityInstance, EntityPoolMap } from './entity';
import { withEntityPools } from './entity';
import { upsertEntity, type EngineState } from './state';
import type { TagCollection } from './tag-collection';
import { TagCollection as TC } from './tag-collection';
import type { SlotCatalog, ActiveTagOptions } from './slots';
import { selectActiveTags } from './slots';
import { entitiesWithUniversal } from './document';
import { recordPoolLifetimeUsed } from './metrics';
import { floorPoolQuantity, roundPoolQuantity } from './quantity';
import {
  poolCapacityStep,
  selectPoolAvailableRaw,
  selectPoolEffectiveAvailable,
  selectPoolMaxRaw,
} from './derive';
import {
  resolveAssignmentCommit,
  selectAssignmentPoolMaxBonus,
} from './capacity';

/** Stored pool value = Available (spendable / reservable), raw. */
export function selectPoolAvailable(
  entity: EntityInstance,
  pool: string,
): number {
  return selectPoolAvailableRaw(entity, pool);
}

/**
 * Sum of active `reserve-pool` strengths targeting this entity's pool.
 * Passives on other entities with `scope: 'primary'` count toward the primary.
 */
export function selectPoolReserved(
  state: EngineState,
  entityId: string,
  pool: string,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): number {
  const all = computeReservedByEntity(state, registry, universalTags);
  return all.get(entityId)?.[pool] ?? 0;
}

/** Effective reserved (capacityStep floor). */
export function selectPoolEffectiveReserved(
  state: EngineState,
  entityId: string,
  pool: string,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): number {
  return floorPoolQuantity(
    selectPoolReserved(state, entityId, pool, registry, universalTags),
    poolCapacityStep(registry, pool),
  );
}

/** Available + Reserved (raw). */
export function selectPoolContents(
  state: EngineState,
  entityId: string,
  pool: string,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): number {
  const entity = state.entities.get(entityId);
  if (!entity) {
    return 0;
  }
  return (
    selectPoolAvailable(entity, pool) +
    selectPoolReserved(state, entityId, pool, registry, universalTags)
  );
}

function activeOptsFor(
  state: EngineState,
  entity: EntityInstance,
  universalTags: TagCollection,
): ActiveTagOptions {
  return {
    universalTags,
    mergeUnslottedUniversal: entity.id === state.primaryEntityId,
  };
}

function poolMaxRawFor(
  state: EngineState,
  entity: EntityInstance,
  pool: string,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): number {
  const entities = entitiesWithUniversal(state, universalTags);
  return (
    selectPoolMaxRaw(
      entity,
      pool,
      registry,
      entities,
      activeOptsFor(state, entity, universalTags),
    ) +
    selectAssignmentPoolMaxBonus(
      state,
      entity,
      pool,
      registry,
      universalTags,
    )
  );
}

/** Effective ceiling for Available regen clamp: raw Max − raw Reserved. */
export function selectPoolAvailableMax(
  state: EngineState,
  entity: EntityInstance,
  pool: string,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): number {
  const max = poolMaxRawFor(state, entity, pool, registry, universalTags);
  const reserved = selectPoolReserved(
    state,
    entity.id,
    pool,
    registry,
    universalTags,
  );
  return Math.max(0, max - reserved);
}

/**
 * Effective Available headroom for gates: effective Max − effective Reserved.
 */
export function selectPoolEffectiveAvailableMax(
  state: EngineState,
  entity: EntityInstance,
  pool: string,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): number {
  const max = floorPoolQuantity(
    poolMaxRawFor(state, entity, pool, registry, universalTags),
    poolCapacityStep(registry, pool),
  );
  const reserved = selectPoolEffectiveReserved(
    state,
    entity.id,
    pool,
    registry,
    universalTags,
  );
  return Math.max(0, max - reserved);
}

export type ReservedByEntity = ReadonlyMap<
  string,
  Readonly<Record<string, number>>
>;

/**
 * For each entity, pool → reserved amount from active `reserve-pool` effects
 * that target that entity (`scope: 'primary'` → primary; else tag owner).
 */
export function computeReservedByEntity(
  state: EngineState,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): ReservedByEntity {
  const entities = entitiesWithUniversal(state, universalTags);
  const out = new Map<string, Record<string, number>>();

  const add = (targetId: string, pool: string, strength: number) => {
    if (!state.entities.has(targetId) || !pool || !Number.isFinite(strength)) {
      return;
    }
    const row = out.get(targetId) ?? {};
    row[pool] = (row[pool] ?? 0) + strength;
    out.set(targetId, row);
  };

  for (const entity of state.entities.values()) {
    const activeOpts: ActiveTagOptions = {
      universalTags,
      mergeUnslottedUniversal: entity.id === state.primaryEntityId,
    };
    for (const tag of selectActiveTags(
      entity,
      registry,
      entities,
      activeOpts,
    )) {
      for (const effect of tag.effects) {
        if (effect.type !== 'reserve-pool') {
          continue;
        }
        const pool = typeof effect.pool === 'string' ? effect.pool : undefined;
        if (!pool) {
          continue;
        }
        const targetId =
          effect.scope === 'primary' ? state.primaryEntityId : entity.id;
        add(targetId, pool, effect.strength);
      }
    }
    for (const a of entity.capacityAssignments) {
      if (!a.fromPool) {
        continue;
      }
      add(
        a.sourceEntityId,
        a.fromPool,
        resolveAssignmentCommit(state, a, registry, universalTags),
      );
    }
  }

  return out;
}

/**
 * After a tag/slot/entity transition: move Available by −ΔReserved.
 * Returns undefined if any pool would go negative (caller should refuse).
 */
export function applyReservationDeltas(
  state: EngineState,
  before: ReservedByEntity,
  after: ReservedByEntity,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): EngineState | undefined {
  const entityIds = new Set<string>([
    ...before.keys(),
    ...after.keys(),
    ...state.entities.keys(),
  ]);

  let next = state;
  for (const entityId of entityIds) {
    const entity = next.entities.get(entityId);
    if (!entity) {
      continue;
    }
    const beforeRow = before.get(entityId) ?? {};
    const afterRow = after.get(entityId) ?? {};
    const poolIds = new Set([
      ...Object.keys(beforeRow),
      ...Object.keys(afterRow),
      ...Object.keys(entity.pools),
    ]);

    let pools: EntityPoolMap | undefined;
    const working = entity;
    for (const pool of poolIds) {
      const delta = (afterRow[pool] ?? 0) - (beforeRow[pool] ?? 0);
      if (delta === 0) {
        continue;
      }
      const available = (pools ?? working.pools)[pool] ?? 0;
      const nextAvailable = roundPoolQuantity(available - delta);
      if (nextAvailable < 0) {
        return undefined;
      }
      const max = poolMaxRawFor(next, working, pool, registry, universalTags);
      const reservedAfter = afterRow[pool] ?? 0;
      const cap = Math.max(0, max - reservedAfter);
      const clamped = Math.min(cap, Math.max(0, nextAvailable));
      pools = {
        ...(pools ?? working.pools),
        [pool]: roundPoolQuantity(clamped),
      };
    }
    if (pools) {
      next = upsertEntity(next, withEntityPools(working, pools, next.tick));
    }
  }
  return next;
}

/**
 * Recompute reserved from `proposed` tags vs `previous` and adjust Available.
 * On over-reserve, returns `previous` unchanged.
 */
export function reconcilePoolReservations(
  previous: EngineState,
  proposed: EngineState,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): EngineState {
  const before = computeReservedByEntity(previous, registry, universalTags);
  const after = computeReservedByEntity(proposed, registry, universalTags);
  const applied = applyReservationDeltas(
    proposed,
    before,
    after,
    registry,
    universalTags,
  );
  return applied ?? previous;
}

export type TryAdjustPoolOptions = {
  /**
   * When false, refuse to introduce a new `entity.pools` key.
   * Default **true** (actions / commands). Passive generators pass false
   * unless the effect sets `createPool: true`.
   */
  readonly createPool?: boolean;
};

/**
 * Adjust Available (raw). Spend fails if **effective** Available cannot cover
 * the cost. Gains clamp to raw Max − Reserved. Float hygiene via
 * {@link roundPoolQuantity}.
 */
export function tryAdjustEntityPool(
  state: EngineState,
  entity: EntityInstance,
  poolId: string,
  delta: number,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
  tick = state.tick,
  options: TryAdjustPoolOptions = {},
): EntityInstance | undefined {
  const createPool = options.createPool !== false;
  if (!(poolId in entity.pools) && !createPool) {
    return undefined;
  }

  const available = selectPoolAvailableRaw(entity, poolId);
  const cap = selectPoolAvailableMax(
    state,
    entity,
    poolId,
    registry,
    universalTags,
  );

  if (delta < 0) {
    const effective = selectPoolEffectiveAvailable(entity, poolId, registry);
    if (effective + delta < -1e-9) {
      return undefined;
    }
  }

  const next = roundPoolQuantity(
    Math.min(cap, Math.max(0, available + delta)),
  );
  const actualDelta = next - available;
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

export {
  selectPoolEffectiveAvailable,
  selectPoolMaxRaw,
  poolCapacityStep,
};
