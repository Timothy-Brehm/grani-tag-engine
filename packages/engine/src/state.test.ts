import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from './action';
import type { EngineCommand } from './command';
import { EngineRegistry } from './registry';
import { reduceEngineCommands, reduceEngineState } from './reduce';
import {
  createEngineState,
  engineStateFromJSON,
  engineStateToJSON,
} from './state';
import { createTag } from './tag';
import { ProcessesNotImplementedError } from './process';

describe('EngineState and reduceEngineState', () => {
  const registry = new EngineRegistry().createBuiltinAdaptors();
  const options = { registry, host: {} };

  it('serializes and restores tags and tick', () => {
    const state = createEngineState({
      tags: [createTag({ name: 'a', effects: [] })],
      tick: 3,
    });
    const restored = engineStateFromJSON(engineStateToJSON(state));
    expect(restored.tick).toBe(3);
    expect(restored.tags.has('a')).toBe(true);
  });

  it('adds tags idempotently and removes by name', () => {
    let state = createEngineState();
    const tag = createTag({ name: 'x', effects: [] });
    state = reduceEngineState(state, { type: 'add-tag', tag }, options);
    state = reduceEngineState(state, { type: 'add-tag', tag }, options);
    expect(state.tags.size).toBe(1);
    state = reduceEngineState(state, { type: 'remove-tag', name: 'x' }, options);
    expect(state.tags.has('x')).toBe(false);
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
      { type: 'execute-action', action },
    ];
    const next = reduceEngineCommands(createEngineState(), commands, options);
    expect(next.tick).toBe(2);
    expect(next.tags.has('bonus')).toBe(true);
  });

  it('replace-tags swaps the whole collection', () => {
    const state = createEngineState({
      tags: [createTag({ name: 'old', effects: [] })],
    });
    const next = reduceEngineState(
      state,
      { type: 'replace-tags', tags: [createTag({ name: 'new', effects: [] })] },
      options,
    );
    expect(next.tags.has('old')).toBe(false);
    expect(next.tags.has('new')).toBe(true);
  });

  it('fails explicitly for reserved process commands', () => {
    expect(() =>
      reduceEngineState(
        createEngineState(),
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
