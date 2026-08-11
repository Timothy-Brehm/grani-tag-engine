import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from './action';
import {
  emptyOrPayable,
  hasProductiveEffect,
  isActionContinuable,
  isActionFinishable,
  isActionStartable,
  isActionAvailable,
} from './action-availability';
import { EngineRegistry } from './registry';
import { createTag } from './tag';
import {
  createPrimaryEngineState,
  createTaggedEntity,
  toEngineContext,
  upsertEntity,
} from './state';
import { reduceEngineState } from './reduce';
import { continuousProgressKey } from './continuous-types';
import { collectCatalogWarnings } from './catalog';
import { applySlotMagnitudeModifiers } from './action-improvements';
import { createEntityInstance } from './entity';
import { selectPoolCurrent } from './selectors';

describe('action availability helpers', () => {
  const registry = new EngineRegistry().createBuiltinAdaptors();

  function withPools(
    pools: Record<string, number>,
    maxByPool: Record<string, number> = {},
  ) {
    const tags = Object.entries(maxByPool).map(([pool, strength]) =>
      createTag({
        name: `Pool_Initial_${pool}`,
        effects: [
          { type: 'pool-max', name: pool, strength, pool },
        ],
      }),
    );
    let state = createPrimaryEngineState(
      createTaggedEntity({ id: 'hero', tags }),
    );
    const entity = state.entities.get('hero')!;
    state = upsertEntity(state, { ...entity, pools: { ...pools } });
    return toEngineContext(state, {}, { actorEntityId: 'hero' });
  }

  describe('hasProductiveEffect / startable matrix', () => {
    it('finished authored → any requiredFinished canHappen', () => {
      const action: ActionDefinition = {
        name: 'grant',
        requirements: [{ type: 'free' }],
        requiredImmediateEffects: [],
        requiredFinishedEffects: [
          { type: 'grant-tag', name: 'done', strength: 1 },
        ],
        optionalFinishedEffects: [],
      };
      const ctx = withPools({});
      expect(hasProductiveEffect(registry, action, ctx)).toBe(true);
      expect(isActionStartable(registry, action, ctx)).toBe(true);
    });

    it('optional Finished fill still productive after unlock tags are held', () => {
      const action: ActionDefinition = {
        name: 'harvest',
        requirements: [{ type: 'free' }],
        requiredImmediateEffects: [
          { type: 'adjust-pool', name: 'stam', strength: -0.1, pool: 'Stamina' },
        ],
        requiredFinishedEffects: [
          { type: 'grant-tag', name: 'Pool_Initial_Berry', strength: 1 },
        ],
        optionalFinishedEffects: [
          { type: 'adjust-pool', name: 'berry', strength: 1, pool: 'Berry' },
        ],
      };
      // withPools already holds Pool_Initial_Berry (max tag) — unlock grant
      // is not productive; optional fill still is while Berry has room.
      const room = withPools(
        { Stamina: 5, Berry: 1 },
        { Stamina: 10, Berry: 5 },
      );
      expect(hasProductiveEffect(registry, action, room)).toBe(true);
      expect(isActionStartable(registry, action, room)).toBe(true);
      expect(isActionFinishable(registry, action, room, 0)).toBe(true);

      const full = withPools(
        { Stamina: 5, Berry: 5 },
        { Stamina: 10, Berry: 5 },
      );
      expect(hasProductiveEffect(registry, action, full)).toBe(false);
      expect(isActionStartable(registry, action, full)).toBe(false);
    });

    it('immediate only → any Immediate canHappen', () => {
      const action: ActionDefinition = {
        name: 'pay-start',
        requirements: [{ type: 'free' }],
        requiredImmediateEffects: [
          { type: 'adjust-pool', name: 'pay', strength: -1, pool: 'Stamina' },
        ],
        requiredFinishedEffects: [],
        optionalFinishedEffects: [],
      };
      const ok = withPools({ Stamina: 2 }, { Stamina: 5 });
      expect(hasProductiveEffect(registry, action, ok)).toBe(true);
      expect(isActionStartable(registry, action, ok)).toBe(true);
      const broke = withPools({ Stamina: 0 }, { Stamina: 5 });
      expect(hasProductiveEffect(registry, action, broke)).toBe(false);
      expect(isActionStartable(registry, action, broke)).toBe(false);
    });

    it('optional OT only (Rest-like) → optional OT canHappen', () => {
      const action: ActionDefinition = {
        name: 'rest',
        durationTicks: 4,
        requirements: [{ type: 'free' }],
        requiredImmediateEffects: [],
        optionalOverTimeEffects: [
          { type: 'adjust-pool', name: 'heal', strength: 4, pool: 'Life' },
        ],
        requiredFinishedEffects: [],
        optionalFinishedEffects: [],
      };
      const room = withPools({ Life: 1 }, { Life: 5 });
      expect(hasProductiveEffect(registry, action, room)).toBe(true);
      expect(isActionStartable(registry, action, room)).toBe(true);
      const full = withPools({ Life: 5 }, { Life: 5 });
      expect(hasProductiveEffect(registry, action, full)).toBe(false);
      expect(isActionStartable(registry, action, full)).toBe(false);
    });

    it('empty effects → productive (time-only)', () => {
      const action: ActionDefinition = {
        name: 'wait',
        durationTicks: 3,
        requirements: [{ type: 'free' }],
        requiredImmediateEffects: [],
        requiredFinishedEffects: [],
        optionalFinishedEffects: [],
      };
      const ctx = withPools({});
      expect(hasProductiveEffect(registry, action, ctx)).toBe(true);
      expect(isActionStartable(registry, action, ctx)).toBe(true);
    });
  });

  describe('continuable / finishable', () => {
    it('emptyOrPayable is true for empty and false when unpaid', () => {
      const ctx = withPools({ Stamina: 0 }, { Stamina: 5 });
      expect(emptyOrPayable(registry, [], ctx)).toBe(true);
      expect(
        emptyOrPayable(
          registry,
          [
            {
              type: 'adjust-pool',
              name: 'pay',
              strength: -1,
              pool: 'Stamina',
            },
          ],
          ctx,
        ),
      ).toBe(false);
    });

    it('unpaid required OT pauses mid-cycle; empty OT slice continues', () => {
      const options = { registry, host: {} };
      const spend: ActionDefinition = {
        name: 'work',
        durationTicks: 4,
        requirements: [{ type: 'free' }],
        requiredImmediateEffects: [],
        requiredOverTimeEffects: [
          { type: 'adjust-pool', name: 'stamina', strength: -4, pool: 'Stamina' },
        ],
        requiredFinishedEffects: [
          { type: 'grant-tag', name: 'worked', strength: 1 },
        ],
        optionalFinishedEffects: [],
      };
      let state = createPrimaryEngineState(
        createTaggedEntity({
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
          ],
        }),
      );
      state = upsertEntity(state, {
        ...state.entities.get('hero')!,
        pools: { Stamina: 2 },
      });
      state = reduceEngineState(
        state,
        { type: 'execute-action', action: spend, actorEntityId: 'hero' },
        options,
      );
      const key = continuousProgressKey({
        actorEntityId: 'hero',
        actionName: 'work',
      });
      // 2 stamina pays 2 ticks of -1 each; third tick should pause
      state = reduceEngineState(state, { type: 'tick', steps: 2 }, options);
      expect(state.continuousProgress.get(key)?.progress).toBe(50);
      expect(selectPoolCurrent(state.entities.get('hero')!, 'Stamina')).toBe(0);
      state = reduceEngineState(state, { type: 'tick', steps: 1 }, options);
      expect(state.continuousActions.has(key)).toBe(false);
      expect(state.continuousProgress.get(key)?.progress).toBe(50);
      expect(state.entities.get('hero')?.tags.has('worked')).toBe(false);

      const idle: ActionDefinition = {
        name: 'idle',
        durationTicks: 4,
        requirements: [{ type: 'free' }],
        requiredImmediateEffects: [],
        requiredFinishedEffects: [
          { type: 'grant-tag', name: 'idled', strength: 1 },
        ],
        optionalFinishedEffects: [],
      };
      let idleState = createPrimaryEngineState(
        createTaggedEntity({ id: 'hero', tags: [] }),
      );
      idleState = reduceEngineState(
        idleState,
        { type: 'execute-action', action: idle, actorEntityId: 'hero' },
        options,
      );
      const idleKey = continuousProgressKey({
        actorEntityId: 'hero',
        actionName: 'idle',
      });
      const midCtx = toEngineContext(idleState, {}, { actorEntityId: 'hero' });
      expect(
        isActionContinuable(registry, idle, midCtx, 25),
      ).toBe(true);
      idleState = reduceEngineState(idleState, { type: 'tick', steps: 4 }, options);
      expect(idleState.entities.get('hero')?.tags.has('idled')).toBe(true);
      expect(idleState.continuousProgress.has(idleKey)).toBe(false);
    });

    it('finishable blocked by hard requiredFinished costs; soft fills ignored', () => {
      const softFill: ActionDefinition = {
        name: 'fill',
        durationTicks: 2,
        requirements: [{ type: 'free' }],
        requiredImmediateEffects: [],
        requiredFinishedEffects: [
          { type: 'adjust-pool', name: 'gain', strength: 1, pool: 'Life' },
        ],
        optionalFinishedEffects: [],
      };
      const full = withPools({ Life: 5 }, { Life: 5 });
      // Positive Finished fills are soft at the gate (clamped at apply).
      expect(isActionFinishable(registry, softFill, full, 100)).toBe(true);
      expect(isActionStartable(registry, softFill, full)).toBe(false);

      const hardCost: ActionDefinition = {
        name: 'pay-on-finish',
        durationTicks: 2,
        requirements: [{ type: 'free' }],
        requiredImmediateEffects: [],
        requiredFinishedEffects: [
          { type: 'adjust-pool', name: 'toll', strength: -1, pool: 'Life' },
        ],
        optionalFinishedEffects: [],
      };
      const empty = withPools({ Life: 0 }, { Life: 5 });
      expect(isActionFinishable(registry, hardCost, empty, 100)).toBe(false);

      const emptyFinished: ActionDefinition = {
        name: 'timer',
        durationTicks: 2,
        requirements: [{ type: 'free' }],
        requiredImmediateEffects: [],
        requiredFinishedEffects: [],
        optionalFinishedEffects: [],
      };
      expect(isActionFinishable(registry, emptyFinished, full, 100)).toBe(true);

      const options = { registry, host: {} };
      let state = createPrimaryEngineState(
        createTaggedEntity({
          id: 'hero',
          tags: [
            createTag({
              name: 'Pool_Initial_Life',
              effects: [
                { type: 'pool-max', name: 'Life', strength: 5, pool: 'Life' },
              ],
            }),
          ],
        }),
      );
      state = upsertEntity(state, {
        ...state.entities.get('hero')!,
        pools: { Life: 2 },
      });
      state = reduceEngineState(
        state,
        { type: 'execute-action', action: hardCost, actorEntityId: 'hero' },
        options,
      );
      // Drain Life mid-run so the hard Finished toll cannot happen at complete
      state = upsertEntity(state, {
        ...state.entities.get('hero')!,
        pools: { Life: 0 },
      });
      const key = continuousProgressKey({
        actorEntityId: 'hero',
        actionName: 'pay-on-finish',
      });
      state = reduceEngineState(state, { type: 'tick', steps: 2 }, options);
      expect(state.continuousActions.has(key)).toBe(false);
      expect(state.continuousProgress.get(key)?.progress).toBeGreaterThan(0);
      expect(selectPoolCurrent(state.entities.get('hero')!, 'Life')).toBe(0);
    });
  });

  it('isActionAvailable routes mid-cycle to continuable/finishable', () => {
    const action: ActionDefinition = {
      name: 'long',
      durationTicks: 4,
      requirements: [{ type: 'free' }],
      requiredImmediateEffects: [],
      requiredFinishedEffects: [
        { type: 'grant-tag', name: 'done', strength: 1 },
      ],
      optionalFinishedEffects: [],
    };
    const options = { registry, host: {} };
    let state = createPrimaryEngineState(
      createTaggedEntity({ id: 'hero', tags: [] }),
    );
    state = reduceEngineState(
      state,
      { type: 'execute-action', action, actorEntityId: 'hero' },
      options,
    );
    state = reduceEngineState(state, { type: 'tick', steps: 1 }, options);
    const ctx = toEngineContext(state, {}, { actorEntityId: 'hero' });
    expect(isActionAvailable(registry, action, ctx)).toBe(true);
  });
});

describe('catalog finished-required-cost warn', () => {
  it('warns on negative adjust-pool in requiredFinishedEffects', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    registry.registerEntityDefinition({
      id: 'camp',
      maxActive: 1,
      maxCreated: 1,
      actions: [
        {
          name: 'weird-finish-cost',
          requirements: [],
          requiredImmediateEffects: [],
          requiredFinishedEffects: [
            {
              type: 'adjust-pool',
              name: 'late-pay',
              strength: -2,
              pool: 'Stamina',
            },
          ],
          optionalFinishedEffects: [],
        },
      ],
    });
    const state = createPrimaryEngineState(
      createTaggedEntity({ id: 'hero', tags: [] }),
    );
    const warnings = collectCatalogWarnings(registry, state);
    expect(
      warnings.some(
        (w) =>
          w.kind === 'finished-required-cost' &&
          w.id === 'weird-finish-cost' &&
          w.source === 'definition:camp.action:weird-finish-cost',
      ),
    ).toBe(true);
  });
});

describe('finished magnitude dual-read', () => {
  it('reduceRequiredEffect still shrinks finished-slot adjusts', () => {
    const actor = createEntityInstance({
      id: 'a',
      definitionId: 'a',
      tags: [
        createTag({
          name: 'legacy-finish',
          effects: [
            {
              type: 'reduceRequiredEffect',
              name: 'relief',
              strength: 2,
              pool: 'Water',
              actionName: 'explore',
            },
          ],
        }),
      ],
    });
    const next = applySlotMagnitudeModifiers(
      [
        {
          type: 'adjust-pool',
          name: 'find',
          strength: 5,
          pool: 'Water',
        },
      ],
      'requiredFinishedEffects',
      actor,
      'explore',
      undefined,
    );
    expect(next[0]?.strength).toBe(3);
  });

  it('reduceFinishedEffect applies to both finished slots', () => {
    const actor = createEntityInstance({
      id: 'a',
      definitionId: 'a',
      tags: [
        createTag({
          name: 'new-finish',
          effects: [
            {
              type: 'reduceFinishedEffect',
              name: 'relief',
              strength: 1,
              pool: 'Water',
            },
          ],
        }),
      ],
    });
    const next = applySlotMagnitudeModifiers(
      [
        {
          type: 'adjust-pool',
          name: 'find',
          strength: 4,
          pool: 'Water',
        },
      ],
      'optionalFinishedEffects',
      actor,
      'explore',
      undefined,
    );
    expect(next[0]?.strength).toBe(3);
  });
});
