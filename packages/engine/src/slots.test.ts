import { describe, expect, it } from 'vitest';
import { createTag } from './tag';
import { createEntityInstance, entityInstanceFromJSON, entityInstanceToJSON } from './entity';
import {
  createPrimaryEngineState,
  toEngineContext,
} from './state';
import { reduceEngineState } from './reduce';
import { EngineRegistry } from './registry';
import { requirementsMet } from './evaluate';
import { collectCatalogWarnings } from './catalog';
import {
  entityHasActiveTag,
  entityHasHeldSlot,
  reconcileSlotSelections,
  selectActiveTags,
  selectSlotSelection,
  selectSlotWinner,
  tagBestOnlyScore,
} from './slots';
import { selectStatValue } from './selectors';
import { TagCollection } from './tag-collection';

describe('catalog definitions and soft validation', () => {
  it('registers and lists slot/pool/stat definitions', () => {
    const registry = new EngineRegistry()
      .registerSlotDefinition({ id: 'vehicle', label: 'Vehicle' })
      .registerPoolDefinition({ id: 'Stamina', label: 'Stamina' })
      .registerStatDefinition({ id: 'Strength', label: 'Strength' });

    expect(registry.getSlotDefinition('vehicle')?.label).toBe('Vehicle');
    expect(registry.listPoolDefinitions()).toHaveLength(1);
    expect(registry.listStatDefinitions()[0]?.id).toBe('Strength');
  });

  it('collectCatalogWarnings walks entity definitions and in-play state', () => {
    const registry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerEntityDefinition({
        id: 'hero',
        initialTags: [
          createTag({
            name: 'BootGear',
            slot: 'feet',
            effects: [
              {
                type: 'stat',
                name: 'Agility',
                strength: 1,
                stat: 'Agility',
              },
            ],
          }),
        ],
        initialPools: { Stamina: 1 },
      });
    const state = createPrimaryEngineState(
      createEntityInstance({ id: 'hero', definitionId: 'hero', tags: [] }),
    );
    const warnings = collectCatalogWarnings(registry, state);
    expect(warnings.some((w) => w.source.startsWith('definition:hero'))).toBe(
      true,
    );
    expect(warnings.some((w) => w.kind === 'slot' && w.id === 'feet')).toBe(
      true,
    );
    expect(warnings.some((w) => w.kind === 'pool' && w.id === 'Stamina')).toBe(
      true,
    );
  });

  it('collectCatalogWarnings reports missing catalog ids without throwing', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    const entity = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [
        createTag({
          name: 'Vehicle_Plane',
          slot: 'vehicle',
          effects: [
            {
              type: 'stat',
              name: 'Strength',
              strength: 2,
              stat: 'Strength',
            },
            {
              type: 'pool-max',
              name: 'Fuel',
              strength: 10,
              pool: 'Fuel',
            },
          ],
        }),
      ],
      pools: { Fuel: 3 },
    });
    const state = createPrimaryEngineState(entity);
    const warnings = collectCatalogWarnings(registry, state);
    expect(warnings.some((w) => w.kind === 'slot' && w.id === 'vehicle')).toBe(
      true,
    );
    expect(warnings.some((w) => w.kind === 'stat' && w.id === 'Strength')).toBe(
      true,
    );
    expect(warnings.some((w) => w.kind === 'pool' && w.id === 'Fuel')).toBe(
      true,
    );
  });

  it('missing slot definition treats tags as unslotted (both active)', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    const entity = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [
        createTag({
          name: 'A',
          slot: 'mystery',
          effects: [{ type: 'stat', name: 'S', strength: 1, stat: 'S' }],
        }),
        createTag({
          name: 'B',
          slot: 'mystery',
          effects: [{ type: 'stat', name: 'S', strength: 2, stat: 'S' }],
        }),
      ],
    });
    expect(selectStatValue(entity, 'S', registry)).toBe(3);
  });
});

describe('slotted tags', () => {
  const plane = createTag({
    name: 'Vehicle_Plane',
    slot: 'vehicle',
    dependentTags: [createTag({ name: 'CanFly', effects: [] })],
    effects: [{ type: 'stat', name: 'Speed', strength: 5, stat: 'Speed' }],
  });
  const boat = createTag({
    name: 'Vehicle_Boat',
    slot: 'vehicle',
    effects: [{ type: 'stat', name: 'Speed', strength: 2, stat: 'Speed' }],
  });
  const bike = createTag({
    name: 'Vehicle_Bike',
    slot: 'vehicle',
    effects: [{ type: 'stat', name: 'Speed', strength: 3, stat: 'Speed' }],
  });

  it('selectable slot: only selected tag passives and dependents apply', () => {
    const registry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'vehicle' });

    let entity = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [boat, plane],
      slotSelections: { vehicle: 'Vehicle_Boat' },
    });
    entity = reconcileSlotSelections(entity, registry);

    expect(selectSlotSelection(entity, 'vehicle')).toBe('Vehicle_Boat');
    expect(selectStatValue(entity, 'Speed', registry)).toBe(2);
    expect(entityHasActiveTag(entity, 'CanFly', registry)).toBe(false);
    expect(entityHasHeldSlot(entity, 'vehicle')).toBe(true);
    expect(entity.tags.has('CanFly')).toBe(false);

    entity = {
      ...entity,
      slotSelections: Object.freeze({ vehicle: 'Vehicle_Plane' }),
    };
    expect(selectStatValue(entity, 'Speed', registry)).toBe(5);
    expect(entityHasActiveTag(entity, 'CanFly', registry)).toBe(true);
    expect(
      selectActiveTags(entity, registry).some((t) => t.name === 'CanFly'),
    ).toBe(true);
  });

  it('best-only picks highest abs(strength) sum; ties by name', () => {
    const registry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'vehicle', mode: 'best-only' });

    expect(tagBestOnlyScore(plane)).toBe(5);
    expect(tagBestOnlyScore(bike)).toBe(3);

    const entity = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [boat, bike, plane],
    });
    expect(selectSlotWinner(entity, 'vehicle')?.name).toBe('Vehicle_Plane');
    expect(selectStatValue(entity, 'Speed', registry)).toBe(5);
    expect(entityHasActiveTag(entity, 'CanFly', registry)).toBe(true);

    const tieA = createTag({
      name: 'Alpha',
      slot: 'ring',
      effects: [{ type: 'stat', name: 'X', strength: 4, stat: 'X' }],
    });
    const tieB = createTag({
      name: 'Beta',
      slot: 'ring',
      effects: [{ type: 'stat', name: 'X', strength: 4, stat: 'X' }],
    });
    const tied = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [tieB, tieA],
    });
    const bestRegistry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'ring', mode: 'best-only' });
    expect(selectSlotWinner(tied, 'ring')?.name).toBe('Alpha');
    expect(selectStatValue(tied, 'X', bestRegistry)).toBe(4);
  });

  it('tag requirement uses active view; has-slot uses held', () => {
    const registry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'vehicle' });

    const entity = reconcileSlotSelections(
      createEntityInstance({
        id: 'hero',
        definitionId: 'hero',
        tags: [boat, plane],
        slotSelections: { vehicle: 'Vehicle_Boat' },
      }),
      registry,
    );
    const state = createPrimaryEngineState(entity);
    const ctx = toEngineContext(state, {}, { actorEntityId: 'hero' });

    expect(
      requirementsMet(
        registry,
        [{ type: 'tag', tagName: 'CanFly', exists: true }],
        ctx,
      ),
    ).toBe(false);
    expect(
      requirementsMet(
        registry,
        [{ type: 'has-slot', slot: 'vehicle' }],
        ctx,
      ),
    ).toBe(true);

    const flying = {
      ...entity,
      slotSelections: Object.freeze({ vehicle: 'Vehicle_Plane' }),
    };
    const flyCtx = toEngineContext(
      createPrimaryEngineState(flying),
      {},
      { actorEntityId: 'hero' },
    );
    expect(
      requirementsMet(
        registry,
        [{ type: 'tag', tagName: 'CanFly', exists: true }],
        flyCtx,
      ),
    ).toBe(true);
  });

  it('auto-selects newly granted selectable tag; repairs on remove', () => {
    const registry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'vehicle' });
    const options = { registry, host: {} };

    let state = createPrimaryEngineState(
      createEntityInstance({ id: 'hero', definitionId: 'hero', tags: [] }),
    );

    state = reduceEngineState(
      state,
      { type: 'add-tag', entityId: 'hero', tag: boat },
      options,
    );
    expect(selectSlotSelection(state.entities.get('hero')!, 'vehicle')).toBe(
      'Vehicle_Boat',
    );

    state = reduceEngineState(state, { type: 'tick', steps: 1 }, options);
    state = reduceEngineState(
      state,
      { type: 'add-tag', entityId: 'hero', tag: plane },
      options,
    );
    // Already had a selection — keep boat
    expect(selectSlotSelection(state.entities.get('hero')!, 'vehicle')).toBe(
      'Vehicle_Boat',
    );

    state = reduceEngineState(
      state,
      {
        type: 'select-slot-item',
        entityId: 'hero',
        slot: 'vehicle',
        tagName: 'Vehicle_Plane',
      },
      options,
    );
    expect(selectSlotSelection(state.entities.get('hero')!, 'vehicle')).toBe(
      'Vehicle_Plane',
    );

    state = reduceEngineState(
      state,
      { type: 'remove-tag', entityId: 'hero', name: 'Vehicle_Plane' },
      options,
    );
    expect(selectSlotSelection(state.entities.get('hero')!, 'vehicle')).toBe(
      'Vehicle_Boat',
    );
  });

  it('select-slot-item no-ops for best-only or wrong tag', () => {
    const registry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'vehicle', mode: 'best-only' });
    const options = { registry, host: {} };
    let state = createPrimaryEngineState(
      createEntityInstance({
        id: 'hero',
        definitionId: 'hero',
        tags: [boat, plane],
      }),
    );
    const before = state.entities.get('hero')!;
    state = reduceEngineState(
      state,
      {
        type: 'select-slot-item',
        entityId: 'hero',
        slot: 'vehicle',
        tagName: 'Vehicle_Boat',
      },
      options,
    );
    expect(state.entities.get('hero')).toEqual(before);
  });

  it('JSON round-trips slotSelections and dependentTags', () => {
    const entity = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [plane],
      slotSelections: { vehicle: 'Vehicle_Plane' },
    });
    const json = entityInstanceToJSON(entity);
    expect(json.slotSelections).toEqual({ vehicle: 'Vehicle_Plane' });
    expect(json.tags.tags[0]?.dependentTags?.[0]?.name).toBe('CanFly');

    const restored = entityInstanceFromJSON(json);
    expect(restored.slotSelections).toEqual({ vehicle: 'Vehicle_Plane' });
    expect(restored.tags.get('Vehicle_Plane')?.dependentTags?.[0]?.name).toBe(
      'CanFly',
    );

    const collectionJson = TagCollection.create([plane]).toJSON();
    expect(collectionJson.tags[0]?.slot).toBe('vehicle');
    expect(
      TagCollection.fromJSON(collectionJson).get('Vehicle_Plane')
        ?.dependentTags?.[0]?.name,
    ).toBe('CanFly');
  });
});
