import { describe, expect, it } from 'vitest';
import { EngineRegistry } from './registry';
import { createEngineState } from './state';
import { reduceEngineState } from './reduce';
import { createTag } from './tag';
import { instantiateEntity } from './entity';
import {
  selectPoolAvailable,
  selectPoolMax,
  selectPoolReserved,
  selectStatValue,
} from './selectors';
import { selectStatReserved, selectStatValueGross } from './capacity';
import { ENGINE_VERSION } from './version';

function registryWith(
  ...defs: Parameters<EngineRegistry['registerEntityDefinition']>[0][]
) {
  const registry = new EngineRegistry().createBuiltinAdaptors();
  for (const def of defs) {
    registry.registerEntityDefinition(def);
  }
  return registry;
}

describe('assignable capacities', () => {
  it('exports 0.3.0.2', () => {
    expect(ENGINE_VERSION).toBe('0.3.0.2');
  });

  it('reserve-stat lowers effective selectStatValue', () => {
    const registry = registryWith({
      id: 'mage',
      initialTags: [
        createTag({
          name: 'Stat_Initial_Int',
          effects: [
            {
              type: 'stat',
              name: 'int',
              strength: 10,
              stat: 'Intelligence',
            },
            {
              type: 'reserve-stat',
              name: 'focus',
              strength: 3,
              stat: 'Intelligence',
            },
          ],
        }),
      ],
    });
    const state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('mage')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    const player = state.entities.get('player')!;
    expect(
      selectStatValueGross(player, 'Intelligence', registry, state.entities),
    ).toBe(10);
    expect(
      selectStatReserved(state, 'player', 'Intelligence', registry),
    ).toBe(3);
    expect(
      selectStatValue(
        player,
        'Intelligence',
        registry,
        state.entities,
        undefined,
        state,
      ),
    ).toBe(7);
  });

  it('stat→pool: commits Int, provides Mana max + generate', () => {
    const registry = registryWith({
      id: 'mage',
      initialTags: [
        createTag({
          name: 'Stat_Initial_Int',
          effects: [
            {
              type: 'stat',
              name: 'int',
              strength: 10,
              stat: 'Intelligence',
            },
          ],
        }),
        createTag({
          name: 'Pool_Initial_Mana',
          effects: [
            {
              type: 'pool-max',
              name: 'mana',
              strength: 0,
              pool: 'Mana',
            },
          ],
        }),
      ],
      initialPools: { Mana: 0 },
    });
    let state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('mage')!, 'player'),
      ],
      primaryEntityId: 'player',
    });

    state = reduceEngineState(
      state,
      {
        type: 'assign-capacity',
        converterEntityId: 'player',
        assignment: {
          id: 'int-to-mana',
          sourceEntityId: 'player',
          fromStat: 'Intelligence',
          amount: 3,
          toPool: 'Mana',
          efficiency: 5,
        },
      },
      { registry, host: undefined },
    );

    const player = state.entities.get('player')!;
    expect(
      selectStatValue(
        player,
        'Intelligence',
        registry,
        state.entities,
        undefined,
        state,
      ),
    ).toBe(7);
    expect(
      selectPoolMax(
        player,
        'Mana',
        registry,
        state.entities,
        undefined,
        state,
      ),
    ).toBe(15);

    state = reduceEngineState(
      state,
      { type: 'tick', steps: 1 },
      { registry, host: undefined },
    );
    expect(
      selectPoolAvailable(state.entities.get('player')!, 'Mana'),
    ).toBe(15);
  });

  it('pool→pool: reserves Stamina Available and raises dest Max', () => {
    const registry = registryWith({
      id: 'worker',
      initialTags: [
        createTag({
          name: 'Pools',
          effects: [
            {
              type: 'pool-max',
              name: 'stam',
              strength: 20,
              pool: 'Stamina',
            },
            {
              type: 'pool-max',
              name: 'focus',
              strength: 0,
              pool: 'Focus',
            },
          ],
        }),
      ],
      initialPools: { Stamina: 20, Focus: 0 },
    });
    let state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('worker')!, 'player'),
      ],
      primaryEntityId: 'player',
    });

    state = reduceEngineState(
      state,
      {
        type: 'assign-capacity',
        converterEntityId: 'player',
        assignment: {
          id: 'stam-to-focus',
          sourceEntityId: 'player',
          fromPool: 'Stamina',
          amount: 5,
          toPool: 'Focus',
          efficiency: 1,
        },
      },
      { registry, host: undefined },
    );

    const player = state.entities.get('player')!;
    expect(selectPoolReserved(state, 'player', 'Stamina', registry)).toBe(5);
    expect(selectPoolAvailable(player, 'Stamina')).toBe(15);
    expect(
      selectPoolMax(
        player,
        'Focus',
        registry,
        state.entities,
        undefined,
        state,
      ),
    ).toBe(5);
  });

  it('pool→stat: reserved pool provides dest stat', () => {
    const registry = registryWith({
      id: 'athlete',
      initialTags: [
        createTag({
          name: 'Base',
          effects: [
            {
              type: 'pool-max',
              name: 'stam',
              strength: 20,
              pool: 'Stamina',
            },
            {
              type: 'stat',
              name: 'con',
              strength: 1,
              stat: 'Constitution',
            },
          ],
        }),
      ],
      initialPools: { Stamina: 20 },
    });
    let state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('athlete')!, 'player'),
      ],
      primaryEntityId: 'player',
    });

    state = reduceEngineState(
      state,
      {
        type: 'assign-capacity',
        converterEntityId: 'player',
        assignment: {
          id: 'stam-to-con',
          sourceEntityId: 'player',
          fromPool: 'Stamina',
          amount: 20,
          toStat: 'Constitution',
          efficiency: 0.05,
        },
      },
      { registry, host: undefined },
    );

    const player = state.entities.get('player')!;
    expect(selectPoolAvailable(player, 'Stamina')).toBe(0);
    expect(
      selectStatValue(
        player,
        'Constitution',
        registry,
        state.entities,
        undefined,
        state,
      ),
    ).toBe(2);
  });

  it('clawback available claws Available then drops Max', () => {
    const registry = registryWith({
      id: 'mage',
      capacityClawback: 'available',
      initialTags: [
        createTag({
          name: 'Base',
          effects: [
            {
              type: 'stat',
              name: 'int',
              strength: 10,
              stat: 'Intelligence',
            },
          ],
        }),
      ],
      initialPools: {},
    });
    let state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('mage')!, 'player'),
      ],
      primaryEntityId: 'player',
    });

    state = reduceEngineState(
      state,
      {
        type: 'assign-capacity',
        converterEntityId: 'player',
        assignment: {
          id: 'a',
          sourceEntityId: 'player',
          fromStat: 'Intelligence',
          amount: 4,
          toPool: 'Mana',
          efficiency: 2,
        },
      },
      { registry, host: undefined },
    );
    state = reduceEngineState(
      state,
      { type: 'tick', steps: 1 },
      { registry, host: undefined },
    );
    expect(selectPoolAvailable(state.entities.get('player')!, 'Mana')).toBe(8);

    state = reduceEngineState(
      state,
      {
        type: 'assign-capacity',
        converterEntityId: 'player',
        assignment: {
          id: 'a',
          sourceEntityId: 'player',
          fromStat: 'Intelligence',
          amount: 2,
          toPool: 'Mana',
          efficiency: 2,
        },
      },
      { registry, host: undefined },
    );

    const player = state.entities.get('player')!;
    expect(
      selectPoolMax(
        player,
        'Mana',
        registry,
        state.entities,
        undefined,
        state,
      ),
    ).toBe(4);
    expect(selectPoolAvailable(player, 'Mana')).toBe(4);
  });

  it('clawback strict refuses when Available < ΔMax', () => {
    const registry = registryWith({
      id: 'mage',
      capacityClawback: 'strict',
      initialTags: [
        createTag({
          name: 'Base',
          effects: [
            {
              type: 'stat',
              name: 'int',
              strength: 10,
              stat: 'Intelligence',
            },
          ],
        }),
      ],
    });
    let state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('mage')!, 'player'),
      ],
      primaryEntityId: 'player',
    });

    state = reduceEngineState(
      state,
      {
        type: 'assign-capacity',
        converterEntityId: 'player',
        assignment: {
          id: 'a',
          sourceEntityId: 'player',
          fromStat: 'Intelligence',
          amount: 4,
          toPool: 'Mana',
          efficiency: 2,
        },
      },
      { registry, host: undefined },
    );
    state = reduceEngineState(
      state,
      { type: 'tick', steps: 1 },
      { registry, host: undefined },
    );
    // Spend some Available so Available < ΔMax on shrink
    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'player', pool: 'Mana', delta: -5 },
      { registry, host: undefined },
    );
    expect(selectPoolAvailable(state.entities.get('player')!, 'Mana')).toBe(3);

    const before = state;
    state = reduceEngineState(
      before,
      {
        type: 'assign-capacity',
        converterEntityId: 'player',
        assignment: {
          id: 'a',
          sourceEntityId: 'player',
          fromStat: 'Intelligence',
          amount: 1,
          toPool: 'Mana',
          efficiency: 2,
        },
      },
      { registry, host: undefined },
    );
    expect(state).toBe(before);
    expect(
      selectPoolMax(
        state.entities.get('player')!,
        'Mana',
        registry,
        state.entities,
        undefined,
        state,
      ),
    ).toBe(8);
  });

  it('clear-capacity-assignment releases commit and claws dest', () => {
    const registry = registryWith({
      id: 'mage',
      initialTags: [
        createTag({
          name: 'Base',
          effects: [
            {
              type: 'stat',
              name: 'int',
              strength: 10,
              stat: 'Intelligence',
            },
          ],
        }),
      ],
    });
    let state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('mage')!, 'player'),
      ],
      primaryEntityId: 'player',
    });

    state = reduceEngineState(
      state,
      {
        type: 'assign-capacity',
        converterEntityId: 'player',
        assignment: {
          id: 'a',
          sourceEntityId: 'player',
          fromStat: 'Intelligence',
          amount: 3,
          toPool: 'Mana',
          efficiency: 5,
        },
      },
      { registry, host: undefined },
    );
    state = reduceEngineState(
      state,
      { type: 'tick', steps: 1 },
      { registry, host: undefined },
    );

    state = reduceEngineState(
      state,
      {
        type: 'clear-capacity-assignment',
        converterEntityId: 'player',
        assignmentId: 'a',
      },
      { registry, host: undefined },
    );

    const player = state.entities.get('player')!;
    expect(
      selectStatValue(
        player,
        'Intelligence',
        registry,
        state.entities,
        undefined,
        state,
      ),
    ).toBe(10);
    expect(
      selectPoolMax(
        player,
        'Mana',
        registry,
        state.entities,
        undefined,
        state,
      ),
    ).toBe(0);
    expect(selectPoolAvailable(player, 'Mana')).toBe(0);
  });
});
