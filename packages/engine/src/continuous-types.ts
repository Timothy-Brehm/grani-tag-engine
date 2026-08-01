import type { ActiveEffect } from './effect';
import type { Requirement } from './requirement';

/** Reject starting actions whose (effective) duration exceeds this. */
export const MAX_ACTION_DURATION_TICKS = 10_000;

/** Progress and paid-fraction values use two decimal places (0..100 percent). */
export const CONTINUOUS_PROGRESS_DECIMALS = 2;

/** Round a continuous percent (0..100) to two decimal places. */
export function roundContinuousProgress(value: number): number {
  return Number(value.toFixed(CONTINUOUS_PROGRESS_DECIMALS));
}

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

/**
 * Persisted continuous progress. `progress` is percent complete (0..100),
 * rounded to two decimals — same basis used to prorate `costsOverTime`
 * (`payFraction = deltaProgress / 100`). Effective duration is recomputed
 * each tick so mid-action speed changes affect remaining work only.
 */
export type ContinuousProgressRecord = {
  readonly progressKey: string;
  readonly actorEntityId: string;
  readonly sourceEntityId?: string;
  readonly targetEntityId?: string;
  readonly action: ContinuousActionSnapshot;
  /** Percent complete for this cycle (0..100), two decimal places. */
  readonly progress: number;
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
  /** Percent 0..100. Legacy saves may send progressTicks + effectiveDurationTicks. */
  progress?: number;
  /** @deprecated Prefer `progress` (percent). */
  progressTicks?: number;
  /** @deprecated Prefer `progress` (percent). */
  effectiveDurationTicks?: number;
  /** @deprecated Progress percent is the paid basis now. */
  costsOverTimePaidFraction?: number;
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

/** First-class percent complete (0..100), already rounded on the record. */
export function continuousProgressPercent(
  record: ContinuousProgressRecord,
): number {
  return record.progress;
}

function progressFromLegacyJSON(entry: ContinuousProgressRecordJSON): number {
  if (typeof entry.progress === 'number' && Number.isFinite(entry.progress)) {
    return roundContinuousProgress(Math.min(100, Math.max(0, entry.progress)));
  }
  const ticks = entry.progressTicks;
  const duration = entry.effectiveDurationTicks;
  if (
    typeof ticks === 'number' &&
    typeof duration === 'number' &&
    duration > 0
  ) {
    const paid =
      typeof entry.costsOverTimePaidFraction === 'number'
        ? entry.costsOverTimePaidFraction * 100
        : (ticks / duration) * 100;
    return roundContinuousProgress(Math.min(100, Math.max(0, paid)));
  }
  if (
    typeof entry.costsOverTimePaidFraction === 'number' &&
    Number.isFinite(entry.costsOverTimePaidFraction)
  ) {
    return roundContinuousProgress(
      Math.min(100, Math.max(0, entry.costsOverTimePaidFraction * 100)),
    );
  }
  return 0;
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
    progress: record.progress,
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
      progress: progressFromLegacyJSON(entry),
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
