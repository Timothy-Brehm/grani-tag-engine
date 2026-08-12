/**
 * Resolve Available band for a `generate-pool` pulse (absolute + % of Max + floors).
 */

export type GeneratePoolBand = {
  /** Lower bound: negative regen stops at / clamps to this (default 0). */
  readonly lo: number;
  /** Upper bound: positive regen stops at / clamps to this (default +Infinity). */
  readonly hi: number;
};

export type GeneratePoolBandFields = {
  readonly whileAvailableAbove?: number;
  readonly whileAvailableBelow?: number;
  readonly whileAvailableAbovePercent?: number;
  readonly whileAvailableBelowPercent?: number;
};

function finiteOr(
  value: number | undefined,
  fallback: number,
): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * @param availableMax Effective Available max (Max − Reserved)
 * @param floorSum Sum of active `pool-generate-floor` strength for this pool
 */
export function resolveGeneratePoolBand(
  fields: GeneratePoolBandFields,
  availableMax: number,
  floorSum: number,
): GeneratePoolBand {
  const max = Math.max(0, availableMax);
  let lo = 0;
  let hi = Number.POSITIVE_INFINITY;

  const above = fields.whileAvailableAbove;
  if (typeof above === 'number' && Number.isFinite(above)) {
    lo = Math.max(lo, above);
  }
  const abovePct = fields.whileAvailableAbovePercent;
  if (typeof abovePct === 'number' && Number.isFinite(abovePct)) {
    lo = Math.max(lo, (max * abovePct) / 100);
  }
  if (typeof floorSum === 'number' && Number.isFinite(floorSum) && floorSum > 0) {
    lo = Math.max(lo, floorSum);
  }

  const below = fields.whileAvailableBelow;
  if (typeof below === 'number' && Number.isFinite(below)) {
    hi = Math.min(hi, below);
  }
  const belowPct = fields.whileAvailableBelowPercent;
  if (typeof belowPct === 'number' && Number.isFinite(belowPct)) {
    hi = Math.min(hi, (max * belowPct) / 100);
  }

  lo = finiteOr(lo, 0);
  if (!(hi > lo)) {
    // Degenerate band: no room to pulse
    return { lo, hi: lo };
  }
  return { lo, hi };
}

/**
 * Clamp a pulse amount so Available stays within [lo, hi], or return 0 to skip.
 */
export function clampGeneratePoolAmount(
  current: number,
  amount: number,
  band: GeneratePoolBand,
): number {
  if (!Number.isFinite(amount) || amount === 0) {
    return 0;
  }
  const { lo, hi } = band;
  if (amount > 0) {
    if (!(current < hi)) {
      return 0;
    }
    // Lower band: must already be at/above lo (e.g. battery needs ≥5% to trickle).
    if (!(current >= lo)) {
      return 0;
    }
    const room = hi - current;
    if (!(room > 0)) {
      return 0;
    }
    return Math.min(amount, room);
  }
  // negative
  if (!(current > lo)) {
    return 0;
  }
  const room = lo - current; // negative
  if (!(room < 0)) {
    return 0;
  }
  return Math.max(amount, room);
}
