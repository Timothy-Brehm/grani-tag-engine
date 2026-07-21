import type { ActiveEffect } from './effect';
import type { Requirement } from './requirement';

export interface ActionDefinition<
  TReq extends { type: string } = Requirement,
  TEffect extends ActiveEffect = ActiveEffect,
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
}
