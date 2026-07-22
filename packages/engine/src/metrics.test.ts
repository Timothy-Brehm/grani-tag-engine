import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from './action';
import { EngineRegistry } from './registry';
import { reduceEngineState } from './reduce';
import {
  createEngineState,
  createTaggedEntity,
  engineStateFromJSON,
  engineStateToJSON,
  upsertEntity,
  toEngineContext,
} from './state';
import { createEntityInstance } from './entity';
import { createTag } from './tag';
import {
  selectActionCount,
  selectActionFirstTick,
  selectActionLastTick,
  selectPoolHighWater,
  selectPoolLifetimeUsed,
  selectPoolLifetimeUsedFirstTick,
  selectPoolLowWater,
  selectPoolMaxHighWater,
  selectStatHighWater,
  selectTagGrantedAt,
} from './metrics';
import { requirementsMet } from './evaluate';

describe('entity metrics', () => {
  const registry = new EngineRegistry().createBuiltinAdaptors();
  const options = { registry, host: {} };

  function withPlayer() {
    return upsertEntity(
      createEngineState(),
      createTaggedEntity({
        id: 'player',
        definitionId: 'player',
        tags: [
          createTag({
            name: 'Stat_Initial_Strength',
            effects: [
              {
                type: 'stat',
                name: 'Strength',
                strength: 1,
                stat: 'Strength',
              } as never,
            ],
          }),
          createTag({
            name: 'Pool_Initial_Life',
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
      }),
    );
  }

  it('seeds stat and pool-max high-waters from initial tags', () => {
    const player = withPlayer().entities.get('player')!;
    expect(selectStatHighWater(player, 'Strength')).toBe(1);
    expect(selectPoolMaxHighWater(player, 'Life')).toBe(5);
  });

  it('raises pool high-water on adjust-pool and keeps it after spend', () => {
    let state = withPlayer();
    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'player', pool: 'Life', delta: 4 },
      options,
    );
    let player = state.entities.get('player')!;
    expect(selectPoolHighWater(player, 'Life')).toBe(4);

    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'player', pool: 'Life', delta: -2 },
      options,
    );
    player = state.entities.get('player')!;
    expect(player.pools.Life).toBe(2);
    expect(selectPoolHighWater(player, 'Life')).toBe(4);
  });

  it('tracks pool low-water and gates on ever hitting zero Life', () => {
    let state = upsertEntity(
      createEngineState(),
      createEntityInstance({
        id: 'hero',
        definitionId: 'hero',
        tags: [
          createTag({
            name: 'Pool_Initial_Life',
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
      }),
    );
    let hero = state.entities.get('hero')!;
    expect(selectPoolLowWater(hero, 'Life')).toBe(3);
    expect(
      requirementsMet(
        registry,
        [
          {
            type: 'metric',
            metric: 'pool-low-water',
            pool: 'Life',
            amount: 0,
          },
        ],
        toEngineContext(state, {}, { actorEntityId: 'hero' }),
      ),
    ).toBe(false);

    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'hero', pool: 'Life', delta: -3 },
      options,
    );
    hero = state.entities.get('hero')!;
    expect(hero.pools.Life).toBe(0);
    expect(selectPoolLowWater(hero, 'Life')).toBe(0);
    expect(selectPoolHighWater(hero, 'Life')).toBe(3);

    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'hero', pool: 'Life', delta: 2 },
      options,
    );
    hero = state.entities.get('hero')!;
    expect(hero.pools.Life).toBe(2);
    expect(selectPoolLowWater(hero, 'Life')).toBe(0);

    expect(
      requirementsMet(
        registry,
        [
          {
            type: 'metric',
            metric: 'pool-low-water',
            pool: 'Life',
            amount: 0,
          },
        ],
        toEngineContext(state, {}, { actorEntityId: 'hero' }),
      ),
    ).toBe(true);
  });

  it('counts lifetime pool usage from actual spends, not gains or current', () => {
    let state = upsertEntity(
      createEngineState(),
      createEntityInstance({
        id: 'hero',
        definitionId: 'hero',
        tags: [
          createTag({
            name: 'Pool_Sticks',
            effects: [
              {
                type: 'pool-max',
                name: 'Stick',
                strength: 20,
                pool: 'Stick',
              } as never,
            ],
          }),
        ],
        pools: { Stick: 10 },
      }),
    );
    expect(selectPoolLifetimeUsed(state.entities.get('hero')!, 'Stick')).toBe(0);

    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'hero', pool: 'Stick', delta: 5 },
      options,
    );
    expect(selectPoolLifetimeUsed(state.entities.get('hero')!, 'Stick')).toBe(0);

    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'hero', pool: 'Stick', delta: -4 },
      options,
    );
    expect(state.entities.get('hero')!.pools.Stick).toBe(11);
    expect(selectPoolLifetimeUsed(state.entities.get('hero')!, 'Stick')).toBe(4);

    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'hero', pool: 'Stick', delta: -100 },
      options,
    );
    const hero = state.entities.get('hero')!;
    expect(hero.pools.Stick).toBe(0);
    // Only the 11 actually removed count, not the requested 100.
    expect(selectPoolLifetimeUsed(hero, 'Stick')).toBe(15);
    expect(
      requirementsMet(
        registry,
        [
          {
            type: 'metric',
            metric: 'pool-lifetime-used',
            pool: 'Stick',
            amount: 15,
          },
        ],
        toEngineContext(state, {}, { actorEntityId: 'hero' }),
      ),
    ).toBe(true);
  });

  it('raises pool-max high-water when capacity tags are granted', () => {
    let state = withPlayer();
    state = reduceEngineState(
      state,
      {
        type: 'add-tag',
        entityId: 'player',
        tag: createTag({
          name: 'Pool_Extra_Life',
          effects: [
            {
              type: 'pool-max',
              name: 'Life',
              strength: 3,
              pool: 'Life',
            } as never,
          ],
        }),
      },
      options,
    );
    const player = state.entities.get('player')!;
    expect(selectPoolMaxHighWater(player, 'Life')).toBe(8);
  });

  it('counts manual and automatic action executions on the actor', () => {
    const action: ActionDefinition = {
      name: 'craft',
      requirements: [{ type: 'free' }],
      costs: [],
      results: [{ type: 'grant-tag', name: 'crafted', strength: 1 }],
      sideEffects: [],
    };
    let state = withPlayer();
    state = reduceEngineState(
      state,
      {
        type: 'execute-action',
        action,
        actorEntityId: 'player',
        execution: 'manual',
      },
      options,
    );
    state = reduceEngineState(
      state,
      {
        type: 'execute-action',
        action: {
          ...action,
          results: [{ type: 'grant-tag', name: 'crafted-2', strength: 1 }],
        },
        actorEntityId: 'player',
        execution: 'automatic',
      },
      options,
    );
    const player = state.entities.get('player')!;
    expect(selectActionCount(player, 'craft', 'manual')).toBe(1);
    expect(selectActionCount(player, 'craft', 'automatic')).toBe(1);
    expect(selectActionCount(player, 'craft', 'total')).toBe(2);
  });

  it('stamps tick times for actions, tags, and pool spends', () => {
    const action: ActionDefinition = {
      name: 'scout',
      requirements: [{ type: 'free' }],
      costs: [],
      results: [{ type: 'grant-tag', name: 'scouted', strength: 1 }],
      sideEffects: [],
    };
    let state = upsertEntity(
      createEngineState({ tick: 10 }),
      createEntityInstance({
        id: 'hero',
        definitionId: 'hero',
        tags: [
          createTag({
            name: 'Pool_Sticks',
            effects: [
              {
                type: 'pool-max',
                name: 'Stick',
                strength: 20,
                pool: 'Stick',
              } as never,
            ],
          }),
        ],
        pools: { Stick: 5 },
        tick: 10,
      }),
    );
    expect(selectTagGrantedAt(state.entities.get('hero')!, 'Pool_Sticks')).toBe(
      10,
    );

    state = reduceEngineState(state, { type: 'tick', steps: 5 }, options);
    expect(state.tick).toBe(15);

    state = reduceEngineState(
      state,
      {
        type: 'execute-action',
        action,
        actorEntityId: 'hero',
      },
      options,
    );
    let hero = state.entities.get('hero')!;
    expect(selectActionFirstTick(hero, 'scout')).toBe(15);
    expect(selectActionLastTick(hero, 'scout')).toBe(15);
    expect(selectTagGrantedAt(hero, 'scouted')).toBe(15);

    state = reduceEngineState(state, { type: 'tick', steps: 5 }, options);
    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'hero', pool: 'Stick', delta: -2 },
      options,
    );
    hero = state.entities.get('hero')!;
    expect(selectPoolLifetimeUsed(hero, 'Stick')).toBe(2);
    expect(selectPoolLifetimeUsedFirstTick(hero, 'Stick')).toBe(20);

    const ctx = toEngineContext(state, {}, { actorEntityId: 'hero' });
    expect(
      requirementsMet(
        registry,
        [{ type: 'metric', metric: 'engine-tick', amount: 20 }],
        ctx,
      ),
    ).toBe(true);
    expect(
      requirementsMet(
        registry,
        [
          {
            type: 'metric',
            metric: 'tag-held-for',
            tagName: 'scouted',
            amount: 5,
          },
        ],
        ctx,
      ),
    ).toBe(true);
    expect(
      requirementsMet(
        registry,
        [
          {
            type: 'metric',
            metric: 'tag-held-for',
            tagName: 'scouted',
            amount: 6,
          },
        ],
        ctx,
      ),
    ).toBe(false);
  });

  it('evaluates metric requirements and round-trips metrics in JSON', () => {
    let state = withPlayer();
    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'player', pool: 'Life', delta: 3 },
      options,
    );
    const action: ActionDefinition = {
      name: 'scout',
      requirements: [{ type: 'free' }],
      costs: [],
      results: [{ type: 'grant-tag', name: 'scouted', strength: 1 }],
      sideEffects: [],
    };
    state = reduceEngineState(
      state,
      {
        type: 'execute-action',
        action,
        actorEntityId: 'player',
      },
      options,
    );

    const ctx = toEngineContext(state, {}, { actorEntityId: 'player' });
    expect(
      requirementsMet(
        registry,
        [{ type: 'metric', metric: 'action-total', actionId: 'scout', amount: 1 }],
        ctx,
      ),
    ).toBe(true);
    expect(
      requirementsMet(
        registry,
        [
          {
            type: 'metric',
            metric: 'pool-high-water',
            pool: 'Life',
            amount: 3,
          },
        ],
        ctx,
      ),
    ).toBe(true);
    expect(
      requirementsMet(
        registry,
        [
          {
            type: 'metric',
            metric: 'action-manual',
            actionId: 'scout',
            amount: 2,
          },
        ],
        ctx,
      ),
    ).toBe(false);

    const restored = engineStateFromJSON(engineStateToJSON(state));
    const player = restored.entities.get('player')!;
    expect(selectActionCount(player, 'scout', 'total')).toBe(1);
    expect(selectPoolHighWater(player, 'Life')).toBe(3);
  });
});
