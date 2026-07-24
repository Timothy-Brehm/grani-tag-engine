import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from './action';
import type { EngineCommand } from './command';
import { EngineRegistry } from './registry';
import { reduceEngineCommands, reduceEngineState } from './reduce';
import {
  createPrimaryEngineState,
  createTaggedEntity,
  engineStateFromJSON,
  engineStateToJSON,
} from './state';
import { createTag } from './tag';
import { ProcessesNotImplementedError } from './process';
import { selectPoolCurrent, selectStatValue } from './selectors';

describe('EngineState and reduceEngineState', () => {
  const registry = new EngineRegistry().createBuiltinAdaptors();
  const options = { registry, host: {} };

  function playerEntity() {
    return createTaggedEntity({
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
              strength: 1,
              pool: 'Life',
            } as never,
          ],
        }),
      ],
    });
  }

  function withPlayer(tick = 0) {
    return createPrimaryEngineState(playerEntity(), { tick });
  }

  it('serializes and restores entities, tick, and primaryEntityId', () => {
    const state = withPlayer(3);
    const restored = engineStateFromJSON(engineStateToJSON(state));
    expect(restored.tick).toBe(3);
    expect(restored.primaryEntityId).toBe('player');
    expect(
      restored.entities.get('player')?.tags.has('Stat_Initial_Strength'),
    ).toBe(true);
  });

  it('requires primaryEntityId and refuses to remove the primary entity', () => {
    const state = withPlayer();
    expect(state.primaryEntityId).toBe('player');
    expect(() =>
      reduceEngineState(
        state,
        { type: 'remove-entity', entityId: 'player' },
        options,
      ),
    ).toThrow(/Cannot remove primary entity/);
  });

  it('allows removing a former primary after retargeting', () => {
    const registryLocal = new EngineRegistry().createBuiltinAdaptors();
    registryLocal.registerEntityDefinition({
      id: 'hero',
      maxActive: 2,
      maxCreated: 2,
    });
    const a = createTaggedEntity({ id: 'a', definitionId: 'hero' });
    const b = createTaggedEntity({ id: 'b', definitionId: 'hero' });
    let state = createPrimaryEngineState(a, {
      others: [b],
      spawnCounts: { hero: 2 },
    });
    state = reduceEngineState(
      state,
      { type: 'set-primary-entity', entityId: 'b' },
      { registry: registryLocal, host: {} },
    );
    expect(state.primaryEntityId).toBe('b');
    state = reduceEngineState(
      state,
      { type: 'remove-entity', entityId: 'a' },
      { registry: registryLocal, host: {} },
    );
    expect(state.entities.has('a')).toBe(false);
    expect(state.primaryEntityId).toBe('b');
  });

  it('adds tags idempotently and removes by name on an entity', () => {
    let state = withPlayer();
    const tag = createTag({ name: 'x', effects: [] });
    state = reduceEngineState(
      state,
      { type: 'add-tag', entityId: 'player', tag },
      options,
    );
    state = reduceEngineState(
      state,
      { type: 'add-tag', entityId: 'player', tag },
      options,
    );
    expect(state.entities.get('player')?.tags.size).toBe(3);
    state = reduceEngineState(
      state,
      { type: 'remove-tag', entityId: 'player', name: 'x' },
      options,
    );
    expect(state.entities.get('player')?.tags.has('x')).toBe(false);
  });

  it('advances tick and executes actions via commands', () => {
    const action: ActionDefinition = {
      name: 'grant',
      requirements: [{ type: 'free' }],
      costs: [],
      results: [{ type: 'grant-tag', name: 'bonus', strength: 1 }],
      sideEffects: [],
    };
    const commands: EngineCommand[] = [
      { type: 'tick', steps: 2 },
      { type: 'execute-action', action, actorEntityId: 'player' },
    ];
    const next = reduceEngineCommands(withPlayer(), commands, options);
    expect(next.tick).toBe(2);
    expect(next.entities.get('player')?.tags.has('bonus')).toBe(true);
  });

  it('adjusts pools and clamps to tag-derived maxima', () => {
    let state = withPlayer();
    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'player', pool: 'Life', delta: 1 },
      options,
    );
    expect(selectPoolCurrent(state.entities.get('player')!, 'Life')).toBe(1);
    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'player', pool: 'Life', delta: 5 },
      options,
    );
    expect(selectPoolCurrent(state.entities.get('player')!, 'Life')).toBe(1);
  });

  it('spawns entities from registered definitions with limits', () => {
    registry.registerEntityDefinition({
      id: 'crate',
      maxActive: 1,
      maxCreated: 1,
      initialPools: {},
    });
    let state = withPlayer();
    state = reduceEngineState(
      state,
      { type: 'spawn-entity', definitionId: 'crate', entityId: 'crate-1' },
      options,
    );
    expect(state.entities.has('crate-1')).toBe(true);
    expect(state.spawnCounts.crate).toBe(1);
    const blocked = reduceEngineState(
      state,
      { type: 'spawn-entity', definitionId: 'crate', entityId: 'crate-2' },
      options,
    );
    expect(blocked.entities.has('crate-2')).toBe(false);
  });

  it('replace-tags swaps the entity collection', () => {
    const state = withPlayer();
    const next = reduceEngineState(
      state,
      {
        type: 'replace-tags',
        entityId: 'player',
        tags: [createTag({ name: 'new', effects: [] })],
      },
      options,
    );
    expect(next.entities.get('player')?.tags.has('Stat_Initial_Strength')).toBe(
      false,
    );
    expect(next.entities.get('player')?.tags.has('new')).toBe(true);
  });

  it('derives stats from entity tags', () => {
    const state = withPlayer();
    expect(selectStatValue(state.entities.get('player')!, 'Strength')).toBe(1);
  });

  it('fails explicitly for reserved process commands', () => {
    expect(() =>
      reduceEngineState(
        withPlayer(),
        {
          type: 'set-process-allocation',
          processId: 'factory/metal',
          allocation: 1,
        },
        options,
      ),
    ).toThrow(ProcessesNotImplementedError);
  });
});
