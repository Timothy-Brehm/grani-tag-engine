/**
 * Action start / continue / finish availability (empty-or-payable + productive-effect).
 * Lives here so continuous can share helpers without importing evaluate
 * (evaluate → this → continuous; continuous → this).
 */

import type { ActionDefinition, RequirementCheck } from './action';
import type { ActiveEffect } from './effect';
import type { EngineContext } from './context';
import type { EngineRegistry } from './registry';
import type { Requirement } from './requirement';
import {
  materializeSlotEffects,
  type RecipeEffectSlot,
} from './action-improvements';
import {
  actionDurationTicks,
  canPayRequiredOverTimeSlice,
  continuousProgressKey,
  roundContinuousProgress,
  selectContinuousProgressDelta,
  selectEffectiveDurationTicks,
} from './continuous';

function requirementsMet<THost>(
  registry: EngineRegistry<THost>,
  requirements: readonly Requirement[],
  context: EngineContext<THost>,
): boolean {
  return requirements.every((req) => registry.isRequirementMet(req, context));
}

function codeRequirementsMetLocal<THost>(
  checks: readonly RequirementCheck<THost>[] | undefined,
  context: EngineContext<THost>,
): boolean {
  return checks?.every((check) => check(context)) ?? true;
}

function anyEffectPossible<THost>(
  registry: EngineRegistry<THost>,
  effects: readonly ActiveEffect[],
  context: EngineContext<THost>,
): boolean {
  return effects.some((effect) => registry.canApplyEffect(effect, context));
}

function actorFromContext<THost>(context: EngineContext<THost>) {
  const id = context.actorEntityId ?? context.engine.primaryEntityId;
  return context.engine.entities.get(id);
}

function liveSlot<THost>(
  effects: readonly ActiveEffect[],
  slot: RecipeEffectSlot,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
  registry: EngineRegistry<THost>,
): ActiveEffect[] {
  return materializeSlotEffects(
    effects,
    slot,
    actorFromContext(context),
    action.name,
    action.types,
    registry,
    context.engine.entities,
  );
}

/** Empty list is fine; otherwise every effect must canHappen. */
export function emptyOrPayable<THost>(
  registry: EngineRegistry<THost>,
  effects: readonly ActiveEffect[],
  context: EngineContext<THost>,
): boolean {
  return (
    effects.length === 0 ||
    effects.every((effect) => registry.canApplyEffect(effect, context))
  );
}

/**
 * Start / re-arm only: something productive must be able to happen.
 * Not re-checked as a tax on idle mid-cycle ticks.
 */
export function hasProductiveEffect<THost>(
  registry: EngineRegistry<THost>,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
): boolean {
  const requiredFinishedAuthored = action.requiredFinishedEffects.length > 0;
  const optionalFinishedAuthored =
    (action.optionalFinishedEffects?.length ?? 0) > 0;
  if (requiredFinishedAuthored || optionalFinishedAuthored) {
    const requiredFinished = liveSlot(
      action.requiredFinishedEffects,
      'requiredFinishedEffects',
      action,
      context,
      registry,
    );
    const optionalFinished = liveSlot(
      action.optionalFinishedEffects ?? [],
      'optionalFinishedEffects',
      action,
      context,
      registry,
    );
    // Repeatable gather/harvest: unlock tags sit in required Finished; the
    // soft fill lives in optional Finished and must still count after unlock.
    return anyEffectPossible(
      registry,
      [...requiredFinished, ...optionalFinished],
      context,
    );
  }

  const immediateAuthored =
    action.requiredImmediateEffects.length > 0 ||
    (action.optionalImmediateEffects?.length ?? 0) > 0;
  if (immediateAuthored) {
    const requiredImmediate = liveSlot(
      action.requiredImmediateEffects,
      'requiredImmediateEffects',
      action,
      context,
      registry,
    );
    const optionalImmediate = liveSlot(
      action.optionalImmediateEffects ?? [],
      'optionalImmediateEffects',
      action,
      context,
      registry,
    );
    return anyEffectPossible(
      registry,
      [...requiredImmediate, ...optionalImmediate],
      context,
    );
  }

  const requiredOt = action.requiredOverTimeEffects ?? [];
  const optionalOt = action.optionalOverTimeEffects ?? [];
  const otAuthored = requiredOt.length > 0 || optionalOt.length > 0;
  if (otAuthored) {
    if (requiredOt.length > 0) {
      return true;
    }
    const optionalLive = liveSlot(
      optionalOt,
      'optionalOverTimeEffects',
      action,
      context,
      registry,
    );
    return anyEffectPossible(registry, optionalLive, context);
  }

  return true;
}

function firstOverTimeFractionPayable<THost>(
  registry: EngineRegistry<THost>,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
): boolean {
  const actorEntityId =
    context.actorEntityId ?? context.engine.primaryEntityId;
  const actor = context.engine.entities.get(actorEntityId);
  if (!actor) {
    return false;
  }
  const baseDuration = actionDurationTicks(action);
  const D = selectEffectiveDurationTicks(
    actor,
    action.name,
    baseDuration,
    registry,
    context.engine.entities,
    action.types,
  );
  const deltaTicks = Math.min(
    selectContinuousProgressDelta(
      actor,
      action.name,
      registry,
      context.engine.entities,
      action.types,
    ),
    D,
  );
  const deltaProgress = (deltaTicks / D) * 100;
  return canPayRequiredOverTimeSlice(
    registry,
    action,
    deltaProgress / 100,
    false,
    context,
  );
}

/** Requirements + productive-effect + required Immediate + first OT empty-or-payable. */
export function isActionStartable<THost>(
  registry: EngineRegistry<THost>,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
): boolean {
  if (
    !requirementsMet(registry, action.requirements, context) ||
    !codeRequirementsMetLocal(action.codeRequirements, context) ||
    !hasProductiveEffect(registry, action, context)
  ) {
    return false;
  }

  const requiredImmediate = liveSlot(
    action.requiredImmediateEffects,
    'requiredImmediateEffects',
    action,
    context,
    registry,
  );
  if (!emptyOrPayable(registry, requiredImmediate, context)) {
    return false;
  }

  return firstOverTimeFractionPayable(registry, action, context);
}

function thisTickDeltaProgress<THost>(
  registry: EngineRegistry<THost>,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
  progress: number,
): number | null {
  const actorEntityId =
    context.actorEntityId ?? context.engine.primaryEntityId;
  const actor = context.engine.entities.get(actorEntityId);
  if (!actor) {
    return null;
  }
  const baseDuration = actionDurationTicks(action);
  const D = selectEffectiveDurationTicks(
    actor,
    action.name,
    baseDuration,
    registry,
    context.engine.entities,
    action.types,
  );
  const rawDeltaTicks = selectContinuousProgressDelta(
    actor,
    action.name,
    registry,
    context.engine.entities,
    action.types,
  );
  const remaining = roundContinuousProgress(100 - progress);
  return roundContinuousProgress(
    Math.min((rawDeltaTicks / D) * 100, remaining),
  );
}

/**
 * Mid-cycle: requirements + this tick’s required OT slice empty-or-payable.
 * `progress` is the saved percent (0..100).
 */
export function isActionContinuable<THost>(
  registry: EngineRegistry<THost>,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
  progress: number,
): boolean {
  if (
    !requirementsMet(registry, action.requirements, context) ||
    !codeRequirementsMetLocal(action.codeRequirements, context)
  ) {
    return false;
  }

  const deltaProgress = thisTickDeltaProgress(
    registry,
    action,
    context,
    progress,
  );
  if (deltaProgress === null || deltaProgress <= 0) {
    return false;
  }

  return canPayRequiredOverTimeSlice(
    registry,
    action,
    deltaProgress / 100,
    false,
    context,
  );
}

/**
 * Finish: requirements + remaining OT settle (includeNonPool) + requiredFinished
 * empty-or-payable (all must be payable when non-empty).
 */
export function isActionFinishable<THost>(
  registry: EngineRegistry<THost>,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
  progress: number,
): boolean {
  if (
    !requirementsMet(registry, action.requirements, context) ||
    !codeRequirementsMetLocal(action.codeRequirements, context)
  ) {
    return false;
  }

  const settleFraction = Math.max(0, (100 - progress) / 100);
  if (
    settleFraction > 1e-9 &&
    !canPayRequiredOverTimeSlice(
      registry,
      action,
      settleFraction,
      true,
      context,
    )
  ) {
    return false;
  }

  const requiredFinished = liveSlot(
    action.requiredFinishedEffects,
    'requiredFinishedEffects',
    action,
    context,
    registry,
  );
  // Positive adjust-pool fills often share a Finished slot with the grant-tag
  // that raises pool-max; they become payable only after those grants apply.
  // Gate hard Finished effects (costs / removes / etc.); soft fills are clamped
  // at apply time. Idempotent grant/lock tags are soft — already held is fine.
  const hardFinished = requiredFinished.filter((effect) => {
    if (effect.type === 'adjust-pool') {
      return effect.strength < 0;
    }
    if (effect.type === 'grant-tag' || effect.type === 'lock-tag') {
      return false;
    }
    return true;
  });
  return emptyOrPayable(registry, hardFinished, context);
}

/**
 * Host offer gate: startable at 0%; mid-cycle continuable or finishable when
 * the next delta would complete; progress ≥ 100 treated as finishable.
 */
export function isActionAvailable<THost>(
  registry: EngineRegistry<THost>,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
): boolean {
  const actorEntityId =
    context.actorEntityId ?? context.engine.primaryEntityId;
  const key = continuousProgressKey({
    actorEntityId,
    actionName: action.name,
    sourceEntityId: context.sourceEntityId,
  });
  const existing = context.engine.continuousProgress.get(key);
  const progress = existing?.progress ?? 0;

  if (progress >= 100) {
    return isActionFinishable(registry, action, context, progress);
  }

  if (progress > 0 && progress < 100) {
    const deltaProgress = thisTickDeltaProgress(
      registry,
      action,
      context,
      progress,
    );
    if (deltaProgress === null || deltaProgress <= 0) {
      return false;
    }
    const willComplete =
      roundContinuousProgress(progress + deltaProgress) >= 100;
    if (willComplete) {
      return isActionFinishable(registry, action, context, progress);
    }
    return isActionContinuable(registry, action, context, progress);
  }

  return isActionStartable(registry, action, context);
}
