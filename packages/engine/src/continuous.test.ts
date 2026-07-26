import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from './action';
import { EngineRegistry } from './registry';
import { reduceEngineState } from './reduce';
import {
  createPrimaryEngineState,
  createTaggedEntity,
  engineStateFromJSON,
  engineStateToJSON,
} from './state';
import { createTag } from './tag';
import {
  continuousProgressKey,
  continuousProgressPercent,
} from './continuous-types';
import { selectPoolCurrent } from './selectors';
import { selectActionCount } from './metrics';

describe('generators and continuous actions', () => {
  const registry = new EngineRegistry().createBuiltinAdaptors();
  const options = { registry, host: {} };

  function withHero(
    pools: Record<string, number>,
    extraTags: ReturnType<typeof createTag>[] = [],
  ) {
    const entity = createTaggedEntity({
      id: 'hero',
      tags: [
        createTag({
          name: 'Pool_Initial_Stamina',
          effects: [
            {
              type: 'pool-max',
              name: 'Stamina',
              strength: 10,
              pool: 'Stamina',
            },
          ],
        }),
        createTag({
          name: 'Pool_Initial_Stick',
          effects: [
            {
              type: 'pool-max',
              name: 'Stick',
              strength: 5,
              pool: 'Stick',
            },
          ],
        }),
        ...extraTags,
      ],
    });
    const state = createPrimaryEngineState(entity);
    const heroEntity = state.entities.get('hero')!;
    return createPrimaryEngineState({
      ...heroEntity,
      pools: { Stamina: 0, Stick: 0, ...pools },
    });
  }

  it('pulses generate-pool and skips when full without advancing lastPulse', () => {
    let state = withHero(
      { Stamina: 9 },
      [
        createTag({
          name: 'Regen',
          effects: [
            {
              type: 'generate-pool',
              name: 'stamina-gen',
              strength: 1,
              pool: 'Stamina',
              amount: 1,
              everyTicks: 2,
            },
          ],
        }),
      ],
    );

    state = reduceEngineState(state, { type: 'tick', steps: 1 }, options);
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stamina')).toBe(10);
    const pulsedAt = state.entities.get('hero')!.metrics.generatorLastTick[
      'Regen::Stamina'
    ];
    expect(pulsedAt).toBe(1);

    state = reduceEngineState(state, { type: 'tick', steps: 2 }, options);
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stamina')).toBe(10);
    expect(
      state.entities.get('hero')!.metrics.generatorLastTick['Regen::Stamina'],
    ).toBe(pulsedAt);

    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'hero', pool: 'Stamina', delta: -1 },
      options,
    );
    state = reduceEngineState(state, { type: 'tick', steps: 1 }, options);
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stamina')).toBe(10);
    expect(
      state.entities.get('hero')!.metrics.generatorLastTick['Regen::Stamina'],
    ).toBeGreaterThan(pulsedAt!);
  });

  it('treats omitted durationTicks as 1 and pays full costsOverTime on that tick', () => {
    const action: ActionDefinition = {
      name: 'instant-gather',
      requirements: [{ type: 'free' }],
      costs: [
        { type: 'adjust-pool', name: 'start', strength: -1, pool: 'Stamina' },
      ],
      costsOverTime: [
        { type: 'adjust-pool', name: 'work', strength: -2, pool: 'Stamina' },
      ],
      results: [
        { type: 'adjust-pool', name: 'stick', strength: 1, pool: 'Stick' },
      ],
      sideEffects: [],
    };
    let state = withHero({ Stamina: 5, Stick: 0 });
    state = reduceEngineState(
      state,
      { type: 'execute-action', action, actorEntityId: 'hero' },
      options,
    );
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stamina')).toBe(2);
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stick')).toBe(1);
    expect(state.continuousActions.size).toBe(0);
    expect(
      selectActionCount(state.entities.get('hero')!, 'instant-gather'),
    ).toBe(1);
  });

  it('prorates costsOverTime and pauses when the slice cannot be paid', () => {
    const action: ActionDefinition = {
      name: 'gather-sticks',
      durationTicks: 10,
      requirements: [{ type: 'free' }],
      costs: [
        { type: 'adjust-pool', name: 'start', strength: -1, pool: 'Stamina' },
      ],
      costsOverTime: [
        { type: 'adjust-pool', name: 'work', strength: -10, pool: 'Stamina' },
      ],
      results: [
        { type: 'adjust-pool', name: 'stick', strength: 1, pool: 'Stick' },
      ],
      sideEffects: [],
    };
    let state = withHero({ Stamina: 6, Stick: 0 });
    state = reduceEngineState(
      state,
      { type: 'execute-action', action, actorEntityId: 'hero' },
      options,
    );
    const key = continuousProgressKey({
      actorEntityId: 'hero',
      actionName: 'gather-sticks',
    });
    expect(state.continuousActions.has(key)).toBe(true);
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stamina')).toBe(5);

    // Builtin canHappen for spend requires current > cost; from 5 we can pay
    // four -1 slices (→ stamina 1, progress 4), then the next slice pauses.
    state = reduceEngineState(state, { type: 'tick', steps: 5 }, options);
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stamina')).toBe(1);
    expect(state.continuousActions.has(key)).toBe(false);
    expect(state.continuousProgress.get(key)?.progressTicks).toBe(4);
    expect(continuousProgressPercent(state.continuousProgress.get(key)!)).toBe(
      0.4,
    );
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stick')).toBe(0);

    // Resume after refill — no re-pay start cost. Need enough stamina that
    // canHappen (current > slice) still holds through the remaining slices.
    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'hero', pool: 'Stamina', delta: 9 },
      options,
    );
    state = reduceEngineState(
      state,
      { type: 'execute-action', action, actorEntityId: 'hero' },
      options,
    );
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stamina')).toBe(10);
    expect(state.continuousProgress.get(key)?.progressTicks).toBe(4);

    state = reduceEngineState(state, { type: 'tick', steps: 6 }, options);
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stick')).toBe(1);
    expect(state.continuousProgress.has(key)).toBe(false);
    expect(state.continuousActions.has(key)).toBe(false);
  });

  it('auto-stops when requirements fail and keeps progress', () => {
    const action: ActionDefinition = {
      name: 'gated',
      durationTicks: 4,
      requirements: [
        { type: 'tag', tagName: 'allowed', exists: true },
      ],
      costs: [],
      results: [
        { type: 'grant-tag', name: 'done', strength: 1 },
      ],
      sideEffects: [],
    };
    let state = withHero({ Stamina: 5 }, [
      createTag({ name: 'allowed', effects: [] }),
    ]);
    state = reduceEngineState(
      state,
      { type: 'execute-action', action, actorEntityId: 'hero' },
      options,
    );
    const key = continuousProgressKey({
      actorEntityId: 'hero',
      actionName: 'gated',
    });
    state = reduceEngineState(state, { type: 'tick', steps: 2 }, options);
    expect(state.continuousProgress.get(key)?.progressTicks).toBe(2);

    state = reduceEngineState(
      state,
      { type: 'remove-tag', entityId: 'hero', name: 'allowed' },
      options,
    );
    state = reduceEngineState(state, { type: 'tick', steps: 1 }, options);
    expect(state.continuousActions.has(key)).toBe(false);
    expect(state.continuousProgress.get(key)?.progressTicks).toBe(2);
    expect(state.entities.get('hero')?.tags.has('done')).toBe(false);
  });

  it('respects continuous-slots and allow-instant-while-continuous', () => {
    const longJob: ActionDefinition = {
      name: 'long',
      durationTicks: 10,
      requirements: [{ type: 'free' }],
      costs: [],
      results: [{ type: 'grant-tag', name: 'long-done', strength: 1 }],
      sideEffects: [],
    };
    const instant: ActionDefinition = {
      name: 'quick',
      requirements: [{ type: 'free' }],
      costs: [],
      results: [{ type: 'grant-tag', name: 'quick-done', strength: 1 }],
      sideEffects: [],
    };

    let state = withHero({ Stamina: 5 });
    state = reduceEngineState(
      state,
      { type: 'execute-action', action: longJob, actorEntityId: 'hero' },
      options,
    );
    const blocked = reduceEngineState(
      state,
      { type: 'execute-action', action: instant, actorEntityId: 'hero' },
      options,
    );
    expect(blocked.entities.get('hero')?.tags.has('quick-done')).toBe(false);

    state = reduceEngineState(
      state,
      {
        type: 'add-tag',
        entityId: 'hero',
        tag: createTag({
          name: 'multitask',
          effects: [
            {
              type: 'allow-instant-while-continuous',
              name: 'allow',
              strength: 1,
            },
          ],
        }),
      },
      options,
    );
    state = reduceEngineState(
      state,
      { type: 'execute-action', action: instant, actorEntityId: 'hero' },
      options,
    );
    expect(state.entities.get('hero')?.tags.has('quick-done')).toBe(true);
    expect(state.continuousActions.size).toBe(1);
  });

  it('applies continuous-speed addTicks then multiply and generatorCount', () => {
    const action: ActionDefinition = {
      name: 'chop',
      durationTicks: 100,
      requirements: [{ type: 'free' }],
      costs: [],
      costsOverTime: [
        { type: 'adjust-pool', name: 'work', strength: -4, pool: 'Stamina' },
      ],
      results: [
        { type: 'adjust-pool', name: 'stick', strength: 1, pool: 'Stick' },
      ],
      sideEffects: [],
    };
    let state = withHero({ Stamina: 10 }, [
      createTag({
        name: 'efficiency',
        effects: [
          {
            type: 'continuous-speed',
            name: 'speed',
            strength: 1,
            actionName: 'chop',
            addTicks: -96,
            multiply: 0.5,
            generatorCount: 2,
          },
        ],
      }),
    ]);
    // effective: (100-96)*0.5 = 2; progress +2 per tick → completes in 1 tick
    state = reduceEngineState(
      state,
      { type: 'execute-action', action, actorEntityId: 'hero' },
      options,
    );
    state = reduceEngineState(state, { type: 'tick', steps: 1 }, options);
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stick')).toBe(1);
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stamina')).toBe(6);
  });

  it('round-trips continuous progress and actives through JSON', () => {
    const action: ActionDefinition = {
      name: 'slow',
      durationTicks: 5,
      requirements: [{ type: 'free' }],
      costs: [],
      results: [{ type: 'grant-tag', name: 'slow-done', strength: 1 }],
      sideEffects: [],
    };
    let state = withHero({ Stamina: 5 });
    state = reduceEngineState(
      state,
      { type: 'execute-action', action, actorEntityId: 'hero' },
      options,
    );
    state = reduceEngineState(state, { type: 'tick', steps: 2 }, options);
    const restored = engineStateFromJSON(engineStateToJSON(state));
    const key = continuousProgressKey({
      actorEntityId: 'hero',
      actionName: 'slow',
    });
    expect(restored.continuousActions.has(key)).toBe(true);
    expect(restored.continuousProgress.get(key)?.progressTicks).toBe(2);
    expect(restored.engineVersion).toBe(state.engineVersion);
  });

  it('cancel clears progress without refund', () => {
    const action: ActionDefinition = {
      name: 'work',
      durationTicks: 4,
      requirements: [{ type: 'free' }],
      costs: [
        { type: 'adjust-pool', name: 'start', strength: -2, pool: 'Stamina' },
      ],
      results: [{ type: 'grant-tag', name: 'worked', strength: 1 }],
      sideEffects: [],
    };
    let state = withHero({ Stamina: 5 });
    state = reduceEngineState(
      state,
      { type: 'execute-action', action, actorEntityId: 'hero' },
      options,
    );
    state = reduceEngineState(state, { type: 'tick', steps: 1 }, options);
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stamina')).toBe(3);
    state = reduceEngineState(
      state,
      {
        type: 'cancel-continuous-action',
        actorEntityId: 'hero',
        actionName: 'work',
      },
      options,
    );
    expect(state.continuousActions.size).toBe(0);
    expect(state.continuousProgress.size).toBe(0);
    expect(selectPoolCurrent(state.entities.get('hero')!, 'Stamina')).toBe(3);
    expect(state.entities.get('hero')?.tags.has('worked')).toBe(false);
  });
});
