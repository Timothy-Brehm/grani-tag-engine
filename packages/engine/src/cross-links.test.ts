import { describe, expect, it } from 'vitest';
import { EngineRegistry } from './registry';
import { createEngineState } from './state';
import { reduceEngineState } from './reduce';
import { createTag } from './tag';
import { instantiateEntity } from './entity';
import { collectCatalogWarnings } from './catalog';
import {
  selectBaseStatValue,
  selectPoolAvailable,
  selectPoolCurrent,
  selectPoolDisplayCurrent,
  selectPoolMax,
  selectPoolMaxRaw,
  selectStatValue,
} from './selectors';
import { ENGINE_VERSION } from './version';
import { floorPoolQuantity, roundPoolQuantity } from './quantity';

function registryWith(
  ...defs: Parameters<EngineRegistry['registerEntityDefinition']>[0][]
) {
  const registry = new EngineRegistry().createBuiltinAdaptors();
  for (const def of defs) {
    registry.registerEntityDefinition(def);
  }
  return registry;
}

describe('stats/pools cross-links', () => {
  it('exports 0.2.2.0', () => {
    expect(ENGINE_VERSION).toBe('0.2.2.0');
  });

  it('live Int toPoolMax raises Mana max', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Stat_Int',
          effects: [
            {
              type: 'stat',
              name: 'int',
              strength: 5,
              stat: 'Intelligence',
              toPoolMax: 'Mana',
              amount: 2,
            },
          ],
        }),
        createTag({
          name: 'Pool_Mana_Base',
          effects: [
            { type: 'pool-max', name: 'base', strength: 10, pool: 'Mana' },
          ],
        }),
      ],
      initialPools: { Mana: 0 },
    });
    const state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    const player = state.entities.get('player')!;
    expect(selectBaseStatValue(player, 'Intelligence')).toBe(5);
    expect(selectStatValue(player, 'Intelligence')).toBe(5);
    expect(selectPoolMax(player, 'Mana')).toBe(20); // 10 + 5*2
  });

  it('Endurance toGeneratePool pulses Stamina', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Stat_End',
          effects: [
            {
              type: 'stat',
              name: 'end',
              strength: 3,
              stat: 'Endurance',
              toGeneratePool: 'Stamina',
              amount: 1,
              everyTicks: 1,
            },
          ],
        }),
        createTag({
          name: 'Pool_Stamina',
          effects: [
            { type: 'pool-max', name: 'max', strength: 100, pool: 'Stamina' },
          ],
        }),
      ],
      initialPools: { Stamina: 0 },
    });
    let state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    state = reduceEngineState(state, { type: 'tick', steps: 1 }, { registry });
    expect(selectPoolAvailable(state.entities.get('player')!, 'Stamina')).toBe(
      3,
    );
  });

  it('product tag accumulates Mana max from Int', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Stat_Int_Cap',
          effects: [
            {
              type: 'stat',
              name: 'int',
              strength: 2,
              stat: 'Intelligence',
              productTag: 'ManaPoolAddedByInt',
              toPoolMax: 'Mana',
              amount: 0.5,
              everyTicks: 1,
            },
          ],
        }),
        createTag({
          name: 'Pool_Mana_Base',
          effects: [
            { type: 'pool-max', name: 'base', strength: 10, pool: 'Mana' },
          ],
        }),
      ],
      initialPools: { Mana: 0 },
    });
    let state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    expect(selectPoolMax(state.entities.get('player')!, 'Mana')).toBe(10);
    state = reduceEngineState(state, { type: 'tick', steps: 2 }, { registry });
    const player = state.entities.get('player')!;
    expect(player.tags.has('ManaPoolAddedByInt')).toBe(true);
    // 2 ticks * (0.5 * 2 Int) = +2
    expect(selectPoolMax(player, 'Mana')).toBe(12);
    // remove source — product remains
    state = reduceEngineState(
      state,
      { type: 'remove-tag', entityId: 'player', name: 'Stat_Int_Cap' },
      { registry },
    );
    expect(selectPoolMax(state.entities.get('player')!, 'Mana')).toBe(12);
  });

  it('pool-link Life toStat Vigor uses effective Available', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Pool_Life',
          effects: [
            { type: 'pool-max', name: 'max', strength: 10, pool: 'Life' },
          ],
        }),
        createTag({
          name: 'Link_Life_Vigor',
          effects: [
            {
              type: 'pool-link',
              name: 'vigor',
              strength: 1,
              pool: 'Life',
              toStat: 'Vigor',
            },
          ],
        }),
      ],
      initialPools: { Life: 4.7 },
    });
    registry.registerPoolDefinition({ id: 'Life', capacityStep: 1 });
    const state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    const player = state.entities.get('player')!;
    expect(selectPoolAvailable(player, 'Life')).toBe(4.7);
    expect(selectPoolCurrent(player, 'Life', registry)).toBe(4);
    expect(selectStatValue(player, 'Vigor', registry)).toBe(4);
  });

  it('createPool false skips unlock; true introduces key', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Gen_Locked',
          effects: [
            {
              type: 'generate-pool',
              name: 'g',
              strength: 1,
              pool: 'Mystery',
              everyTicks: 1,
            },
          ],
        }),
        createTag({
          name: 'Pool_Mystery_Max',
          effects: [
            { type: 'pool-max', name: 'max', strength: 10, pool: 'Mystery' },
          ],
        }),
      ],
    });
    let state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    state = reduceEngineState(state, { type: 'tick', steps: 3 }, { registry });
    expect('Mystery' in state.entities.get('player')!.pools).toBe(false);

    const registry2 = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Gen_Unlock',
          effects: [
            {
              type: 'generate-pool',
              name: 'g',
              strength: 1,
              pool: 'Mystery',
              everyTicks: 1,
              createPool: true,
            },
          ],
        }),
        createTag({
          name: 'Pool_Mystery_Max',
          effects: [
            { type: 'pool-max', name: 'max', strength: 10, pool: 'Mystery' },
          ],
        }),
      ],
    });
    let state2 = createEngineState({
      entities: [
        instantiateEntity(registry2.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    state2 = reduceEngineState(
      state2,
      { type: 'tick', steps: 1 },
      { registry: registry2 },
    );
    expect(selectPoolAvailable(state2.entities.get('player')!, 'Mystery')).toBe(
      1,
    );
  });

  it('capacityStep floors gates until raw crosses a step', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Gen_Mana',
          effects: [
            {
              type: 'generate-pool',
              name: 'g',
              strength: 0.0001,
              pool: 'Mana',
              everyTicks: 1,
            },
          ],
        }),
        createTag({
          name: 'Pool_Mana',
          effects: [
            { type: 'pool-max', name: 'max', strength: 10, pool: 'Mana' },
          ],
        }),
      ],
      initialPools: { Mana: 0 },
    });
    registry.registerPoolDefinition({
      id: 'Mana',
      capacityStep: 1,
      displayStep: 1,
    });
    let state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    state = reduceEngineState(state, { type: 'tick', steps: 5000 }, { registry });
    const player = state.entities.get('player')!;
    expect(selectPoolAvailable(player, 'Mana')).toBeCloseTo(0.5, 5);
    expect(selectPoolCurrent(player, 'Mana', registry)).toBe(0);
    expect(selectPoolDisplayCurrent(player, 'Mana', registry)).toBe(0);

    state = reduceEngineState(
      state,
      { type: 'tick', steps: 5000 },
      { registry },
    );
    const after = state.entities.get('player')!;
    expect(selectPoolAvailable(after, 'Mana')).toBeCloseTo(1, 5);
    expect(selectPoolCurrent(after, 'Mana', registry)).toBe(1);
  });

  it('warns on sub-capacityStep adds and cycles', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Loop_A',
          effects: [
            {
              type: 'stat',
              name: 'int',
              strength: 1,
              stat: 'Intelligence',
              toPoolMax: 'Mana',
              amount: 0.0001,
            },
          ],
        }),
        createTag({
          name: 'Loop_B',
          effects: [
            {
              type: 'pool-link',
              name: 'back',
              strength: 1,
              pool: 'Mana',
              toStat: 'Intelligence',
            },
          ],
        }),
      ],
      initialPools: { Mana: 0 },
    });
    registry.registerPoolDefinition({ id: 'Mana', capacityStep: 1 });
    registry.registerStatDefinition({ id: 'Intelligence' });
    const state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    const warnings = collectCatalogWarnings(registry, state);
    expect(warnings.some((w) => w.kind === 'capacity-step')).toBe(true);
    expect(warnings.some((w) => w.kind === 'cycle')).toBe(true);
  });

  it('ManaCap-style product pattern has no cycle warn', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Stat_Int',
          effects: [
            {
              type: 'stat',
              name: 'int',
              strength: 1,
              stat: 'Intelligence',
              productTag: 'ManaPoolAddedByInt',
              toPoolMax: 'Mana',
              amount: 0.1,
              everyTicks: 1,
            },
          ],
        }),
      ],
    });
    registry.registerPoolDefinition({ id: 'Mana', capacityStep: 1 });
    registry.registerStatDefinition({ id: 'Intelligence' });
    const state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    const warnings = collectCatalogWarnings(registry, state);
    expect(warnings.some((w) => w.kind === 'cycle')).toBe(false);
    expect(warnings.some((w) => w.kind === 'capacity-step')).toBe(true);
  });

  it('round/floor helpers', () => {
    expect(roundPoolQuantity(0.1 + 0.2)).toBe(0.3);
    expect(floorPoolQuantity(4.7, 1)).toBe(4);
    expect(floorPoolQuantity(0.25, 0.1)).toBe(0.2);
  });

  it('selectPoolMaxRaw exposes unfloored max', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Pool_Fuel',
          effects: [
            { type: 'pool-max', name: 'max', strength: 1.5, pool: 'Fuel' },
          ],
        }),
      ],
      initialPools: { Fuel: 0 },
    });
    registry.registerPoolDefinition({ id: 'Fuel', capacityStep: 1 });
    const state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    const player = state.entities.get('player')!;
    expect(selectPoolMaxRaw(player, 'Fuel', registry)).toBe(1.5);
    expect(selectPoolMax(player, 'Fuel', registry)).toBe(1);
  });
});
