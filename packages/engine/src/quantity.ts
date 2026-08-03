/** Float hygiene for stored pool / product-tag quantities (not gameplay step). */
export const POOL_QUANTITY_DECIMALS = 6;

/** Round to {@link POOL_QUANTITY_DECIMALS} to limit IEEE noise. */
export function roundPoolQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(POOL_QUANTITY_DECIMALS));
}

/**
 * Floor `value` to a positive `step` quantum (toward −∞ for negatives via
 * Math.floor). Omits / invalid step ⇒ return value unchanged (after finite check).
 */
export function floorPoolQuantity(value: number, step?: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (step === undefined || !(step > 0) || !Number.isFinite(step)) {
    return value;
  }
  return roundPoolQuantity(Math.floor(value / step + 1e-12) * step);
}
