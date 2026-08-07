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
  readonly requiredImmediateEffects: readonly ActiveEffect[];
  readonly optionalImmediateEffects: readonly ActiveEffect[];
  /** Required over-time (hard). */
  readonly requiredOverTimeEffects: readonly ActiveEffect[];
  /** Optional over-time (soft / if able). */
  readonly optionalOverTimeEffects: readonly ActiveEffect[];
  readonly requiredFinishedEffects: readonly ActiveEffect[];
  readonly optionalFinishedEffects: readonly ActiveEffect[];
  readonly durationTicks: number;
  /** Authored Types (empty if omitted on the recipe). */
  readonly types: readonly string[];
  /** See {@link import('./action').ActionDefinition.repeatWhileAvailable}. */
  readonly repeatWhileAvailable?: boolean;
};

/**
 * Dual-read recipe effect slots from continuous JSON (new keys or legacy
 * `immediateEffects` / `costs` / `costsOverTime` / `overTimeEffects` /
 * `requiredEffects` / `results` / `optionalEffects` / `sideEffects`).
 * See docs/UPGRADING.md.
 */
export function recipeEffectsFromSnapshotJSON(action: {
  readonly requiredImmediateEffects?: readonly ActiveEffect[];
  /** @deprecated Prefer `requiredImmediateEffects`. */
  readonly immediateEffects?: readonly ActiveEffect[];
  readonly optionalImmediateEffects?: readonly ActiveEffect[];
  readonly requiredOverTimeEffects?: readonly ActiveEffect[];
  /** @deprecated Prefer `requiredOverTimeEffects`. */
  readonly overTimeEffects?: readonly ActiveEffect[];
  readonly optionalOverTimeEffects?: readonly ActiveEffect[];
  readonly requiredFinishedEffects?: readonly ActiveEffect[];
  /** @deprecated Prefer `requiredFinishedEffects`. */
  readonly requiredEffects?: readonly ActiveEffect[];
  readonly optionalFinishedEffects?: readonly ActiveEffect[];
  /** @deprecated Prefer `optionalFinishedEffects`. */
  readonly optionalEffects?: readonly ActiveEffect[];
  /** @deprecated Prefer `requiredImmediateEffects`. */
  readonly costs?: readonly ActiveEffect[];
  /** @deprecated Prefer `requiredOverTimeEffects`. */
  readonly costsOverTime?: readonly ActiveEffect[];
  /** @deprecated Prefer `requiredFinishedEffects`. */
  readonly results?: readonly ActiveEffect[];
  /** @deprecated Prefer `optionalFinishedEffects`. */
  readonly sideEffects?: readonly ActiveEffect[];
  readonly types?: readonly string[];
}): {
  readonly requiredImmediateEffects: readonly ActiveEffect[];
  readonly optionalImmediateEffects: readonly ActiveEffect[];
  readonly requiredOverTimeEffects: readonly ActiveEffect[];
  readonly optionalOverTimeEffects: readonly ActiveEffect[];
  readonly requiredFinishedEffects: readonly ActiveEffect[];
  readonly optionalFinishedEffects: readonly ActiveEffect[];
  readonly types: readonly string[];
} {
  return {
    requiredImmediateEffects: Object.freeze([
      ...(action.requiredImmediateEffects ??
        action.immediateEffects ??
        action.costs ??
        []),
    ]),
    optionalImmediateEffects: Object.freeze([
      ...(action.optionalImmediateEffects ?? []),
    ]),
    requiredOverTimeEffects: Object.freeze([
      ...(action.requiredOverTimeEffects ??
        action.overTimeEffects ??
        action.costsOverTime ??
        []),
    ]),
    optionalOverTimeEffects: Object.freeze([
      ...(action.optionalOverTimeEffects ?? []),
    ]),
    requiredFinishedEffects: Object.freeze([
      ...(action.requiredFinishedEffects ??
        action.requiredEffects ??
        action.results ??
        []),
    ]),
    optionalFinishedEffects: Object.freeze([
      ...(action.optionalFinishedEffects ??
        action.optionalEffects ??
        action.sideEffects ??
        []),
    ]),
    types: Object.freeze([...(action.types ?? [])]),
  };
}

/**
 * Persisted continuous progress. `progress` is percent complete (0..100),
 * rounded to two decimals — same basis used to prorate required/optional
 * over-time (`payFraction = deltaProgress / 100`). Effective duration is
 * recomputed each tick so mid-action speed changes affect remaining work only.
 */
export type ContinuousProgressRecord = {
  readonly progressKey: string;
  readonly actorEntityId: string;
  readonly sourceEntityId?: string;
  readonly targetEntityId?: string;
  readonly action: ContinuousActionSnapshot;
  /** Percent complete for this cycle (0..100), two decimal places. */
  readonly progress: number;
  /**
   * Execution kind stamped when the job was started; used for every cycle’s
   * action-count metrics (including `repeatWhileAvailable` re-arms).
   */
  readonly execution: 'manual' | 'automatic';
  /**
   * When true, the next `advanceOneJob` must pay `requiredImmediateEffects`
   * (and soft `optionalImmediateEffects`) before progressing (set on
   * `repeatWhileAvailable` re-arm; unset after first start pay in
   * `startContinuousAction`).
   */
  readonly payImmediateOnNextAdvance?: boolean;
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
  action: ContinuousActionSnapshot & {
    /** @deprecated Prefer `requiredImmediateEffects`. */
    immediateEffects?: readonly ActiveEffect[];
    /** @deprecated Prefer `requiredImmediateEffects`. */
    costs?: readonly ActiveEffect[];
    /** @deprecated Prefer `requiredOverTimeEffects`. */
    overTimeEffects?: readonly ActiveEffect[];
    /** @deprecated Prefer `requiredOverTimeEffects`. */
    costsOverTime?: readonly ActiveEffect[];
    /** @deprecated Prefer `requiredFinishedEffects`. */
    requiredEffects?: readonly ActiveEffect[];
    /** @deprecated Prefer `requiredFinishedEffects`. */
    results?: readonly ActiveEffect[];
    /** @deprecated Prefer `optionalFinishedEffects`. */
    optionalEffects?: readonly ActiveEffect[];
    /** @deprecated Prefer `optionalFinishedEffects`. */
    sideEffects?: readonly ActiveEffect[];
  };
  /** Percent 0..100. Legacy saves may send progressTicks + effectiveDurationTicks. */
  progress?: number;
  execution?: 'manual' | 'automatic';
  payImmediateOnNextAdvance?: boolean;
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
      requiredImmediateEffects: [...record.action.requiredImmediateEffects],
      optionalImmediateEffects: [...record.action.optionalImmediateEffects],
      requiredOverTimeEffects: [...record.action.requiredOverTimeEffects],
      optionalOverTimeEffects: [...record.action.optionalOverTimeEffects],
      requiredFinishedEffects: [...record.action.requiredFinishedEffects],
      optionalFinishedEffects: [...record.action.optionalFinishedEffects],
      types: [...record.action.types],
      ...(record.action.repeatWhileAvailable === true
        ? { repeatWhileAvailable: true }
        : {}),
    },
    progress: record.progress,
    execution: record.execution,
    ...(record.payImmediateOnNextAdvance === true
      ? { payImmediateOnNextAdvance: true }
      : {}),
  }));
}

export function continuousProgressFromJSON(
  list: ContinuousProgressRecordJSON[] | undefined,
): ContinuousProgressMap {
  const map = new Map<string, ContinuousProgressRecord>();
  for (const entry of list ?? []) {
    const recipe = recipeEffectsFromSnapshotJSON(entry.action);
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
        name: entry.action.name,
        ...(entry.action.description !== undefined
          ? { description: entry.action.description }
          : {}),
        ...(entry.action.label !== undefined
          ? { label: entry.action.label }
          : {}),
        ...(entry.action.sourceId !== undefined
          ? { sourceId: entry.action.sourceId }
          : {}),
        requirements: Object.freeze([...(entry.action.requirements ?? [])]),
        requiredImmediateEffects: recipe.requiredImmediateEffects,
        optionalImmediateEffects: recipe.optionalImmediateEffects,
        requiredOverTimeEffects: recipe.requiredOverTimeEffects,
        optionalOverTimeEffects: recipe.optionalOverTimeEffects,
        requiredFinishedEffects: recipe.requiredFinishedEffects,
        optionalFinishedEffects: recipe.optionalFinishedEffects,
        durationTicks: entry.action.durationTicks ?? 1,
        types: recipe.types,
        ...(entry.action.repeatWhileAvailable === true
          ? { repeatWhileAvailable: true }
          : {}),
      },
      progress: progressFromLegacyJSON(entry),
      execution: entry.execution === 'automatic' ? 'automatic' : 'manual',
      ...(entry.payImmediateOnNextAdvance === true
        ? { payImmediateOnNextAdvance: true }
        : {}),
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
