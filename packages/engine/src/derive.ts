import type { EntityInstance, EntityMap } from './entity';
import type { CatalogRegistryView } from './catalog';
import type { ActiveTagOptions, SlotCatalog } from './slots';
import { selectActiveTags, sumActiveTaggedFieldStrength } from './slots';
import { floorPoolQuantity, roundPoolQuantity } from './quantity';

function linkCoeff(effect: {
  readonly amount?: number;
  readonly strength: number;
}): number {
  if (typeof effect.amount === 'number' && Number.isFinite(effect.amount)) {
    return effect.amount;
  }
  return effect.strength;
}

function outboundStatCoeff(effect: {
  readonly amount?: number;
}): number {
  if (typeof effect.amount === 'number' && Number.isFinite(effect.amount)) {
    return effect.amount;
  }
  return 1;
}

export function poolCapacityStep(
  registry: CatalogRegistryView | SlotCatalog | undefined,
  poolId: string,
): number | undefined {
  const step = registry?.getPoolDefinition?.(poolId)?.capacityStep;
  if (typeof step === 'number' && step > 0 && Number.isFinite(step)) {
    return step;
  }
  return undefined;
}

export function poolDisplayStep(
  registry: CatalogRegistryView | SlotCatalog | undefined,
  poolId: string,
): number | undefined {
  const def = registry?.getPoolDefinition?.(poolId);
  const display = def?.displayStep;
  if (typeof display === 'number' && display > 0 && Number.isFinite(display)) {
    return display;
  }
  return poolCapacityStep(registry, poolId);
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
 * Base traits from `stat` strengths only (no pool-link contributions).
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
 * Raw pool max before capacityStep: fixed `pool-max` + live `toPoolMax` +
 * `pool-link`/`toPoolMax` × effective Available of the source pool.
 */
export function selectPoolMaxRaw(
  entity: EntityInstance,
  pool: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  let total = sumActiveTaggedFieldStrength(
    entity,
    'pool-max',
    'pool',
    pool,
    registry,
    entities,
    options,
  );

  for (const tag of selectActiveTags(entity, registry, entities, options)) {
    for (const effect of tag.effects) {
      if (effect.type === 'stat') {
        const toPoolMax =
          typeof effect.toPoolMax === 'string' ? effect.toPoolMax : undefined;
        const productTag =
          typeof effect.productTag === 'string' ? effect.productTag : undefined;
        const stat =
          typeof effect.stat === 'string' ? effect.stat : undefined;
        // Growing capacity uses product tag only — skip live term.
        if (
          toPoolMax === pool &&
          !productTag &&
          stat
        ) {
          total +=
            selectBaseStatValue(entity, stat, registry, entities, options) *
            outboundStatCoeff(effect);
        }
      }
      if (effect.type === 'pool-link') {
        const toPoolMax =
          typeof effect.toPoolMax === 'string' ? effect.toPoolMax : undefined;
        const sourcePool =
          typeof effect.pool === 'string' ? effect.pool : undefined;
        if (toPoolMax === pool && sourcePool) {
          total +=
            selectPoolEffectiveAvailable(entity, sourcePool, registry) *
            linkCoeff(effect);
        }
      }
    }
  }

  return roundPoolQuantity(total);
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
 * Final stat: base + `pool-link`/`toStat` × effective Available.
 */
export function selectStatValue(
  entity: EntityInstance,
  stat: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  let total = selectBaseStatValue(entity, stat, registry, entities, options);
  for (const tag of selectActiveTags(entity, registry, entities, options)) {
    for (const effect of tag.effects) {
      if (effect.type !== 'pool-link') {
        continue;
      }
      const toStat =
        typeof effect.toStat === 'string' ? effect.toStat : undefined;
      const sourcePool =
        typeof effect.pool === 'string' ? effect.pool : undefined;
      if (toStat === stat && sourcePool) {
        total +=
          selectPoolEffectiveAvailable(entity, sourcePool, registry) *
          linkCoeff(effect);
      }
    }
  }
  return roundPoolQuantity(total);
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
