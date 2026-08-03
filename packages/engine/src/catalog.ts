import type { NoveltyAck } from './novelty-types';
import type { EngineState } from './state';
import type { Tag } from './tag';

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
   */
  readonly capacityStep?: number;
  /**
   * Host/UI quantum for display selectors. Defaults to {@link capacityStep}.
   */
  readonly displayStep?: number;
};

/**
 * Stat catalog entry. Same `label` / `description` UI pattern as pools.
 */
export type StatDefinition = CatalogMeta;

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
  | 'capacity-step';

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
  /**
   * Optional: walk authored entity definitions (initial tags/pools) for soft
   * validation. `EngineRegistry` provides this.
   */
  listEntityDefinitions?(): readonly {
    readonly id: string;
    readonly initialTags?: readonly Tag[];
    readonly initialPools?: Readonly<Record<string, number>>;
  }[];
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
        effect.type === 'pool-link' ||
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

function outboundStatCoeff(effect: Tag['effects'][number]): number {
  if (typeof effect.amount === 'number' && Number.isFinite(effect.amount)) {
    return effect.amount;
  }
  return 1;
}

function walkCapacityStepWarnings(
  tag: Tag,
  source: string,
  registry: CatalogRegistryView,
  warnings: CatalogWarning[],
  seen: Set<string>,
): void {
  const check = (poolId: string, amount: number, detail: string) => {
    const step = registry.getPoolDefinition(poolId)?.capacityStep;
    if (typeof step !== 'number' || !(step > 0) || !Number.isFinite(step)) {
      return;
    }
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
    if (effect.type === 'stat') {
      const coeff = outboundStatCoeff(effect);
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
    if (effect.type === 'pool-link') {
      const coeff = effectAddAmount(effect);
      if (typeof effect.toPoolMax === 'string' && effect.toPoolMax) {
        check(effect.toPoolMax, coeff, 'pool-link.toPoolMax');
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
    if (effect.type === 'stat' && typeof effect.stat === 'string') {
      const from = `stat:${effect.stat}`;
      if (typeof effect.toPoolMax === 'string' && effect.toPoolMax) {
        addCrossLinkEdge(edges, from, `pool:${effect.toPoolMax}`);
      }
      if (typeof effect.toGeneratePool === 'string' && effect.toGeneratePool) {
        addCrossLinkEdge(edges, from, `pool:${effect.toGeneratePool}`);
      }
    }
    if (effect.type === 'pool-link' && typeof effect.pool === 'string') {
      const from = `pool:${effect.pool}`;
      if (typeof effect.toStat === 'string' && effect.toStat) {
        addCrossLinkEdge(edges, from, `stat:${effect.toStat}`);
      }
      if (typeof effect.toPoolMax === 'string' && effect.toPoolMax) {
        addCrossLinkEdge(edges, from, `pool:${effect.toPoolMax}`);
      }
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

  return warnings;
}
