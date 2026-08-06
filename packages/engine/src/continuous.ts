import type { ActionDefinition } from './action';
import type { ActiveEffect } from './effect';
import type { EngineContext } from './context';
import type { EngineRegistry } from './registry';
import type { Requirement } from './requirement';
import type { EntityInstance } from './entity';
import type { Tag } from './tag';
import { toEngineContext, upsertEntity, type EngineState } from './state';
import {
  selectPoolAvailable,
  selectPoolAvailableMax,
} from './selectors';
import { selectActiveTags } from './slots';
import type { SlotCatalog } from './slots';
import type { EntityMap } from './entity';
import { withEntityTags } from './entity';
import { tryAdjustEntityPool } from './pools';
import { recordActionExecution } from './metrics';
import { TagCollection } from './tag-collection';
import { entitiesWithUniversal } from './document';
import { createTag } from './tag';
import { roundPoolQuantity } from './quantity';
import { crossLinkCoeff, crossLinkSourceValue } from './derive';
import {
  assignmentEveryTicks,
  resolveAssignmentProvide,
} from './capacity';
import {
  listMatchingContinuousSpeedEffects,
  materializeSlotEffects,
  type RecipeEffectSlot,
} from './action-improvements';
import { listPoolsMatchingTypes } from './action-match';

import {
  continuousProgressKey,
  MAX_ACTION_DURATION_TICKS,
  roundContinuousProgress,
  type ContinuousActionSnapshot,
  type ContinuousActiveJob,
  type ContinuousActiveMap,
  type ContinuousProgressMap,
  type ContinuousProgressRecord,
} from './continuous-types';

export type {
  ContinuousActionSnapshot,
  ContinuousProgressRecord,
  ContinuousActiveJob,
  ContinuousProgressMap,
  ContinuousActiveMap,
  ContinuousProgressRecordJSON,
  ContinuousActiveJobJSON,
} from './continuous-types';
export {
  continuousProgressKey,
  continuousProgressPercent,
  continuousProgressToJSON,
  continuousProgressFromJSON,
  continuousActionsToJSON,
  continuousActionsFromJSON,
  recipeEffectsFromSnapshotJSON,
  MAX_ACTION_DURATION_TICKS,
  CONTINUOUS_PROGRESS_DECIMALS,
  roundContinuousProgress,
} from './continuous-types';


function requirementsMet<THost>(
  registry: EngineRegistry<THost>,
  requirements: readonly Requirement[],
  context: EngineContext<THost>,
): boolean {
  return requirements.every((req) => registry.isRequirementMet(req, context));
}

function codeRequirementsMet<THost>(
  checks:
    | readonly ((context: EngineContext<THost>) => boolean)[]
    | undefined,
  context: EngineContext<THost>,
): boolean {
  return checks?.every((check) => check(context)) ?? true;
}

function costsPayable<THost>(
  registry: EngineRegistry<THost>,
  costs: readonly ActiveEffect[],
  context: EngineContext<THost>,
): boolean {
  return costs.every((cost) => registry.canApplyEffect(cost, context));
}

function anyResultPossible<THost>(
  registry: EngineRegistry<THost>,
  results: readonly ActiveEffect[],
  context: EngineContext<THost>,
): boolean {
  return results.some((result) => registry.canApplyEffect(result, context));
}

function actorForContext<THost>(
  context: EngineContext<THost>,
): EntityInstance | undefined {
  const id = context.actorEntityId ?? context.engine.primaryEntityId;
  return context.engine.entities.get(id);
}

function liveSlotEffects<THost>(
  effects: readonly ActiveEffect[],
  slot: RecipeEffectSlot,
  action: { readonly name: string; readonly types?: readonly string[] },
  context: EngineContext<THost>,
  registry: EngineRegistry<THost>,
): ActiveEffect[] {
  return materializeSlotEffects(
    effects,
    slot,
    actorForContext(context),
    action.name,
    action.types,
    registry,
    context.engine.entities,
  );
}

/** Omitted `durationTicks` on an action is treated as 1. */
export function actionDurationTicks<THost = unknown>(
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
): number {
  const raw = action.durationTicks;
  if (raw === undefined || raw === null) {
    return 1;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return n;
}

export function snapshotAction<THost = unknown>(
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
): ContinuousActionSnapshot {
  return {
    name: action.name,
    ...(action.description !== undefined
      ? { description: action.description }
      : {}),
    ...(action.label !== undefined ? { label: action.label } : {}),
    ...(action.sourceId !== undefined ? { sourceId: action.sourceId } : {}),
    requirements: Object.freeze([...action.requirements]),
    immediateEffects: Object.freeze([...action.immediateEffects]),
    overTimeEffects: Object.freeze([...(action.overTimeEffects ?? [])]),
    requiredEffects: Object.freeze([...action.requiredEffects]),
    optionalEffects: Object.freeze([...action.optionalEffects]),
    durationTicks: actionDurationTicks(action),
    types: Object.freeze([...(action.types ?? [])]),
  };
}

export function actionFromSnapshot(
  snapshot: ContinuousActionSnapshot,
): ActionDefinition<Requirement, ActiveEffect, unknown> {
  return {
    name: snapshot.name,
    ...(snapshot.description !== undefined
      ? { description: snapshot.description }
      : {}),
    ...(snapshot.label !== undefined ? { label: snapshot.label } : {}),
    ...(snapshot.sourceId !== undefined ? { sourceId: snapshot.sourceId } : {}),
    requirements: snapshot.requirements,
    immediateEffects: snapshot.immediateEffects,
    overTimeEffects: snapshot.overTimeEffects,
    requiredEffects: snapshot.requiredEffects,
    optionalEffects: snapshot.optionalEffects,
    durationTicks: snapshot.durationTicks,
    types: snapshot.types ?? [],
  };
}

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

/**
 * Max concurrent active continuous jobs for an actor (default 1).
 * Enforced at job start only — see composition doc “Known limitation” under
 * Continuous actions if max drops mid-run.
 */
export function selectContinuousSlotMax(
  actor: EntityInstance,
  registry?: SlotCatalog,
  entities?: EntityMap,
): number {
  const effects = listTagEffects(actor, 'continuous-slots', registry, entities);
  if (effects.length === 0) {
    return 1;
  }
  let total = 0;
  for (const effect of effects) {
    total += effect.strength;
  }
  return Math.max(1, total);
}

export function selectAllowInstantWhileContinuous(
  actor: EntityInstance,
  registry?: SlotCatalog,
  entities?: EntityMap,
): boolean {
  return (
    listTagEffects(
      actor,
      'allow-instant-while-continuous',
      registry,
      entities,
    ).length > 0
  );
}

/**
 * Effective duration: (base + sum addTicks) × multiply / divide, min 1.
 * Matches `continuous-speed` via action name and/or actionTypes.
 */
export function selectEffectiveDurationTicks(
  actor: EntityInstance,
  actionName: string,
  baseDurationTicks: number,
  registry?: SlotCatalog,
  entities?: EntityMap,
  actionTypes?: readonly string[],
): number {
  const effects = listMatchingContinuousSpeedEffects(
    actor,
    actionName,
    actionTypes,
    registry,
    entities,
  );
  let d = baseDurationTicks;
  for (const effect of effects) {
    const add =
      typeof effect.addTicks === 'number' && Number.isFinite(effect.addTicks)
        ? effect.addTicks
        : 0;
    d += add;
  }
  let multiply = 1;
  let divide = 1;
  for (const effect of effects) {
    if (typeof effect.multiply === 'number' && Number.isFinite(effect.multiply)) {
      multiply *= effect.multiply;
    }
    if (
      typeof effect.divide === 'number' &&
      Number.isFinite(effect.divide) &&
      effect.divide !== 0
    ) {
      divide *= effect.divide;
    }
  }
  d = (d * multiply) / divide;
  if (!Number.isFinite(d) || d < 1) {
    return 1;
  }
  return d;
}

/** Progress ticks gained per engine tick (default 1). */
export function selectContinuousProgressDelta(
  actor: EntityInstance,
  actionName: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  actionTypes?: readonly string[],
): number {
  const effects = listMatchingContinuousSpeedEffects(
    actor,
    actionName,
    actionTypes,
    registry,
    entities,
  );
  let total = 0;
  let any = false;
  for (const effect of effects) {
    if (
      typeof effect.generatorCount === 'number' &&
      Number.isFinite(effect.generatorCount)
    ) {
      total += effect.generatorCount;
      any = true;
    }
  }
  if (!any) {
    return 1;
  }
  return Math.max(1, total);
}

export function countActiveJobsForActor(
  state: EngineState,
  actorEntityId: string,
): number {
  let n = 0;
  for (const job of state.continuousActions.values()) {
    if (job.actorEntityId === actorEntityId) {
      n += 1;
    }
  }
  return n;
}

export function scaleEffectStrength(
  effect: ActiveEffect,
  fraction: number,
): ActiveEffect {
  return {
    ...effect,
    strength: Number((effect.strength * fraction).toFixed(6)),
  };
}

function applyEffectList<THost>(
  registry: EngineRegistry<THost>,
  effects: readonly ActiveEffect[],
  context: EngineContext<THost>,
): EngineContext<THost> {
  let next = context;
  for (const effect of effects) {
    next = registry.applyEffect(effect, next);
  }
  return next;
}

function canPayEffectList<THost>(
  registry: EngineRegistry<THost>,
  effects: readonly ActiveEffect[],
  context: EngineContext<THost>,
): boolean {
  return effects.every((effect) => registry.canApplyEffect(effect, context));
}

/**
 * Build the over-time cost slice for a progress fraction.
 * `adjust-pool` is strength-scaled; other types apply only when `includeNonPool`
 * (used on cycle completion settle).
 */
export function buildOverTimeSlice(
  overTimeEffects: readonly ActiveEffect[],
  fraction: number,
  includeNonPool: boolean,
): ActiveEffect[] {
  if (fraction <= 0) {
    return [];
  }
  const out: ActiveEffect[] = [];
  for (const effect of overTimeEffects) {
    if (effect.type === 'adjust-pool') {
      const scaled = scaleEffectStrength(effect, fraction);
      if (scaled.strength !== 0) {
        out.push(scaled);
      }
    } else if (includeNonPool) {
      out.push(effect);
    }
  }
  return out;
}

export type StartContinuousOptions<THost = unknown> = {
  readonly registry: EngineRegistry<THost>;
  readonly host: THost;
  readonly action: ActionDefinition<Requirement, ActiveEffect, THost>;
  readonly actorEntityId: string;
  readonly sourceEntityId?: string;
  readonly targetEntityId?: string;
  readonly execution?: 'manual' | 'automatic';
  readonly mode?: 'strict' | 'safe';
  readonly universalTags?: import('./tag-collection').TagCollection;
};

/**
 * Start or resume a continuous action. Duration-1 jobs advance to completion
 * in the same call when possible.
 */
export function startContinuousAction<THost>(
  state: EngineState,
  options: StartContinuousOptions<THost>,
): EngineState {
  const actor = state.entities.get(options.actorEntityId);
  if (!actor) {
    return state;
  }

  const progressKey = continuousProgressKey({
    actorEntityId: options.actorEntityId,
    actionName: options.action.name,
    sourceEntityId: options.sourceEntityId,
  });

  if (state.continuousActions.has(progressKey)) {
    return state;
  }

  const baseDuration = actionDurationTicks(options.action);
  if (baseDuration > MAX_ACTION_DURATION_TICKS) {
    return state;
  }
  const isInstant = baseDuration <= 1;
  const activeCount = countActiveJobsForActor(state, options.actorEntityId);
  const slotMax = selectContinuousSlotMax(
    actor,
    options.registry,
    entitiesWithUniversal(
      state,
      options.universalTags ?? TagCollection.create(),
    ),
  );
  const allowInstant = selectAllowInstantWhileContinuous(
    actor,
    options.registry,
    entitiesWithUniversal(
      state,
      options.universalTags ?? TagCollection.create(),
    ),
  );

  // Busy lock: any active job blocks new duration-1 starts unless allow tag.
  if (isInstant) {
    if (activeCount > 0 && !allowInstant) {
      return state;
    }
  } else if (activeCount >= slotMax) {
    return state;
  }

  let ctx = toEngineContext(
    state,
    options.host,
    {
      actorEntityId: options.actorEntityId,
      sourceEntityId: options.sourceEntityId,
      targetEntityId: options.targetEntityId,
    },
    options.universalTags ?? TagCollection.create(),
  );

  if (
    !requirementsMet(options.registry, options.action.requirements, ctx) ||
    !codeRequirementsMet(options.action.codeRequirements, ctx) ||
    !anyResultPossible(
      options.registry,
      liveSlotEffects(
        options.action.requiredEffects,
        'requiredEffects',
        options.action,
        ctx,
        options.registry,
      ),
      ctx,
    )
  ) {
    return state;
  }

  const existing = state.continuousProgress.get(progressKey);
  const midCycle =
    existing !== undefined &&
    existing.progress > 0 &&
    existing.progress < 100;

  const effectiveDuration = selectEffectiveDurationTicks(
    actor,
    options.action.name,
    baseDuration,
    options.registry,
    state.entities,
    options.action.types,
  );
  if (effectiveDuration > MAX_ACTION_DURATION_TICKS) {
    return state;
  }

  if (!midCycle) {
    const startImmediate = liveSlotEffects(
      options.action.immediateEffects,
      'immediateEffects',
      options.action,
      ctx,
      options.registry,
    );
    if (!costsPayable(options.registry, startImmediate, ctx)) {
      return state;
    }
    const firstDeltaTicks = Math.min(
      selectContinuousProgressDelta(
        actor,
        options.action.name,
        options.registry,
        state.entities,
        options.action.types,
      ),
      effectiveDuration,
    );
    const firstDeltaProgress = roundContinuousProgress(
      (firstDeltaTicks / effectiveDuration) * 100,
    );
    const firstSlice = liveSlotEffects(
      buildOverTimeSlice(
        options.action.overTimeEffects ?? [],
        firstDeltaProgress / 100,
        false,
      ),
      'overTimeEffects',
      options.action,
      ctx,
      options.registry,
    );
    if (!canPayEffectList(options.registry, firstSlice, ctx)) {
      return state;
    }
    ctx = applyEffectList(options.registry, startImmediate, ctx);
  }

  const snapshot = snapshotAction(options.action);
  const progress: ContinuousProgressRecord = midCycle
    ? {
        ...existing,
        action: snapshot,
        actorEntityId: options.actorEntityId,
        ...(options.sourceEntityId !== undefined
          ? { sourceEntityId: options.sourceEntityId }
          : existing.sourceEntityId !== undefined
            ? { sourceEntityId: existing.sourceEntityId }
            : {}),
        ...(options.targetEntityId !== undefined
          ? { targetEntityId: options.targetEntityId }
          : existing.targetEntityId !== undefined
            ? { targetEntityId: existing.targetEntityId }
            : {}),
      }
    : {
        progressKey,
        actorEntityId: options.actorEntityId,
        ...(options.sourceEntityId !== undefined
          ? { sourceEntityId: options.sourceEntityId }
          : {}),
        ...(options.targetEntityId !== undefined
          ? { targetEntityId: options.targetEntityId }
          : {}),
        action: snapshot,
        progress: 0,
      };

  let nextState = withContinuousState(ctx.engine, {
    continuousActions: upsertActive(ctx.engine.continuousActions, {
      progressKey,
      actorEntityId: options.actorEntityId,
    }),
    continuousProgress: upsertProgress(ctx.engine.continuousProgress, progress),
  });

  // Duration-1: advance to completion in the same command.
  if (isInstant) {
    nextState = advanceOneJob(nextState, progressKey, {
      registry: options.registry,
      host: options.host,
      execution: options.execution ?? 'manual',
      mode: options.mode ?? 'strict',
    });
  }

  return nextState;
}

function upsertActive(
  map: ContinuousActiveMap,
  job: ContinuousActiveJob,
): ContinuousActiveMap {
  const next = new Map(map);
  next.set(job.progressKey, job);
  return next;
}

function upsertProgress(
  map: ContinuousProgressMap,
  record: ContinuousProgressRecord,
): ContinuousProgressMap {
  const next = new Map(map);
  next.set(record.progressKey, record);
  return next;
}

function deleteActive(
  map: ContinuousActiveMap,
  progressKey: string,
): ContinuousActiveMap {
  if (!map.has(progressKey)) {
    return map;
  }
  const next = new Map(map);
  next.delete(progressKey);
  return next;
}

function deleteProgress(
  map: ContinuousProgressMap,
  progressKey: string,
): ContinuousProgressMap {
  if (!map.has(progressKey)) {
    return map;
  }
  const next = new Map(map);
  next.delete(progressKey);
  return next;
}

export function withContinuousState(
  state: EngineState,
  patch: {
    readonly continuousActions?: ContinuousActiveMap;
    readonly continuousProgress?: ContinuousProgressMap;
  },
): EngineState {
  return {
    ...state,
    ...(patch.continuousActions !== undefined
      ? { continuousActions: patch.continuousActions }
      : {}),
    ...(patch.continuousProgress !== undefined
      ? { continuousProgress: patch.continuousProgress }
      : {}),
  };
}

/** Pause an active job; keep progress. */
export function pauseContinuousAction(
  state: EngineState,
  progressKey: string,
): EngineState {
  if (!state.continuousActions.has(progressKey)) {
    return state;
  }
  return withContinuousState(state, {
    continuousActions: deleteActive(state.continuousActions, progressKey),
  });
}

/** Cancel: clear progress and free slot; no refund. */
export function cancelContinuousAction(
  state: EngineState,
  progressKey: string,
): EngineState {
  return withContinuousState(state, {
    continuousActions: deleteActive(state.continuousActions, progressKey),
    continuousProgress: deleteProgress(state.continuousProgress, progressKey),
  });
}

type AdvanceOptions<THost> = {
  readonly registry: EngineRegistry<THost>;
  readonly host: THost;
  readonly execution: 'manual' | 'automatic';
  readonly mode: 'strict' | 'safe';
  readonly universalTags?: import('./tag-collection').TagCollection;
};

function advanceOneJob<THost>(
  state: EngineState,
  progressKey: string,
  options: AdvanceOptions<THost>,
): EngineState {
  const job = state.continuousActions.get(progressKey);
  const record = state.continuousProgress.get(progressKey);
  if (!job || !record) {
    return state;
  }

  const actor = state.entities.get(record.actorEntityId);
  if (!actor) {
    return pauseContinuousAction(state, progressKey);
  }

  let ctx = toEngineContext(
    state,
    options.host,
    {
      actorEntityId: record.actorEntityId,
      sourceEntityId: record.sourceEntityId,
      targetEntityId: record.targetEntityId,
    },
    options.universalTags ?? TagCollection.create(),
  );

  const action = actionFromSnapshot(record.action);

  if (
    !requirementsMet(options.registry, action.requirements, ctx) ||
    !codeRequirementsMet(action.codeRequirements, ctx)
  ) {
    return pauseContinuousAction(state, progressKey);
  }

  if (record.progress >= 100) {
    return completeContinuousJob(state, progressKey, options);
  }

  // Recompute duration each tick so mid-action speed changes affect rate only.
  const baseDuration = actionDurationTicks(action);
  const D = selectEffectiveDurationTicks(
    actor,
    action.name,
    baseDuration,
    options.registry,
    state.entities,
    action.types,
  );
  if (D > MAX_ACTION_DURATION_TICKS) {
    return pauseContinuousAction(state, progressKey);
  }

  const rawDeltaTicks = selectContinuousProgressDelta(
    actor,
    action.name,
    options.registry,
    state.entities,
    action.types,
  );
  const remaining = roundContinuousProgress(100 - record.progress);
  const deltaProgress = roundContinuousProgress(
    Math.min((rawDeltaTicks / D) * 100, remaining),
  );
  if (deltaProgress <= 0) {
    return state;
  }

  const willComplete = roundContinuousProgress(record.progress + deltaProgress) >= 100;
  const payFraction = willComplete
    ? roundContinuousProgress(100 - record.progress) / 100
    : deltaProgress / 100;
  const slice = liveSlotEffects(
    buildOverTimeSlice(
      action.overTimeEffects ?? [],
      payFraction,
      willComplete,
    ),
    'overTimeEffects',
    action,
    ctx,
    options.registry,
  );

  if (!canPayEffectList(options.registry, slice, ctx)) {
    return pauseContinuousAction(state, progressKey);
  }

  if (slice.length > 0) {
    ctx = applyEffectList(options.registry, slice, ctx);
  }

  const nextProgress = willComplete
    ? 100
    : roundContinuousProgress(record.progress + deltaProgress);

  let nextState = withContinuousState(ctx.engine, {
    continuousProgress: upsertProgress(ctx.engine.continuousProgress, {
      ...record,
      progress: nextProgress,
    }),
  });

  if (nextProgress >= 100) {
    nextState = completeContinuousJob(nextState, progressKey, options);
  }

  return nextState;
}

function applyRequiredAndOptionalEffects<THost>(
  registry: EngineRegistry<THost>,
  requiredEffects: readonly ActiveEffect[],
  optionalEffects: readonly ActiveEffect[],
  context: EngineContext<THost>,
  mode: 'strict' | 'safe',
): EngineContext<THost> {
  let next = context;
  if (mode === 'safe') {
    for (const effect of requiredEffects) {
      if (registry.canApplyEffect(effect, next)) {
        next = registry.applyEffect(effect, next);
      }
    }
  } else {
    // Required effects must happen (apply always; pool clamps / no-ops are fine).
    for (const effect of requiredEffects) {
      next = registry.applyEffect(effect, next);
    }
  }
  // Optional effects happen only if able.
  for (const effect of optionalEffects) {
    if (registry.canApplyEffect(effect, next)) {
      next = registry.applyEffect(effect, next);
    }
  }
  return next;
}

function completeContinuousJob<THost>(
  state: EngineState,
  progressKey: string,
  options: AdvanceOptions<THost>,
): EngineState {
  const record = state.continuousProgress.get(progressKey);
  if (!record) {
    return withContinuousState(state, {
      continuousActions: deleteActive(state.continuousActions, progressKey),
    });
  }

  let ctx = toEngineContext(
    state,
    options.host,
    {
      actorEntityId: record.actorEntityId,
      sourceEntityId: record.sourceEntityId,
      targetEntityId: record.targetEntityId,
    },
    options.universalTags ?? TagCollection.create(),
  );

  const action = actionFromSnapshot(record.action);
  const settleFraction = Math.max(0, (100 - record.progress) / 100);
  if (settleFraction > 1e-9) {
    const settle = liveSlotEffects(
      buildOverTimeSlice(
        action.overTimeEffects ?? [],
        settleFraction,
        true,
      ),
      'overTimeEffects',
      action,
      ctx,
      options.registry,
    );
    if (canPayEffectList(options.registry, settle, ctx)) {
      ctx = applyEffectList(options.registry, settle, ctx);
    }
  }

  ctx = applyRequiredAndOptionalEffects(
    options.registry,
    liveSlotEffects(
      action.requiredEffects,
      'requiredEffects',
      action,
      ctx,
      options.registry,
    ),
    liveSlotEffects(
      action.optionalEffects,
      'optionalEffects',
      action,
      ctx,
      options.registry,
    ),
    ctx,
    options.mode,
  );

  let nextState = ctx.engine;
  const actorEntity = nextState.entities.get(record.actorEntityId);
  if (actorEntity) {
    nextState = upsertEntity(
      nextState,
      recordActionExecution(
        actorEntity,
        action.name,
        options.execution,
        nextState.tick,
      ),
    );
  }

  // Complete → progress 0% (absent record) and free slot.
  return withContinuousState(nextState, {
    continuousActions: deleteActive(nextState.continuousActions, progressKey),
    continuousProgress: deleteProgress(nextState.continuousProgress, progressKey),
  });
}

/** Advance all active continuous jobs one engine tick. */
export function advanceContinuousActions<THost>(
  state: EngineState,
  options: {
    readonly registry: EngineRegistry<THost>;
    readonly host: THost;
    readonly universalTags?: import('./tag-collection').TagCollection;
  },
): EngineState {
  let next = state;
  const keys = [...next.continuousActions.keys()];
  for (const progressKey of keys) {
    if (!next.continuousActions.has(progressKey)) {
      continue;
    }
    next = advanceOneJob(next, progressKey, {
      registry: options.registry,
      host: options.host,
      execution: 'automatic',
      mode: 'strict',
      universalTags: options.universalTags,
    });
  }
  return next;
}

/**
 * Pulse `generate-pool`, `cross-link` generators / product-tag capacity, and
 * capacity-assignment `toPool` provides (default every 1 tick).
 * Fullness uses raw Available vs raw Max−Reserved so micro-gains can accumulate
 * under capacityStep. Passive creates require `createPool: true`; assignments
 * unlock the dest pool on assign and pulse with createPool.
 */
export function pulseGenerators(
  state: EngineState,
  registry?: SlotCatalog,
  universalTags: TagCollection = TagCollection.create(),
): EngineState {
  let next = state;
  const entities = entitiesWithUniversal(next, universalTags);
  for (const entityId of [...next.entities.keys()]) {
    let entity = next.entities.get(entityId);
    if (!entity) {
      continue;
    }
    let generatorLastTick = {
      ...entity.metrics.generatorLastTick,
    } as Record<string, number>;
    let changed = false;

    const activeOpts = {
      universalTags,
      mergeUnslottedUniversal: entityId === next.primaryEntityId,
    };

    const markPulse = (key: string) => {
      generatorLastTick = {
        ...generatorLastTick,
        [key]: next.tick,
      };
      entity = {
        ...entity!,
        metrics: {
          ...entity!.metrics,
          generatorLastTick,
        },
      };
      changed = true;
    };

    const tryPulseAvailable = (
      pool: string,
      amount: number,
      key: string,
      createPool: boolean,
    ): boolean => {
      const cur = selectPoolAvailable(entity!, pool);
      const availableMax = selectPoolAvailableMax(
        next,
        entity!,
        pool,
        registry,
        universalTags,
      );
      if (amount > 0 && cur >= availableMax) {
        return false;
      }
      if (amount < 0 && cur <= 0) {
        return false;
      }
      const adjusted = tryAdjustEntityPool(
        next,
        entity!,
        pool,
        amount,
        registry,
        universalTags,
        next.tick,
        { createPool },
      );
      if (!adjusted) {
        return false;
      }
      entity = {
        ...adjusted,
        metrics: {
          ...adjusted.metrics,
          generatorLastTick: {
            ...generatorLastTick,
            [key]: next.tick,
          },
        },
      };
      generatorLastTick = entity.metrics.generatorLastTick as Record<
        string,
        number
      >;
      changed = true;
      return true;
    };

    for (const tag of selectActiveTags(entity, registry, entities, activeOpts)) {
      for (const effect of tag.effects) {
        const everyTicks =
          typeof effect.everyTicks === 'number' && effect.everyTicks > 0
            ? effect.everyTicks
            : 1;

        if (effect.type === 'generate-pool') {
          const amount =
            typeof effect.amount === 'number' ? effect.amount : effect.strength;
          if (!Number.isFinite(amount) || amount === 0) {
            continue;
          }
          const filter = {
            pool: typeof effect.pool === 'string' ? effect.pool : undefined,
            poolTypes: effect.poolTypes,
          };
          let pools: string[] =
            filter.pool !== undefined || filter.poolTypes !== undefined
              ? listPoolsMatchingTypes(registry, filter)
              : [];
          // Legacy single-id without catalog list: still pulse that id.
          if (
            pools.length === 0 &&
            typeof effect.pool === 'string' &&
            effect.pool
          ) {
            pools = [effect.pool];
          }
          for (const pool of pools) {
            const key = `${tag.name}::${pool}`;
            const last = generatorLastTick[key];
            const due = last === undefined || next.tick - last >= everyTicks;
            if (!due) {
              continue;
            }
            tryPulseAvailable(
              pool,
              amount,
              key,
              effect.createPool === true,
            );
          }
          continue;
        }

        if (effect.type !== 'cross-link') {
          continue;
        }

        const source = crossLinkSourceValue(
          entity,
          effect,
          registry,
          entities,
          activeOpts,
        );
        const coeff = crossLinkCoeff(effect);
        const pulseAmount = roundPoolQuantity(coeff * source);

        const toGenerate =
          typeof effect.toGeneratePool === 'string'
            ? effect.toGeneratePool
            : undefined;
        if (toGenerate) {
          const key = `${tag.name}::gen::${toGenerate}`;
          const last = generatorLastTick[key];
          const due = last === undefined || next.tick - last >= everyTicks;
          if (due && pulseAmount !== 0) {
            tryPulseAvailable(
              toGenerate,
              pulseAmount,
              key,
              effect.createPool === true,
            );
          }
        }

        const productTag =
          typeof effect.productTag === 'string' ? effect.productTag : undefined;
        const toPoolMax =
          typeof effect.toPoolMax === 'string' ? effect.toPoolMax : undefined;
        if (productTag && toPoolMax) {
          const key = `${tag.name}::product::${productTag}`;
          const last = generatorLastTick[key];
          const due = last === undefined || next.tick - last >= everyTicks;
          if (!due) {
            continue;
          }
          if (pulseAmount === 0) {
            markPulse(key);
            continue;
          }
          const existing = entity.tags.get(productTag);
          let nextStrength = pulseAmount;
          if (existing) {
            const prior = existing.effects.find(
              (e) => e.type === 'pool-max' && e.pool === toPoolMax,
            );
            nextStrength = roundPoolQuantity(
              (prior?.strength ?? 0) + pulseAmount,
            );
          }
          const product = createTag({
            name: productTag,
            effects: [
              {
                type: 'pool-max',
                name: `${productTag}:${toPoolMax}`,
                strength: nextStrength,
                pool: toPoolMax,
              },
            ],
          });
          const tags = existing
            ? entity.tags.set(product)
            : entity.tags.add(product);
          entity = withEntityTags(
            { ...entity, metrics: { ...entity.metrics, generatorLastTick } },
            tags,
            next.tick,
            registry,
            entities,
          );
          generatorLastTick = {
            ...entity.metrics.generatorLastTick,
            [key]: next.tick,
          };
          entity = {
            ...entity,
            metrics: {
              ...entity.metrics,
              generatorLastTick,
            },
          };
          changed = true;
        }
      }
    }

    for (const assignment of entity.capacityAssignments) {
      if (!assignment.toPool) {
        continue;
      }
      const amount = resolveAssignmentProvide(
        next,
        assignment,
        registry,
        universalTags,
      );
      if (!(amount > 0)) {
        continue;
      }
      const everyTicks = assignmentEveryTicks(assignment);
      const key = `capacity::${assignment.id}::${assignment.toPool}`;
      const last = generatorLastTick[key];
      const due = last === undefined || next.tick - last >= everyTicks;
      if (!due) {
        continue;
      }
      tryPulseAvailable(assignment.toPool, amount, key, true);
    }

    if (changed) {
      next = upsertEntity(next, entity);
    }
  }
  return next;
}

