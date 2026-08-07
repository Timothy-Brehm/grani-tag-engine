/**
 * Apply-time magnitude modifiers for recipe effect slots.
 * See docs/design/action-types.md and docs/UPGRADING.md.
 */

import type { ActiveEffect, AdjustPoolEffect } from './effect';
import type { EntityInstance, EntityMap } from './entity';
import type { Tag } from './tag';
import type { SlotCatalog } from './slots';
import { selectActiveTags } from './slots';
import type { CatalogRegistryView } from './catalog';
import {
  actionMatchesFilter,
  listPoolsMatchingTypes,
  normalizeTypes,
  poolMatchesTarget,
} from './action-match';

export type RecipeEffectSlot =
  | 'immediateEffects'
  | 'requiredOverTimeEffects'
  | 'optionalOverTimeEffects'
  | 'requiredEffects'
  | 'optionalEffects';

export const REDUCE_EFFECT_TYPE: Record<RecipeEffectSlot, string> = {
  immediateEffects: 'reduceImmediateEffect',
  requiredOverTimeEffects: 'reduceOverTimeEffect',
  // Same tag types as required over-time; slot is distinct for apply-time lists.
  optionalOverTimeEffects: 'reduceOverTimeEffect',
  requiredEffects: 'reduceRequiredEffect',
  optionalEffects: 'reduceOptionalEffect',
};

export const ENHANCE_EFFECT_TYPE: Record<RecipeEffectSlot, string> = {
  immediateEffects: 'enhanceImmediateEffect',
  requiredOverTimeEffects: 'enhanceOverTimeEffect',
  optionalOverTimeEffects: 'enhanceOverTimeEffect',
  requiredEffects: 'enhanceRequiredEffect',
  optionalEffects: 'enhanceOptionalEffect',
};

function listTagEffects(
  entity: EntityInstance | undefined,
  effectType: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
): Tag['effects'][number][] {
  if (!entity) {
    return [];
  }
  const out: Tag['effects'][number][] = [];
  for (const tag of selectActiveTags(entity, registry, entities)) {
    for (const effect of tag.effects) {
      if (effect.type === effectType) {
        out.push(effect);
      }
    }
  }
  return out;
}

function matchingActionEffects(
  actor: EntityInstance | undefined,
  effectType: string,
  actionName: string,
  actionTypes: readonly string[] | undefined,
  registry?: SlotCatalog,
  entities?: EntityMap,
): Tag['effects'][number][] {
  const types = normalizeTypes(actionTypes);
  return listTagEffects(actor, effectType, registry, entities).filter(
    (effect) =>
      actionMatchesFilter(
        {
          actionName: effect.actionName,
          actionTypes: effect.actionTypes,
        },
        { name: actionName, types },
      ),
  );
}

function magnitudeFromEffect(effect: {
  readonly amount?: number;
  readonly strength: number;
  readonly percent?: number;
}): { flat: number; percent: number } {
  let flat = 0;
  let percent = 0;
  if (typeof effect.percent === 'number' && Number.isFinite(effect.percent)) {
    percent = Math.abs(effect.percent);
  }
  if (typeof effect.amount === 'number' && Number.isFinite(effect.amount)) {
    flat = Math.abs(effect.amount);
  } else if (percent === 0) {
    flat = Math.abs(effect.strength);
  } else if (effect.strength !== 0) {
    flat = Math.abs(effect.strength);
  }
  return { flat, percent };
}

function matchesPoolFilter(
  effect: Tag['effects'][number],
  poolId: string,
  registry?: CatalogRegistryView,
): boolean {
  const hasPool = typeof effect.pool === 'string' && effect.pool.length > 0;
  const hasTypes = effect.poolTypes !== undefined;
  if (!hasPool && !hasTypes) {
    return true;
  }
  return poolMatchesTarget(registry, poolId, {
    pool: hasPool ? effect.pool : undefined,
    poolTypes: effect.poolTypes,
  });
}

/** Toward 0: sign-preserving shrink of |authored|. */
export function reduceEffect(
  authored: number,
  flat: number,
  percentPoints: number,
): number {
  if (!Number.isFinite(authored) || authored === 0) {
    return authored === 0 ? 0 : authored;
  }
  const r = Math.max(0, Number.isFinite(flat) ? flat : 0);
  let mag = Math.max(0, Math.abs(authored) - r);
  const p = Number.isFinite(percentPoints) ? Math.max(0, percentPoints) : 0;
  mag *= Math.max(0, 1 - p / 100);
  if (mag === 0) {
    return 0;
  }
  return authored < 0 ? -mag : mag;
}

/** Away from 0: sign-preserving grow of |authored|. */
export function enhanceEffect(
  authored: number,
  flat: number,
  percentPoints: number,
): number {
  if (!Number.isFinite(authored) || authored === 0) {
    return authored;
  }
  const f = Math.max(0, Number.isFinite(flat) ? flat : 0);
  let mag = Math.abs(authored) + f;
  const p = Number.isFinite(percentPoints) ? Math.max(0, percentPoints) : 0;
  mag *= 1 + p / 100;
  return authored < 0 ? -mag : mag;
}

/** @deprecated Use {@link reduceEffect}. */
export const relieveFlat = (authored: number, relief: number) =>
  reduceEffect(authored, relief, 0);

/** @deprecated Use {@link reduceEffect}. */
export const relievePercent = (authored: number, percentPoints: number) =>
  reduceEffect(authored, 0, percentPoints);

/**
 * Expand one adjust-pool (id and/or poolTypes) into concrete pool adjusts.
 * Single-id without poolTypes: createPool defaults true (legacy).
 * Type-expanded: createPool defaults false unless opted in.
 */
export function resolveAdjustPoolEffect(
  effect: AdjustPoolEffect,
  registry: CatalogRegistryView | undefined,
): {
  readonly pool: string;
  readonly strength: number;
  readonly createPool: boolean;
  readonly scope?: AdjustPoolEffect['scope'];
  readonly name: string;
}[] {
  const ids = new Set<string>();
  if (typeof effect.pool === 'string' && effect.pool) {
    ids.add(effect.pool);
  }
  if (effect.poolTypes !== undefined) {
    for (const id of listPoolsMatchingTypes(registry, {
      poolTypes: effect.poolTypes,
    })) {
      ids.add(id);
    }
  }
  if (ids.size === 0) {
    return [];
  }

  const typeExpanded = effect.poolTypes !== undefined;
  const createPool = typeExpanded
    ? effect.createPool === true
    : effect.createPool !== false;

  const out: {
    pool: string;
    strength: number;
    createPool: boolean;
    scope?: AdjustPoolEffect['scope'];
    name: string;
  }[] = [];
  for (const pool of ids) {
    if (effect.strength === 0) {
      continue;
    }
    out.push({
      pool,
      strength: effect.strength,
      createPool,
      ...(effect.scope !== undefined ? { scope: effect.scope } : {}),
      name: effect.name,
    });
  }
  return out;
}

/** Expand typed adjust-pools without magnitude mods. */
export function materializeAdjustPools(
  effects: readonly ActiveEffect[],
  registry?: CatalogRegistryView,
): ActiveEffect[] {
  const out: ActiveEffect[] = [];
  for (const effect of effects) {
    if (effect.type !== 'adjust-pool') {
      out.push(effect);
      continue;
    }
    for (const resolved of resolveAdjustPoolEffect(
      effect as AdjustPoolEffect,
      registry,
    )) {
      const next: AdjustPoolEffect = {
        type: 'adjust-pool',
        name: resolved.name,
        strength: resolved.strength,
        pool: resolved.pool,
        createPool: resolved.createPool,
        ...(resolved.scope !== undefined ? { scope: resolved.scope } : {}),
      };
      out.push(next);
    }
  }
  return out;
}

function collectMods(
  actor: EntityInstance | undefined,
  effectType: string,
  actionName: string,
  actionTypes: readonly string[] | undefined,
  poolId: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
): { flat: number; percent: number } {
  let flat = 0;
  let percent = 0;
  for (const effect of matchingActionEffects(
    actor,
    effectType,
    actionName,
    actionTypes,
    registry,
    entities,
  )) {
    if (!matchesPoolFilter(effect, poolId, registry)) {
      continue;
    }
    const m = magnitudeFromEffect(effect);
    flat += m.flat;
    percent += m.percent;
  }
  return { flat, percent };
}

/**
 * Apply reduce* then enhance* for a recipe slot (flats then % within each).
 * Only `adjust-pool` strengths change; other effect types pass through.
 */
export function applySlotMagnitudeModifiers(
  effects: readonly ActiveEffect[],
  slot: RecipeEffectSlot,
  actor: EntityInstance | undefined,
  actionName: string,
  actionTypes: readonly string[] | undefined,
  registry?: SlotCatalog,
  entities?: EntityMap,
): ActiveEffect[] {
  const reduceType = REDUCE_EFFECT_TYPE[slot];
  const enhanceType = ENHANCE_EFFECT_TYPE[slot];

  return effects.map((effect) => {
    if (effect.type !== 'adjust-pool') {
      return effect;
    }
    const adj = effect as AdjustPoolEffect;
    const poolId = adj.pool;
    if (typeof poolId !== 'string' || !poolId) {
      return effect;
    }

    const red = collectMods(
      actor,
      reduceType,
      actionName,
      actionTypes,
      poolId,
      registry,
      entities,
    );
    const enh = collectMods(
      actor,
      enhanceType,
      actionName,
      actionTypes,
      poolId,
      registry,
      entities,
    );

    let next = adj.strength;
    // All flats first, then all percents (reduce toward 0, enhance away).
    next = reduceEffect(next, red.flat, 0);
    next = enhanceEffect(next, enh.flat, 0);
    next = reduceEffect(next, 0, red.percent);
    next = enhanceEffect(next, 0, enh.percent);
    if (next === adj.strength) {
      return effect;
    }
    return { ...adj, strength: Number(next.toFixed(6)) };
  });
}

/** Expand poolTypes then apply reduce/enhance for a slot. */
export function materializeSlotEffects(
  effects: readonly ActiveEffect[],
  slot: RecipeEffectSlot,
  actor: EntityInstance | undefined,
  actionName: string,
  actionTypes: readonly string[] | undefined,
  registry?: SlotCatalog,
  entities?: EntityMap,
): ActiveEffect[] {
  return applySlotMagnitudeModifiers(
    materializeAdjustPools(effects, registry),
    slot,
    actor,
    actionName,
    actionTypes,
    registry,
    entities,
  );
}

export function listMatchingContinuousSpeedEffects(
  actor: EntityInstance | undefined,
  actionName: string,
  actionTypes: readonly string[] | undefined,
  registry?: SlotCatalog,
  entities?: EntityMap,
): Tag['effects'][number][] {
  return matchingActionEffects(
    actor,
    'continuous-speed',
    actionName,
    actionTypes,
    registry,
    entities,
  );
}

/** @deprecated Prefer {@link materializeSlotEffects} with slot. */
export function applyCostBonuses(
  costs: readonly ActiveEffect[],
  actor: EntityInstance | undefined,
  actionName: string,
  actionTypes: readonly string[] | undefined,
  registry?: SlotCatalog,
  entities?: EntityMap,
): ActiveEffect[] {
  return applySlotMagnitudeModifiers(
    costs,
    'immediateEffects',
    actor,
    actionName,
    actionTypes,
    registry,
    entities,
  );
}

/** @deprecated Prefer {@link materializeSlotEffects}. */
export function materializeActionResults(
  results: readonly ActiveEffect[],
  actor: EntityInstance | undefined,
  actionName: string,
  actionTypes: readonly string[] | undefined,
  registry?: SlotCatalog,
  entities?: EntityMap,
): ActiveEffect[] {
  return materializeSlotEffects(
    results,
    'requiredEffects',
    actor,
    actionName,
    actionTypes,
    registry,
    entities,
  );
}
