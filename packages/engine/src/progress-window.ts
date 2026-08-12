/**
 * Over-time effect progress windows (`ActiveEffect.applyDuring`).
 * Normalized to percent of the cycle; tick windows use effective duration D.
 */

export type EffectApplyDuring =
  | { readonly mode: 'first'; readonly ticks: number }
  | { readonly mode: 'first'; readonly percent: number }
  | { readonly mode: 'last'; readonly ticks: number }
  | { readonly mode: 'last'; readonly percent: number }
  | {
      readonly mode: 'middle';
      readonly fromTicks: number;
      readonly toTicks: number;
    }
  | {
      readonly mode: 'middle';
      readonly fromPercent: number;
      readonly toPercent: number;
    };

/** Resolved percent window. `hiClosed` only for last-through-completion (`hi === 100`). */
export type ResolvedProgressWindow = {
  readonly lo: number;
  readonly hi: number;
  readonly hiClosed: boolean;
};

export type OverTimeProgressSlice = {
  /** Progress % before this tick’s advance (0..100). */
  readonly progressBefore: number;
  /** Progress % after this tick’s advance (0..100). */
  readonly progressAfter: number;
  /** Effective duration ticks this tick (same D as continuous progress). */
  readonly durationTicks: number;
  /** Include non-adjust-pool OT effects (completion settle). */
  readonly includeNonPool: boolean;
};

function ticksToPercent(ticks: number, durationTicks: number): number {
  if (!(durationTicks > 0) || !Number.isFinite(ticks)) {
    return 0;
  }
  return (ticks / durationTicks) * 100;
}

/**
 * Normalize `applyDuring` to a percent window using effective duration `D`.
 * Returns null when omitted / invalid (caller treats as full-cycle unwindowed).
 */
export function resolveApplyDuring(
  applyDuring: EffectApplyDuring | undefined,
  durationTicks: number,
): ResolvedProgressWindow | null {
  if (!applyDuring || typeof applyDuring !== 'object') {
    return null;
  }
  const D = durationTicks > 0 ? durationTicks : 1;
  const mode = applyDuring.mode;

  if (mode === 'first') {
    const end =
      'ticks' in applyDuring && typeof applyDuring.ticks === 'number'
        ? ticksToPercent(applyDuring.ticks, D)
        : typeof (applyDuring as { percent?: number }).percent === 'number'
          ? (applyDuring as { percent: number }).percent
          : NaN;
    if (!Number.isFinite(end) || end <= 0) {
      return null;
    }
    return { lo: 0, hi: Math.min(100, end), hiClosed: false };
  }

  if (mode === 'last') {
    const span =
      'ticks' in applyDuring && typeof applyDuring.ticks === 'number'
        ? ticksToPercent(applyDuring.ticks, D)
        : typeof (applyDuring as { percent?: number }).percent === 'number'
          ? (applyDuring as { percent: number }).percent
          : NaN;
    if (!Number.isFinite(span) || span <= 0) {
      return null;
    }
    const start = Math.max(0, 100 - Math.min(100, span));
    return { lo: start, hi: 100, hiClosed: true };
  }

  if (mode === 'middle') {
    let from: number;
    let to: number;
    if (
      'fromTicks' in applyDuring &&
      typeof applyDuring.fromTicks === 'number' &&
      typeof applyDuring.toTicks === 'number'
    ) {
      from = ticksToPercent(applyDuring.fromTicks, D);
      to = ticksToPercent(applyDuring.toTicks, D);
    } else if (
      'fromPercent' in applyDuring &&
      typeof applyDuring.fromPercent === 'number' &&
      typeof applyDuring.toPercent === 'number'
    ) {
      from = applyDuring.fromPercent;
      to = applyDuring.toPercent;
    } else {
      return null;
    }
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return null;
    }
    return {
      lo: Math.max(0, Math.min(100, from)),
      hi: Math.max(0, Math.min(100, to)),
      hiClosed: false,
    };
  }

  return null;
}

/** Length of intersection of [a0, a1] with window (half-open or closed-at-100). */
export function progressWindowOverlap(
  progressBefore: number,
  progressAfter: number,
  window: ResolvedProgressWindow,
): number {
  const a0 = Math.min(progressBefore, progressAfter);
  const a1 = Math.max(progressBefore, progressAfter);
  if (a1 <= a0) {
    return 0;
  }
  const w0 = window.lo;
  const w1 = window.hi;
  const overlapLo = Math.max(a0, w0);
  let overlapHi: number;
  if (window.hiClosed) {
    overlapHi = Math.min(a1, w1);
  } else {
    // Half-open [lo, hi): progress exactly at hi does not count.
    overlapHi = Math.min(a1, w1);
    if (overlapHi <= overlapLo) {
      return 0;
    }
    // If the step only touches hi from below with zero width, already 0.
  }
  return Math.max(0, overlapHi - overlapLo);
}

export function progressWindowWidth(window: ResolvedProgressWindow): number {
  return Math.max(0, window.hi - window.lo);
}

/**
 * Pay fraction of authored OT strength for this progress step.
 * Unwindowed: (progressAfter - progressBefore) / 100 (full-cycle total).
 * Windowed: overlap / windowWidth (strength = total for the window).
 */
export function overTimePayFractionForEffect(
  applyDuring: EffectApplyDuring | undefined,
  slice: OverTimeProgressSlice,
): number {
  const delta = slice.progressAfter - slice.progressBefore;
  if (!(delta > 0)) {
    return 0;
  }
  const window = resolveApplyDuring(applyDuring, slice.durationTicks);
  if (!window) {
    return delta / 100;
  }
  const width = progressWindowWidth(window);
  if (!(width > 1e-12)) {
    return 0;
  }
  const overlap = progressWindowOverlap(
    slice.progressBefore,
    slice.progressAfter,
    window,
  );
  if (!(overlap > 0)) {
    return 0;
  }
  return overlap / width;
}
