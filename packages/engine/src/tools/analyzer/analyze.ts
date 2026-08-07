import type { ActionDefinition } from '../../action';
import type { ActiveEffect } from '../../effect';
import type { EngineRegistry } from '../../registry';
import type { Requirement } from '../../requirement';
import type { Tag } from '../../tag';
import {
  analyzerActionKey,
  type AccumulatingPoolRow,
  type AccumulatingPoolSource,
  type AnalyzerActionKey,
  type FiniteStockpileRow,
  type InfinitePoolRow,
  type InfinitePoolSource,
  type NonFarmableAction,
} from './types';

export type {
  AnalyzerContentMeta,
  GateDefinition,
  BlockDefinition,
  BlockEntry,
  AnalyzerActionKey,
  InfinitePoolRow,
  InfinitePoolSource,
  AccumulatingPoolRow,
  AccumulatingPoolSource,
  NonFarmableAction,
  NonFarmableReason,
  FiniteStockpileRow,
} from './types';
export {
  analyzerActionKey,
  parseAnalyzerActionKey,
} from './types';

export type GraphAction = {
  readonly key: AnalyzerActionKey;
  readonly entityDefinitionId: string;
  readonly action: ActionDefinition;
  readonly opaque: boolean;
  readonly grantsTags: readonly string[];
  readonly spawnsDefs: readonly string[];
  readonly requiresTagsPresent: readonly string[];
  readonly requiresTagsAbsent: readonly string[];
  readonly requiresSlots: readonly string[];
  readonly poolCostDeltas: Readonly<Record<string, number>>;
  readonly poolResultDeltas: Readonly<Record<string, number>>;
};

export type ContentGraph = {
  readonly actions: ReadonlyMap<AnalyzerActionKey, GraphAction>;
  readonly tagsByName: ReadonlyMap<string, Tag>;
  /** slot id → tag names that declare that slot */
  readonly tagsBySlot: ReadonlyMap<string, readonly string[]>;
  readonly entityDefinitionIds: readonly string[];
};

export type AnalyzeOptions = {
  /** Starting held tag names. */
  readonly seedTags?: readonly string[];
  /**
   * Entity definitions whose actions are available at start.
   * Default: all registered entity definitions.
   */
  readonly seedEntityDefinitionIds?: readonly string[];
  /** Extra tag bodies (host tag catalog). */
  readonly tagCatalog?: ReadonlyMap<string, Tag> | Readonly<Record<string, Tag>>;
};

export type ReachableSlice = {
  readonly tags: ReadonlySet<string>;
  readonly actions: ReadonlySet<AnalyzerActionKey>;
  readonly entityDefs: ReadonlySet<string>;
  readonly assumedAvailable: ReadonlySet<AnalyzerActionKey>;
};

export type PoolAnalysis = {
  readonly infinitePools: readonly InfinitePoolRow[];
  readonly accumulatingPools: readonly AccumulatingPoolRow[];
  readonly finiteStockpiles: readonly FiniteStockpileRow[];
  readonly nonFarmableActions: readonly NonFarmableAction[];
};

export type UpToGateReport = {
  readonly gateId: string;
  readonly gateTag: string;
  readonly before: ReachableSlice;
  readonly actionsGrantingGate: readonly AnalyzerActionKey[];
  readonly lockedBehindGate: {
    readonly tags: readonly string[];
    readonly actions: readonly AnalyzerActionKey[];
  };
  readonly pools: PoolAnalysis;
};

export type BlockValidation = {
  readonly blockId: string;
  readonly ok: boolean;
  readonly externalDeps: readonly string[];
  readonly missingMembers: readonly string[];
  readonly unreachableMembers: readonly string[];
};

export type BlockAnnotation = {
  readonly blockId: string;
  readonly entry: import('./types').BlockEntry;
  readonly members: {
    readonly tags: readonly string[];
    readonly actions: readonly AnalyzerActionKey[];
  };
  readonly netGrantTags: readonly string[];
  readonly netStat: Readonly<Record<string, number>>;
  readonly netPoolMax: Readonly<Record<string, number>>;
  readonly summaryTag?: string;
  readonly summaryPresent: boolean;
  readonly summaryMismatch?: string;
  readonly pools: PoolAnalysis;
  readonly validation: BlockValidation;
};

function collectTagTree(tag: Tag, into: Map<string, Tag>): void {
  if (!into.has(tag.name)) {
    into.set(tag.name, tag);
  }
  for (const child of tag.dependentTags ?? []) {
    collectTagTree(child, into);
  }
}

function effectList(
  ...lists: (readonly ActiveEffect[] | undefined)[]
): ActiveEffect[] {
  const out: ActiveEffect[] = [];
  for (const list of lists) {
    if (list) out.push(...list);
  }
  return out;
}

function sumAdjustPools(
  effects: readonly ActiveEffect[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const effect of effects) {
    if (effect.type !== 'adjust-pool') continue;
    const payload = effect as ActiveEffect & { pool?: string };
    const pool = typeof payload.pool === 'string' ? payload.pool : undefined;
    if (!pool) continue;
    const delta = effect.strength;
    if (!Number.isFinite(delta) || delta === 0) continue;
    out[pool] = (out[pool] ?? 0) + delta;
  }
  return out;
}

function classifyRequirements(action: ActionDefinition): {
  opaque: boolean;
  requiresTagsPresent: string[];
  requiresTagsAbsent: string[];
  requiresSlots: string[];
} {
  const requiresTagsPresent: string[] = [];
  const requiresTagsAbsent: string[] = [];
  const requiresSlots: string[] = [];
  let opaque = Boolean(action.codeRequirements?.length);

  for (const req of action.requirements as readonly Requirement[]) {
    switch (req.type) {
      case 'free':
        break;
      case 'forbidden':
        opaque = true;
        break;
      case 'tag': {
        const tagReq = req as {
          tagName: string;
          exists: boolean;
        };
        if (tagReq.exists) {
          requiresTagsPresent.push(tagReq.tagName);
        } else {
          requiresTagsAbsent.push(tagReq.tagName);
        }
        break;
      }
      case 'has-slot':
      case 'has-slot-local':
      case 'has-slot-universal': {
        const slot = (req as { slot: string }).slot;
        if (slot) requiresSlots.push(slot);
        break;
      }
      case 'stat':
      case 'pool-max':
      case 'metric':
      case 'entity-count':
        opaque = true;
        break;
      default:
        opaque = true;
        break;
    }
  }
  return { opaque, requiresTagsPresent, requiresTagsAbsent, requiresSlots };
}

function grantsFromEffects(effects: readonly ActiveEffect[]): {
  tags: string[];
  spawns: string[];
} {
  const tags: string[] = [];
  const spawns: string[] = [];
  for (const effect of effects) {
    if (
      (effect.type === 'grant-tag' || effect.type === 'lock-tag') &&
      effect.name
    ) {
      tags.push(effect.name);
    }
    if (effect.type === 'spawn-entity') {
      const defId = (effect as { definitionId?: string }).definitionId;
      if (defId) spawns.push(defId);
    }
  }
  return { tags, spawns };
}

export function buildContentGraph(
  registry: EngineRegistry,
  options: AnalyzeOptions = {},
): ContentGraph {
  const tagsByName = new Map<string, Tag>();
  const tagsBySlot = new Map<string, string[]>();
  const actions = new Map<AnalyzerActionKey, GraphAction>();

  const defs = registry.listEntityDefinitions();
  for (const def of defs) {
    for (const tag of def.initialTags ?? []) {
      collectTagTree(tag, tagsByName);
    }
  }
  if (options.tagCatalog) {
    if (options.tagCatalog instanceof Map) {
      for (const tag of options.tagCatalog.values()) {
        collectTagTree(tag, tagsByName);
      }
    } else {
      for (const tag of Object.values(options.tagCatalog)) {
        collectTagTree(tag, tagsByName);
      }
    }
  }

  for (const tag of tagsByName.values()) {
    if (typeof tag.slot === 'string' && tag.slot) {
      const list = tagsBySlot.get(tag.slot) ?? [];
      list.push(tag.name);
      tagsBySlot.set(tag.slot, list);
    }
  }

  for (const def of defs) {
    for (const action of def.actions ?? []) {
      const key = analyzerActionKey(def.id, action.name);
      const classified = classifyRequirements(action);
      const results = effectList(action.requiredEffects, action.optionalEffects);
      const costs = effectList(
        action.immediateEffects,
        action.requiredOverTimeEffects,
      );
      const granted = grantsFromEffects(results);
      actions.set(key, {
        key,
        entityDefinitionId: def.id,
        action,
        opaque: classified.opaque,
        grantsTags: Object.freeze(granted.tags),
        spawnsDefs: Object.freeze(granted.spawns),
        requiresTagsPresent: Object.freeze(classified.requiresTagsPresent),
        requiresTagsAbsent: Object.freeze(classified.requiresTagsAbsent),
        requiresSlots: Object.freeze(classified.requiresSlots),
        poolCostDeltas: Object.freeze(sumAdjustPools(costs)),
        poolResultDeltas: Object.freeze(sumAdjustPools(results)),
      });
    }
  }

  return {
    actions,
    tagsByName,
    tagsBySlot: new Map(
      [...tagsBySlot.entries()].map(([k, v]) => [k, Object.freeze([...v])]),
    ),
    entityDefinitionIds: Object.freeze(defs.map((d) => d.id)),
  };
}

function slotSatisfied(
  graph: ContentGraph,
  heldTags: ReadonlySet<string>,
  slot: string,
): boolean {
  const candidates = graph.tagsBySlot.get(slot) ?? [];
  return candidates.some((name) => heldTags.has(name));
}

function actionStructurallyAvailable(
  graph: ContentGraph,
  ga: GraphAction,
  heldTags: ReadonlySet<string>,
  entityDefs: ReadonlySet<string>,
): boolean {
  if (!entityDefs.has(ga.entityDefinitionId)) return false;
  for (const tag of ga.requiresTagsPresent) {
    if (!heldTags.has(tag)) return false;
  }
  for (const tag of ga.requiresTagsAbsent) {
    if (heldTags.has(tag)) return false;
  }
  for (const slot of ga.requiresSlots) {
    if (!slotSatisfied(graph, heldTags, slot)) return false;
  }
  return true;
}

export function analyzeReachable(
  graph: ContentGraph,
  options: AnalyzeOptions = {},
): ReachableSlice {
  const tags = new Set<string>(options.seedTags ?? []);
  const entityDefs = new Set<string>(
    options.seedEntityDefinitionIds ?? graph.entityDefinitionIds,
  );
  const actions = new Set<AnalyzerActionKey>();
  const assumedAvailable = new Set<AnalyzerActionKey>();

  let changed = true;
  while (changed) {
    changed = false;
    for (const ga of graph.actions.values()) {
      if (actions.has(ga.key)) continue;
      if (!actionStructurallyAvailable(graph, ga, tags, entityDefs)) {
        continue;
      }
      actions.add(ga.key);
      if (ga.opaque) assumedAvailable.add(ga.key);
      changed = true;
      for (const t of ga.grantsTags) {
        if (!tags.has(t)) {
          tags.add(t);
          changed = true;
        }
      }
      for (const d of ga.spawnsDefs) {
        if (!entityDefs.has(d)) {
          entityDefs.add(d);
          changed = true;
        }
      }
    }
  }

  return {
    tags,
    actions,
    entityDefs,
    assumedAvailable,
  };
}

/** Reachability that never adds `blockedTag` to held facts (gate boundary). */
function analyzeReachableBlockingTag(
  graph: ContentGraph,
  options: AnalyzeOptions,
  blockedTag: string,
): ReachableSlice {
  const tags = new Set<string>(
    (options.seedTags ?? []).filter((t) => t !== blockedTag),
  );
  const entityDefs = new Set<string>(
    options.seedEntityDefinitionIds ?? graph.entityDefinitionIds,
  );
  const actions = new Set<AnalyzerActionKey>();
  const assumedAvailable = new Set<AnalyzerActionKey>();

  let changed = true;
  while (changed) {
    changed = false;
    for (const ga of graph.actions.values()) {
      if (actions.has(ga.key)) continue;
      if (!actionStructurallyAvailable(graph, ga, tags, entityDefs)) {
        continue;
      }
      actions.add(ga.key);
      if (ga.opaque) assumedAvailable.add(ga.key);
      changed = true;
      for (const t of ga.grantsTags) {
        if (t === blockedTag) continue;
        if (!tags.has(t)) {
          tags.add(t);
          changed = true;
        }
      }
      for (const d of ga.spawnsDefs) {
        if (!entityDefs.has(d)) {
          entityDefs.add(d);
          changed = true;
        }
      }
    }
  }

  return { tags, actions, entityDefs, assumedAvailable };
}

function structuralPoolMax(
  graph: ContentGraph,
  heldTags: ReadonlySet<string>,
  pool: string,
): number {
  let total = 0;
  for (const tagName of heldTags) {
    const tag = graph.tagsByName.get(tagName);
    if (!tag) continue;
    for (const effect of tag.effects) {
      if (effect.type === 'pool-max' && effect.pool === pool) {
        total += effect.strength;
      }
      if (
        effect.type === 'cross-link' &&
        typeof effect.toPoolMax === 'string' &&
        effect.toPoolMax === pool
      ) {
        const coeff =
          typeof effect.amount === 'number' ? effect.amount : effect.strength;
        // Structural: use coeff as if source were 1 when fromStat/fromPool unknown magnitude
        total += coeff;
      }
    }
  }
  return total;
}

function collectGenerateSources(
  graph: ContentGraph,
  heldTags: ReadonlySet<string>,
): {
  positive: Map<string, AccumulatingPoolSource[]>;
  negative: Map<string, AccumulatingPoolSource[]>;
} {
  const positive = new Map<string, AccumulatingPoolSource[]>();
  const negative = new Map<string, AccumulatingPoolSource[]>();
  const push = (
    map: Map<string, AccumulatingPoolSource[]>,
    pool: string,
    source: AccumulatingPoolSource,
  ) => {
    const list = map.get(pool) ?? [];
    list.push(source);
    map.set(pool, list);
  };

  for (const tagName of heldTags) {
    const tag = graph.tagsByName.get(tagName);
    if (!tag) continue;
    for (const effect of tag.effects) {
      if (effect.type === 'generate-pool' && typeof effect.pool === 'string') {
        const amount =
          typeof effect.amount === 'number' ? effect.amount : effect.strength;
        if (!Number.isFinite(amount) || amount === 0) continue;
        const src: AccumulatingPoolSource = {
          kind: 'generate-pool',
          tagName,
        };
        if (amount > 0) push(positive, effect.pool, src);
        else push(negative, effect.pool, src);
      }
      if (
        effect.type === 'cross-link' &&
        typeof effect.toGeneratePool === 'string'
      ) {
        const coeff =
          typeof effect.amount === 'number' ? effect.amount : effect.strength;
        if (!Number.isFinite(coeff) || coeff === 0) continue;
        const src: AccumulatingPoolSource = {
          kind: 'cross-link-generate',
          tagName,
        };
        if (coeff > 0) push(positive, effect.toGeneratePool, src);
        else push(negative, effect.toGeneratePool, src);
      }
    }
  }
  return { positive, negative };
}

function whoGrantsTag(
  graph: ContentGraph,
  slice: ReachableSlice,
  tagName: string,
): AnalyzerActionKey[] {
  const out: AnalyzerActionKey[] = [];
  for (const key of slice.actions) {
    const ga = graph.actions.get(key);
    if (ga?.grantsTags.includes(tagName)) out.push(key);
  }
  return out;
}

function farmability(
  graph: ContentGraph,
  slice: ReachableSlice,
  ga: GraphAction,
  infinitePools: ReadonlySet<string>,
): { farmable: boolean; nonFarmable?: NonFarmableAction } {
  // Immediate / later tag locks
  for (const lockTag of ga.requiresTagsAbsent) {
    if (ga.grantsTags.includes(lockTag)) {
      return {
        farmable: false,
        nonFarmable: {
          actionKey: ga.key,
          reason: 'tag-lock-immediate',
          lockTag,
          granterActionKey: ga.key,
        },
      };
    }
    const granters = whoGrantsTag(graph, slice, lockTag).filter(
      (k) => k !== ga.key,
    );
    if (granters.length > 0) {
      return {
        farmable: false,
        nonFarmable: {
          actionKey: ga.key,
          reason: 'tag-lock-later',
          lockTag,
          granterActionKey: granters[0],
        },
      };
    }
  }

  const costPools = Object.entries(ga.poolCostDeltas).filter(
    ([, d]) => d < 0,
  );
  for (const [pool] of costPools) {
    if (!infinitePools.has(pool)) {
      return {
        farmable: false,
        nonFarmable: {
          actionKey: ga.key,
          reason: 'finite-inputs',
        },
      };
    }
  }
  return { farmable: true };
}

export function analyzeInfinitePools(
  graph: ContentGraph,
  slice: ReachableSlice,
): PoolAnalysis {
  const gen = collectGenerateSources(graph, slice.tags);
  const infinite = new Map<string, InfinitePoolSource[]>();
  const nonFarmable: NonFarmableAction[] = [];
  const seenNonFarm = new Set<string>();

  for (const [pool, sources] of gen.positive) {
    infinite.set(pool, [...sources]);
  }

  let changed = true;
  while (changed) {
    changed = false;
    const infiniteSet = new Set(infinite.keys());
    for (const key of slice.actions) {
      const ga = graph.actions.get(key);
      if (!ga) continue;
      // Action was reachable in the slice; do not re-test absence locks against
      // final held tags (one-shots would look unavailable after granting).
      const { farmable, nonFarmable: nf } = farmability(
        graph,
        slice,
        ga,
        infiniteSet,
      );
      if (!farmable) {
        if (nf && !seenNonFarm.has(nf.actionKey + nf.reason)) {
          seenNonFarm.add(nf.actionKey + nf.reason);
          nonFarmable.push(nf);
        }
        continue;
      }
      for (const [pool, delta] of Object.entries(ga.poolResultDeltas)) {
        if (!(delta > 0)) continue;
        const src: InfinitePoolSource = {
          kind: 'farm-action',
          actionKey: ga.key,
        };
        const list = infinite.get(pool) ?? [];
        if (!list.some((s) => s.kind === 'farm-action' && s.actionKey === ga.key)) {
          list.push(src);
          infinite.set(pool, list);
          changed = true;
        }
      }
    }
  }

  const infinitePools: InfinitePoolRow[] = [...infinite.entries()].map(
    ([pool, sources]) => ({
      pool,
      infiniteOverTime: true as const,
      maxAtATime: structuralPoolMax(graph, slice.tags, pool),
      sources: Object.freeze([...sources]),
    }),
  );

  // Accumulating: any positive inflow
  const inflow = new Map<string, AccumulatingPoolSource[]>();
  for (const [pool, sources] of gen.positive) {
    inflow.set(pool, [...sources]);
  }
  const infiniteSet = new Set(infinite.keys());
  for (const key of slice.actions) {
    const ga = graph.actions.get(key);
    if (!ga) continue;
    const { farmable } = farmability(graph, slice, ga, infiniteSet);
    if (!farmable) continue;
    for (const [pool, delta] of Object.entries(ga.poolResultDeltas)) {
      if (!(delta > 0)) continue;
      const list = inflow.get(pool) ?? [];
      list.push({ kind: 'farm-action', actionKey: ga.key });
      inflow.set(pool, list);
    }
  }

  const drain = new Map<string, AccumulatingPoolSource[]>(gen.negative);
  for (const key of slice.actions) {
    const ga = graph.actions.get(key);
    if (!ga) continue;
    const { farmable } = farmability(graph, slice, ga, infiniteSet);
    if (!farmable) continue;
    for (const [pool, delta] of Object.entries(ga.poolResultDeltas)) {
      if (!(delta < 0)) continue;
      const list = drain.get(pool) ?? [];
      list.push({ kind: 'farm-action', actionKey: ga.key });
      drain.set(pool, list);
    }
  }

  const accumulatingPools: AccumulatingPoolRow[] = [...inflow.entries()].map(
    ([pool, inflowSources]) => {
      const drainSources = drain.get(pool);
      const hasDrain = Boolean(drainSources && drainSources.length > 0);
      return {
        pool,
        maxAtATime: structuralPoolMax(graph, slice.tags, pool),
        hasInflow: true as const,
        hasDrain,
        accumulatesToCapWithoutDrain: !hasDrain,
        inflowSources: Object.freeze([...inflowSources]),
        ...(hasDrain
          ? { drainSources: Object.freeze([...(drainSources ?? [])]) }
          : {}),
      };
    },
  );

  const mentioned = new Set([
    ...infinite.keys(),
    ...inflow.keys(),
  ]);
  const finiteStockpiles: FiniteStockpileRow[] = [];
  for (const tagName of slice.tags) {
    const tag = graph.tagsByName.get(tagName);
    if (!tag) continue;
    for (const effect of tag.effects) {
      if (effect.type === 'pool-max' && typeof effect.pool === 'string') {
        if (!mentioned.has(effect.pool) && !infinite.has(effect.pool)) {
          const max = structuralPoolMax(graph, slice.tags, effect.pool);
          if (
            max > 0 &&
            !finiteStockpiles.some((r) => r.pool === effect.pool)
          ) {
            finiteStockpiles.push({ pool: effect.pool, maxAtATime: max });
          }
        }
      }
    }
  }

  return {
    infinitePools: Object.freeze(infinitePools),
    accumulatingPools: Object.freeze(accumulatingPools),
    finiteStockpiles: Object.freeze(finiteStockpiles),
    nonFarmableActions: Object.freeze(nonFarmable),
  };
}

export function analyzeUpToGate(
  registry: EngineRegistry,
  gateId: string,
  options: AnalyzeOptions = {},
): UpToGateReport | undefined {
  const gate = registry.getGateDefinition(gateId);
  if (!gate) return undefined;
  const graph = buildContentGraph(registry, options);
  const before = analyzeReachableBlockingTag(graph, options, gate.tagName);
  const full = analyzeReachable(graph, options);

  const actionsGrantingGate = [...full.actions].filter((key) => {
    const ga = graph.actions.get(key);
    return ga?.grantsTags.includes(gate.tagName);
  });

  const lockedTags = [...full.tags].filter(
    (t) => t !== gate.tagName && !before.tags.has(t),
  );
  const lockedActions = [...full.actions].filter((a) => !before.actions.has(a));

  return {
    gateId,
    gateTag: gate.tagName,
    before,
    actionsGrantingGate: Object.freeze(actionsGrantingGate),
    lockedBehindGate: {
      tags: Object.freeze(lockedTags),
      actions: Object.freeze(lockedActions),
    },
    pools: analyzeInfinitePools(graph, before),
  };
}

function blockMemberTags(
  registry: EngineRegistry,
  blockId: string,
  graph: ContentGraph,
): string[] {
  const names: string[] = [];
  for (const [name, tag] of graph.tagsByName) {
    if (tag.analyzer?.blockId === blockId) names.push(name);
  }
  // Also scan entity initial tags not yet in graph map analyzer
  for (const def of registry.listEntityDefinitions()) {
    for (const tag of def.initialTags ?? []) {
      walkBlockTags(tag, blockId, names);
    }
  }
  return [...new Set(names)];
}

function walkBlockTags(tag: Tag, blockId: string, names: string[]): void {
  if (tag.analyzer?.blockId === blockId) names.push(tag.name);
  for (const child of tag.dependentTags ?? []) {
    walkBlockTags(child, blockId, names);
  }
}

function blockMemberActions(
  registry: EngineRegistry,
  blockId: string,
): AnalyzerActionKey[] {
  const keys: AnalyzerActionKey[] = [];
  for (const def of registry.listEntityDefinitions()) {
    for (const action of def.actions ?? []) {
      if (action.analyzer?.blockId === blockId) {
        keys.push(analyzerActionKey(def.id, action.name));
      }
    }
  }
  return keys;
}

export function validateBlock(
  registry: EngineRegistry,
  blockId: string,
  options: AnalyzeOptions = {},
): BlockValidation | undefined {
  const block = registry.getBlockDefinition(blockId);
  if (!block) return undefined;
  const graph = buildContentGraph(registry, options);

  const seedTags = [...(options.seedTags ?? [])];
  const seedDefs = [
    ...(options.seedEntityDefinitionIds ?? graph.entityDefinitionIds),
  ];
  if (block.entry.kind === 'tag') {
    seedTags.push(block.entry.name);
  } else if (!seedDefs.includes(block.entry.entityDefinitionId)) {
    seedDefs.push(block.entry.entityDefinitionId);
  }

  let slice = analyzeReachable(graph, {
    ...options,
    seedTags,
    seedEntityDefinitionIds: seedDefs,
  });

  if (block.entry.kind === 'action') {
    const key = analyzerActionKey(
      block.entry.entityDefinitionId,
      block.entry.actionName,
    );
    const ga = graph.actions.get(key);
    if (ga) {
      slice = analyzeReachable(graph, {
        seedTags: [...seedTags, ...ga.grantsTags],
        seedEntityDefinitionIds: [...seedDefs, ...ga.spawnsDefs],
        tagCatalog: options.tagCatalog,
      });
      (slice.actions as Set<AnalyzerActionKey>).add(key);
    }
  }

  const memberTags = blockMemberTags(registry, blockId, graph);
  const memberActions = blockMemberActions(registry, blockId);
  const entryActionKey =
    block.entry.kind === 'action'
      ? analyzerActionKey(
          block.entry.entityDefinitionId,
          block.entry.actionName,
        )
      : undefined;

  const unreachableMembers: string[] = [];
  for (const t of memberTags) {
    const tag = graph.tagsByName.get(t);
    if (tag?.analyzer?.blockRole === 'summary') continue;
    if (!slice.tags.has(t)) unreachableMembers.push(`tag:${t}`);
  }
  for (const a of memberActions) {
    if (!slice.actions.has(a) && a !== entryActionKey) {
      unreachableMembers.push(`action:${a}`);
    }
  }

  const entryTag = block.entry.kind === 'tag' ? block.entry.name : undefined;
  const grantedByMembers = new Set<string>();
  if (entryTag) grantedByMembers.add(entryTag);
  for (const a of memberActions) {
    for (const t of graph.actions.get(a)?.grantsTags ?? []) {
      grantedByMembers.add(t);
    }
  }
  if (entryActionKey) {
    for (const t of graph.actions.get(entryActionKey)?.grantsTags ?? []) {
      grantedByMembers.add(t);
    }
  }

  const externalDeps = new Set<string>();
  for (const a of memberActions) {
    const ga = graph.actions.get(a);
    if (!ga) continue;
    for (const t of ga.requiresTagsPresent) {
      if (!grantedByMembers.has(t) && !(options.seedTags ?? []).includes(t)) {
        externalDeps.add(t);
      }
    }
  }

  const missingMembers: string[] = [];
  if (block.summaryTag && !graph.tagsByName.has(block.summaryTag)) {
    missingMembers.push(`summaryTag:${block.summaryTag}`);
  }

  const ok =
    unreachableMembers.length === 0 &&
    externalDeps.size === 0 &&
    missingMembers.length === 0;

  return {
    blockId,
    ok,
    externalDeps: Object.freeze([...externalDeps]),
    missingMembers: Object.freeze(missingMembers),
    unreachableMembers: Object.freeze(unreachableMembers),
  };
}

export function annotateBlock(
  registry: EngineRegistry,
  blockId: string,
  options: AnalyzeOptions = {},
): BlockAnnotation | undefined {
  const block = registry.getBlockDefinition(blockId);
  if (!block) return undefined;
  const graph = buildContentGraph(registry, options);
  const validation = validateBlock(registry, blockId, options)!;

  const memberTags = blockMemberTags(registry, blockId, graph);
  const memberActions = blockMemberActions(registry, blockId);

  const netGrantTags = new Set<string>();
  const netStat: Record<string, number> = {};
  const netPoolMax: Record<string, number> = {};

  for (const name of memberTags) {
    const tag = graph.tagsByName.get(name);
    if (!tag) continue;
    for (const effect of tag.effects) {
      if (effect.type === 'stat' && typeof effect.stat === 'string') {
        netStat[effect.stat] = (netStat[effect.stat] ?? 0) + effect.strength;
      }
      if (effect.type === 'pool-max' && typeof effect.pool === 'string') {
        netPoolMax[effect.pool] =
          (netPoolMax[effect.pool] ?? 0) + effect.strength;
      }
    }
  }
  for (const key of memberActions) {
    const ga = graph.actions.get(key);
    if (!ga) continue;
    for (const t of ga.grantsTags) netGrantTags.add(t);
  }

  let summaryMismatch: string | undefined;
  const summaryPresent = Boolean(
    block.summaryTag && graph.tagsByName.has(block.summaryTag),
  );
  if (block.summaryTag && summaryPresent) {
    const summary = graph.tagsByName.get(block.summaryTag)!;
    const summaryStat: Record<string, number> = {};
    const summaryPool: Record<string, number> = {};
    for (const effect of summary.effects) {
      if (effect.type === 'stat' && typeof effect.stat === 'string') {
        summaryStat[effect.stat] =
          (summaryStat[effect.stat] ?? 0) + effect.strength;
      }
      if (effect.type === 'pool-max' && typeof effect.pool === 'string') {
        summaryPool[effect.pool] =
          (summaryPool[effect.pool] ?? 0) + effect.strength;
      }
    }
    const keys = new Set([
      ...Object.keys(netStat),
      ...Object.keys(summaryStat),
      ...Object.keys(netPoolMax),
      ...Object.keys(summaryPool),
    ]);
    for (const k of keys) {
      if ((netStat[k] ?? 0) !== (summaryStat[k] ?? 0)) {
        summaryMismatch = `stat:${k}`;
        break;
      }
      if ((netPoolMax[k] ?? 0) !== (summaryPool[k] ?? 0)) {
        summaryMismatch = `pool-max:${k}`;
        break;
      }
    }
  }

  const seedTags = [...(options.seedTags ?? [])];
  const seedDefs = [
    ...(options.seedEntityDefinitionIds ?? graph.entityDefinitionIds),
  ];
  if (block.entry.kind === 'tag') seedTags.push(block.entry.name);
  let slice = analyzeReachable(graph, {
    ...options,
    seedTags,
    seedEntityDefinitionIds: seedDefs,
  });
  if (block.entry.kind === 'action') {
    const key = analyzerActionKey(
      block.entry.entityDefinitionId,
      block.entry.actionName,
    );
    const ga = graph.actions.get(key);
    if (ga) {
      slice = analyzeReachable(graph, {
        seedTags: [...slice.tags, ...ga.grantsTags],
        seedEntityDefinitionIds: [
          ...slice.entityDefs,
          ...ga.spawnsDefs,
          block.entry.entityDefinitionId,
        ],
        tagCatalog: options.tagCatalog,
      });
    }
  }

  return {
    blockId,
    entry: block.entry,
    members: {
      tags: Object.freeze(memberTags),
      actions: Object.freeze(memberActions),
    },
    netGrantTags: Object.freeze([...netGrantTags]),
    netStat: Object.freeze({ ...netStat }),
    netPoolMax: Object.freeze({ ...netPoolMax }),
    summaryTag: block.summaryTag,
    summaryPresent,
    ...(summaryMismatch ? { summaryMismatch } : {}),
    pools: analyzeInfinitePools(graph, slice),
    validation,
  };
}
