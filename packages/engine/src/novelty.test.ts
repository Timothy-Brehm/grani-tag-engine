import { describe, expect, it } from 'vitest';
import { createTag } from './tag';
import { createEntityInstance } from './entity';
import { createPrimaryEngineState } from './state';
import { reduceEngineState } from './reduce';
import { EngineRegistry } from './registry';
import {
  selectActionIsNovel,
  selectEntityHasNovel,
  selectEntityIsNovel,
  selectNovelOnEntity,
  selectPoolIsNovel,
} from './novelty';

describe('tag-based novelty', () => {
  const registry = new EngineRegistry().createBuiltinAdaptors();
  const options = { registry, host: {} };

  const seenShip = createTag({
    name: 'seen_ship',
    effects: [],
  });
  const seenScout = createTag({
    name: 'seen_scout',
    effects: [],
  });
  const seenLife = createTag({
    name: 'seen_life',
    effects: [],
  });

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
              novelty: { seenTag: 'seen_life', scope: 'instance' },
            },
          ],
        }),
      ],
      pools: { Life: 3 },
    });
  }

  const scoutAction = {
    name: 'scout',
    novelty: { seenTag: 'seen_scout', scope: 'primary' as const },
  };

  const heroDefinition = {
    id: 'hero',
    novelty: { seenTag: 'seen_ship', scope: 'instance' as const },
    actions: [scoutAction],
  };

  it('treats configured items as novel until ack tags are granted', () => {
    let state = createPrimaryEngineState(lifeHero());
    let hero = state.entities.get('hero')!;

    expect(selectEntityIsNovel(state, hero, heroDefinition.novelty)).toBe(true);
    expect(selectActionIsNovel(state, hero, scoutAction)).toBe(true);
    expect(selectPoolIsNovel(state, hero, 'Life')).toBe(true);
    expect(selectEntityHasNovel(state, hero, { definition: heroDefinition })).toBe(
      true,
    );

    state = reduceEngineState(
      state,
      { type: 'add-tag', entityId: 'hero', tag: seenShip },
      options,
    );
    state = reduceEngineState(
      state,
      { type: 'add-tag', entityId: 'hero', tag: seenScout },
      options,
    );
    state = reduceEngineState(
      state,
      { type: 'add-tag', entityId: 'hero', tag: seenLife },
      options,
    );
    hero = state.entities.get('hero')!;

    expect(selectEntityIsNovel(state, hero, heroDefinition.novelty)).toBe(false);
    expect(selectActionIsNovel(state, hero, scoutAction)).toBe(false);
    expect(selectPoolIsNovel(state, hero, 'Life')).toBe(false);
    expect(selectEntityHasNovel(state, hero, { definition: heroDefinition })).toBe(
      false,
    );
  });

  it('supports primary scope so one ack covers all instances', () => {
    const shipA = createEntityInstance({ id: 'ship-a', definitionId: 'ship' });
    const shipB = createEntityInstance({ id: 'ship-b', definitionId: 'ship' });
    const pilot = createEntityInstance({ id: 'pilot', definitionId: 'pilot' });
    let state = createPrimaryEngineState(pilot, {
      others: [shipA, shipB],
      spawnCounts: { pilot: 1, ship: 2 },
    });

    const popCanopy = {
      name: 'pop',
      novelty: { seenTag: 'seen_pop_canopy', scope: 'primary' as const },
    };

    expect(selectActionIsNovel(state, shipA, popCanopy)).toBe(true);
    expect(selectActionIsNovel(state, shipB, popCanopy)).toBe(true);

    state = reduceEngineState(
      state,
      {
        type: 'add-tag',
        entityId: 'pilot',
        tag: createTag({
          name: 'seen_pop_canopy',
          effects: [],
        }),
      },
      options,
    );

    expect(selectActionIsNovel(state, shipA, popCanopy)).toBe(false);
    expect(selectActionIsNovel(state, shipB, popCanopy)).toBe(false);
  });

  it('lists novel refs for host modals / badges', () => {
    const state = createPrimaryEngineState(lifeHero());
    const refs = selectNovelOnEntity(state, state.entities.get('hero')!, {
      definition: heroDefinition,
    });
    expect(refs.map((ref) => ref.seenTag).sort()).toEqual([
      'seen_life',
      'seen_scout',
      'seen_ship',
    ]);
  });

  it('supports silent milestone tags that point novelty at a message_* tag', () => {
    const milestone = createTag({
      name: 'milestone_strength5',
      effects: [],
      novelty: { seenTag: 'message_strength5', scope: 'primary' },
    });
    let state = createPrimaryEngineState(
      createEntityInstance({
        id: 'hero',
        definitionId: 'hero',
        tags: [milestone],
      }),
    );
    const refs = selectNovelOnEntity(state, state.entities.get('hero')!);
    expect(refs).toEqual([
      {
        entityId: 'hero',
        seenTag: 'message_strength5',
        scope: 'primary',
        kind: 'tag',
        key: 'milestone_strength5',
      },
    ]);

    state = reduceEngineState(
      state,
      {
        type: 'add-tag',
        entityId: 'hero',
        tag: createTag({
          name: 'message_strength5',
          displayText: 'You feel stronger.',
          effects: [],
        }),
      },
      options,
    );
    expect(selectNovelOnEntity(state, state.entities.get('hero')!)).toEqual([]);
  });

  it('ignores discoverables with no novelty config', () => {
    const state = createPrimaryEngineState(lifeHero());
    const hero = state.entities.get('hero')!;
    expect(
      selectActionIsNovel(state, hero, { name: 'repair' /* no novelty */ }),
    ).toBe(false);
  });
});
