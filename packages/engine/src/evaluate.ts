import type { ActionDefinition, RequirementCheck } from './action';
import type { ActiveEffect } from './effect';
import type { EngineContext } from './context';
import type { EngineRegistry } from './registry';
import type { Requirement } from './requirement';
import {
  actionDurationTicks,
  buildOverTimeSlice,
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

/** True when every cost canHappen (original CostsCanPay). */
export function costsPayable<THost>(
  registry: EngineRegistry<THost>,
  costs: readonly ActiveEffect[],
  context: EngineContext<THost>,
): boolean {
  return costs.every((cost) => registry.canApplyEffect(cost, context));
}

/** True when at least one result canHappen (original AnyResult; empty ⇒ false). */
export function anyResultPossible<THost>(
  registry: EngineRegistry<THost>,
  results: readonly ActiveEffect[],
  context: EngineContext<THost>,
): boolean {
  return results.some((result) => registry.canApplyEffect(result, context));
}

/**
 * Action is available when requirements are met, costs are payable,
 * and at least one result is possible.
 *
 * Mid-cycle resume (saved progress > 0): start `costs` are not re-checked.
 * At 0%: start costs plus the first over-time slice must be payable.
 */
export function isActionAvailable<THost>(
  registry: EngineRegistry<THost>,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
): boolean {
  if (
    !requirementsMet(registry, action.requirements, context) ||
    !codeRequirementsMet(action.codeRequirements, context) ||
    !anyResultPossible(registry, action.results, context)
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

  if (!costsPayable(registry, action.costs, context)) {
    return false;
  }

  const actor = context.engine.entities.get(actorEntityId);
  if (!actor) {
    return false;
  }
  const baseDuration = actionDurationTicks(action);
  const D = selectEffectiveDurationTicks(actor, action.name, baseDuration);
  const deltaTicks = Math.min(
    selectContinuousProgressDelta(actor, action.name),
    D,
  );
  const deltaProgress = (deltaTicks / D) * 100;
  const slice = buildOverTimeSlice(
    action.costsOverTime ?? [],
    deltaProgress / 100,
    baseDuration <= 1,
  );
  return costsPayable(registry, slice, context);
}

/**
 * FireAction-style execution (immutable context):
 * 1. Apply all costs in order (caller should ensure canHappen).
 * 2. Apply all **results** in order — results **must happen** (always applied;
 *    pools clamp / idempotent grants may no-op).
 * 3. Apply **side effects** only when `canHappen` is true — useful when a
 *    stockpile is full: the result still fires, optional extras skip.
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
  for (const cost of action.costs) {
    next = registry.applyEffect(cost, next);
  }
  for (const result of action.results) {
    next = registry.applyEffect(result, next);
  }
  for (const side of action.sideEffects) {
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

  for (const cost of action.costs) {
    applyIfPossible(cost);
  }
  for (const result of action.results) {
    applyIfPossible(result);
  }
  for (const side of action.sideEffects) {
    applyIfPossible(side);
  }
  return next;
}
