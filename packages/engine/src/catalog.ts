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
export type PoolDefinition = CatalogMeta;

/**
 * Stat catalog entry. Same `label` / `description` UI pattern as pools.
 */
export type StatDefinition = CatalogMeta;

export type SlotMode = 'best-only' | 'selectable';

/** Missing or incomplete defs resolve to selectable. */
export function slotDefinitionMode(def: SlotDefinition | undefined): SlotMode {
  return def?.mode === 'best-only' ? 'best-only' : 'selectable';
}

export type CatalogWarningKind = 'slot' | 'pool' | 'stat' | 'tier' | 'share';

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
      (effect.type === 'pool-max' || effect.type === 'generate-pool') &&
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

/**
 * Soft validation: report referenced slot/pool/stat ids with no catalog entry,
 * plus tier consistency within a slot. Walks in-play entities and, when
 * available, registered entity definitions. Does not affect runtime.
 */
export function collectCatalogWarnings(
  registry: CatalogRegistryView,
  state: EngineState,
): CatalogWarning[] {
  const warnings: CatalogWarning[] = [];
  const seen = new Set<string>();

  const defs = registry.listEntityDefinitions?.() ?? [];
  for (const def of defs) {
    const initialTags = def.initialTags ?? [];
    for (const tag of initialTags) {
      walkTagRefs(
        tag,
        `definition:${def.id}`,
        registry,
        warnings,
        seen,
        new Set(),
      );
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
      walkTagRefs(tag, `entity:${entity.id}`, registry, warnings, seen, new Set());
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

  return warnings;
}
