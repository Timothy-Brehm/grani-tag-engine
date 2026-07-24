import { describe, expect, it } from 'vitest';
import { createTag } from './tag';
import { createEntityInstance } from './entity';
import { createEngineState, upsertEntity, withPrimaryEntityId } from './state';
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
    name: 'Seen_Ship',
    description: 'You have looked at this ship.',
    image: 'ship-seen',
    effects: [],
  });
  const seenScout = createTag({
    name: 'Seen_Scout',
    description: 'Scout briefing.',
    image: 'scout-modal',
    effects: [],
  });
  const seenLife = createTag({
    name: 'Seen_Life',
    description: 'Life pool intro.',
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
              novelty: { seenTag: 'Seen_Life', scope: 'instance' },
            },
          ],
        }),
      ],
      pools: { Life: 3 },
    });
  }

  const scoutAction = {
    name: 'scout',
    novelty: { seenTag: 'Seen_Scout', scope: 'primary' as const },
  };

  const heroDefinition = {
    id: 'hero',
    novelty: { seenTag: 'Seen_Ship', scope: 'instance' as const },
    actions: [scoutAction],
  };

  it('treats configured items as novel until ack tags are granted', () => {
    let state = withPrimaryEntityId(
      upsertEntity(createEngineState(), lifeHero()),
      'hero',
    );
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
    let state = createEngineState({
      entities: [pilot, shipA, shipB],
      primaryEntityId: 'pilot',
    });

    const popCanopy = {
      name: 'pop',
      novelty: { seenTag: 'Seen_PopCanopy', scope: 'primary' as const },
    };

    expect(selectActionIsNovel(state, shipA, popCanopy)).toBe(true);
    expect(selectActionIsNovel(state, shipB, popCanopy)).toBe(true);

    state = reduceEngineState(
      state,
      {
        type: 'add-tag',
        entityId: 'pilot',
        tag: createTag({
          name: 'Seen_PopCanopy',
          description: 'Break the canopy seal.',
          effects: [],
        }),
      },
      options,
    );

    expect(selectActionIsNovel(state, shipA, popCanopy)).toBe(false);
    expect(selectActionIsNovel(state, shipB, popCanopy)).toBe(false);
  });

  it('lists novel refs for host modals / badges', () => {
    const state = withPrimaryEntityId(
      upsertEntity(createEngineState(), lifeHero()),
      'hero',
    );
    const refs = selectNovelOnEntity(state, state.entities.get('hero')!, {
      definition: heroDefinition,
    });
    expect(refs.map((ref) => ref.seenTag).sort()).toEqual([
      'Seen_Life',
      'Seen_Scout',
      'Seen_Ship',
    ]);
  });

  it('supports silent milestone tags that point novelty at a display tag', () => {
    const milestone = createTag({
      name: 'Milestone_Strength5',
      effects: [],
      novelty: { seenTag: 'Msg_Strength5', scope: 'primary' },
    });
    let state = createEngineState({
      entities: [
        createEntityInstance({
          id: 'hero',
          definitionId: 'hero',
          tags: [milestone],
        }),
      ],
      primaryEntityId: 'hero',
    });
    const refs = selectNovelOnEntity(state, state.entities.get('hero')!);
    expect(refs).toEqual([
      {
        entityId: 'hero',
        seenTag: 'Msg_Strength5',
        scope: 'primary',
        kind: 'tag',
        key: 'Milestone_Strength5',
      },
    ]);

    state = reduceEngineState(
      state,
      {
        type: 'add-tag',
        entityId: 'hero',
        tag: createTag({
          name: 'Msg_Strength5',
          description: 'You feel stronger.',
          effects: [],
        }),
      },
      options,
    );
    expect(selectNovelOnEntity(state, state.entities.get('hero')!)).toEqual([]);
  });

  it('ignores discoverables with no novelty config', () => {
    const state = upsertEntity(createEngineState(), lifeHero());
    const hero = state.entities.get('hero')!;
    expect(
      selectActionIsNovel(state, hero, { name: 'repair' /* no novelty */ }),
    ).toBe(false);
  });
});
