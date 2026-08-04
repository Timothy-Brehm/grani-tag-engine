import type { EntityInstance, EntityMap } from './entity';
import type { EngineState } from './state';
import type { Tag } from './tag';
import type { TagCollection } from './tag-collection';
import { TagCollection as TC } from './tag-collection';
import type {
  ContinuousActiveJob,
  ContinuousProgressRecord,
} from './continuous-types';
import type { SlotCatalog } from './slots';
import {
  selectStatValue as selectStatValueDerived,
  selectPoolMax as selectPoolMaxDerived,
  selectPoolMaxRaw,
  selectPoolEffectiveAvailable,
  poolCapacityStep,
} from './derive';
import {
  selectAssignmentPoolMaxBonus,
  selectAssignmentStatBonus,
  selectStatReserved,
} from './capacity';
import { floorPoolQuantity, roundPoolQuantity } from './quantity';

export {
  entityHasActiveTag,
  entityHasHeldSlot,
  entityHasHeldTag,
  listHeldTagsInSlot,
  selectActiveTags,
  selectActiveRootTags,
  selectSlotSelection,
  selectSlotWinner,
  reconcileSlotSelections,
  reconcileAllSlotSelections,
  withSlotSelection,
  holdingIsSelectedElsewhere,
  resolveSlotSelectionTag,
} from './slots';

/** Sum strength of tag passive effects whose type matches. */
export function sumTagEffectStrength(
  tags: TagCollection | readonly Tag[],
  effectType: string,
): number {
  const list = 'list' in tags ? tags.list() : tags;
  let total = 0;
  for (const tag of list) {
    for (const effect of tag.effects) {
      if (effect.type === effectType) {
        total += effect.strength;
      }
    }
  }
  return total;
}

/**
 * Sum strength of tag effects matching type where an extra payload field
 * equals `keyValue` (e.g. type `stat` with field `stat` === 'Strength').
 */
export function sumTaggedFieldStrength(
  tags: TagCollection | readonly Tag[],
  effectType: string,
  field: string,
  keyValue: string,
): number {
  const list = 'list' in tags ? tags.list() : tags;
  let total = 0;
  for (const tag of list) {
    for (const effect of tag.effects) {
      if (effect.type !== effectType) {
        continue;
      }
      const payload = effect as Tag['effects'][number] & Record<string, unknown>;
      if (payload[field] === keyValue) {
        total += effect.strength;
      }
    }
  }
  return total;
}

export function selectEntity(
  state: EngineState,
  entityId: string,
): EntityInstance | undefined {
  return state.entities.get(entityId);
}

export function selectEntitiesByDefinition(
  state: EngineState,
  definitionId: string,
): EntityInstance[] {
  return [...state.entities.values()].filter(
    (entity) => entity.definitionId === definitionId,
  );
}

/**
 * Effective stat for gates: base + cross-links + assignment provides − reserved
 * (`reserve-stat` + capacity commits). Without `state`, returns gross (no reserve).
 */
export function selectStatValue(
  entity: EntityInstance,
  stat: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: import('./slots').ActiveTagOptions,
  state?: EngineState,
  universalTags: TagCollection = TC.create(),
): number {
  let value = selectStatValueDerived(
    entity,
    stat,
    registry,
    entities,
    options,
  );
  if (!state) {
    return value;
  }
  value += selectAssignmentStatBonus(
    state,
    entity,
    stat,
    registry,
    universalTags,
  );
  value -= selectStatReserved(
    state,
    entity.id,
    stat,
    registry,
    universalTags,
  );
  return roundPoolQuantity(Math.max(0, value));
}

/**
 * Effective pool Max. With `state`, includes capacity-assignment provides on
 * this entity.
 */
export function selectPoolMax(
  entity: EntityInstance,
  pool: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: import('./slots').ActiveTagOptions,
  state?: EngineState,
  universalTags: TagCollection = TC.create(),
): number {
  if (!state) {
    return selectPoolMaxDerived(
      entity,
      pool,
      registry,
      entities,
      options,
    );
  }
  return floorPoolQuantity(
    selectPoolMaxRaw(entity, pool, registry, entities, options) +
      selectAssignmentPoolMaxBonus(
        state,
        entity,
        pool,
        registry,
        universalTags,
      ),
    poolCapacityStep(registry, pool),
  );
}

export function selectPoolCurrent(
  entity: EntityInstance,
  pool: string,
  registry?: SlotCatalog,
): number {
  /** Effective Available for requirements / gates. */
  return selectPoolEffectiveAvailable(entity, pool, registry);
}

export {
  selectPoolAvailable,
  selectPoolReserved,
  selectPoolContents,
  selectPoolAvailableMax,
  selectPoolEffectiveAvailableMax,
  selectPoolEffectiveReserved,
  computeReservedByEntity,
  reconcilePoolReservations,
  tryAdjustEntityPool,
} from './pools';

export {
  selectBaseStatValue,
  selectBasePoolMax,
  selectCrossLinkPoolMaxBonus,
  selectCrossLinkStatBonus,
  selectPoolMaxRaw,
  selectPoolEffectiveAvailable,
  selectPoolDisplayCurrent,
  selectPoolDisplayMax,
  poolCapacityStep,
  poolDisplayStep,
  crossLinkCoeff,
  crossLinkSourceValue,
} from './derive';

export {
  POOL_QUANTITY_DECIMALS,
  roundPoolQuantity,
  floorPoolQuantity,
  DEFAULT_CAPACITY_STEP,
  DEFAULT_DISPLAY_STEP,
} from './quantity';

export function selectActiveCount(
  state: EngineState,
  definitionId: string,
): number {
  return selectEntitiesByDefinition(state, definitionId).length;
}

export function selectSpawnCount(
  state: EngineState,
  definitionId: string,
): number {
  return state.spawnCounts[definitionId] ?? 0;
}

/** The engine's designated primary entity (always present when state is valid). */
export function selectPrimaryEntity(state: EngineState): EntityInstance {
  const entity = state.entities.get(state.primaryEntityId);
  if (!entity) {
    throw new Error(
      `primaryEntityId "${state.primaryEntityId}" is missing from entities`,
    );
  }
  return entity;
}

export function selectPrimaryEntityId(state: EngineState): string {
  return state.primaryEntityId;
}

export function selectContinuousActiveJobs(
  state: EngineState,
  actorEntityId?: string,
): ContinuousActiveJob[] {
  const jobs = [...state.continuousActions.values()];
  if (!actorEntityId) {
    return jobs;
  }
  return jobs.filter((job) => job.actorEntityId === actorEntityId);
}

export function selectContinuousProgress(
  state: EngineState,
  progressKey: string,
): ContinuousProgressRecord | undefined {
  return state.continuousProgress.get(progressKey);
}
