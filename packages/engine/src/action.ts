import type { ActiveEffect } from './effect';
import type { EngineContext } from './context';
import type { Requirement } from './requirement';
import type { NoveltyAck } from './novelty-types';

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
  /** Cost to start a cycle at 0% progress (unchanged vs legacy instant costs). */
  readonly costs: readonly TEffect[];
  /**
   * Total cost for one full cycle, prorated as progress advances.
   * Inability to pay a slice pauses the job and keeps progress.
   */
  readonly costsOverTime?: readonly TEffect[];
  readonly results: readonly TEffect[];
  readonly sideEffects: readonly TEffect[];
  /**
   * Engine ticks to complete one cycle. Omitted ⇒ 1 (one-tick / “instant”).
   */
  readonly durationTicks?: number;
  /**
   * When set, this action is novel while `seenTag` is absent on the ack scope.
   * Ack by granting that catalog tag; display lives on the tag definition.
   */
  readonly novelty?: NoveltyAck;
  /** Design-time Gate/Block metadata for the content analyzer. */
  readonly analyzer?: import('./tools/analyzer/types').AnalyzerContentMeta;
  /** Optional host-code checks; omitted from serialized action definitions. */
  readonly codeRequirements?: readonly RequirementCheck<THost>[];
}
