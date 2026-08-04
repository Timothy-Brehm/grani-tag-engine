import type { EntityInstance, EntityMap } from './entity';
import type { CatalogRegistryView } from './catalog';
import type { ActiveTagOptions, SlotCatalog } from './slots';
import { selectActiveTags, sumActiveTaggedFieldStrength } from './slots';
import {
  floorPoolQuantity,
  roundPoolQuantity,
  DEFAULT_CAPACITY_STEP,
  DEFAULT_DISPLAY_STEP,
} from './quantity';
import type { TagEffect } from './tag';

/** Coeff for a `cross-link` effect: `amount` if set, else `strength`. */
export function crossLinkCoeff(effect: {
  readonly amount?: number;
  readonly strength: number;
}): number {
  if (typeof effect.amount === 'number' && Number.isFinite(effect.amount)) {
    return effect.amount;
  }
  return effect.strength;
}

/** Source magnitude for a cross-link (base stat or effective Available). */
export function crossLinkSourceValue(
  entity: EntityInstance,
  effect: TagEffect,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  if (typeof effect.fromStat === 'string' && effect.fromStat) {
    return selectBaseStatValue(
      entity,
      effect.fromStat,
      registry,
      entities,
      options,
    );
  }
  if (typeof effect.fromPool === 'string' && effect.fromPool) {
    return selectPoolEffectiveAvailable(entity, effect.fromPool, registry);
  }
  return 0;
}

/** Resolved capacity step (authored or {@link DEFAULT_CAPACITY_STEP}). */
export function poolCapacityStep(
  registry: CatalogRegistryView | SlotCatalog | undefined,
  poolId: string,
): number {
  const step = registry?.getPoolDefinition?.(poolId)?.capacityStep;
  if (typeof step === 'number' && step > 0 && Number.isFinite(step)) {
    return step;
  }
  return DEFAULT_CAPACITY_STEP;
}

/** Resolved display step (authored or {@link DEFAULT_DISPLAY_STEP}). */
export function poolDisplayStep(
  registry: CatalogRegistryView | SlotCatalog | undefined,
  poolId: string,
): number {
  const display = registry?.getPoolDefinition?.(poolId)?.displayStep;
  if (typeof display === 'number' && display > 0 && Number.isFinite(display)) {
    return display;
  }
  return DEFAULT_DISPLAY_STEP;
}

/** Raw stored Available (no capacity step). */
export function selectPoolAvailableRaw(
  entity: EntityInstance,
  pool: string,
): number {
  return entity.pools[pool] ?? 0;
}

/** Effective Available for gates / rules. */
export function selectPoolEffectiveAvailable(
  entity: EntityInstance,
  pool: string,
  registry?: CatalogRegistryView | SlotCatalog,
): number {
  return floorPoolQuantity(
    selectPoolAvailableRaw(entity, pool),
    poolCapacityStep(registry, pool),
  );
}

/**
 * Base traits from `stat` strengths only (no cross-link contributions).
 */
export function selectBaseStatValue(
  entity: EntityInstance,
  stat: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  return sumActiveTaggedFieldStrength(
    entity,
    'stat',
    'stat',
    stat,
    registry,
    entities,
    options,
  );
}

/**
 * Base pool max from `pool-max` only (includes product-tag stored max;
 * excludes live cross-links).
 */
export function selectBasePoolMax(
  entity: EntityInstance,
  pool: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  return sumActiveTaggedFieldStrength(
    entity,
    'pool-max',
    'pool',
    pool,
    registry,
    entities,
    options,
  );
}

/**
 * Sum live `cross-link` contributions to a pool’s max (no `productTag`).
 * Reads sources from base stats / effective Available only — all links are
 * collected independently then added once (no mid-eval feedback).
 */
export function selectCrossLinkPoolMaxBonus(
  entity: EntityInstance,
  pool: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  let total = 0;
  for (const tag of selectActiveTags(entity, registry, entities, options)) {
    for (const effect of tag.effects) {
      if (effect.type !== 'cross-link') {
        continue;
      }
      if (typeof effect.productTag === 'string' && effect.productTag) {
        continue;
      }
      if (effect.toPoolMax !== pool) {
        continue;
      }
      total +=
        crossLinkSourceValue(entity, effect, registry, entities, options) *
        crossLinkCoeff(effect);
    }
  }
  return roundPoolQuantity(total);
}

/**
 * Sum `cross-link` contributions to a final stat.
 */
export function selectCrossLinkStatBonus(
  entity: EntityInstance,
  stat: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  let total = 0;
  for (const tag of selectActiveTags(entity, registry, entities, options)) {
    for (const effect of tag.effects) {
      if (effect.type !== 'cross-link') {
        continue;
      }
      if (effect.toStat !== stat) {
        continue;
      }
      total +=
        crossLinkSourceValue(entity, effect, registry, entities, options) *
        crossLinkCoeff(effect);
    }
  }
  return roundPoolQuantity(total);
}

/**
 * Raw pool max = base `pool-max` + all live cross-link max bonuses (summed once).
 */
export function selectPoolMaxRaw(
  entity: EntityInstance,
  pool: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  return roundPoolQuantity(
    selectBasePoolMax(entity, pool, registry, entities, options) +
      selectCrossLinkPoolMaxBonus(entity, pool, registry, entities, options),
  );
}

/** Effective max (capacityStep floor). */
export function selectPoolMax(
  entity: EntityInstance,
  pool: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  return floorPoolQuantity(
    selectPoolMaxRaw(entity, pool, registry, entities, options),
    poolCapacityStep(registry, pool),
  );
}

/**
 * Final stat = base `stat` + all cross-link stat bonuses (summed once).
 */
export function selectStatValue(
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

export function selectPoolDisplayCurrent(
  entity: EntityInstance,
  pool: string,
  registry?: CatalogRegistryView | SlotCatalog,
): number {
  return floorPoolQuantity(
    selectPoolAvailableRaw(entity, pool),
    poolDisplayStep(registry, pool),
  );
}

export function selectPoolDisplayMax(
  entity: EntityInstance,
  pool: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  return floorPoolQuantity(
    selectPoolMaxRaw(entity, pool, registry, entities, options),
    poolDisplayStep(registry, pool),
  );
}
