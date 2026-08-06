import type { NoveltyAck } from './novelty-types';
import type { EngineState } from './state';
import type { Tag } from './tag';
import { DEFAULT_CAPACITY_STEP } from './quantity';

export { DEFAULT_CAPACITY_STEP, DEFAULT_DISPLAY_STEP } from './quantity';

/** Shared optional presentation for catalog definitions. */
export type CatalogMeta = {
  readonly id: string;
  readonly label?: string;
  readonly description?: string;
  readonly novelty?: NoveltyAck;
};

export type SlotDefinition = CatalogMeta & {
  /**
   * Resolution mode for tags that reference this slot.
   * Default when omitted (or when no SlotDefinition is registered): `'selectable'`.
   */
  readonly mode?: 'best-only' | 'selectable';
  /**
   * When true, a given holding `(holderEntityId, tagName)` may be selected by
   * at most one slot owner worldwide for this slot id.
   */
  readonly cannotShareTag?: boolean;
};

/**
 * Pool catalog entry. Prefer authored `label` / `description` for UI
 * (spaces, special characters, alternate capitalization)—do not derive display
 * text by stripping id prefixes.
 */
export type PoolDefinition = CatalogMeta & {
  /**
   * Gameplay quantum: floor raw Available/Max to this step for requirements,
   * spend affordance, and other gates. e.g. `1` = wholes, `0.1` = tenths.
   * Default when omitted: {@link DEFAULT_CAPACITY_STEP} (`0.01`).
   */
  readonly capacityStep?: number;
  /**
   * Host/UI quantum for display selectors.
   * Default when omitted: {@link DEFAULT_DISPLAY_STEP} (`1`).
   */
  readonly displayStep?: number;
  /**
   * Arbitrary Types for improvement matching (e.g. `Liquid`, `Food`).
   * See docs/design/action-types.md.
   */
  readonly types?: readonly string[];
};

/**
 * Stat catalog entry. Same `label` / `description` UI pattern as pools.
 */
export type StatDefinition = CatalogMeta & {
  /** Arbitrary Types (e.g. `Physical`). See docs/design/action-types.md. */
  readonly types?: readonly string[];
};

export type SlotMode = 'best-only' | 'selectable';

/** Missing or incomplete defs resolve to selectable. */
export function slotDefinitionMode(def: SlotDefinition | undefined): SlotMode {
  return def?.mode === 'best-only' ? 'best-only' : 'selectable';
}

export type CatalogWarningKind =
  | 'slot'
  | 'pool'
  | 'stat'
  | 'tier'
  | 'share'
  | 'cycle'
  | 'capacity-step'
  | 'gate'
  | 'block';

export type CatalogWarning = {
  readonly kind: CatalogWarningKind;
  readonly id: string;
  /** Where the id was referenced (entity id, tag name, etc.). */
  readonly source: string;
};

export type CatalogRegistryView = {
  getSlotDefinition(id: string): SlotDefinition | undefined;
  getPoolDefinition(id: string): PoolDefinition | undefined;
  getStatDefinition(id: string): StatDefinition | undefined;
  listPoolDefinitions?(): readonly PoolDefinition[];
  listStatDefinitions?(): readonly StatDefinition[];
  getGateDefinition?(id: string): import('./tools/analyzer/types').GateDefinition | undefined;
  getBlockDefinition?(id: string): import('./tools/analyzer/types').BlockDefinition | undefined;
  /**
   * Optional: walk authored entity definitions (initial tags/pools) for soft
   * validation. `EngineRegistry` provides this.
   */
  listEntityDefinitions?(): readonly {
    readonly id: string;
    readonly initialTags?: readonly Tag[];
    readonly initialPools?: Readonly<Record<string, number>>;
    readonly actions?: readonly {
      readonly name: string;
      readonly analyzer?: import('./tools/analyzer/types').AnalyzerContentMeta;
      readonly requiredEffects?: readonly { readonly type: string; readonly name?: string }[];
      readonly optionalEffects?: readonly { readonly type: string; readonly name?: string }[];
      readonly requirements?: readonly { readonly type: string }[];
    }[];
  }[];
  listGateDefinitions?(): readonly import('./tools/analyzer/types').GateDefinition[];
  listBlockDefinitions?(): readonly import('./tools/analyzer/types').BlockDefinition[];
};

function pushUnique(
  warnings: CatalogWarning[],
  seen: Set<string>,
  warning: CatalogWarning,
): void {
  const key = `${warning.kind}:${warning.id}:${warning.source}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  warnings.push(warning);
}

function walkTagRefs(
  tag: Tag,
  source: string,
  registry: CatalogRegistryView,
  warnings: CatalogWarning[],
  seen: Set<string>,
  visiting: Set<string>,
): void {
  if (visiting.has(tag.name)) {
    return;
  }
  visiting.add(tag.name);

  if (typeof tag.slot === 'string' && tag.slot) {
    if (!registry.getSlotDefinition(tag.slot)) {
      pushUnique(warnings, seen, {
        kind: 'slot',
        id: tag.slot,
        source: `${source}#${tag.name}`,
      });
    }
  }

  const meta = tag.analyzer;
  if (meta?.blockId && registry.getBlockDefinition) {
    if (!registry.getBlockDefinition(meta.blockId)) {
      pushUnique(warnings, seen, {
        kind: 'block',
        id: meta.blockId,
        source: `${source}#${tag.name}`,
      });
    }
  }
  if (meta?.gateId && registry.getGateDefinition) {
    if (!registry.getGateDefinition(meta.gateId)) {
      pushUnique(warnings, seen, {
        kind: 'gate',
        id: meta.gateId,
        source: `${source}#${tag.name}`,
      });
    }
  }

  for (const effect of tag.effects) {
    if (effect.type === 'stat' && typeof effect.stat === 'string' && effect.stat) {
      if (!registry.getStatDefinition(effect.stat)) {
        pushUnique(warnings, seen, {
          kind: 'stat',
          id: effect.stat,
          source: `${source}#${tag.name}`,
        });
      }
    }
    if (
      (effect.type === 'pool-max' ||
        effect.type === 'generate-pool' ||
        effect.type === 'reserve-pool') &&
      typeof effect.pool === 'string' &&
      effect.pool
    ) {
      if (!registry.getPoolDefinition(effect.pool)) {
        pushUnique(warnings, seen, {
          kind: 'pool',
          id: effect.pool,
          source: `${source}#${tag.name}`,
        });
      }
    }
    if (effect.type === 'cross-link') {
      if (typeof effect.fromStat === 'string' && effect.fromStat) {
        if (!registry.getStatDefinition(effect.fromStat)) {
          pushUnique(warnings, seen, {
            kind: 'stat',
            id: effect.fromStat,
            source: `${source}#${tag.name}.fromStat`,
          });
        }
      }
      if (typeof effect.fromPool === 'string' && effect.fromPool) {
        if (!registry.getPoolDefinition(effect.fromPool)) {
          pushUnique(warnings, seen, {
            kind: 'pool',
            id: effect.fromPool,
            source: `${source}#${tag.name}.fromPool`,
          });
        }
      }
      for (const field of ['toPoolMax', 'toGeneratePool'] as const) {
        const target = effect[field];
        if (typeof target === 'string' && target) {
          if (!registry.getPoolDefinition(target)) {
            pushUnique(warnings, seen, {
              kind: 'pool',
              id: target,
              source: `${source}#${tag.name}.${field}`,
            });
          }
        }
      }
      if (typeof effect.toStat === 'string' && effect.toStat) {
        if (!registry.getStatDefinition(effect.toStat)) {
          pushUnique(warnings, seen, {
            kind: 'stat',
            id: effect.toStat,
            source: `${source}#${tag.name}.toStat`,
          });
        }
      }
    }
  }

  for (const child of tag.dependentTags ?? []) {
    walkTagRefs(child, source, registry, warnings, seen, visiting);
  }
  visiting.delete(tag.name);
}

/**
 * Soft tier checks for tags that share a slot id:
 * - duplicate non-zero `tier` values
 * - mix of `tier: 0` with non-zero tiers
 */
function walkSlotTierWarnings(
  tags: readonly Tag[],
  source: string,
  warnings: CatalogWarning[],
  seen: Set<string>,
): void {
  const bySlot = new Map<string, Tag[]>();
  for (const tag of tags) {
    if (!tag.slot) {
      continue;
    }
    const list = bySlot.get(tag.slot) ?? [];
    list.push(tag);
    bySlot.set(tag.slot, list);
  }

  for (const [slotId, slotted] of bySlot) {
    const nonzeroTiers = new Map<number, string[]>();
    let hasZero = false;
    let hasNonzero = false;

    for (const tag of slotted) {
      if (typeof tag.tier !== 'number' || !Number.isFinite(tag.tier)) {
        continue;
      }
      if (tag.tier === 0) {
        hasZero = true;
        continue;
      }
      hasNonzero = true;
      const names = nonzeroTiers.get(tag.tier) ?? [];
      names.push(tag.name);
      nonzeroTiers.set(tag.tier, names);
    }

    if (hasZero && hasNonzero) {
      pushUnique(warnings, seen, {
        kind: 'tier',
        id: slotId,
        source: `${source}#slot:${slotId}:zero-mixed`,
      });
    }

    for (const [tier, names] of nonzeroTiers) {
      if (names.length > 1) {
        pushUnique(warnings, seen, {
          kind: 'tier',
          id: slotId,
          source: `${source}#slot:${slotId}:tier-${tier}:[${names.join(',')}]`,
        });
      }
    }
  }
}

function effectAddAmount(effect: Tag['effects'][number]): number {
  if (typeof effect.amount === 'number' && Number.isFinite(effect.amount)) {
    return effect.amount;
  }
  return effect.strength;
}

function walkCapacityStepWarnings(
  tag: Tag,
  source: string,
  registry: CatalogRegistryView,
  warnings: CatalogWarning[],
  seen: Set<string>,
): void {
  const check = (poolId: string, amount: number, detail: string) => {
    const authored = registry.getPoolDefinition(poolId)?.capacityStep;
    const step =
      typeof authored === 'number' && authored > 0 && Number.isFinite(authored)
        ? authored
        : DEFAULT_CAPACITY_STEP;
    if (!(amount < step)) {
      return;
    }
    pushUnique(warnings, seen, {
      kind: 'capacity-step',
      id: poolId,
      source: `${source}#${tag.name}:${detail}`,
    });
  };

  for (const effect of tag.effects) {
    if (effect.type === 'pool-max' && typeof effect.pool === 'string') {
      check(effect.pool, effect.strength, 'pool-max');
    }
    if (effect.type === 'generate-pool' && typeof effect.pool === 'string') {
      check(effect.pool, effectAddAmount(effect), 'generate-pool');
    }
    if (effect.type === 'cross-link') {
      const coeff = effectAddAmount(effect);
      if (typeof effect.toPoolMax === 'string' && effect.toPoolMax) {
        check(
          effect.toPoolMax,
          coeff,
          effect.productTag ? 'productTag' : 'toPoolMax',
        );
      }
      if (typeof effect.toGeneratePool === 'string' && effect.toGeneratePool) {
        check(effect.toGeneratePool, coeff, 'toGeneratePool');
      }
    }
  }

  for (const child of tag.dependentTags ?? []) {
    walkCapacityStepWarnings(child, source, registry, warnings, seen);
  }
}

function addCrossLinkEdge(
  edges: Map<string, Set<string>>,
  from: string,
  to: string,
): void {
  const set = edges.get(from) ?? new Set<string>();
  set.add(to);
  edges.set(from, set);
}

function collectCrossLinkEdgesFromTag(
  tag: Tag,
  edges: Map<string, Set<string>>,
): void {
  for (const effect of tag.effects) {
    if (effect.type !== 'cross-link') {
      continue;
    }
    let from: string | undefined;
    if (typeof effect.fromStat === 'string' && effect.fromStat) {
      from = `stat:${effect.fromStat}`;
    } else if (typeof effect.fromPool === 'string' && effect.fromPool) {
      from = `pool:${effect.fromPool}`;
    }
    if (!from) {
      continue;
    }
    if (typeof effect.toStat === 'string' && effect.toStat) {
      addCrossLinkEdge(edges, from, `stat:${effect.toStat}`);
    }
    if (typeof effect.toPoolMax === 'string' && effect.toPoolMax) {
      addCrossLinkEdge(edges, from, `pool:${effect.toPoolMax}`);
    }
    if (typeof effect.toGeneratePool === 'string' && effect.toGeneratePool) {
      addCrossLinkEdge(edges, from, `pool:${effect.toGeneratePool}`);
    }
  }
  for (const child of tag.dependentTags ?? []) {
    collectCrossLinkEdgesFromTag(child, edges);
  }
}

/** DFS cycle detection; pushes one warning per cycle node found. */
function walkCycleWarnings(
  edges: Map<string, Set<string>>,
  warnings: CatalogWarning[],
  seen: Set<string>,
): void {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  const visit = (node: string): void => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const idx = stack.indexOf(next);
        const path = [...stack.slice(idx), next].join('→');
        pushUnique(warnings, seen, {
          kind: 'cycle',
          id: next,
          source: path,
        });
      } else if (c === WHITE) {
        visit(next);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  };

  for (const node of edges.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      visit(node);
    }
  }
}

/**
 * Soft validation: report referenced slot/pool/stat ids with no catalog entry,
 * tier consistency, cross-link cycles, and sub-capacityStep adds. Walks in-play
 * entities and, when available, registered entity definitions. Does not affect
 * runtime.
 */
export function collectCatalogWarnings(
  registry: CatalogRegistryView,
  state: EngineState,
): CatalogWarning[] {
  const warnings: CatalogWarning[] = [];
  const seen = new Set<string>();
  const crossEdges = new Map<string, Set<string>>();

  const visitTag = (tag: Tag, source: string) => {
    walkTagRefs(tag, source, registry, warnings, seen, new Set());
    walkCapacityStepWarnings(tag, source, registry, warnings, seen);
    collectCrossLinkEdgesFromTag(tag, crossEdges);
  };

  const defs = registry.listEntityDefinitions?.() ?? [];
  for (const def of defs) {
    const initialTags = def.initialTags ?? [];
    for (const tag of initialTags) {
      visitTag(tag, `definition:${def.id}`);
    }
    walkSlotTierWarnings(
      initialTags,
      `definition:${def.id}`,
      warnings,
      seen,
    );
    for (const pool of Object.keys(def.initialPools ?? {})) {
      if (!registry.getPoolDefinition(pool)) {
        pushUnique(warnings, seen, {
          kind: 'pool',
          id: pool,
          source: `definition:${def.id}.initialPools`,
        });
      }
    }
    for (const action of def.actions ?? []) {
      const meta = action.analyzer;
      if (meta?.blockId && registry.getBlockDefinition) {
        if (!registry.getBlockDefinition(meta.blockId)) {
          pushUnique(warnings, seen, {
            kind: 'block',
            id: meta.blockId,
            source: `definition:${def.id}.action:${action.name}`,
          });
        }
      }
      if (meta?.gateId && registry.getGateDefinition) {
        if (!registry.getGateDefinition(meta.gateId)) {
          pushUnique(warnings, seen, {
            kind: 'gate',
            id: meta.gateId,
            source: `definition:${def.id}.action:${action.name}`,
          });
        }
      }
    }
  }

  for (const entity of state.entities.values()) {
    const held = entity.tags.list();
    for (const tag of held) {
      visitTag(tag, `entity:${entity.id}`);
    }
    walkSlotTierWarnings(held, `entity:${entity.id}`, warnings, seen);
    for (const pool of Object.keys(entity.pools)) {
      if (!registry.getPoolDefinition(pool)) {
        pushUnique(warnings, seen, {
          kind: 'pool',
          id: pool,
          source: `entity:${entity.id}.pools`,
        });
      }
    }
  }

  const assigneesByHolding = new Map<string, string[]>();
  for (const entity of state.entities.values()) {
    for (const [slotId, ref] of Object.entries(entity.slotSelections)) {
      if (!registry.getSlotDefinition(slotId)?.cannotShareTag) {
        continue;
      }
      const key = `${slotId}::${ref.holderEntityId}::${ref.tagName}`;
      const owners = assigneesByHolding.get(key) ?? [];
      owners.push(entity.id);
      assigneesByHolding.set(key, owners);
    }
  }
  for (const [key, owners] of assigneesByHolding) {
    if (owners.length > 1) {
      const slotId = key.split('::')[0] ?? key;
      pushUnique(warnings, seen, {
        kind: 'share',
        id: slotId,
        source: `holding:${key};owners:[${owners.join(',')}]`,
      });
    }
  }

  walkCycleWarnings(crossEdges, warnings, seen);

  for (const gate of registry.listGateDefinitions?.() ?? []) {
    // Soft: gate tagName should appear somewhere in defs/catalog walk; warn if never seen as tag name in defs.
    let found = false;
    for (const def of defs) {
      for (const tag of def.initialTags ?? []) {
        if (tag.name === gate.tagName || tagHasName(tag, gate.tagName)) {
          found = true;
          break;
        }
      }
      if (found) break;
      for (const action of def.actions ?? []) {
        for (const effect of [
          ...(action.requiredEffects ?? []),
          ...(action.optionalEffects ?? []),
        ]) {
          if (effect.type === 'grant-tag' && effect.name === gate.tagName) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) {
      pushUnique(warnings, seen, {
        kind: 'gate',
        id: gate.id,
        source: `gate.tagName:${gate.tagName}`,
      });
    }
  }

  for (const block of registry.listBlockDefinitions?.() ?? []) {
    const entry = block.entry;
    if (entry.kind === 'tag') {
      const members = collectBlockMemberRefs(registry, block.id);
      const entryTagged = members.tags.some(
        (t) => t.name === entry.name && t.analyzer?.blockRole === 'entry',
      );
      if (!entryTagged && !members.tags.some((t) => t.name === entry.name)) {
        pushUnique(warnings, seen, {
          kind: 'block',
          id: block.id,
          source: `entry.tag:${entry.name}`,
        });
      }
    } else {
      const def = defs.find((d) => d.id === entry.entityDefinitionId);
      const action = def?.actions?.find((a) => a.name === entry.actionName);
      if (!action) {
        pushUnique(warnings, seen, {
          kind: 'block',
          id: block.id,
          source: `entry.action:${entry.entityDefinitionId}::${entry.actionName}`,
        });
      } else if (action) {
        const meta = action.analyzer;
        if (
          meta?.blockId === block.id &&
          meta.blockRole &&
          meta.blockRole !== 'entry'
        ) {
          pushUnique(warnings, seen, {
            kind: 'block',
            id: block.id,
            source: `entry.role-mismatch:${entry.actionName}`,
          });
        }
      }
    }
    if (block.summaryTag) {
      const members = collectBlockMemberRefs(registry, block.id);
      if (!members.tags.some((t) => t.name === block.summaryTag)) {
        pushUnique(warnings, seen, {
          kind: 'block',
          id: block.id,
          source: `summaryTag:${block.summaryTag}`,
        });
      }
    }
  }

  return warnings;
}

function tagHasName(tag: Tag, name: string): boolean {
  if (tag.name === name) return true;
  for (const child of tag.dependentTags ?? []) {
    if (tagHasName(child, name)) return true;
  }
  return false;
}

function collectBlockMemberRefs(
  registry: CatalogRegistryView,
  blockId: string,
): {
  tags: Tag[];
  actions: { name: string; analyzer?: import('./tools/analyzer/types').AnalyzerContentMeta }[];
} {
  const tags: Tag[] = [];
  const actions: {
    name: string;
    analyzer?: import('./tools/analyzer/types').AnalyzerContentMeta;
  }[] = [];
  for (const def of registry.listEntityDefinitions?.() ?? []) {
    for (const tag of def.initialTags ?? []) {
      collectTagsWithBlock(tag, blockId, tags);
    }
    for (const action of def.actions ?? []) {
      if (action.analyzer?.blockId === blockId) {
        actions.push(action);
      }
    }
  }
  return { tags, actions };
}

function collectTagsWithBlock(tag: Tag, blockId: string, out: Tag[]): void {
  if (tag.analyzer?.blockId === blockId) {
    out.push(tag);
  }
  for (const child of tag.dependentTags ?? []) {
    collectTagsWithBlock(child, blockId, out);
  }
}
