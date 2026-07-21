import { describe, expect, it } from 'vitest';
import {
  createEngineState,
  EngineRegistry,
  reduceEngineState,
  type EngineCommand,
} from 'grani-tag-engine';
import { createTag } from 'grani-tag-engine';

/**
 * React package focuses on wiring; reducer behavior is covered in the engine.
 * This smoke test documents the dispatch pattern the provider uses.
 */
describe('@grani/react dispatch pattern', () => {
  it('reduces add-tag the same way EngineProvider dispatch would', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    const options = { registry, host: {} };
    let state = createEngineState();
    const dispatch = (command: EngineCommand) => {
      state = reduceEngineState(state, command, options);
    };
    dispatch({
      type: 'add-tag',
      tag: createTag({ name: 'linked', effects: [] }),
    });
    dispatch({ type: 'tick' });
    expect(state.tags.has('linked')).toBe(true);
    expect(state.tick).toBe(1);
  });
});
