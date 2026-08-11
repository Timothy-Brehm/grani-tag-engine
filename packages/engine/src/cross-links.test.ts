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
  it('exports 0.3.0.8', () => {
    expect(ENGINE_VERSION).toBe('0.3.0.8');
  });

  it('live cross-link fromStat toPoolMax raises Mana max', () => {
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
            },
          ],
        }),
        createTag({
          name: 'Link_Int_Mana',
          effects: [
            {
              type: 'cross-link',
              name: 'int-mana',
              strength: 2,
              fromStat: 'Intelligence',
              toPoolMax: 'Mana',
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

  it('cross-link fromStat toGeneratePool pulses Stamina', () => {
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
            },
          ],
        }),
        createTag({
          name: 'Link_End_Stamina',
          effects: [
            {
              type: 'cross-link',
              name: 'end-stam',
              strength: 1,
              fromStat: 'Endurance',
              toGeneratePool: 'Stamina',
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

  it('product tag accumulates Mana max via cross-link', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Stat_Int',
          effects: [
            {
              type: 'stat',
              name: 'int',
              strength: 2,
              stat: 'Intelligence',
            },
          ],
        }),
        createTag({
          name: 'Link_Int_Mana_Grow',
          effects: [
            {
              type: 'cross-link',
              name: 'grow',
              strength: 0.5,
              fromStat: 'Intelligence',
              productTag: 'ManaPoolAddedByInt',
              toPoolMax: 'Mana',
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
    expect(selectPoolMax(player, 'Mana')).toBe(12);
    state = reduceEngineState(
      state,
      { type: 'remove-tag', entityId: 'player', name: 'Link_Int_Mana_Grow' },
      { registry },
    );
    expect(selectPoolMax(state.entities.get('player')!, 'Mana')).toBe(12);
  });

  it('cross-link fromPool toStat uses effective Available', () => {
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
              type: 'cross-link',
              name: 'vigor',
              strength: 1,
              fromPool: 'Life',
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

  it('cross-links sum once without mid-eval feedback', () => {
    // Int → Mana max and Mana → Int both read base values only.
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Stat_Int',
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
          name: 'Pool_Mana',
          effects: [
            { type: 'pool-max', name: 'max', strength: 5, pool: 'Mana' },
          ],
        }),
        createTag({
          name: 'Link_Int_Mana',
          effects: [
            {
              type: 'cross-link',
              name: 'a',
              strength: 1,
              fromStat: 'Intelligence',
              toPoolMax: 'Mana',
            },
          ],
        }),
        createTag({
          name: 'Link_Mana_Int',
          effects: [
            {
              type: 'cross-link',
              name: 'b',
              strength: 1,
              fromPool: 'Mana',
              toStat: 'Intelligence',
            },
          ],
        }),
      ],
      initialPools: { Mana: 3 },
    });
    registry.registerPoolDefinition({ id: 'Mana', capacityStep: 1 });
    const state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    const player = state.entities.get('player')!;
    // base Int 10 + fromPool Mana effective 3 = 13 (not feeding Int back into Mana)
    expect(selectBaseStatValue(player, 'Intelligence')).toBe(10);
    expect(selectStatValue(player, 'Intelligence', registry)).toBe(13);
    // base Mana max 5 + fromStat Int 10 = 15
    expect(selectPoolMax(player, 'Mana', registry)).toBe(15);
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
              type: 'cross-link',
              name: 'a',
              strength: 0.0001,
              fromStat: 'Intelligence',
              toPoolMax: 'Mana',
            },
          ],
        }),
        createTag({
          name: 'Loop_B',
          effects: [
            {
              type: 'cross-link',
              name: 'b',
              strength: 1,
              fromPool: 'Mana',
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

  it('product-tag cross-link pattern has no cycle warn', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Link_Grow',
          effects: [
            {
              type: 'cross-link',
              name: 'grow',
              strength: 0.1,
              fromStat: 'Intelligence',
              productTag: 'ManaPoolAddedByInt',
              toPoolMax: 'Mana',
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

  it('round/floor helpers and default steps', () => {
    expect(roundPoolQuantity(0.1 + 0.2)).toBe(0.3);
    expect(floorPoolQuantity(4.7, 1)).toBe(4);
    expect(floorPoolQuantity(0.25, 0.1)).toBe(0.2);
  });

  it('defaults capacityStep to 0.01 and displayStep to 1', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Pool_Dust',
          effects: [
            { type: 'pool-max', name: 'max', strength: 10, pool: 'Dust' },
          ],
        }),
      ],
      initialPools: { Dust: 1.234 },
    });
    registry.registerPoolDefinition({ id: 'Dust' });
    const state = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    const player = state.entities.get('player')!;
    expect(selectPoolCurrent(player, 'Dust', registry)).toBe(1.23);
    expect(selectPoolDisplayCurrent(player, 'Dust', registry)).toBe(1);
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
