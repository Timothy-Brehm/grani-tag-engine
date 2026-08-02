import { describe, expect, it } from 'vitest';
import {
  ENGINE_VERSION,
  EngineRegistry,
  UNIVERSAL_TAGS_HOLDER_ID,
  createEngineDocument,
  createPrimaryEngineState,
  createTaggedEntity,
  createTag,
  engineDocumentFromJSON,
  engineDocumentToJSON,
  entitiesWithUniversal,
  getActiveGame,
  migrateEngineStateToDocument,
  reduceEngineDocument,
  requirementsMet,
  selectActiveTags,
  selectStatValue,
  toEngineContext,
  wrapGameAsDocument,
  engineStateToJSON,
} from './index';

function registry() {
  return new EngineRegistry().createBuiltinAdaptors();
}

describe('EngineDocument', () => {
  it('wraps a game and round-trips JSON', () => {
    const game = createPrimaryEngineState(
      createTaggedEntity({ id: 'player', tags: [] }),
    );
    const doc = wrapGameAsDocument(game);
    expect(doc.engineVersion).toBe(ENGINE_VERSION);
    expect(doc.settings.activeGameId).toBe('game-0');
    expect(doc.settings.universalTags.size).toBe(0);
    const json = engineDocumentToJSON(doc);
    const loaded = engineDocumentFromJSON(json);
    expect(getActiveGame(loaded).primaryEntityId).toBe('player');
  });

  it('migrates bare 0.1 EngineStateJSON', () => {
    const game = createPrimaryEngineState(
      createTaggedEntity({ id: 'player', tags: [] }),
    );
    const oldJson = {
      ...engineStateToJSON(game),
      engineVersion: '0.1.2.0',
    };
    const doc = migrateEngineStateToDocument(oldJson);
    expect(doc.engineVersion).toBe(ENGINE_VERSION);
    expect(getActiveGame(doc).entities.has('player')).toBe(true);
  });

  it('settings-grant-tag and universal tag requirements', () => {
    const reg = registry();
    const game = createPrimaryEngineState(
      createTaggedEntity({ id: 'player', tags: [] }),
    );
    let doc = createEngineDocument({ game });
    doc = reduceEngineDocument(
      doc,
      {
        type: 'settings-add-tag',
        tag: createTag({
          name: 'Unlock_River',
          effects: [{ type: 'stat', stat: 'Science', strength: 2 }],
        }),
      },
      { registry: reg, host: {} },
    );
    expect(doc.settings.universalTags.has('Unlock_River')).toBe(true);

    const active = getActiveGame(doc);
    const ctx = toEngineContext(
      active,
      {},
      { actorEntityId: 'player' },
      doc.settings.universalTags,
    );
    expect(
      requirementsMet(
        reg,
        [{ type: 'tag', tagName: 'Unlock_River', exists: true }],
        ctx,
      ),
    ).toBe(true);
    expect(
      selectStatValue(
        active.entities.get('player')!,
        'Science',
        reg,
        entitiesWithUniversal(active, doc.settings.universalTags),
        {
          universalTags: doc.settings.universalTags,
          mergeUnslottedUniversal: true,
        },
      ),
    ).toBe(2);
  });

  it('has-slot family: local vs universal vs union', () => {
    const reg = registry();
    reg.registerSlotDefinition({ id: 'vehicle', mode: 'selectable' });
    const game = createPrimaryEngineState(
      createTaggedEntity({
        id: 'player',
        tags: [
          createTag({
            name: 'LocalCart',
            slot: 'vehicle',
            effects: [],
          }),
        ],
      }),
    );
    let doc = createEngineDocument({
      game,
      universalTags: [
        createTag({ name: 'Turbo', slot: 'vehicle', effects: [] }),
      ],
    });
    const ctx = toEngineContext(
      getActiveGame(doc),
      {},
      { actorEntityId: 'player' },
      doc.settings.universalTags,
    );
    expect(
      requirementsMet(reg, [{ type: 'has-slot', slot: 'vehicle' }], ctx),
    ).toBe(true);
    expect(
      requirementsMet(reg, [{ type: 'has-slot-local', slot: 'vehicle' }], ctx),
    ).toBe(true);
    expect(
      requirementsMet(
        reg,
        [{ type: 'has-slot-universal', slot: 'vehicle' }],
        ctx,
      ),
    ).toBe(true);

    doc = reduceEngineDocument(
      doc,
      { type: 'settings-remove-tag', name: 'Turbo' },
      { registry: reg, host: {} },
    );
    const ctx2 = toEngineContext(
      getActiveGame(doc),
      {},
      { actorEntityId: 'player' },
      doc.settings.universalTags,
    );
    expect(
      requirementsMet(
        reg,
        [{ type: 'has-slot-universal', slot: 'vehicle' }],
        ctx2,
      ),
    ).toBe(false);
    expect(
      requirementsMet(reg, [{ type: 'has-slot', slot: 'vehicle' }], ctx2),
    ).toBe(true);
  });

  it('selects universal slotted tag per game', () => {
    const reg = registry();
    reg.registerSlotDefinition({ id: 'vehicle', mode: 'selectable' });
    const turbo = createTag({
      name: 'Turbo',
      slot: 'vehicle',
      effects: [{ type: 'stat', stat: 'Speed', strength: 5 }],
      dependentTags: [createTag({ name: 'CanBoost', effects: [] })],
    });
    const gameA = createPrimaryEngineState(
      createTaggedEntity({ id: 'player', tags: [] }),
    );
    const gameB = createPrimaryEngineState(
      createTaggedEntity({ id: 'player', tags: [] }),
    );
    let doc = createEngineDocument({
      gameId: 'a',
      game: gameA,
      games: new Map([
        ['a', gameA],
        ['b', gameB],
      ]),
      activeGameId: 'a',
      universalTags: [turbo],
    });
    doc = reduceEngineDocument(
      doc,
      {
        type: 'select-slot-item',
        entityId: 'player',
        slot: 'vehicle',
        tagName: 'Turbo',
        holderEntityId: UNIVERSAL_TAGS_HOLDER_ID,
      },
      { registry: reg, host: {} },
    );
    const activeA = getActiveGame(doc);
    const tagsA = selectActiveTags(
      activeA.entities.get('player')!,
      reg,
      entitiesWithUniversal(activeA, doc.settings.universalTags),
    );
    expect(tagsA.some((t) => t.name === 'Turbo')).toBe(true);
    expect(tagsA.some((t) => t.name === 'CanBoost')).toBe(true);

    doc = reduceEngineDocument(
      doc,
      { type: 'games-switch', gameId: 'b' },
      { registry: reg, host: {} },
    );
    const activeB = getActiveGame(doc);
    expect(
      selectActiveTags(
        activeB.entities.get('player')!,
        reg,
        entitiesWithUniversal(activeB, doc.settings.universalTags),
      ).some((t) => t.name === 'Turbo'),
    ).toBe(false);

    doc = reduceEngineDocument(
      doc,
      {
        type: 'select-slot-item',
        entityId: 'player',
        slot: 'vehicle',
        tagName: 'Turbo',
        holderEntityId: UNIVERSAL_TAGS_HOLDER_ID,
      },
      { registry: reg, host: {} },
    );
    expect(
      getActiveGame(doc).entities.get('player')!.slotSelections.vehicle
        ?.tagName,
    ).toBe('Turbo');
  });

  it('games-switch / fork / delete', () => {
    const reg = registry();
    const g0 = createPrimaryEngineState(
      createTaggedEntity({ id: 'player', tags: [] }),
    );
    let doc = wrapGameAsDocument(g0, 'g0');
    doc = reduceEngineDocument(
      doc,
      { type: 'tick', steps: 3 },
      { registry: reg, host: {} },
    );
    expect(getActiveGame(doc).tick).toBe(3);
    doc = reduceEngineDocument(
      doc,
      {
        type: 'games-fork',
        newGameId: 'g1',
        switchTo: true,
      },
      { registry: reg, host: {} },
    );
    expect(doc.settings.activeGameId).toBe('g1');
    expect(getActiveGame(doc).tick).toBe(3);
    doc = reduceEngineDocument(
      doc,
      { type: 'tick', steps: 1 },
      { registry: reg, host: {} },
    );
    expect(getActiveGame(doc).tick).toBe(4);
    doc = reduceEngineDocument(
      doc,
      { type: 'games-switch', gameId: 'g0' },
      { registry: reg, host: {} },
    );
    expect(getActiveGame(doc).tick).toBe(3);
    doc = reduceEngineDocument(
      doc,
      { type: 'games-delete', gameId: 'g1' },
      { registry: reg, host: {} },
    );
    expect(doc.games.has('g1')).toBe(false);
    // refuse delete active / last
    const same = reduceEngineDocument(
      doc,
      { type: 'games-delete', gameId: 'g0' },
      { registry: reg, host: {} },
    );
    expect(same.games.size).toBe(1);
  });
});
