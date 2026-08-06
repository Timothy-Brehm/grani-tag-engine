import { describe, expect, it } from 'vitest';
import {
  enhanceEffect,
  reduceEffect,
  applySlotMagnitudeModifiers,
} from './action-improvements';
import { createTag } from './tag';
import { createEntityInstance } from './entity';
import type { ActiveEffect } from './effect';

describe('reduceEffect / enhanceEffect', () => {
  it('reduce moves toward zero without flipping sign', () => {
    expect(reduceEffect(-5, 2, 0)).toBe(-3);
    expect(reduceEffect(5, 2, 0)).toBe(3);
    expect(reduceEffect(-1, 5, 0)).toBe(0);
    expect(reduceEffect(10, 0, 50)).toBe(5);
  });

  it('enhance moves away from zero without flipping sign', () => {
    expect(enhanceEffect(-5, 2, 0)).toBe(-7);
    expect(enhanceEffect(5, 2, 0)).toBe(7);
    expect(enhanceEffect(10, 0, 50)).toBe(15);
    expect(enhanceEffect(-10, 0, 50)).toBe(-15);
  });

  it('reduceImmediateEffect shrinks matching immediate adjust', () => {
    const actor = createEntityInstance({
      id: 'a',
      definitionId: 'a',
      tags: [
        createTag({
          name: 'cheap-explore',
          effects: [
            {
              type: 'reduceImmediateEffect',
              name: 'stamina-relief',
              strength: 1,
              pool: 'Stamina',
              actionTypes: ['Explore'],
            },
          ],
        }),
      ],
    });
    const next = applySlotMagnitudeModifiers(
      [
        {
          type: 'adjust-pool',
          name: 'pay',
          strength: -3,
          pool: 'Stamina',
        },
      ],
      'immediateEffects',
      actor,
      'explore',
      ['Explore'],
    );
    expect(next[0]?.strength).toBe(-2);
  });

  it('applies all flats before all percents across reduce and enhance', () => {
    const actor = createEntityInstance({
      id: 'a',
      definitionId: 'a',
      tags: [
        createTag({
          name: 'mods',
          effects: [
            {
              type: 'reduceImmediateEffect',
              name: 'pct',
              strength: 0,
              percent: 50,
              pool: 'Stamina',
            },
            {
              type: 'enhanceImmediateEffect',
              name: 'flat',
              strength: 2,
              pool: 'Stamina',
            },
          ],
        }),
      ],
    });
    // authored −10 → flat enhance to −12 → 50% reduce magnitude → −6
    // (not: 50% first → −5 then enhance → −7)
    const next = applySlotMagnitudeModifiers(
      [
        {
          type: 'adjust-pool',
          name: 'pay',
          strength: -10,
          pool: 'Stamina',
        },
      ],
      'immediateEffects',
      actor,
      'explore',
      undefined,
    );
    expect(next[0]?.strength).toBe(-6);
  });
});
