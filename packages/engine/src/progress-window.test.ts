import { describe, expect, it } from 'vitest';
import {
  overTimePayFractionForEffect,
  progressWindowOverlap,
  resolveApplyDuring,
} from './progress-window';
import {
  clampGeneratePoolAmount,
  resolveGeneratePoolBand,
} from './generate-pool-band';

describe('progress-window', () => {
  it('resolves first/last/middle ticks and percent', () => {
    expect(resolveApplyDuring({ mode: 'first', ticks: 3 }, 10)).toEqual({
      lo: 0,
      hi: 30,
      hiClosed: false,
    });
    expect(resolveApplyDuring({ mode: 'first', percent: 50 }, 10)).toEqual({
      lo: 0,
      hi: 50,
      hiClosed: false,
    });
    expect(resolveApplyDuring({ mode: 'last', ticks: 1 }, 10)).toEqual({
      lo: 90,
      hi: 100,
      hiClosed: true,
    });
    expect(
      resolveApplyDuring(
        { mode: 'middle', fromPercent: 20, toPercent: 80 },
        10,
      ),
    ).toEqual({ lo: 20, hi: 80, hiClosed: false });
  });

  it('partial-tick at boundary: 10/tick rate → 5 when crossing 75', () => {
    // Window total = 75 pts over first 75% (10 per full 10% tick × 7.5).
    const fraction = overTimePayFractionForEffect(
      { mode: 'first', percent: 75 },
      {
        progressBefore: 70,
        progressAfter: 80,
        durationTicks: 10,
        includeNonPool: false,
      },
    );
    expect(fraction).toBeCloseTo(5 / 75, 6);
    expect(75 * fraction).toBeCloseTo(5, 6);
  });

  it('half-open upper bound excludes progress past hi', () => {
    const window = resolveApplyDuring({ mode: 'first', percent: 50 }, 10)!;
    expect(progressWindowOverlap(50, 60, window)).toBe(0);
    expect(progressWindowOverlap(40, 50, window)).toBeCloseTo(10, 6);
  });
});

describe('generate-pool-band', () => {
  it('clamps positive regen to belowPercent of max', () => {
    const band = resolveGeneratePoolBand(
      { whileAvailableBelowPercent: 10 },
      100,
      0,
    );
    expect(band.hi).toBe(10);
    expect(clampGeneratePoolAmount(8, 5, band)).toBe(2);
    expect(clampGeneratePoolAmount(10, 1, band)).toBe(0);
  });

  it('clamps negative regen to floor / whileAvailableAbove', () => {
    const band = resolveGeneratePoolBand({}, 10, 9);
    expect(band.lo).toBe(9);
    expect(clampGeneratePoolAmount(10, -0.5, band)).toBeCloseTo(-0.5, 6);
    expect(clampGeneratePoolAmount(9.2, -0.5, band)).toBeCloseTo(-0.2, 6);
    expect(clampGeneratePoolAmount(9, -0.5, band)).toBe(0);
  });

  it('battery middle band 5%–50%', () => {
    const band = resolveGeneratePoolBand(
      {
        whileAvailableAbovePercent: 5,
        whileAvailableBelowPercent: 50,
      },
      100,
      0,
    );
    expect(band.lo).toBe(5);
    expect(band.hi).toBe(50);
    expect(clampGeneratePoolAmount(0, 1, band)).toBe(0);
    expect(clampGeneratePoolAmount(5, 1, band)).toBe(1);
    expect(clampGeneratePoolAmount(49.5, 1, band)).toBeCloseTo(0.5, 6);
  });
});
