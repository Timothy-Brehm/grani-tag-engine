import { describe, expect, it } from 'vitest';
import { createTag } from './tag';
import { createEntityInstance } from './entity';
import { createEngineState, upsertEntity } from './state';
import { reduceEngineState } from './reduce';
import { EngineRegistry } from './registry';
import {
  selectActionIsNew,
  selectEntityHasNew,
  selectEntityIsNew,
  selectPoolIsNew,
} from './novelty';

describe('entity novelty', () => {
  const registry = new EngineRegistry().createBuiltinAdaptors();
  const options = { registry, host: {} };

  function lifeHero() {
    return createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [
        createTag({
          name: 'Pool_Life',
          effects: [
            {
              type: 'pool-max',
              name: 'Life',
              strength: 5,
              pool: 'Life',
            } as never,
          ],
        }),
      ],
      pools: { Life: 3 },
    });
  }

  it('treats fresh entities as new until seen-entity-content', () => {
    let state = upsertEntity(createEngineState(), lifeHero());
    let hero = state.entities.get('hero')!;
    expect(selectEntityIsNew(hero)).toBe(true);
    expect(selectActionIsNew(hero, 'scout')).toBe(true);
    expect(selectPoolIsNew(hero, 'Life')).toBe(true);
    expect(selectEntityHasNew(hero, ['scout'])).toBe(true);

    state = reduceEngineState(
      state,
      {
        type: 'seen-entity-content',
        entityId: 'hero',
        actionIds: ['scout'],
      },
      options,
    );
    hero = state.entities.get('hero')!;
    expect(selectEntityIsNew(hero)).toBe(false);
    expect(selectActionIsNew(hero, 'scout')).toBe(false);
    expect(selectPoolIsNew(hero, 'Life')).toBe(false);
    expect(selectEntityHasNew(hero, ['scout'])).toBe(false);
  });

  it('keeps hasNew when an unseen action remains', () => {
    let state = upsertEntity(createEngineState(), lifeHero());
    state = reduceEngineState(
      state,
      { type: 'seen-entity', entityId: 'hero' },
      options,
    );
    state = reduceEngineState(
      state,
      { type: 'seen-pool', entityId: 'hero', pool: 'Life' },
      options,
    );
    const hero = state.entities.get('hero')!;
    expect(selectEntityIsNew(hero)).toBe(false);
    expect(selectEntityHasNew(hero, ['scout'])).toBe(true);
  });

  it('marks pools seen via seen-pool (host decides when)', () => {
    let state = upsertEntity(createEngineState(), lifeHero());
    expect(selectPoolIsNew(state.entities.get('hero')!, 'Life')).toBe(true);
    state = reduceEngineState(
      state,
      { type: 'seen-pool', entityId: 'hero', pool: 'Life' },
      options,
    );
    expect(selectPoolIsNew(state.entities.get('hero')!, 'Life')).toBe(false);
  });
});
