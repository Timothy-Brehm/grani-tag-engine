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
   * Default when omitted: `'selectable'` (Best Only off).
   */
  readonly mode?: 'best-only' | 'selectable';
};

export type PoolDefinition = CatalogMeta;

export type StatDefinition = CatalogMeta;

export type SlotMode = 'best-only' | 'selectable';

export function slotDefinitionMode(def: SlotDefinition | undefined): SlotMode {
  return def?.mode === 'best-only' ? 'best-only' : 'selectable';
}

export type CatalogWarningKind = 'slot' | 'pool' | 'stat';

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
 * Soft validation: report referenced slot/pool/stat ids with no catalog entry.
 * Walks in-play entities and, when available, registered entity definitions.
 * Does not affect runtime; hosts may show these in designer UI.
 */
export function collectCatalogWarnings(
  registry: CatalogRegistryView,
  state: EngineState,
): CatalogWarning[] {
  const warnings: CatalogWarning[] = [];
  const seen = new Set<string>();

  const defs = registry.listEntityDefinitions?.() ?? [];
  for (const def of defs) {
    for (const tag of def.initialTags ?? []) {
      walkTagRefs(
        tag,
        `definition:${def.id}`,
        registry,
        warnings,
        seen,
        new Set(),
      );
    }
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
    for (const tag of entity.tags.list()) {
      walkTagRefs(tag, `entity:${entity.id}`, registry, warnings, seen, new Set());
    }
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

  return warnings;
}
