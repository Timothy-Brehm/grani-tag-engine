/**
 * Types membership and matching for actions, pools, and stats.
 * See docs/design/action-types.md.
 */

import type { CatalogRegistryView } from './catalog';

export type ActionMatchFilter = {
  readonly actionName?: string;
  readonly actionTypes?: readonly string[];
};

export type ActionMatchTarget = {
  readonly name: string;
  readonly types?: readonly string[];
};

/** Dedupe type strings; empty/whitespace dropped. */
export function normalizeTypes(
  types: readonly string[] | undefined,
): readonly string[] {
  if (!types || types.length === 0) {
    return Object.freeze([]);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of types) {
    const t = typeof raw === 'string' ? raw.trim() : '';
    if (!t || seen.has(t)) {
      continue;
    }
    seen.add(t);
    out.push(t);
  }
  return Object.freeze(out);
}

/** @deprecated Prefer {@link normalizeTypes}. */
export const normalizeActionTypes = normalizeTypes;

/**
 * True when the member has **every** filter Type (AND within the filter list).
 * `undefined` filter ⇒ no Types constraint. Empty filter list ⇒ never matches.
 * Separate tag effects still stack (OR across effects).
 */
export function typesIntersect(
  filterTypes: readonly string[] | undefined,
  memberTypes: readonly string[] | undefined,
): boolean {
  if (filterTypes === undefined) {
    return true;
  }
  if (filterTypes.length === 0) {
    return false;
  }
  const set = new Set(memberTypes ?? []);
  for (const t of filterTypes) {
    if (!set.has(t)) {
      return false;
    }
  }
  return true;
}

function nameMatches(
  filterName: string | undefined,
  actionName: string,
): boolean {
  return (
    filterName === undefined ||
    filterName === '*' ||
    filterName === actionName
  );
}

/**
 * True when the filter matches the action.
 * Name-only / types-only / both (AND) / neither (matches all).
 */
export function actionMatchesFilter(
  filter: ActionMatchFilter,
  action: ActionMatchTarget,
): boolean {
  const hasNameFilter =
    filter.actionName !== undefined && filter.actionName !== '';
  const hasTypesFilter = filter.actionTypes !== undefined;

  if (!hasNameFilter && !hasTypesFilter) {
    return true;
  }

  const nameOk = hasNameFilter
    ? nameMatches(filter.actionName, action.name)
    : true;
  const typesOk = hasTypesFilter
    ? typesIntersect(filter.actionTypes, action.types)
    : true;

  return nameOk && typesOk;
}

export function poolCatalogTypes(
  registry: CatalogRegistryView | undefined,
  poolId: string,
): readonly string[] {
  return normalizeTypes(registry?.getPoolDefinition?.(poolId)?.types);
}

export function statCatalogTypes(
  registry: CatalogRegistryView | undefined,
  statId: string,
): readonly string[] {
  return normalizeTypes(registry?.getStatDefinition?.(statId)?.types);
}

/** Pool id matches an optional exact id and/or poolTypes filter. */
export function poolMatchesTarget(
  registry: CatalogRegistryView | undefined,
  poolId: string,
  filter: { readonly pool?: string; readonly poolTypes?: readonly string[] },
): boolean {
  const hasId = typeof filter.pool === 'string' && filter.pool.length > 0;
  const hasTypes = filter.poolTypes !== undefined;
  if (!hasId && !hasTypes) {
    return false;
  }
  const idOk = hasId ? filter.pool === poolId : true;
  const typesOk = hasTypes
    ? typesIntersect(filter.poolTypes, poolCatalogTypes(registry, poolId))
    : true;
  return idOk && typesOk;
}

/** Stat id matches an optional exact id and/or statTypes filter. */
export function statMatchesTarget(
  registry: CatalogRegistryView | undefined,
  statId: string,
  filter: { readonly stat?: string; readonly statTypes?: readonly string[] },
): boolean {
  const hasId = typeof filter.stat === 'string' && filter.stat.length > 0;
  const hasTypes = filter.statTypes !== undefined;
  if (!hasId && !hasTypes) {
    return false;
  }
  const idOk = hasId ? filter.stat === statId : true;
  const typesOk = hasTypes
    ? typesIntersect(filter.statTypes, statCatalogTypes(registry, statId))
    : true;
  return idOk && typesOk;
}

/** Pool ids in the catalog that match poolTypes (and optional exact pool). */
export function listPoolsMatchingTypes(
  registry: CatalogRegistryView | undefined,
  filter: { readonly pool?: string; readonly poolTypes?: readonly string[] },
): string[] {
  if (!registry?.listPoolDefinitions) {
    return filter.pool ? [filter.pool] : [];
  }
  const out: string[] = [];
  for (const def of registry.listPoolDefinitions()) {
    if (poolMatchesTarget(registry, def.id, filter)) {
      out.push(def.id);
    }
  }
  return out;
}

export function listStatsMatchingTypes(
  registry: CatalogRegistryView | undefined,
  filter: { readonly stat?: string; readonly statTypes?: readonly string[] },
): string[] {
  if (!registry?.listStatDefinitions) {
    return filter.stat ? [filter.stat] : [];
  }
  const out: string[] = [];
  for (const def of registry.listStatDefinitions()) {
    if (statMatchesTarget(registry, def.id, filter)) {
      out.push(def.id);
    }
  }
  return out;
}
