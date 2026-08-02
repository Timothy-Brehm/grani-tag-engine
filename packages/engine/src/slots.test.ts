import { describe, expect, it } from 'vitest';
import { createTag } from './tag';
import {
  createEntityInstance,
  entityInstanceFromJSON,
  entityInstanceToJSON,
} from './entity';
import {
  createPrimaryEngineState,
  toEngineContext,
  upsertEntity,
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
  withSlotSelection,
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

  it('missing slot definition acts as default selectable (not stacking)', () => {
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
    const state = createPrimaryEngineState(entity);
    const reconciled = reconcileSlotSelections(
      state.entities.get('hero')!,
      state,
      registry,
    );
    expect(selectSlotSelection(reconciled, 'mystery')).toEqual({
      holderEntityId: 'hero',
      tagName: 'A',
    });
    expect(
      selectStatValue(reconciled, 'S', registry, state.entities),
    ).toBe(1);
  });

  it('warns on duplicate non-zero tiers and zero/non-zero mix', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    const entity = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [
        createTag({
          name: 'T2a',
          slot: 'ring',
          tier: 2,
          effects: [],
        }),
        createTag({
          name: 'T2b',
          slot: 'ring',
          tier: 2,
          effects: [],
        }),
        createTag({
          name: 'T0',
          slot: 'amulet',
          tier: 0,
          effects: [],
        }),
        createTag({
          name: 'T3',
          slot: 'amulet',
          tier: 3,
          effects: [],
        }),
      ],
    });
    const warnings = collectCatalogWarnings(
      registry,
      createPrimaryEngineState(entity),
    );
    expect(
      warnings.some(
        (w) => w.kind === 'tier' && w.id === 'ring' && w.source.includes('tier-2'),
      ),
    ).toBe(true);
    expect(
      warnings.some(
        (w) =>
          w.kind === 'tier' &&
          w.id === 'amulet' &&
          w.source.includes('zero-mixed'),
      ),
    ).toBe(true);
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
    const state = createPrimaryEngineState(entity);
    entity = reconcileSlotSelections(
      state.entities.get('hero')!,
      state,
      registry,
    );

    expect(selectSlotSelection(entity, 'vehicle')).toEqual({
      holderEntityId: 'hero',
      tagName: 'Vehicle_Boat',
    });
    expect(selectStatValue(entity, 'Speed', registry, state.entities)).toBe(2);
    expect(entityHasActiveTag(entity, 'CanFly', registry, state.entities)).toBe(
      false,
    );
    expect(entityHasHeldSlot(entity, 'vehicle')).toBe(true);
    expect(entity.tags.has('CanFly')).toBe(false);

    entity = {
      ...entity,
      slotSelections: Object.freeze({
        vehicle: { holderEntityId: 'hero', tagName: 'Vehicle_Plane' },
      }),
    };
    expect(selectStatValue(entity, 'Speed', registry, state.entities)).toBe(5);
    expect(entityHasActiveTag(entity, 'CanFly', registry, state.entities)).toBe(
      true,
    );
    expect(
      selectActiveTags(entity, registry, state.entities).some(
        (t) => t.name === 'CanFly',
      ),
    ).toBe(true);
  });

  it('best-only: tier, then abs(strength) sum, then name', () => {
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

    const weakHighTier = createTag({
      name: 'Weak_High',
      slot: 'ring',
      tier: 1,
      effects: [{ type: 'stat', name: 'X', strength: 1, stat: 'X' }],
    });
    const strongLowTier = createTag({
      name: 'Strong_Low',
      slot: 'ring',
      tier: 5,
      effects: [{ type: 'stat', name: 'X', strength: 99, stat: 'X' }],
    });
    const forgotten = createTag({
      name: 'Forgotten',
      slot: 'ring',
      effects: [{ type: 'stat', name: 'X', strength: 1000, stat: 'X' }],
    });
    const tiered = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [forgotten, strongLowTier, weakHighTier],
    });
    const bestRegistry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'ring', mode: 'best-only' });
    expect(selectSlotWinner(tiered, 'ring')?.name).toBe('Weak_High');
    expect(selectStatValue(tiered, 'X', bestRegistry)).toBe(1);

    const tieA = createTag({
      name: 'Alpha',
      slot: 'ring',
      tier: 1,
      effects: [{ type: 'stat', name: 'X', strength: 4, stat: 'X' }],
    });
    const tieB = createTag({
      name: 'Beta',
      slot: 'ring',
      tier: 1,
      effects: [{ type: 'stat', name: 'X', strength: 4, stat: 'X' }],
    });
    const tied = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [tieB, tieA],
    });
    expect(selectSlotWinner(tied, 'ring')?.name).toBe('Alpha');
  });

  it('withSlotSelection no-ops when tag.slot does not match slot id', () => {
    const entity = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [boat],
      slotSelections: { vehicle: 'Vehicle_Boat' },
    });
    const state = createPrimaryEngineState(entity);
    const next = withSlotSelection(
      entity,
      'weapon',
      'Vehicle_Boat',
      'hero',
      state,
    );
    expect(next).toBe(entity);
  });

  it('tag requirement uses active view; has-slot uses held', () => {
    const registry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'vehicle' });

    const entity = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [boat, plane],
      slotSelections: { vehicle: 'Vehicle_Boat' },
    });
    let state = createPrimaryEngineState(entity);
    state = upsertEntity(
      state,
      reconcileSlotSelections(state.entities.get('hero')!, state, registry),
    );
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
      ...state.entities.get('hero')!,
      slotSelections: Object.freeze({
        vehicle: { holderEntityId: 'hero', tagName: 'Vehicle_Plane' },
      }),
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
    expect(selectSlotSelection(state.entities.get('hero')!, 'vehicle')).toEqual(
      { holderEntityId: 'hero', tagName: 'Vehicle_Boat' },
    );

    state = reduceEngineState(state, { type: 'tick', steps: 1 }, options);
    state = reduceEngineState(
      state,
      { type: 'add-tag', entityId: 'hero', tag: plane },
      options,
    );
    expect(selectSlotSelection(state.entities.get('hero')!, 'vehicle')).toEqual(
      { holderEntityId: 'hero', tagName: 'Vehicle_Boat' },
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
    expect(selectSlotSelection(state.entities.get('hero')!, 'vehicle')).toEqual(
      { holderEntityId: 'hero', tagName: 'Vehicle_Plane' },
    );

    state = reduceEngineState(
      state,
      { type: 'remove-tag', entityId: 'hero', name: 'Vehicle_Plane' },
      options,
    );
    expect(selectSlotSelection(state.entities.get('hero')!, 'vehicle')).toEqual(
      { holderEntityId: 'hero', tagName: 'Vehicle_Boat' },
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
    expect(restored.slotSelections).toEqual({
      vehicle: { holderEntityId: 'hero', tagName: 'Vehicle_Plane' },
    });
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

describe('cross-entity slot assignments', () => {
  const shotgun = createTag({
    name: 'Shotgun',
    slot: 'weapon',
    effects: [{ type: 'stat', name: 'Damage', strength: 4, stat: 'Damage' }],
  });

  it('hero can select armory-held gun and gain passives', () => {
    const registry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'weapon', cannotShareTag: true });
    const options = { registry, host: {} };

    const armory = createEntityInstance({
      id: 'armory',
      definitionId: 'armory',
      tags: [shotgun],
    });
    const hero = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [],
    });
    let state = createPrimaryEngineState(hero, { others: [armory] });

    state = reduceEngineState(
      state,
      {
        type: 'select-slot-item',
        entityId: 'hero',
        slot: 'weapon',
        tagName: 'Shotgun',
        holderEntityId: 'armory',
      },
      options,
    );

    const heroNext = state.entities.get('hero')!;
    expect(selectSlotSelection(heroNext, 'weapon')).toEqual({
      holderEntityId: 'armory',
      tagName: 'Shotgun',
    });
    expect(state.entities.get('armory')!.tags.has('Shotgun')).toBe(true);
    expect(
      selectStatValue(heroNext, 'Damage', registry, state.entities),
    ).toBe(4);
    expect(
      entityHasActiveTag(heroNext, 'Shotgun', registry, state.entities),
    ).toBe(true);
  });

  it('cannotShareTag blocks a second assignee of the same holding', () => {
    const registry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'weapon', cannotShareTag: true });
    const options = { registry, host: {} };

    const armory = createEntityInstance({
      id: 'armory',
      definitionId: 'armory',
      tags: [shotgun],
    });
    const heroA = createEntityInstance({
      id: 'heroA',
      definitionId: 'hero',
      tags: [],
    });
    const heroB = createEntityInstance({
      id: 'heroB',
      definitionId: 'hero',
      tags: [],
    });
    let state = createPrimaryEngineState(heroA, {
      others: [heroB, armory],
    });

    state = reduceEngineState(
      state,
      {
        type: 'select-slot-item',
        entityId: 'heroA',
        slot: 'weapon',
        tagName: 'Shotgun',
        holderEntityId: 'armory',
      },
      options,
    );
    const afterFirst = state;
    state = reduceEngineState(
      state,
      {
        type: 'select-slot-item',
        entityId: 'heroB',
        slot: 'weapon',
        tagName: 'Shotgun',
        holderEntityId: 'armory',
      },
      options,
    );
    expect(state.entities.get('heroB')).toEqual(
      afterFirst.entities.get('heroB'),
    );
    expect(selectSlotSelection(state.entities.get('heroA')!, 'weapon')).toEqual(
      { holderEntityId: 'armory', tagName: 'Shotgun' },
    );
  });

  it('shareable slots allow multiple assignees of the same holding', () => {
    const registry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'weapon' });
    const options = { registry, host: {} };

    const armory = createEntityInstance({
      id: 'armory',
      definitionId: 'armory',
      tags: [shotgun],
    });
    const heroA = createEntityInstance({
      id: 'heroA',
      definitionId: 'hero',
      tags: [],
    });
    const heroB = createEntityInstance({
      id: 'heroB',
      definitionId: 'hero',
      tags: [],
    });
    let state = createPrimaryEngineState(heroA, {
      others: [heroB, armory],
    });

    state = reduceEngineState(
      state,
      {
        type: 'select-slot-item',
        entityId: 'heroA',
        slot: 'weapon',
        tagName: 'Shotgun',
        holderEntityId: 'armory',
      },
      options,
    );
    state = reduceEngineState(
      state,
      {
        type: 'select-slot-item',
        entityId: 'heroB',
        slot: 'weapon',
        tagName: 'Shotgun',
        holderEntityId: 'armory',
      },
      options,
    );
    expect(selectSlotSelection(state.entities.get('heroB')!, 'weapon')).toEqual(
      { holderEntityId: 'armory', tagName: 'Shotgun' },
    );
  });

  it('removing holder entity clears foreign selections', () => {
    const registry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'weapon' });
    const options = { registry, host: {} };

    const armory = createEntityInstance({
      id: 'armory',
      definitionId: 'armory',
      tags: [shotgun],
    });
    const hero = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [],
      slotSelections: {
        weapon: { holderEntityId: 'armory', tagName: 'Shotgun' },
      },
    });
    let state = createPrimaryEngineState(hero, { others: [armory] });
    expect(
      selectStatValue(
        state.entities.get('hero')!,
        'Damage',
        registry,
        state.entities,
      ),
    ).toBe(4);

    state = reduceEngineState(
      state,
      { type: 'remove-entity', entityId: 'armory' },
      options,
    );
    expect(selectSlotSelection(state.entities.get('hero')!, 'weapon')).toBe(
      undefined,
    );
    expect(
      selectStatValue(
        state.entities.get('hero')!,
        'Damage',
        registry,
        state.entities,
      ),
    ).toBe(0);
  });

  it('JSON migrates legacy string selections and keeps foreign refs', () => {
    const entity = createEntityInstance({
      id: 'hero',
      definitionId: 'hero',
      tags: [],
      slotSelections: {
        weapon: { holderEntityId: 'armory', tagName: 'Shotgun' },
      },
    });
    const json = entityInstanceToJSON(entity);
    expect(json.slotSelections).toEqual({
      weapon: { holderEntityId: 'armory', tagName: 'Shotgun' },
    });
    const restored = entityInstanceFromJSON({
      id: 'hero',
      definitionId: 'hero',
      tags: { tags: [] },
      pools: {},
      slotSelections: { vehicle: 'Vehicle_Boat' },
    });
    expect(restored.slotSelections.vehicle).toEqual({
      holderEntityId: 'hero',
      tagName: 'Vehicle_Boat',
    });
  });

  it('collectCatalogWarnings reports cannotShareTag duplicates', () => {
    const registry = new EngineRegistry()
      .createBuiltinAdaptors()
      .registerSlotDefinition({ id: 'weapon', cannotShareTag: true });
    const armory = createEntityInstance({
      id: 'armory',
      definitionId: 'armory',
      tags: [shotgun],
    });
    const heroA = createEntityInstance({
      id: 'heroA',
      definitionId: 'hero',
      tags: [],
      slotSelections: {
        weapon: { holderEntityId: 'armory', tagName: 'Shotgun' },
      },
    });
    const heroB = createEntityInstance({
      id: 'heroB',
      definitionId: 'hero',
      tags: [],
      slotSelections: {
        weapon: { holderEntityId: 'armory', tagName: 'Shotgun' },
      },
    });
    const warnings = collectCatalogWarnings(
      registry,
      createPrimaryEngineState(heroA, { others: [heroB, armory] }),
    );
    expect(warnings.some((w) => w.kind === 'share' && w.id === 'weapon')).toBe(
      true,
    );
  });
});
