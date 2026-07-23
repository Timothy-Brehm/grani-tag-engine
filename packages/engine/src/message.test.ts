import { describe, expect, it } from 'vitest';
import { createEntityInstance } from './entity';
import { createEngineState, upsertEntity, engineStateToJSON, engineStateFromJSON } from './state';
import { reduceEngineState } from './reduce';
import { EngineRegistry } from './registry';
import {
  selectMessageIsNew,
  selectUnseenMessages,
} from './novelty';
import { selectUnseenMessagesInState } from './selectors';

describe('entity messages', () => {
  const registry = new EngineRegistry().createBuiltinAdaptors();
  const options = { registry, host: {} };

  function shipAndPilot() {
    let state = createEngineState({
      entities: [
        createEntityInstance({ id: 'pilot', definitionId: 'pilot' }),
        createEntityInstance({ id: 'ship', definitionId: 'ship' }),
      ],
      primaryEntityId: 'pilot',
    });
    return state;
  }

  it('offers show-message on source by default and acknowledges via seen-message', () => {
    let state = shipAndPilot();
    state = reduceEngineState(
      state,
      {
        type: 'execute-action',
        action: {
          name: 'briefing',
          requirements: [{ type: 'free' }],
          costs: [],
          results: [
            {
              type: 'show-message',
              name: 'canopy-hint',
              strength: 1,
            },
          ],
          sideEffects: [],
        },
        actorEntityId: 'pilot',
        sourceEntityId: 'ship',
      },
      options,
    );

    const ship = state.entities.get('ship')!;
    const pilot = state.entities.get('pilot')!;
    expect(selectUnseenMessages(ship)).toEqual(['canopy-hint']);
    expect(selectUnseenMessages(pilot)).toEqual([]);
    expect(selectMessageIsNew(ship, 'canopy-hint')).toBe(true);
    expect(selectUnseenMessagesInState(state)).toEqual([
      { entityId: 'ship', messageId: 'canopy-hint' },
    ]);

    state = reduceEngineState(
      state,
      {
        type: 'seen-message',
        entityId: 'ship',
        messageId: 'canopy-hint',
      },
      options,
    );
    expect(selectUnseenMessages(state.entities.get('ship')!)).toEqual([]);
    expect(state.entities.get('ship')!.novelty.seenMessages['canopy-hint']).toBe(
      true,
    );
    expect(selectUnseenMessagesInState(state)).toEqual([]);
  });

  it('is fire-once: does not re-offer after seen', () => {
    let state = shipAndPilot();
    const action = {
      name: 'briefing',
      requirements: [{ type: 'free' as const }],
      costs: [],
      results: [
        {
          type: 'show-message' as const,
          name: 'canopy-hint',
          strength: 1,
        },
      ],
      sideEffects: [],
    };

    state = reduceEngineState(
      state,
      {
        type: 'execute-action',
        action,
        actorEntityId: 'pilot',
        sourceEntityId: 'ship',
      },
      options,
    );
    state = reduceEngineState(
      state,
      {
        type: 'seen-message',
        entityId: 'ship',
        messageId: 'canopy-hint',
      },
      options,
    );
    state = reduceEngineState(
      state,
      {
        type: 'execute-action',
        action,
        actorEntityId: 'pilot',
        sourceEntityId: 'ship',
      },
      options,
    );

    expect(selectUnseenMessages(state.entities.get('ship')!)).toEqual([]);
  });

  it('respects explicit actor scope', () => {
    let state = shipAndPilot();
    state = reduceEngineState(
      state,
      {
        type: 'execute-action',
        action: {
          name: 'self-talk',
          requirements: [{ type: 'free' }],
          costs: [],
          results: [
            {
              type: 'show-message',
              name: 'ragged',
              strength: 1,
              scope: 'actor',
            },
          ],
          sideEffects: [],
        },
        actorEntityId: 'pilot',
        sourceEntityId: 'ship',
      },
      options,
    );

    expect(selectUnseenMessages(state.entities.get('pilot')!)).toEqual([
      'ragged',
    ]);
    expect(selectUnseenMessages(state.entities.get('ship')!)).toEqual([]);
  });

  it('round-trips offered and seen messages in engine JSON', () => {
    let state = upsertEntity(
      createEngineState(),
      createEntityInstance({ id: 'ship', definitionId: 'ship' }),
    );
    state = reduceEngineState(
      state,
      {
        type: 'execute-action',
        action: {
          name: 'briefing',
          requirements: [{ type: 'free' }],
          costs: [],
          results: [
            { type: 'show-message', name: 'a', strength: 1, scope: 'actor' },
            { type: 'show-message', name: 'b', strength: 1, scope: 'actor' },
          ],
          sideEffects: [],
        },
        actorEntityId: 'ship',
      },
      options,
    );
    state = reduceEngineState(
      state,
      { type: 'seen-message', entityId: 'ship', messageId: 'a' },
      options,
    );

    const restored = engineStateFromJSON(engineStateToJSON(state));
    const ship = restored.entities.get('ship')!;
    expect(selectUnseenMessages(ship)).toEqual(['b']);
    expect(ship.novelty.seenMessages.a).toBe(true);
  });
});
