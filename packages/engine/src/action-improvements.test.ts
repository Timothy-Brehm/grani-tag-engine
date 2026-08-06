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

  it('applySlotMagnitudeModifiers reduce then enhance on immediate slot', () => {
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
    const costs: ActiveEffect[] = [
      {
        type: 'adjust-pool',
        name: 'pay',
        strength: -3,
        pool: 'Stamina',
      },
    ];
    const next = applySlotMagnitudeModifiers(
      costs,
      'immediateEffects',
      actor,
      'explore',
      ['Explore'],
    );
    expect(next[0]?.strength).toBe(-2);
  });
});
