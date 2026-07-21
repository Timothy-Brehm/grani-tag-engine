import type { ActiveEffect } from './effect';
import type { EngineContext } from './context';
import type { Requirement } from './requirement';

/**
 * A code-only availability check supplied by a host application.
 *
 * Predicates are intentionally separate from `requirements`: they are useful
 * for TypeScript-defined actions, but cannot be serialized into content JSON.
 * Prefer a registered custom requirement type for authored content.
 */
export type RequirementCheck<THost = unknown> = (
  context: EngineContext<THost>,
) => boolean;

export interface ActionDefinition<
  TReq extends { type: string } = Requirement,
  TEffect extends ActiveEffect = ActiveEffect,
  THost = unknown,
> {
  readonly name: string;
  readonly description?: string;
  readonly label?: string;
  /** Generic stand-in for a former card/source identifier. */
  readonly sourceId?: string;
  readonly requirements: readonly TReq[];
  readonly costs: readonly TEffect[];
  readonly results: readonly TEffect[];
  readonly sideEffects: readonly TEffect[];
  /** Optional host-code checks; omitted from serialized action definitions. */
  readonly codeRequirements?: readonly RequirementCheck<THost>[];
}
