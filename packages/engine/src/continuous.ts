import type { ActionDefinition } from './action';
import type { ActiveEffect } from './effect';
import type { EngineContext } from './context';
import type { EngineRegistry } from './registry';
import type { Requirement } from './requirement';
import type { EntityInstance } from './entity';
import type { Tag } from './tag';
import { toEngineContext, upsertEntity, type EngineState } from './state';
import { selectPoolCurrent, selectPoolMax } from './selectors';
import { adjustEntityPool } from './entity';
import { recordActionExecution } from './metrics';

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
    costs: Object.freeze([...action.costs]),
    costsOverTime: Object.freeze([...(action.costsOverTime ?? [])]),
    results: Object.freeze([...action.results]),
    sideEffects: Object.freeze([...action.sideEffects]),
    durationTicks: actionDurationTicks(action),
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
    costs: snapshot.costs,
    costsOverTime: snapshot.costsOverTime,
    results: snapshot.results,
    sideEffects: snapshot.sideEffects,
    durationTicks: snapshot.durationTicks,
  };
}

function listTagEffects(
  entity: EntityInstance | undefined,
  effectType: string,
): Tag['effects'][number][] {
  if (!entity) {
    return [];
  }
  const out: Tag['effects'][number][] = [];
  for (const tag of entity.tags.list()) {
    for (const effect of tag.effects) {
      if (effect.type === effectType) {
        out.push(effect);
      }
    }
  }
  return out;
}

/** Max concurrent active continuous jobs for an actor (default 1). */
export function selectContinuousSlotMax(actor: EntityInstance): number {
  const effects = listTagEffects(actor, 'continuous-slots');
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
): boolean {
  return listTagEffects(actor, 'allow-instant-while-continuous').length > 0;
}

function speedEffectsForAction(
  actor: EntityInstance,
  actionName: string,
): Tag['effects'][number][] {
  return listTagEffects(actor, 'continuous-speed').filter((effect) => {
    const name = effect.actionName;
    return name === undefined || name === '*' || name === actionName;
  });
}

/**
 * Effective duration: (base + sum addTicks) × multiply / divide, min 1.
 */
export function selectEffectiveDurationTicks(
  actor: EntityInstance,
  actionName: string,
  baseDurationTicks: number,
): number {
  const effects = speedEffectsForAction(actor, actionName);
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
): number {
  const effects = speedEffectsForAction(actor, actionName);
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
  costsOverTime: readonly ActiveEffect[],
  fraction: number,
  includeNonPool: boolean,
): ActiveEffect[] {
  if (fraction <= 0) {
    return [];
  }
  const out: ActiveEffect[] = [];
  for (const effect of costsOverTime) {
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
  const slotMax = selectContinuousSlotMax(actor);
  const allowInstant = selectAllowInstantWhileContinuous(actor);

  // Busy lock: any active job blocks new duration-1 starts unless allow tag.
  if (isInstant) {
    if (activeCount > 0 && !allowInstant) {
      return state;
    }
  } else if (activeCount >= slotMax) {
    return state;
  }

  let ctx = toEngineContext(state, options.host, {
    actorEntityId: options.actorEntityId,
    sourceEntityId: options.sourceEntityId,
    targetEntityId: options.targetEntityId,
  });

  if (
    !requirementsMet(options.registry, options.action.requirements, ctx) ||
    !codeRequirementsMet(options.action.codeRequirements, ctx) ||
    !anyResultPossible(options.registry, options.action.results, ctx)
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
  );
  if (effectiveDuration > MAX_ACTION_DURATION_TICKS) {
    return state;
  }

  if (!midCycle) {
    if (!costsPayable(options.registry, options.action.costs, ctx)) {
      return state;
    }
    const firstDeltaTicks = Math.min(
      selectContinuousProgressDelta(actor, options.action.name),
      effectiveDuration,
    );
    const firstDeltaProgress = roundContinuousProgress(
      (firstDeltaTicks / effectiveDuration) * 100,
    );
    const firstSlice = buildOverTimeSlice(
      options.action.costsOverTime ?? [],
      firstDeltaProgress / 100,
      false,
    );
    if (!canPayEffectList(options.registry, firstSlice, ctx)) {
      return state;
    }
    ctx = applyEffectList(options.registry, options.action.costs, ctx);
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

  let ctx = toEngineContext(state, options.host, {
    actorEntityId: record.actorEntityId,
    sourceEntityId: record.sourceEntityId,
    targetEntityId: record.targetEntityId,
  });

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
  const D = selectEffectiveDurationTicks(actor, action.name, baseDuration);
  if (D > MAX_ACTION_DURATION_TICKS) {
    return pauseContinuousAction(state, progressKey);
  }

  const rawDeltaTicks = selectContinuousProgressDelta(actor, action.name);
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
  const slice = buildOverTimeSlice(
    action.costsOverTime ?? [],
    payFraction,
    willComplete,
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

function applyResultsAndSideEffects<THost>(
  registry: EngineRegistry<THost>,
  results: readonly ActiveEffect[],
  sideEffects: readonly ActiveEffect[],
  context: EngineContext<THost>,
  mode: 'strict' | 'safe',
): EngineContext<THost> {
  let next = context;
  if (mode === 'safe') {
    for (const result of results) {
      if (registry.canApplyEffect(result, next)) {
        next = registry.applyEffect(result, next);
      }
    }
  } else {
    // Results must happen (apply always; pool clamps / no-ops are fine).
    for (const result of results) {
      next = registry.applyEffect(result, next);
    }
  }
  // Side effects happen only if able.
  for (const side of sideEffects) {
    if (registry.canApplyEffect(side, next)) {
      next = registry.applyEffect(side, next);
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

  let ctx = toEngineContext(state, options.host, {
    actorEntityId: record.actorEntityId,
    sourceEntityId: record.sourceEntityId,
    targetEntityId: record.targetEntityId,
  });

  const action = actionFromSnapshot(record.action);
  const settleFraction = Math.max(0, (100 - record.progress) / 100);
  if (settleFraction > 1e-9) {
    const settle = buildOverTimeSlice(
      action.costsOverTime ?? [],
      settleFraction,
      true,
    );
    if (canPayEffectList(options.registry, settle, ctx)) {
      ctx = applyEffectList(options.registry, settle, ctx);
    }
  }

  ctx = applyResultsAndSideEffects(
    options.registry,
    action.results,
    action.sideEffects,
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
    });
  }
  return next;
}

/**
 * Pulse `generate-pool` tag passives. If the pool is full, skip and do not
 * advance lastPulse.
 */
export function pulseGenerators(state: EngineState): EngineState {
  let next = state;
  for (const entityId of [...next.entities.keys()]) {
    let entity = next.entities.get(entityId);
    if (!entity) {
      continue;
    }
    let generatorLastTick = {
      ...entity.metrics.generatorLastTick,
    } as Record<string, number>;
    let changed = false;

    for (const tag of entity.tags.list()) {
      for (const effect of tag.effects) {
        if (effect.type !== 'generate-pool') {
          continue;
        }
        const pool = typeof effect.pool === 'string' ? effect.pool : undefined;
        if (!pool) {
          continue;
        }
        const everyTicks =
          typeof effect.everyTicks === 'number' && effect.everyTicks > 0
            ? effect.everyTicks
            : 1;
        const amount =
          typeof effect.amount === 'number' ? effect.amount : effect.strength;
        if (!Number.isFinite(amount) || amount === 0) {
          continue;
        }
        const key = `${tag.name}::${pool}`;
        const last = generatorLastTick[key];
        const due = last === undefined || next.tick - last >= everyTicks;
        if (!due) {
          continue;
        }
        const max = selectPoolMax(entity, pool);
        const cur = selectPoolCurrent(entity, pool);
        if (amount > 0 && cur >= max) {
          continue;
        }
        if (amount < 0 && cur <= 0) {
          continue;
        }
        const adjusted = adjustEntityPool(entity, pool, amount, max, next.tick);
        generatorLastTick[key] = next.tick;
        entity = {
          ...adjusted,
          metrics: {
            ...adjusted.metrics,
            generatorLastTick: Object.freeze({ ...generatorLastTick }),
          },
        };
        changed = true;
      }
    }

    if (changed) {
      next = upsertEntity(next, entity);
    }
  }
  return next;
}

