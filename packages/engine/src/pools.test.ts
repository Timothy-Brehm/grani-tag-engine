import { describe, expect, it } from 'vitest';
import { EngineRegistry } from './registry';
import { createEngineState } from './state';
import { reduceEngineState } from './reduce';
import { createTag } from './tag';
import { instantiateEntity } from './entity';
import {
  selectPoolAvailable,
  selectPoolContents,
  selectPoolMax,
  selectPoolReserved,
  selectStatValue,
} from './selectors';
import { ENGINE_VERSION } from './version';

function registryWith(...defs: Parameters<EngineRegistry['registerEntityDefinition']>[0][]) {
  const registry = new EngineRegistry().createBuiltinAdaptors();
  for (const def of defs) {
    registry.registerEntityDefinition(def);
  }
  return registry;
}

describe('pool reservation', () => {
  it('exports 0.3.0.5', () => {
    expect(ENGINE_VERSION).toBe('0.3.0.5');
  });

  it('refuses spend when Available is insufficient', () => {
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Pool_Initial_Mana',
          effects: [
            {
              type: 'pool-max',
              name: 'max',
              strength: 10,
              pool: 'Mana',
            },
          ],
        }),
      ],
      initialPools: { Mana: 3 },
    });
    let state = createEngineState({
      entities: [instantiateEntity(registry.getEntityDefinition('hero')!, 'player')],
      primaryEntityId: 'player',
    });
    const blocked = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'player', pool: 'Mana', delta: -5 },
      { registry },
    );
    expect(blocked).toBe(state);
    expect(selectPoolAvailable(state.entities.get('player')!, 'Mana')).toBe(3);
  });

  it('Space + Sawmill: reserve on spawn, release on remove; mill continuous', () => {
    const sawmillTag = createTag({
      name: 'Building_Sawmill',
      effects: [
        {
          type: 'reserve-pool',
          name: 'footprint',
          strength: 2,
          pool: 'Space',
          scope: 'primary',
        },
      ],
    });
    const registry = registryWith(
      {
        id: 'camp',
        initialTags: [
          createTag({
            name: 'Camp_Space_Base',
            effects: [
              {
                type: 'pool-max',
                name: 'space',
                strength: 8,
                pool: 'Space',
              },
            ],
          }),
          createTag({
            name: 'Pool_Initial_Logs',
            effects: [
              {
                type: 'pool-max',
                name: 'logs',
                strength: 100,
                pool: 'Logs',
              },
              {
                type: 'pool-max',
                name: 'boards',
                strength: 100,
                pool: 'Boards',
              },
            ],
          }),
        ],
        initialPools: { Space: 8, Logs: 40, Boards: 0 },
      },
      {
        id: 'Sawmill',
        initialTags: [sawmillTag],
        maxActive: 4,
      },
    );

    let state = createEngineState({
      entities: [instantiateEntity(registry.getEntityDefinition('camp')!, 'player')],
      primaryEntityId: 'player',
    });

    state = reduceEngineState(
      state,
      { type: 'spawn-entity', definitionId: 'Sawmill', entityId: 'mill-1' },
      { registry },
    );
    const player = state.entities.get('player')!;
    expect(selectPoolReserved(state, 'player', 'Space', registry)).toBe(2);
    expect(selectPoolAvailable(player, 'Space')).toBe(6);
    expect(selectPoolContents(state, 'player', 'Space', registry)).toBe(8);
    expect(selectPoolMax(player, 'Space', registry, state.entities)).toBe(8);
    expect(state.entities.has('mill-1')).toBe(true);

    // Short mill cycle: 2 ticks, 2 logs → 1 board
    const quickMill = {
      name: 'Sawmill_Mill_Quick',
      durationTicks: 2,
      requirements: [],
      immediateEffects: [],
      requiredOverTimeEffects: [
        {
          type: 'adjust-pool',
          name: 'logs',
          strength: -2,
          pool: 'Logs',
          scope: 'actor' as const,
        },
      ],
      requiredEffects: [
        {
          type: 'adjust-pool',
          name: 'boards',
          strength: 1,
          pool: 'Boards',
          scope: 'actor' as const,
        },
      ],
      optionalEffects: [],
    };
    state = reduceEngineState(
      state,
      {
        type: 'execute-action',
        action: quickMill,
        actorEntityId: 'player',
        sourceEntityId: 'mill-1',
      },
      { registry },
    );
    expect(state.continuousActions.size).toBeGreaterThan(0);
    state = reduceEngineState(state, { type: 'tick', steps: 2 }, { registry });
    expect(selectPoolAvailable(state.entities.get('player')!, 'Logs')).toBe(38);
    expect(selectPoolAvailable(state.entities.get('player')!, 'Boards')).toBe(1);

    state = reduceEngineState(
      state,
      { type: 'remove-entity', entityId: 'mill-1' },
      { registry },
    );
    expect(selectPoolReserved(state, 'player', 'Space', registry)).toBe(0);
    expect(selectPoolAvailable(state.entities.get('player')!, 'Space')).toBe(8);
  });

  it('Strength spell reserves Mana and boosts Strength', () => {
    const spell = createTag({
      name: 'Spell_BullStrength',
      effects: [
        { type: 'stat', name: 'str', strength: 2, stat: 'Strength' },
        {
          type: 'reserve-pool',
          name: 'lock',
          strength: 5,
          pool: 'Mana',
        },
      ],
    });
    const registry = registryWith({
      id: 'mage',
      initialTags: [
        createTag({
          name: 'Pool_Initial_Mana',
          effects: [
            {
              type: 'pool-max',
              name: 'max',
              strength: 10,
              pool: 'Mana',
            },
          ],
        }),
        createTag({
          name: 'Stat_Initial_Strength',
          effects: [
            { type: 'stat', name: 'base', strength: 1, stat: 'Strength' },
          ],
        }),
      ],
      initialPools: { Mana: 10 },
    });
    let state = createEngineState({
      entities: [instantiateEntity(registry.getEntityDefinition('mage')!, 'player')],
      primaryEntityId: 'player',
    });

    state = reduceEngineState(
      state,
      { type: 'add-tag', entityId: 'player', tag: spell },
      { registry },
    );
    let player = state.entities.get('player')!;
    expect(selectStatValue(player, 'Strength', registry, state.entities)).toBe(3);
    expect(selectPoolReserved(state, 'player', 'Mana', registry)).toBe(5);
    expect(selectPoolAvailable(player, 'Mana')).toBe(5);

    const blocked = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'player', pool: 'Mana', delta: -6 },
      { registry },
    );
    expect(blocked).toBe(state);

    state = reduceEngineState(
      state,
      { type: 'adjust-pool', entityId: 'player', pool: 'Mana', delta: -5 },
      { registry },
    );
    expect(selectPoolAvailable(state.entities.get('player')!, 'Mana')).toBe(0);

    state = reduceEngineState(
      state,
      { type: 'remove-tag', entityId: 'player', name: 'Spell_BullStrength' },
      { registry },
    );
    player = state.entities.get('player')!;
    expect(selectStatValue(player, 'Strength', registry, state.entities)).toBe(1);
    expect(selectPoolReserved(state, 'player', 'Mana', registry)).toBe(0);
    expect(selectPoolAvailable(player, 'Mana')).toBe(5);
  });

  it('hand-slotted computer reserves Power on primary', () => {
    const computer = createTag({
      name: 'Item_WristComputer',
      slot: 'hand_left',
      effects: [
        {
          type: 'reserve-pool',
          name: 'draw',
          strength: 1,
          pool: 'Power',
          scope: 'primary',
        },
        { type: 'stat', name: 'sci', strength: 1, stat: 'Science' },
      ],
    });
    const registry = registryWith({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Pool_Initial_Power',
          effects: [
            {
              type: 'pool-max',
              name: 'pwr',
              strength: 2,
              pool: 'Power',
            },
          ],
        }),
      ],
      initialPools: { Power: 2 },
    });
    registry.registerSlotDefinition({
      id: 'hand_left',
      mode: 'selectable',
      label: 'Left hand',
    });
    registry.registerSlotDefinition({
      id: 'hand_right',
      mode: 'selectable',
      label: 'Right hand',
    });

    let state = createEngineState({
      entities: [instantiateEntity(registry.getEntityDefinition('hero')!, 'player')],
      primaryEntityId: 'player',
    });

    state = reduceEngineState(
      state,
      { type: 'add-tag', entityId: 'player', tag: computer },
      { registry },
    );
    expect(selectPoolReserved(state, 'player', 'Power', registry)).toBe(1);
    expect(selectPoolAvailable(state.entities.get('player')!, 'Power')).toBe(1);
    expect(
      selectStatValue(
        state.entities.get('player')!,
        'Science',
        registry,
        state.entities,
      ),
    ).toBe(1);

    state = reduceEngineState(
      state,
      { type: 'remove-tag', entityId: 'player', name: 'Item_WristComputer' },
      { registry },
    );
    expect(selectPoolReserved(state, 'player', 'Power', registry)).toBe(0);
    expect(selectPoolAvailable(state.entities.get('player')!, 'Power')).toBe(2);
  });

  it('refuses spawn that would over-reserve Space', () => {
    const heavy = createTag({
      name: 'Building_Heavy',
      effects: [
        {
          type: 'reserve-pool',
          name: 'foot',
          strength: 5,
          pool: 'Space',
          scope: 'primary',
        },
      ],
    });
    const registry = registryWith(
      {
        id: 'camp',
        initialTags: [
          createTag({
            name: 'Camp_Space_Tiny',
            effects: [
              {
                type: 'pool-max',
                name: 'space',
                strength: 4,
                pool: 'Space',
              },
            ],
          }),
        ],
        initialPools: { Space: 4 },
      },
      { id: 'Heavy', initialTags: [heavy] },
    );
    const state = createEngineState({
      entities: [instantiateEntity(registry.getEntityDefinition('camp')!, 'player')],
      primaryEntityId: 'player',
    });
    const next = reduceEngineState(
      state,
      { type: 'spawn-entity', definitionId: 'Heavy', entityId: 'h1' },
      { registry },
    );
    expect(next).toBe(state);
    expect(next.entities.has('h1')).toBe(false);
  });
});
