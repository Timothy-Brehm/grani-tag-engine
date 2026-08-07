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
  /**
   * Effects applied when starting a cycle at 0% progress.
   * Often costs; any adjust sign is allowed in any slot.
   */
  readonly immediateEffects: readonly TEffect[];
  /**
   * Total **required** effects for one full cycle, prorated as progress advances.
   * Inability to apply a slice pauses the job and keeps progress.
   */
  readonly requiredOverTimeEffects?: readonly TEffect[];
  /**
   * Total **optional** effects for one full cycle, prorated as progress advances.
   * Each effect applies only when `canHappen` (e.g. pool not full); never pauses.
   */
  readonly optionalOverTimeEffects?: readonly TEffect[];
  /** Effects that must apply on completion (always applied; clamps may no-op). */
  readonly requiredEffects: readonly TEffect[];
  /** Effects applied on completion only when `canHappen` is true. */
  readonly optionalEffects: readonly TEffect[];
  /**
   * Engine ticks to complete one cycle. Omitted ⇒ 1 (one-tick / “instant”).
   */
  readonly durationTicks?: number;
  /**
   * When true, after a continuous cycle completes, if the action is still
   * available, re-arm at 0% and keep the slot. The next advance happens on a
   * later tick (duration-1 does not spin multiple cycles in one command).
   * Caps are normal availability (requirements / results), not a max-rep field.
   */
  readonly repeatWhileAvailable?: boolean;
  /**
   * Arbitrary content Types for improvement matching (e.g. `Explore`).
   * Each applies independently; see docs/design/action-types.md.
   */
  readonly types?: readonly string[];
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
