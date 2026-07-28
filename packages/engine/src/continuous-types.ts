import type { ActiveEffect } from './effect';
import type { Requirement } from './requirement';

/** Serializable snapshot of an action recipe for continuous jobs. */
export type ContinuousActionSnapshot = {
  readonly name: string;
  readonly description?: string;
  readonly label?: string;
  readonly sourceId?: string;
  readonly requirements: readonly Requirement[];
  readonly costs: readonly ActiveEffect[];
  readonly costsOverTime: readonly ActiveEffect[];
  readonly results: readonly ActiveEffect[];
  readonly sideEffects: readonly ActiveEffect[];
  readonly durationTicks: number;
};

export type ContinuousProgressRecord = {
  readonly progressKey: string;
  readonly actorEntityId: string;
  readonly sourceEntityId?: string;
  readonly targetEntityId?: string;
  readonly action: ContinuousActionSnapshot;
  /** Progress toward one cycle (0 .. effectiveDurationTicks). */
  readonly progressTicks: number;
  /** Duration used for this cycle (speed modifiers applied at start/resume). */
  readonly effectiveDurationTicks: number;
  /** Fraction of `costsOverTime` already paid this cycle (0..1). */
  readonly costsOverTimePaidFraction: number;
};

export type ContinuousActiveJob = {
  readonly progressKey: string;
  readonly actorEntityId: string;
};

export type ContinuousProgressMap = ReadonlyMap<string, ContinuousProgressRecord>;
export type ContinuousActiveMap = ReadonlyMap<string, ContinuousActiveJob>;

export type ContinuousProgressRecordJSON = {
  progressKey: string;
  actorEntityId: string;
  sourceEntityId?: string;
  targetEntityId?: string;
  action: ContinuousActionSnapshot;
  progressTicks: number;
  effectiveDurationTicks: number;
  costsOverTimePaidFraction: number;
};

export type ContinuousActiveJobJSON = {
  progressKey: string;
  actorEntityId: string;
};

export function continuousProgressKey(input: {
  readonly actorEntityId: string;
  readonly actionName: string;
  readonly sourceEntityId?: string;
}): string {
  return `${input.actorEntityId}::${input.actionName}::${input.sourceEntityId ?? ''}`;
}

export function continuousProgressPercent(
  record: ContinuousProgressRecord,
): number {
  if (record.effectiveDurationTicks <= 0) {
    return 0;
  }
  return record.progressTicks / record.effectiveDurationTicks;
}

export function continuousProgressToJSON(
  map: ContinuousProgressMap,
): ContinuousProgressRecordJSON[] {
  return [...map.values()].map((record) => ({
    progressKey: record.progressKey,
    actorEntityId: record.actorEntityId,
    ...(record.sourceEntityId !== undefined
      ? { sourceEntityId: record.sourceEntityId }
      : {}),
    ...(record.targetEntityId !== undefined
      ? { targetEntityId: record.targetEntityId }
      : {}),
    action: {
      ...record.action,
      requirements: [...record.action.requirements],
      costs: [...record.action.costs],
      costsOverTime: [...record.action.costsOverTime],
      results: [...record.action.results],
      sideEffects: [...record.action.sideEffects],
    },
    progressTicks: record.progressTicks,
    effectiveDurationTicks: record.effectiveDurationTicks,
    costsOverTimePaidFraction: record.costsOverTimePaidFraction,
  }));
}

export function continuousProgressFromJSON(
  list: ContinuousProgressRecordJSON[] | undefined,
): ContinuousProgressMap {
  const map = new Map<string, ContinuousProgressRecord>();
  for (const entry of list ?? []) {
    map.set(entry.progressKey, {
      progressKey: entry.progressKey,
      actorEntityId: entry.actorEntityId,
      ...(entry.sourceEntityId !== undefined
        ? { sourceEntityId: entry.sourceEntityId }
        : {}),
      ...(entry.targetEntityId !== undefined
        ? { targetEntityId: entry.targetEntityId }
        : {}),
      action: {
        ...entry.action,
        requirements: Object.freeze([...(entry.action.requirements ?? [])]),
        costs: Object.freeze([...(entry.action.costs ?? [])]),
        costsOverTime: Object.freeze([...(entry.action.costsOverTime ?? [])]),
        results: Object.freeze([...(entry.action.results ?? [])]),
        sideEffects: Object.freeze([...(entry.action.sideEffects ?? [])]),
        durationTicks: entry.action.durationTicks ?? 1,
      },
      progressTicks: entry.progressTicks ?? 0,
      effectiveDurationTicks: entry.effectiveDurationTicks ?? 1,
      costsOverTimePaidFraction: entry.costsOverTimePaidFraction ?? 0,
    });
  }
  return map;
}

export function continuousActionsToJSON(
  map: ContinuousActiveMap,
): ContinuousActiveJobJSON[] {
  return [...map.values()].map((job) => ({
    progressKey: job.progressKey,
    actorEntityId: job.actorEntityId,
  }));
}

export function continuousActionsFromJSON(
  list: ContinuousActiveJobJSON[] | undefined,
): ContinuousActiveMap {
  const map = new Map<string, ContinuousActiveJob>();
  for (const entry of list ?? []) {
    map.set(entry.progressKey, {
      progressKey: entry.progressKey,
      actorEntityId: entry.actorEntityId,
    });
  }
  return map;
}
