import type { EntityInstance, EntityMap } from './entity';
import { withEntityPools } from './entity';
import type { EngineState } from './state';
import { upsertEntity } from './state';
import type { TagCollection } from './tag-collection';
import { TagCollection as TC } from './tag-collection';
import type { SlotCatalog, ActiveTagOptions } from './slots';
import { selectActiveTags } from './slots';
import { entitiesWithUniversal } from './document';
import { roundPoolQuantity } from './quantity';
import {
  selectBaseStatValue,
  selectCrossLinkStatBonus,
  selectPoolMaxRaw,
  selectPoolAvailableRaw,
} from './derive';
import type { CapacityAssignment, CapacityClawback } from './capacity-types';
import {
  assignmentEfficiency,
  normalizeCapacityClawback,
} from './capacity-types';

export type {
  CapacityAssignment,
  CapacityAssignmentJSON,
  CapacityClawback,
} from './capacity-types';
export {
  DEFAULT_CAPACITY_CLAWBACK,
  normalizeCapacityClawback,
  assignmentEfficiency,
  assignmentEveryTicks,
} from './capacity-types';

function activeOpts(
  state: EngineState,
  entity: EntityInstance,
  universalTags: TagCollection,
): ActiveTagOptions {
  return {
    universalTags,
    mergeUnslottedUniversal: entity.id === state.primaryEntityId,
  };
}

/** Absolute units committed from the source (before efficiency). */
export function resolveAssignmentCommit(
  state: EngineState,
  assignment: CapacityAssignment,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): number {
  if (typeof assignment.amount === 'number' && Number.isFinite(assignment.amount)) {
    return Math.max(0, assignment.amount);
  }
  const pct =
    typeof assignment.percent === 'number' && Number.isFinite(assignment.percent)
      ? assignment.percent
      : undefined;
  if (pct === undefined) {
    return 0;
  }
  const source = state.entities.get(assignment.sourceEntityId);
  if (!source) {
    return 0;
  }
  const entities = entitiesWithUniversal(state, universalTags);
  const opts = activeOpts(state, source, universalTags);
  let basis = 0;
  if (assignment.fromPool) {
    basis = selectPoolMaxRaw(
      source,
      assignment.fromPool,
      registry,
      entities,
      opts,
    );
  } else if (assignment.fromStat) {
    basis =
      selectBaseStatValue(
        source,
        assignment.fromStat,
        registry,
        entities,
        opts,
      ) +
      selectCrossLinkStatBonus(
        source,
        assignment.fromStat,
        registry,
        entities,
        opts,
      );
  }
  return roundPoolQuantity(Math.max(0, (basis * pct) / 100));
}

/** Dest magnitude = commit × efficiency. */
export function resolveAssignmentProvide(
  state: EngineState,
  assignment: CapacityAssignment,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): number {
  return roundPoolQuantity(
    resolveAssignmentCommit(state, assignment, registry, universalTags) *
      assignmentEfficiency(assignment),
  );
}

/** Sum assignment provides of `toPool` on this converter. */
export function selectAssignmentPoolMaxBonus(
  state: EngineState,
  entity: EntityInstance,
  pool: string,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
  excludeAssignmentId?: string,
): number {
  let total = 0;
  for (const a of entity.capacityAssignments) {
    if (excludeAssignmentId && a.id === excludeAssignmentId) {
      continue;
    }
    if (a.toPool !== pool) {
      continue;
    }
    total += resolveAssignmentProvide(state, a, registry, universalTags);
  }
  return roundPoolQuantity(total);
}

/** Sum assignment provides of `toStat` on this converter. */
export function selectAssignmentStatBonus(
  state: EngineState,
  entity: EntityInstance,
  stat: string,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): number {
  let total = 0;
  for (const a of entity.capacityAssignments) {
    if (a.toStat !== stat) {
      continue;
    }
    total += resolveAssignmentProvide(state, a, registry, universalTags);
  }
  return roundPoolQuantity(total);
}

/**
 * Extra pool reservation from capacity assignments targeting this entity as source.
 */
export function selectAssignmentPoolReserved(
  state: EngineState,
  entityId: string,
  pool: string,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): number {
  let total = 0;
  for (const entity of state.entities.values()) {
    for (const a of entity.capacityAssignments) {
      if (a.sourceEntityId !== entityId || a.fromPool !== pool) {
        continue;
      }
      total += resolveAssignmentCommit(state, a, registry, universalTags);
    }
  }
  return roundPoolQuantity(total);
}

/**
 * Stat reservation from `reserve-stat` passives + capacity assignments.
 */
export function selectStatReserved(
  state: EngineState,
  entityId: string,
  stat: string,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): number {
  let total = 0;
  const entities = entitiesWithUniversal(state, universalTags);
  for (const entity of state.entities.values()) {
    const opts = activeOpts(state, entity, universalTags);
    for (const tag of selectActiveTags(entity, registry, entities, opts)) {
      for (const effect of tag.effects) {
        if (effect.type !== 'reserve-stat') {
          continue;
        }
        if (effect.stat !== stat) {
          continue;
        }
        const targetId =
          effect.scope === 'primary' ? state.primaryEntityId : entity.id;
        if (targetId !== entityId) {
          continue;
        }
        total += effect.strength;
      }
    }
    for (const a of entity.capacityAssignments) {
      if (a.sourceEntityId !== entityId || a.fromStat !== stat) {
        continue;
      }
      total += resolveAssignmentCommit(state, a, registry, universalTags);
    }
  }
  return roundPoolQuantity(total);
}

export function selectStatValueGross(
  entity: EntityInstance,
  stat: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  return roundPoolQuantity(
    selectBaseStatValue(entity, stat, registry, entities, options) +
      selectCrossLinkStatBonus(entity, stat, registry, entities, options),
  );
}

/**
 * Validate assignment shape and that source has enough unreserved headroom.
 */
export function canAcceptCapacityAssignment(
  state: EngineState,
  converter: EntityInstance,
  assignment: CapacityAssignment,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
  /** When replacing, ignore this id in current commit sums. */
  replaceId?: string,
): boolean {
  const hasFrom = Boolean(assignment.fromPool || assignment.fromStat);
  const hasTo = Boolean(assignment.toPool || assignment.toStat);
  if (!hasFrom || !hasTo || !assignment.id || !assignment.sourceEntityId) {
    return false;
  }
  if (assignment.fromPool && assignment.fromStat) {
    return false;
  }
  if (assignment.toPool && assignment.toStat) {
    return false;
  }
  const source = state.entities.get(assignment.sourceEntityId);
  if (!source) {
    return false;
  }
  const commit = resolveAssignmentCommit(
    state,
    assignment,
    registry,
    universalTags,
  );
  if (!(commit > 0)) {
    return false;
  }

  if (assignment.fromPool) {
    const pool = assignment.fromPool;
    let oldCommit = 0;
    if (replaceId) {
      const prev = converter.capacityAssignments.find((a) => a.id === replaceId);
      if (
        prev &&
        prev.sourceEntityId === source.id &&
        prev.fromPool === pool
      ) {
        oldCommit = resolveAssignmentCommit(
          state,
          prev,
          registry,
          universalTags,
        );
      }
    }
    const delta = commit - oldCommit;
    if (delta > 1e-9) {
      const available = selectPoolAvailableRaw(source, pool);
      if (available + 1e-9 < delta) {
        return false;
      }
    }
    return true;
  }

  if (assignment.fromStat) {
    const stat = assignment.fromStat;
    const entities = entitiesWithUniversal(state, universalTags);
    const opts = activeOpts(state, source, universalTags);
    const gross = selectStatValueGross(
      source,
      stat,
      registry,
      entities,
      opts,
    );
    let reserved = 0;
    let oldCommit = 0;
    for (const ent of state.entities.values()) {
      for (const a of ent.capacityAssignments) {
        if (replaceId && a.id === replaceId) {
          if (a.sourceEntityId === source.id && a.fromStat === stat) {
            oldCommit = resolveAssignmentCommit(
              state,
              a,
              registry,
              universalTags,
            );
          }
          continue;
        }
        if (a.sourceEntityId !== source.id || a.fromStat !== stat) {
          continue;
        }
        reserved += resolveAssignmentCommit(state, a, registry, universalTags);
      }
      const eopts = activeOpts(state, ent, universalTags);
      for (const tag of selectActiveTags(ent, registry, entities, eopts)) {
        for (const effect of tag.effects) {
          if (effect.type !== 'reserve-stat' || effect.stat !== stat) {
            continue;
          }
          const targetId =
            effect.scope === 'primary' ? state.primaryEntityId : ent.id;
          if (targetId === source.id) {
            reserved += effect.strength;
          }
        }
      }
    }
    if (reserved - oldCommit + commit > gross + 1e-9) {
      return false;
    }
    return true;
  }

  return false;
}

function withCapacityAssignments(
  entity: EntityInstance,
  assignments: readonly CapacityAssignment[],
  clawback?: CapacityClawback,
): EntityInstance {
  return {
    ...entity,
    capacityAssignments: Object.freeze([...assignments]),
    ...(clawback !== undefined
      ? { capacityClawback: clawback }
      : {}),
  };
}

/**
 * Apply or replace an assignment on the converter. Handles dest pool unlock and
 * clawback when shrinking a prior provide to the same id.
 */
export function assignCapacity(
  state: EngineState,
  converterId: string,
  assignment: CapacityAssignment,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): EngineState | undefined {
  const converter = state.entities.get(converterId);
  if (!converter) {
    return undefined;
  }
  if (
    !canAcceptCapacityAssignment(
      state,
      converter,
      assignment,
      registry,
      universalTags,
      assignment.id,
    )
  ) {
    return undefined;
  }

  const prev = converter.capacityAssignments.find((a) => a.id === assignment.id);
  let nextState = state;
  let working = converter;

  if (prev?.toPool && assignment.toPool === prev.toPool) {
    const oldProvide = resolveAssignmentProvide(
      state,
      prev,
      registry,
      universalTags,
    );
    const newProvide = resolveAssignmentProvide(
      state,
      assignment,
      registry,
      universalTags,
    );
    const deltaMax = oldProvide - newProvide;
    if (deltaMax > 1e-9) {
      const clawed = applyProvideClawback(
        nextState,
        working,
        prev.toPool,
        deltaMax,
        registry,
        universalTags,
        assignment.id,
        newProvide,
      );
      if (!clawed) {
        return undefined;
      }
      nextState = clawed.state;
      working = clawed.entity;
    }
  } else if (prev?.toPool && prev.toPool !== assignment.toPool) {
    const oldProvide = resolveAssignmentProvide(
      state,
      prev,
      registry,
      universalTags,
    );
    if (oldProvide > 1e-9) {
      const clawed = applyProvideClawback(
        nextState,
        working,
        prev.toPool,
        oldProvide,
        registry,
        universalTags,
        assignment.id,
        0,
      );
      if (!clawed) {
        return undefined;
      }
      nextState = clawed.state;
      working = clawed.entity;
    }
  }

  const list = working.capacityAssignments.filter((a) => a.id !== assignment.id);
  list.push(assignment);
  working = withCapacityAssignments(working, list);
  nextState = upsertEntity(nextState, working);

  if (assignment.toPool) {
    const dest = nextState.entities.get(converterId)!;
    if (!(assignment.toPool in dest.pools)) {
      nextState = upsertEntity(
        nextState,
        withEntityPools(
          dest,
          { ...dest.pools, [assignment.toPool]: 0 },
          nextState.tick,
        ),
      );
    }
  }

  return nextState;
}

/**
 * Remove an assignment by id from the converter; claw dest Available if needed.
 */
export function clearCapacityAssignment(
  state: EngineState,
  converterId: string,
  assignmentId: string,
  registry?: SlotCatalog,
  universalTags: TagCollection = TC.create(),
): EngineState | undefined {
  const converter = state.entities.get(converterId);
  if (!converter) {
    return undefined;
  }
  const prev = converter.capacityAssignments.find((a) => a.id === assignmentId);
  if (!prev) {
    return state;
  }

  let nextState = state;
  let working = converter;

  if (prev.toPool) {
    const provide = resolveAssignmentProvide(
      state,
      prev,
      registry,
      universalTags,
    );
    if (provide > 1e-9) {
      const clawed = applyProvideClawback(
        nextState,
        working,
        prev.toPool,
        provide,
        registry,
        universalTags,
        assignmentId,
        0,
      );
      if (!clawed) {
        return undefined;
      }
      nextState = clawed.state;
      working = clawed.entity;
    }
  }

  working = withCapacityAssignments(
    working,
    working.capacityAssignments.filter((a) => a.id !== assignmentId),
  );
  return upsertEntity(nextState, working);
}

function applyProvideClawback(
  state: EngineState,
  entity: EntityInstance,
  pool: string,
  deltaMax: number,
  registry: SlotCatalog | undefined,
  universalTags: TagCollection,
  excludeAssignmentId: string,
  remainingProvideForExcluded: number,
): { state: EngineState; entity: EntityInstance } | undefined {
  const mode = normalizeCapacityClawback(entity.capacityClawback);
  const available = selectPoolAvailableRaw(entity, pool);
  if (mode === 'strict' && available + 1e-9 < deltaMax) {
    return undefined;
  }
  const claw = Math.min(available, deltaMax);
  let nextAvail = roundPoolQuantity(available - claw);
  const entities = entitiesWithUniversal(state, universalTags);
  const opts = activeOpts(state, entity, universalTags);
  const tagMax = selectPoolMaxRaw(entity, pool, registry, entities, opts);
  const assignMax = selectAssignmentPoolMaxBonus(
    state,
    entity,
    pool,
    registry,
    universalTags,
    excludeAssignmentId,
  );
  const newMax = Math.max(
    0,
    tagMax + assignMax + remainingProvideForExcluded,
  );
  let reservedOnDest = 0;
  for (const ent of state.entities.values()) {
    const eopts = activeOpts(state, ent, universalTags);
    for (const tag of selectActiveTags(ent, registry, entities, eopts)) {
      for (const effect of tag.effects) {
        if (effect.type !== 'reserve-pool' || effect.pool !== pool) {
          continue;
        }
        const targetId =
          effect.scope === 'primary' ? state.primaryEntityId : ent.id;
        if (targetId === entity.id) {
          reservedOnDest += effect.strength;
        }
      }
    }
    for (const a of ent.capacityAssignments) {
      if (a.id === excludeAssignmentId) {
        continue;
      }
      if (a.sourceEntityId !== entity.id || a.fromPool !== pool) {
        continue;
      }
      reservedOnDest += resolveAssignmentCommit(
        state,
        a,
        registry,
        universalTags,
      );
    }
  }
  const cap = Math.max(0, newMax - reservedOnDest);
  if (nextAvail > cap + 1e-9) {
    nextAvail = roundPoolQuantity(cap);
  }
  let updated = withEntityPools(
    entity,
    { ...entity.pools, [pool]: nextAvail },
    state.tick,
  );
  if (claw > 1e-9) {
    const previous = updated.metrics.poolLifetimeUsed[pool];
    const nextUsed = {
      amount: Number(((previous?.amount ?? 0) + claw).toFixed(2)),
      firstTick: previous?.firstTick ?? state.tick,
      lastTick: state.tick,
    };
    updated = {
      ...updated,
      metrics: {
        ...updated.metrics,
        poolLifetimeUsed: Object.freeze({
          ...updated.metrics.poolLifetimeUsed,
          [pool]: nextUsed,
        }),
      },
    };
  }
  return { state: upsertEntity(state, updated), entity: updated };
}
