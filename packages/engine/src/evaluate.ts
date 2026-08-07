import type { ActionDefinition, RequirementCheck } from './action';
import type { ActiveEffect } from './effect';
import type { EngineContext } from './context';
import type { EngineRegistry } from './registry';
import type { Requirement } from './requirement';
import { materializeSlotEffects } from './action-improvements';
import {
  actionDurationTicks,
  canPayRequiredOverTimeSlice,
  continuousProgressKey,
  selectContinuousProgressDelta,
  selectEffectiveDurationTicks,
} from './continuous';

/** True when every requirement is met (original RequirementsMet). */
export function requirementsMet<THost>(
  registry: EngineRegistry<THost>,
  requirements: readonly Requirement[],
  context: EngineContext<THost>,
): boolean {
  return requirements.every((req) => registry.isRequirementMet(req, context));
}

/** Evaluate host-code predicates attached to a TypeScript-defined action. */
export function codeRequirementsMet<THost>(
  checks: readonly RequirementCheck<THost>[] | undefined,
  context: EngineContext<THost>,
): boolean {
  return checks?.every((check) => check(context)) ?? true;
}

/** True when every effect canHappen. */
export function costsPayable<THost>(
  registry: EngineRegistry<THost>,
  effects: readonly ActiveEffect[],
  context: EngineContext<THost>,
): boolean {
  return effects.every((effect) => registry.canApplyEffect(effect, context));
}

/** True when at least one effect canHappen (empty ⇒ false). */
export function anyResultPossible<THost>(
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
  slot:
    | 'requiredImmediateEffects'
    | 'optionalImmediateEffects'
    | 'requiredOverTimeEffects'
    | 'optionalOverTimeEffects'
    | 'requiredFinishedEffects'
    | 'optionalFinishedEffects',
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

/**
 * Action is available when requirements are met, required immediate effects
 * are payable, and at least one required finished effect is possible.
 * Optional immediate effects never block availability.
 *
 * Mid-cycle resume (saved progress > 0): requiredImmediateEffects are not
 * re-checked. At 0%: required immediate plus the first over-time slice must
 * be payable.
 */
export function isActionAvailable<THost>(
  registry: EngineRegistry<THost>,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
): boolean {
  const requiredFinished = liveSlot(
    action.requiredFinishedEffects,
    'requiredFinishedEffects',
    action,
    context,
    registry,
  );
  if (
    !requirementsMet(registry, action.requirements, context) ||
    !codeRequirementsMet(action.codeRequirements, context) ||
    !anyResultPossible(registry, requiredFinished, context)
  ) {
    return false;
  }

  const actorEntityId =
    context.actorEntityId ?? context.engine.primaryEntityId;
  const key = continuousProgressKey({
    actorEntityId,
    actionName: action.name,
    sourceEntityId: context.sourceEntityId,
  });
  const existing = context.engine.continuousProgress.get(key);
  const midCycle =
    existing !== undefined && existing.progress > 0 && existing.progress < 100;

  if (midCycle) {
    return true;
  }

  const requiredImmediate = liveSlot(
    action.requiredImmediateEffects,
    'requiredImmediateEffects',
    action,
    context,
    registry,
  );
  if (!costsPayable(registry, requiredImmediate, context)) {
    return false;
  }

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
    baseDuration <= 1,
    context,
  );
}

/**
 * FireAction-style execution (immutable context):
 * 1. Apply requiredImmediateEffects (caller should ensure canHappen).
 * 2. Apply optionalImmediateEffects only when `canHappen`.
 * 3. Apply requiredFinishedEffects — must happen (always applied; clamps may no-op).
 * 4. Apply optionalFinishedEffects only when `canHappen` is true.
 *
 * Prefer checking `isActionAvailable` first. For fully soft application, use
 * `executeActionSafe`. Hosts should prefer the `execute-action` command
 * (continuous pipeline); this helper remains for tests and one-shot recipes.
 */
export function executeAction<THost>(
  registry: EngineRegistry<THost>,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
): EngineContext<THost> {
  let next = context;
  for (const effect of liveSlot(
    action.requiredImmediateEffects,
    'requiredImmediateEffects',
    action,
    next,
    registry,
  )) {
    next = registry.applyEffect(effect, next);
  }
  for (const effect of liveSlot(
    action.optionalImmediateEffects ?? [],
    'optionalImmediateEffects',
    action,
    next,
    registry,
  )) {
    if (registry.canApplyEffect(effect, next)) {
      next = registry.applyEffect(effect, next);
    }
  }
  for (const effect of liveSlot(
    action.requiredFinishedEffects,
    'requiredFinishedEffects',
    action,
    next,
    registry,
  )) {
    next = registry.applyEffect(effect, next);
  }
  for (const side of liveSlot(
    action.optionalFinishedEffects,
    'optionalFinishedEffects',
    action,
    next,
    registry,
  )) {
    if (registry.canApplyEffect(side, next)) {
      next = registry.applyEffect(side, next);
    }
  }
  return next;
}

/**
 * Like executeAction, but only applies an effect when `canHappen` is true
 * at the moment it would be applied (re-checked per effect).
 */
export function executeActionSafe<THost>(
  registry: EngineRegistry<THost>,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
): EngineContext<THost> {
  let next = context;

  const applyIfPossible = (effect: ActiveEffect) => {
    if (registry.canApplyEffect(effect, next)) {
      next = registry.applyEffect(effect, next);
    }
  };

  for (const effect of liveSlot(
    action.requiredImmediateEffects,
    'requiredImmediateEffects',
    action,
    next,
    registry,
  )) {
    applyIfPossible(effect);
  }
  for (const effect of liveSlot(
    action.optionalImmediateEffects ?? [],
    'optionalImmediateEffects',
    action,
    next,
    registry,
  )) {
    applyIfPossible(effect);
  }
  for (const effect of liveSlot(
    action.requiredFinishedEffects,
    'requiredFinishedEffects',
    action,
    next,
    registry,
  )) {
    applyIfPossible(effect);
  }
  for (const side of liveSlot(
    action.optionalFinishedEffects,
    'optionalFinishedEffects',
    action,
    next,
    registry,
  )) {
    applyIfPossible(side);
  }
  return next;
}
