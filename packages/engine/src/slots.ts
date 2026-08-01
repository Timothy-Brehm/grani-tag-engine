import type { CatalogRegistryView, SlotMode } from './catalog';
import { slotDefinitionMode } from './catalog';
import type { EntityInstance } from './entity';
import type { Tag } from './tag';
import { createTag } from './tag';

export type SlotCatalog = CatalogRegistryView;

/** Score for Best Only: sum of abs(strength) on the tag's own effects. */
export function tagBestOnlyScore(tag: Tag): number {
  let total = 0;
  for (const effect of tag.effects) {
    total += Math.abs(effect.strength);
  }
  return total;
}

/**
 * Effective best-only tier; omitted ⇒ lowest priority.
 * Uses a finite sentinel so omitted−omitted sorts do not become NaN.
 */
export function tagBestOnlyTier(tag: Tag): number {
  if (typeof tag.tier === 'number' && Number.isFinite(tag.tier)) {
    return tag.tier;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function listHeldTagsInSlot(
  entity: EntityInstance,
  slotId: string,
): readonly Tag[] {
  return entity.tags.list().filter((tag) => tag.slot === slotId);
}

export function entityHasHeldSlot(
  entity: EntityInstance,
  slotId: string,
): boolean {
  return listHeldTagsInSlot(entity, slotId).length > 0;
}

export function entityHasHeldTag(
  entity: EntityInstance,
  tagName: string,
): boolean {
  return entity.tags.has(tagName);
}

export function selectSlotSelection(
  entity: EntityInstance,
  slotId: string,
): string | undefined {
  return entity.slotSelections[slotId];
}

/**
 * Best-only winner: smaller tier, then higher abs(strength) sum, then name.
 */
export function selectSlotWinner(
  entity: EntityInstance,
  slotId: string,
): Tag | undefined {
  const candidates = [...listHeldTagsInSlot(entity, slotId)];
  if (candidates.length === 0) {
    return undefined;
  }
  candidates.sort((a, b) => {
    const tierDiff = tagBestOnlyTier(a) - tagBestOnlyTier(b);
    if (tierDiff !== 0) {
      return tierDiff;
    }
    const scoreDiff = tagBestOnlyScore(b) - tagBestOnlyScore(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return a.name.localeCompare(b.name);
  });
  return candidates[0];
}

function slotModeFor(
  registry: SlotCatalog | undefined,
  slotId: string,
): SlotMode {
  const def = registry?.getSlotDefinition(slotId);
  // Missing SlotDefinition ⇒ empty default (selectable, no label/description).
  return slotDefinitionMode(def);
}

/**
 * Held tags whose passives should apply (slot-resolved). Does not flatten
 * dependents — use {@link selectActiveTags}.
 */
export function selectActiveRootTags(
  entity: EntityInstance,
  registry?: SlotCatalog,
): readonly Tag[] {
  const held = entity.tags.list();
  const bestOnlySlots = new Set<string>();
  const active: Tag[] = [];

  for (const tag of held) {
    const slotId = tag.slot;
    if (!slotId) {
      active.push(tag);
      continue;
    }
    const mode = slotModeFor(registry, slotId);
    if (mode === 'best-only') {
      bestOnlySlots.add(slotId);
      continue;
    }
    // selectable (including missing SlotDefinition)
    const selected = entity.slotSelections[slotId];
    if (selected === tag.name) {
      active.push(tag);
    }
  }

  for (const slotId of bestOnlySlots) {
    const winner = selectSlotWinner(entity, slotId);
    if (winner) {
      active.push(winner);
    }
  }

  return active;
}

/**
 * Flatten dependentTags under a root (recursive, cycle-guarded by name).
 * Nested `slot` is ignored for resolution.
 */
export function flattenDependentTags(
  root: Tag,
  into: Tag[],
  seenNames: Set<string>,
): void {
  for (const child of root.dependentTags ?? []) {
    if (seenNames.has(child.name)) {
      continue;
    }
    seenNames.add(child.name);
    into.push(createTag(child));
    flattenDependentTags(child, into, seenNames);
  }
}

/**
 * Active roots plus flattened dependents (unique by name; roots first).
 */
export function selectActiveTags(
  entity: EntityInstance,
  registry?: SlotCatalog,
): readonly Tag[] {
  const roots = selectActiveRootTags(entity, registry);
  const out: Tag[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    if (!seen.has(root.name)) {
      seen.add(root.name);
      out.push(root);
    }
    flattenDependentTags(root, out, seen);
  }
  return out;
}

export function entityHasActiveTag(
  entity: EntityInstance,
  tagName: string,
  registry?: SlotCatalog,
): boolean {
  return selectActiveTags(entity, registry).some((tag) => tag.name === tagName);
}

export function sumActiveTaggedFieldStrength(
  entity: EntityInstance,
  effectType: string,
  field: string,
  keyValue: string,
  registry?: SlotCatalog,
): number {
  let total = 0;
  for (const tag of selectActiveTags(entity, registry)) {
    for (const effect of tag.effects) {
      if (effect.type !== effectType) {
        continue;
      }
      const payload = effect as Tag['effects'][number] & Record<string, unknown>;
      if (payload[field] === keyValue) {
        total += effect.strength;
      }
    }
  }
  return total;
}

export function sumActiveTagEffectStrength(
  entity: EntityInstance,
  effectType: string,
  registry?: SlotCatalog,
): number {
  let total = 0;
  for (const tag of selectActiveTags(entity, registry)) {
    for (const effect of tag.effects) {
      if (effect.type === effectType) {
        total += effect.strength;
      }
    }
  }
  return total;
}

/**
 * After tags change: ensure selectable slot selections are valid.
 * `preferTagName` — when granting, prefer selecting that tag if the slot was empty.
 */
export function reconcileSlotSelections(
  entity: EntityInstance,
  registry: SlotCatalog | undefined,
  preferTagName?: string,
): EntityInstance {
  const next: Record<string, string> = { ...entity.slotSelections };
  let changed = false;

  const slotIds = new Set<string>();
  for (const tag of entity.tags.list()) {
    if (tag.slot) {
      slotIds.add(tag.slot);
    }
  }
  for (const existing of Object.keys(next)) {
    slotIds.add(existing);
  }

  for (const slotId of slotIds) {
    const mode = slotModeFor(registry, slotId);
    const held = listHeldTagsInSlot(entity, slotId);

    if (mode !== 'selectable' || held.length === 0) {
      if (next[slotId] !== undefined) {
        delete next[slotId];
        changed = true;
      }
      continue;
    }

    const current = next[slotId];
    const currentHeld = current
      ? held.some((tag) => tag.name === current)
      : false;

    if (currentHeld) {
      continue;
    }

    let pick: string | undefined;
    if (
      preferTagName &&
      held.some((tag) => tag.name === preferTagName) &&
      entity.tags.get(preferTagName)?.slot === slotId
    ) {
      pick = preferTagName;
    } else {
      const sorted = [...held].sort((a, b) => {
        const aTick =
          entity.metrics.tagGrantedAt[a.name] ?? Number.MAX_SAFE_INTEGER;
        const bTick =
          entity.metrics.tagGrantedAt[b.name] ?? Number.MAX_SAFE_INTEGER;
        if (aTick !== bTick) {
          return aTick - bTick;
        }
        return a.name.localeCompare(b.name);
      });
      pick = sorted[0]?.name;
    }

    if (pick) {
      if (next[slotId] !== pick) {
        next[slotId] = pick;
        changed = true;
      }
    } else if (next[slotId] !== undefined) {
      delete next[slotId];
      changed = true;
    }
  }

  if (!changed) {
    return entity;
  }
  return {
    ...entity,
    slotSelections: Object.freeze({ ...next }),
  };
}

/**
 * Select a held tag into a slot. No-op unless the tag is held and its `slot`
 * field equals `slotId` (item type must match the slot).
 */
export function withSlotSelection(
  entity: EntityInstance,
  slotId: string,
  tagName: string,
): EntityInstance {
  const tag = entity.tags.get(tagName);
  if (!tag || tag.slot !== slotId) {
    return entity;
  }
  return {
    ...entity,
    slotSelections: Object.freeze({
      ...entity.slotSelections,
      [slotId]: tagName,
    }),
  };
}
