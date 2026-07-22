import { describe, expect, it } from 'vitest';
import { validateEntityCatalog } from './validate';

describe('entity catalog schema', () => {
  it('accepts a minimal catalog', () => {
    const result = validateEntityCatalog({
      entities: [
        {
          id: 'player',
          displayName: 'Player',
          initialTags: [
            {
              name: 'Stat_Initial_Strength',
              effects: [
                {
                  type: 'stat',
                  name: 'Strength',
                  strength: 1,
                  stat: 'Strength',
                },
              ],
            },
          ],
          initialPools: { Life: 1 },
          actions: [],
          maxActive: 1,
          maxCreated: 1,
        },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.catalog?.entities[0]?.id).toBe('player');
  });

  it('rejects unknown effect types', () => {
    const result = validateEntityCatalog({
      entities: [
        {
          id: 'bad',
          actions: [
            {
              name: 'x',
              requirements: [],
              costs: [],
              results: [
                {
                  type: 'Spawn Card',
                  name: 'crate',
                  strength: 1,
                },
              ],
              sideEffects: [],
            },
          ],
        },
      ],
    });
    expect(result.valid).toBe(false);
  });
});
