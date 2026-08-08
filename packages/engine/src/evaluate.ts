import type { ActionDefinition } from './action';
import type { ActiveEffect } from './effect';
import type { EngineContext } from './context';
import type { EngineRegistry } from './registry';
import type { Requirement } from './requirement';
import { materializeSlotEffects } from './action-improvements';

export {
  emptyOrPayable,
  hasProductiveEffect,
  isActionStartable,
  isActionContinuable,
  isActionFinishable,
  isActionAvailable,
} from './action-availability';

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
  checks: readonly ((context: EngineContext<THost>) => boolean)[] | undefined,
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
