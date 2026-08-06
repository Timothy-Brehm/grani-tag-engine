import { describe, expect, it } from 'vitest';
import { EngineRegistry } from '../../registry';
import { createTag } from '../../tag';
import { ENGINE_VERSION } from '../../version';
import {
  analyzeInfinitePools,
  analyzeReachable,
  analyzeUpToGate,
  annotateBlock,
  buildContentGraph,
  createDebugContentTool,
  ENGINE_DEBUG_TAG_NAME,
  validateBlock,
} from '../index';
import { createEngineDocument } from '../../document';
import { createEngineState } from '../../state';
import { instantiateEntity } from '../../entity';

describe('content analyzer', () => {
  it('exports 0.3.0.1', () => {
    expect(ENGINE_VERSION).toBe('0.3.0.1');
  });

  it('analyzes up to a tier gate', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    registry.registerGateDefinition({
      id: 'tier1',
      tagName: 'Tier1Choice',
    });
    registry.registerEntityDefinition({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Start',
          effects: [],
        }),
      ],
      actions: [
        {
          name: 'choose-left',
          requirements: [{ type: 'tag', tagName: 'Start', exists: true }],
          immediateEffects: [],
          requiredEffects: [
            { type: 'grant-tag', name: 'Tier1Choice', strength: 1 },
            { type: 'grant-tag', name: 'Tier1Choice_WentLeft', strength: 1 },
          ],
          optionalEffects: [],
        },
        {
          name: 'post-tier',
          requirements: [
            { type: 'tag', tagName: 'Tier1Choice', exists: true },
          ],
          immediateEffects: [],
          requiredEffects: [{ type: 'grant-tag', name: 'PostTier', strength: 1 }],
          optionalEffects: [],
        },
      ],
    });

    const report = analyzeUpToGate(registry, 'tier1', {
      seedTags: ['Start'],
      seedEntityDefinitionIds: ['hero'],
    });
    expect(report).toBeDefined();
    expect(report!.before.tags.has('Start')).toBe(true);
    expect(report!.before.tags.has('Tier1Choice')).toBe(false);
    expect(report!.actionsGrantingGate).toContain('hero::choose-left');
    expect(report!.lockedBehindGate.tags).toContain('PostTier');
  });

  it('validates and annotates a self-contained block', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    registry.registerBlockDefinition({
      id: 'demo',
      entry: { kind: 'action', entityDefinitionId: 'hero', actionName: 'start-demo' },
      summaryTag: 'Block_Demo_Summary',
    });
    registry.registerEntityDefinition({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Block_Demo_Summary',
          analyzer: { blockId: 'demo', blockRole: 'summary' },
          effects: [
            { type: 'stat', name: 'power', strength: 2, stat: 'Power' },
          ],
        }),
        createTag({
          name: 'Demo_A',
          analyzer: { blockId: 'demo', blockRole: 'member' },
          effects: [
            { type: 'stat', name: 'power', strength: 1, stat: 'Power' },
          ],
        }),
        createTag({
          name: 'Demo_B',
          analyzer: { blockId: 'demo', blockRole: 'member' },
          effects: [
            { type: 'stat', name: 'power', strength: 1, stat: 'Power' },
          ],
        }),
      ],
      actions: [
        {
          name: 'start-demo',
          analyzer: { blockId: 'demo', blockRole: 'entry' },
          requirements: [{ type: 'free' }],
          immediateEffects: [],
          requiredEffects: [{ type: 'grant-tag', name: 'Demo_A', strength: 1 }],
          optionalEffects: [],
        },
        {
          name: 'unlock-b',
          analyzer: { blockId: 'demo', blockRole: 'member' },
          requirements: [{ type: 'tag', tagName: 'Demo_A', exists: true }],
          immediateEffects: [],
          requiredEffects: [{ type: 'grant-tag', name: 'Demo_B', strength: 1 }],
          optionalEffects: [],
        },
      ],
    });

    const validation = validateBlock(registry, 'demo');
    expect(validation?.ok).toBe(true);
    const ann = annotateBlock(registry, 'demo');
    expect(ann?.members.tags).toEqual(
      expect.arrayContaining(['Demo_A', 'Demo_B', 'Block_Demo_Summary']),
    );
    expect(ann?.summaryPresent).toBe(true);
  });

  it('marks Stamina+Berries infinite via regen and farm action', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    registry.registerPoolDefinition({ id: 'Stamina' });
    registry.registerPoolDefinition({ id: 'Berries' });
    registry.registerEntityDefinition({
      id: 'hero',
      initialTags: [
        createTag({
          name: 'Body',
          effects: [
            {
              type: 'pool-max',
              name: 'stam-max',
              strength: 10,
              pool: 'Stamina',
            },
            {
              type: 'generate-pool',
              name: 'stam-gen',
              strength: 1,
              pool: 'Stamina',
              amount: 1,
            },
            {
              type: 'pool-max',
              name: 'berry-max',
              strength: 20,
              pool: 'Berries',
            },
          ],
        }),
      ],
      actions: [
        {
          name: 'pick-berries',
          requirements: [{ type: 'free' }],
          immediateEffects: [
            {
              type: 'adjust-pool',
              name: 'cost',
              strength: -2,
              pool: 'Stamina',
            },
          ],
          requiredEffects: [
            {
              type: 'adjust-pool',
              name: 'gain',
              strength: 1,
              pool: 'Berries',
            },
          ],
          optionalEffects: [],
        },
      ],
    });

    const graph = buildContentGraph(registry);
    const slice = analyzeReachable(graph, {
      seedTags: ['Body'],
      seedEntityDefinitionIds: ['hero'],
    });
    const pools = analyzeInfinitePools(graph, slice);
    const stamina = pools.infinitePools.find((p) => p.pool === 'Stamina');
    const berries = pools.infinitePools.find((p) => p.pool === 'Berries');
    expect(stamina?.maxAtATime).toBe(10);
    expect(berries?.maxAtATime).toBe(20);
    expect(berries?.sources.some((s) => s.kind === 'farm-action')).toBe(true);
  });

  it('marks free Focus→Mana as infinite', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    registry.registerPoolDefinition({ id: 'Mana' });
    registry.registerEntityDefinition({
      id: 'mage',
      initialTags: [
        createTag({
          name: 'Mind',
          effects: [
            {
              type: 'pool-max',
              name: 'mana-max',
              strength: 15,
              pool: 'Mana',
            },
          ],
        }),
      ],
      actions: [
        {
          name: 'focus',
          requirements: [{ type: 'free' }],
          immediateEffects: [],
          requiredEffects: [
            {
              type: 'adjust-pool',
              name: 'gain',
              strength: 1,
              pool: 'Mana',
            },
          ],
          optionalEffects: [],
        },
      ],
    });

    const graph = buildContentGraph(registry);
    const slice = analyzeReachable(graph, {
      seedTags: ['Mind'],
      seedEntityDefinitionIds: ['mage'],
    });
    const pools = analyzeInfinitePools(graph, slice);
    expect(pools.infinitePools.find((p) => p.pool === 'Mana')?.maxAtATime).toBe(
      15,
    );
  });

  it('detects immediate and later tag locks', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    registry.registerEntityDefinition({
      id: 'hero',
      initialTags: [createTag({ name: 'Ready', effects: [] })],
      actions: [
        {
          name: 'open-crate',
          requirements: [
            { type: 'tag', tagName: 'Event_CrateOpened', exists: false },
          ],
          immediateEffects: [],
          requiredEffects: [
            { type: 'grant-tag', name: 'Event_CrateOpened', strength: 1 },
          ],
          optionalEffects: [],
        },
        {
          name: 'gather-tutorial',
          requirements: [
            { type: 'tag', tagName: 'Skill_Gathering', exists: false },
          ],
          immediateEffects: [],
          requiredEffects: [
            {
              type: 'adjust-pool',
              name: 'stick',
              strength: 1,
              pool: 'Sticks',
            },
          ],
          optionalEffects: [],
        },
        {
          name: 'learn-gather',
          requirements: [{ type: 'free' }],
          immediateEffects: [],
          requiredEffects: [
            { type: 'grant-tag', name: 'Skill_Gathering', strength: 1 },
          ],
          optionalEffects: [],
        },
      ],
    });

    const graph = buildContentGraph(registry);
    const slice = analyzeReachable(graph, {
      seedTags: ['Ready'],
      seedEntityDefinitionIds: ['hero'],
    });
    const pools = analyzeInfinitePools(graph, slice);
    const open = pools.nonFarmableActions.find(
      (a) => a.actionKey === 'hero::open-crate',
    );
    const gather = pools.nonFarmableActions.find(
      (a) => a.actionKey === 'hero::gather-tutorial',
    );
    expect(open?.reason).toBe('tag-lock-immediate');
    expect(gather?.reason).toBe('tag-lock-later');
    expect(pools.infinitePools.some((p) => p.pool === 'Sticks')).toBe(false);
  });

  it('flags pollution with no drain and clears when vent exists', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    registry.registerPoolDefinition({ id: 'Pollution' });
    registry.registerEntityDefinition({
      id: 'camp',
      initialTags: [
        createTag({
          name: 'Smog',
          effects: [
            {
              type: 'pool-max',
              name: 'pol-max',
              strength: 100,
              pool: 'Pollution',
            },
            {
              type: 'generate-pool',
              name: 'pol-gen',
              strength: 1,
              pool: 'Pollution',
              amount: 1,
            },
          ],
        }),
      ],
      actions: [],
    });

    let graph = buildContentGraph(registry);
    let slice = analyzeReachable(graph, {
      seedTags: ['Smog'],
      seedEntityDefinitionIds: ['camp'],
    });
    let pools = analyzeInfinitePools(graph, slice);
    const pol = pools.accumulatingPools.find((p) => p.pool === 'Pollution');
    expect(pol?.accumulatesToCapWithoutDrain).toBe(true);
    expect(pol?.maxAtATime).toBe(100);

    registry.registerEntityDefinition({
      id: 'camp2',
      initialTags: [
        createTag({
          name: 'Smog',
          effects: [
            {
              type: 'pool-max',
              name: 'pol-max',
              strength: 100,
              pool: 'Pollution',
            },
            {
              type: 'generate-pool',
              name: 'pol-gen',
              strength: 1,
              pool: 'Pollution',
              amount: 1,
            },
          ],
        }),
      ],
      actions: [
        {
          name: 'vent-pollution',
          requirements: [{ type: 'free' }],
          immediateEffects: [],
          requiredEffects: [
            {
              type: 'adjust-pool',
              name: 'vent',
              strength: -5,
              pool: 'Pollution',
            },
          ],
          optionalEffects: [],
        },
      ],
    });
    graph = buildContentGraph(registry);
    slice = analyzeReachable(graph, {
      seedTags: ['Smog'],
      seedEntityDefinitionIds: ['camp2'],
    });
    pools = analyzeInfinitePools(graph, slice);
    const pol2 = pools.accumulatingPools.find((p) => p.pool === 'Pollution');
    expect(pol2?.hasDrain).toBe(true);
    expect(pol2?.accumulatesToCapWithoutDrain).toBe(false);
  });

  it('flags opaque requirements on reachable actions', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    registry.registerEntityDefinition({
      id: 'hero',
      initialTags: [createTag({ name: 'Ready', effects: [] })],
      actions: [
        {
          name: 'need-strength',
          requirements: [
            { type: 'stat', stat: 'Strength', amount: 5 },
          ],
          immediateEffects: [],
          requiredEffects: [{ type: 'grant-tag', name: 'Strong', strength: 1 }],
          optionalEffects: [],
        },
      ],
    });
    const graph = buildContentGraph(registry);
    const slice = analyzeReachable(graph, {
      seedTags: ['Ready'],
      seedEntityDefinitionIds: ['hero'],
    });
    expect(slice.actions.has('hero::need-strength')).toBe(true);
    expect(slice.assumedAvailable.has('hero::need-strength')).toBe(true);
    expect(slice.tags.has('Strong')).toBe(true);
  });
});

describe('debug content tool', () => {
  it('always defines the debug capability tag and merges sidecar tags', () => {
    const dbg = createDebugContentTool({
      sourceId: 'test',
      tags: {
        tags: [
          {
            name: 'Block_Cheat',
            effects: [
              { type: 'stat', name: 's', strength: 1, stat: 'Strength' },
            ],
          },
        ],
      },
    });
    expect(dbg.kind).toBe('debug-content');
    expect(dbg.debugTagName).toBe(ENGINE_DEBUG_TAG_NAME);
    expect(dbg.tagCatalog.has('debug')).toBe(true);
    expect(dbg.tagCatalog.has('Block_Cheat')).toBe(true);
  });

  it('enables debug on document universal tags and primary entity', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    registry.registerEntityDefinition({
      id: 'hero',
      initialTags: [],
    });
    const game = createEngineState({
      entities: [
        instantiateEntity(registry.getEntityDefinition('hero')!, 'player'),
      ],
      primaryEntityId: 'player',
    });
    let doc = createEngineDocument({ gameId: 'g1', game });
    const dbg = createDebugContentTool();
    expect(dbg.isDebugEnabledOnDocument(doc)).toBe(false);
    doc = dbg.enableOnDocument(doc);
    expect(dbg.isDebugEnabledOnDocument(doc)).toBe(true);

    let state = game;
    expect(dbg.isDebugEnabledOnPrimary(state)).toBe(false);
    state = dbg.enableOnPrimary(state);
    expect(dbg.isDebugEnabledOnPrimary(state)).toBe(true);
  });
});
