/** When provided pool Max shrinks: claw Available then drop Max, or refuse. */
export type CapacityClawback = 'available' | 'strict';

export const DEFAULT_CAPACITY_CLAWBACK: CapacityClawback = 'available';

/**
 * Assignment on a converter entity: commit source capacity, provide dest
 * pool Max+generate or dest stat. Not an action recipe.
 */
export type CapacityAssignment = {
  readonly id: string;
  readonly sourceEntityId: string;
  readonly fromPool?: string;
  readonly fromStat?: string;
  /** Absolute units committed from the source. */
  readonly amount?: number;
  /** Percent of source pool Max or gross stat (0–100). */
  readonly percent?: number;
  readonly toPool?: string;
  readonly toStat?: string;
  /** Output = committed × efficiency. Default 1. */
  readonly efficiency?: number;
  /** Generate interval for `toPool`. Default 1. */
  readonly everyTicks?: number;
};

export type CapacityAssignmentJSON = CapacityAssignment;

export function normalizeCapacityClawback(
  value: CapacityClawback | undefined,
): CapacityClawback {
  return value === 'strict' ? 'strict' : DEFAULT_CAPACITY_CLAWBACK;
}

export function assignmentEfficiency(a: CapacityAssignment): number {
  const e = a.efficiency;
  return typeof e === 'number' && Number.isFinite(e) ? e : 1;
}

export function assignmentEveryTicks(a: CapacityAssignment): number {
  const t = a.everyTicks;
  return typeof t === 'number' && t > 0 ? t : 1;
}
