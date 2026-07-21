import type { ActionDefinition, RequirementCheck } from './action';
import type { ActiveEffect } from './effect';
import type { EngineContext } from './context';
import type { EngineRegistry } from './registry';
import type { Requirement } from './requirement';

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
 */
export function isActionAvailable<THost>(
  registry: EngineRegistry<THost>,
  action: ActionDefinition<Requirement, ActiveEffect, THost>,
  context: EngineContext<THost>,
): boolean {
  return (
    requirementsMet(registry, action.requirements, context) &&
    codeRequirementsMet(action.codeRequirements, context) &&
    costsPayable(registry, action.costs, context) &&
    anyResultPossible(registry, action.results, context)
  );
}

/**
 * FireAction-style execution (immutable context):
 * 1. Apply all costs in order (caller should ensure canHappen).
 * 2. Apply all results in order (original ResultsHappen applied all without re-check).
 * 3. Apply all sideEffects in order.
 *
 * Prefer checking `isActionAvailable` first. For guarded application, use `executeActionSafe`.
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
    next = registry.applyEffect(side, next);
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
