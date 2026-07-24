import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from './action';
import { EngineRegistry } from './registry';
import { createTag } from './tag';
import {
  executeAction,
  executeActionSafe,
  isActionAvailable,
  codeRequirementsMet,
  requirementsMet,
} from './evaluate';
import {
  createPrimaryEngineState,
  createTaggedEntity,
  toEngineContext,
  upsertEntity,
} from './state';

describe('registry builtins and actions', () => {
  const registry = new EngineRegistry().createBuiltinAdaptors();

  function playerContext(tags = [createTag({ name: 'marked', effects: [] })]) {
    const state = createPrimaryEngineState(
      createTaggedEntity({ id: 'player', tags }),
    );
    return toEngineContext(state, {}, { actorEntityId: 'player' });
  }

  it('evaluates free, forbidden, and tag requirements', () => {
    const ctx = playerContext();
    expect(requirementsMet(registry, [{ type: 'free' }], ctx)).toBe(true);
    expect(requirementsMet(registry, [{ type: 'forbidden' }], ctx)).toBe(false);
    expect(
      requirementsMet(registry, [{ type: 'tag', tagName: 'marked', exists: true }], ctx),
    ).toBe(true);
    expect(
      requirementsMet(registry, [{ type: 'tag', tagName: 'marked', exists: false }], ctx),
    ).toBe(false);
    expect(
      requirementsMet(registry, [{ type: 'tag', tagName: 'other', exists: false }], ctx),
    ).toBe(true);
  });

  it('checks availability and executes grant-tag results', () => {
    const action: ActionDefinition = {
      name: 'grant',
      requirements: [{ type: 'free' }],
      costs: [],
      results: [{ type: 'grant-tag', name: 'bonus', strength: 1 }],
      sideEffects: [],
    };
    const ctx = playerContext([]);
    expect(isActionAvailable(registry, action, ctx)).toBe(true);
    const next = executeAction(registry, action, ctx);
    expect(next.engine.entities.get('player')?.tags.has('bonus')).toBe(true);
    expect(isActionAvailable(registry, action, next)).toBe(false);
  });

  it('executeActionSafe skips effects that cannot happen', () => {
    const action: ActionDefinition = {
      name: 'maybe',
      requirements: [{ type: 'free' }],
      costs: [],
      results: [
        { type: 'grant-tag', name: 'a', strength: 1 },
        { type: 'grant-tag', name: 'a', strength: 1 },
      ],
      sideEffects: [{ type: 'grant-tag', name: 'b', strength: 1 }],
    };
    const next = executeActionSafe(registry, action, playerContext([]));
    const tags = next.engine.entities.get('player')!.tags;
    expect(tags.has('a')).toBe(true);
    expect(tags.has('b')).toBe(true);
    expect(tags.size).toBe(2);
  });

  it('remove-entity effect removes the source by default', () => {
    const state = createPrimaryEngineState(
      createTaggedEntity({ id: 'player', tags: [] }),
      { others: [createTaggedEntity({ id: 'crate', tags: [] })] },
    );
    const ctx = toEngineContext(state, {}, {
      actorEntityId: 'player',
      sourceEntityId: 'crate',
    });
    const action: ActionDefinition = {
      name: 'loot',
      requirements: [{ type: 'free' }],
      costs: [],
      results: [{ type: 'remove-entity', name: 'Remove', strength: 1 }],
      sideEffects: [],
    };
    expect(isActionAvailable(registry, action, ctx)).toBe(true);
    const next = executeAction(registry, action, ctx);
    expect(next.engine.entities.has('crate')).toBe(false);
    expect(next.engine.entities.has('player')).toBe(true);
  });

  it('uses host tagCatalog when granting', () => {
    const catalog = {
      fancy: createTag({
        name: 'fancy',
        description: 'from catalog',
        effects: [{ type: 'glow', name: 'g', strength: 4 }],
      }),
    };
    const action: ActionDefinition = {
      name: 'from-catalog',
      requirements: [],
      costs: [],
      results: [{ type: 'grant-tag', name: 'fancy', strength: 1 }],
      sideEffects: [],
    };
    const state = createPrimaryEngineState(
      createTaggedEntity({ id: 'player', tags: [] }),
    );
    const next = executeAction(
      registry,
      action,
      toEngineContext(state, { tagCatalog: catalog }, { actorEntityId: 'player' }),
    );
    const fancy = next.engine.entities.get('player')?.tags.get('fancy');
    expect(fancy?.description).toBe('from catalog');
    expect(fancy && next.engine.entities.get('player')!.tags.sumEffectStrength('glow')).toBe(4);
  });

  it('supports registered host requirements and code-only checks', () => {
    type Host = { level: number; enabled: boolean };
    type LevelRequirement = {
      type: 'example/level';
      minimum: number;
    };
    const hostRegistry = new EngineRegistry<Host>()
      .createBuiltinAdaptors()
      .registerRequirement(
        'example/level',
        (requirement: LevelRequirement, context) =>
          context.host.level >= requirement.minimum,
      );
    const state = createPrimaryEngineState(
      createTaggedEntity({ id: 'player', tags: [] }),
    );
    const context = toEngineContext(
      state,
      { level: 4, enabled: true },
      { actorEntityId: 'player' },
    );

    expect(
      requirementsMet(
        hostRegistry,
        [{ type: 'example/level', minimum: 3 }],
        context,
      ),
    ).toBe(true);
    expect(
      codeRequirementsMet(
        [(ctx) => ctx.host.enabled, (ctx) => ctx.host.level < 5],
        context,
      ),
    ).toBe(true);
  });

  it('applies actor pool costs and source-scoped tag grants', () => {
    registry.registerEntityDefinition({
      id: 'lander',
      maxActive: 1,
      maxCreated: 1,
    });
    let state = createPrimaryEngineState(
      createTaggedEntity({
        id: 'player',
        tags: [
          createTag({
            name: 'life-max',
            effects: [
              { type: 'pool-max', name: 'Life', strength: 2, pool: 'Life' } as never,
            ],
          }),
        ],
      }),
    );
    state = reduceWithPools(state);
    state = upsertEntity(
      state,
      createTaggedEntity({ id: 'lander-1', definitionId: 'lander', tags: [] }),
    );

    const action: ActionDefinition = {
      name: 'open',
      requirements: [{ type: 'free' }],
      costs: [
        { type: 'adjust-pool', name: 'stamina', strength: -1, pool: 'Life' },
      ],
      results: [
        {
          type: 'grant-tag',
          name: 'opened',
          strength: 1,
          scope: 'source',
        } as never,
      ],
      sideEffects: [],
    };

    const next = executeAction(
      registry,
      action,
      toEngineContext(state, {}, {
        actorEntityId: 'player',
        sourceEntityId: 'lander-1',
      }),
    );
    expect(next.engine.entities.get('player')?.pools.Life).toBe(1);
    expect(next.engine.entities.get('lander-1')?.tags.has('opened')).toBe(true);
  });
});

function reduceWithPools(
  state: ReturnType<typeof createPrimaryEngineState>,
) {
  const entity = state.entities.get('player')!;
  return upsertEntity(state, {
    ...entity,
    pools: { Life: 2 },
  });
}
