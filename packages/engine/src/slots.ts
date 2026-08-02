import type { CatalogRegistryView, SlotMode } from './catalog';
import { slotDefinitionMode } from './catalog';
import type {
  EntityInstance,
  EntityMap,
  SlotSelectionRef,
} from './entity';
import { normalizeSlotSelection } from './entity';
import type { Tag } from './tag';
import { createTag } from './tag';
import type { TagCollection } from './tag-collection';
import { upsertEntity, type EngineState } from './state';
import {
  collectionHasHeldSlot,
  selectUniversalUnslottedActiveTags,
  UNIVERSAL_TAGS_HOLDER_ID,
} from './document';

export type SlotCatalog = CatalogRegistryView;

export type ActiveTagOptions = {
  readonly universalTags?: TagCollection;
  /** Merge unslotted universal tags into the active set (primary passives). */
  readonly mergeUnslottedUniversal?: boolean;
};

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
): SlotSelectionRef | undefined {
  return entity.slotSelections[slotId];
}

function resolveHolder(
  owner: EntityInstance,
  holderEntityId: string,
  entities?: EntityMap,
): EntityInstance | undefined {
  if (holderEntityId === owner.id) {
    return owner;
  }
  return entities?.get(holderEntityId);
}

/** Load the tag referenced by a slot selection, if still valid for that slot. */
export function resolveSlotSelectionTag(
  owner: EntityInstance,
  slotId: string,
  entities?: EntityMap,
): Tag | undefined {
  const ref = owner.slotSelections[slotId];
  if (!ref) {
    return undefined;
  }
  const holder = resolveHolder(owner, ref.holderEntityId, entities);
  const tag = holder?.tags.get(ref.tagName);
  if (!tag || tag.slot !== slotId) {
    return undefined;
  }
  return tag;
}

/**
 * Best-only winner among **self-held** tags: smaller tier, then higher
 * abs(strength) sum, then name.
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
  return slotDefinitionMode(def);
}

function slotCannotShare(
  registry: SlotCatalog | undefined,
  slotId: string,
): boolean {
  return registry?.getSlotDefinition(slotId)?.cannotShareTag === true;
}

function holdingKey(ref: SlotSelectionRef): string {
  return `${ref.holderEntityId}::${ref.tagName}`;
}

/**
 * True if some other slot owner already selects this holding in the same slot
 * (used when `cannotShareTag` is set).
 */
export function holdingIsSelectedElsewhere(
  state: EngineState,
  slotId: string,
  ref: SlotSelectionRef,
  exceptOwnerId: string,
): boolean {
  const key = holdingKey(ref);
  for (const entity of state.entities.values()) {
    if (entity.id === exceptOwnerId) {
      continue;
    }
    const sel = entity.slotSelections[slotId];
    if (sel && holdingKey(sel) === key) {
      return true;
    }
  }
  return false;
}

/**
 * Held tags whose passives should apply (slot-resolved). Does not flatten
 * dependents — use {@link selectActiveTags}.
 */
export function selectActiveRootTags(
  entity: EntityInstance,
  registry?: SlotCatalog,
  entities?: EntityMap,
): readonly Tag[] {
  const held = entity.tags.list();
  const bestOnlySlots = new Set<string>();
  const active: Tag[] = [];
  const entitiesForLookup = entities ?? new Map([[entity.id, entity]]);

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
    // selectable — may be satisfied by a foreign holding via slotSelections
  }

  const selectableSlots = new Set<string>();
  for (const tag of held) {
    if (tag.slot && slotModeFor(registry, tag.slot) === 'selectable') {
      selectableSlots.add(tag.slot);
    }
  }
  for (const slotId of Object.keys(entity.slotSelections)) {
    if (slotModeFor(registry, slotId) === 'selectable') {
      selectableSlots.add(slotId);
    }
  }

  for (const slotId of selectableSlots) {
    const resolved = resolveSlotSelectionTag(entity, slotId, entitiesForLookup);
    if (resolved) {
      active.push(resolved);
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
 * When `options.mergeUnslottedUniversal`, also merges unslotted UniversalTags.
 */
export function selectActiveTags(
  entity: EntityInstance,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): readonly Tag[] {
  const roots = selectActiveRootTags(entity, registry, entities);
  const out: Tag[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    if (!seen.has(root.name)) {
      seen.add(root.name);
      out.push(root);
    }
    flattenDependentTags(root, out, seen);
  }
  if (options?.mergeUnslottedUniversal && options.universalTags) {
    for (const tag of selectUniversalUnslottedActiveTags(options.universalTags)) {
      if (!seen.has(tag.name)) {
        seen.add(tag.name);
        out.push(tag);
      }
    }
  }
  return out;
}

export function entityHasActiveTag(
  entity: EntityInstance,
  tagName: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): boolean {
  if (
    selectActiveTags(entity, registry, entities, options).some(
      (tag) => tag.name === tagName,
    )
  ) {
    return true;
  }
  if (options?.universalTags) {
    return selectUniversalUnslottedActiveTags(options.universalTags).some(
      (tag) => tag.name === tagName,
    );
  }
  return false;
}

export function sumActiveTaggedFieldStrength(
  entity: EntityInstance,
  effectType: string,
  field: string,
  keyValue: string,
  registry?: SlotCatalog,
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  let total = 0;
  for (const tag of selectActiveTags(entity, registry, entities, options)) {
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
  entities?: EntityMap,
  options?: ActiveTagOptions,
): number {
  let total = 0;
  for (const tag of selectActiveTags(entity, registry, entities, options)) {
    for (const effect of tag.effects) {
      if (effect.type === effectType) {
        total += effect.strength;
      }
    }
  }
  return total;
}

export { collectionHasHeldSlot };

function selectionStillValid(
  owner: EntityInstance,
  slotId: string,
  ref: SlotSelectionRef,
  state: EngineState,
  registry: SlotCatalog | undefined,
  universalTags?: TagCollection,
): boolean {
  let tag: Tag | undefined;
  if (ref.holderEntityId === UNIVERSAL_TAGS_HOLDER_ID) {
    tag = universalTags?.get(ref.tagName);
  } else {
    const holder =
      ref.holderEntityId === owner.id
        ? owner
        : state.entities.get(ref.holderEntityId);
    tag = holder?.tags.get(ref.tagName);
  }
  if (!tag || tag.slot !== slotId) {
    return false;
  }
  if (
    slotCannotShare(registry, slotId) &&
    holdingIsSelectedElsewhere(state, slotId, ref, owner.id)
  ) {
    return false;
  }
  return true;
}

/**
 * After tags/selections change: drop invalid refs; auto-select only among
 * **self-held** tags for empty selectable slots.
 */
export function reconcileSlotSelections(
  entity: EntityInstance,
  state: EngineState,
  registry: SlotCatalog | undefined,
  preferTagName?: string,
  universalTags?: TagCollection,
): EntityInstance {
  const next: Record<string, SlotSelectionRef> = {
    ...entity.slotSelections,
  };
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
    const current = next[slotId];

    if (mode === 'best-only') {
      if (current !== undefined) {
        delete next[slotId];
        changed = true;
      }
      continue;
    }

    // selectable
    if (
      current &&
      selectionStillValid(
        entity,
        slotId,
        current,
        state,
        registry,
        universalTags,
      )
    ) {
      continue;
    }

    if (current !== undefined) {
      delete next[slotId];
      changed = true;
    }

    // Repair / auto-select only from self-held tags (never steal foreign tags)
    if (held.length === 0) {
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
      const ref: SlotSelectionRef = {
        holderEntityId: entity.id,
        tagName: pick,
      };
      if (
        slotCannotShare(registry, slotId) &&
        holdingIsSelectedElsewhere(state, slotId, ref, entity.id)
      ) {
        continue;
      }
      next[slotId] = ref;
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

/** Reconcile every entity (e.g. after remove-tag / remove-entity). */
export function reconcileAllSlotSelections(
  state: EngineState,
  registry: SlotCatalog | undefined,
  universalTags?: TagCollection,
): EngineState {
  let next = state;
  // Break cannotShareTag duplicates: keep lowest owner id, clear others
  const claimed = new Map<string, string>(); // `${slot}::${holdingKey}` → ownerId
  for (const entity of [...next.entities.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    let entityNext = entity;
    let entityChanged = false;
    const selections: Record<string, SlotSelectionRef> = {
      ...entity.slotSelections,
    };
    for (const [slotId, ref] of Object.entries(selections)) {
      if (!slotCannotShare(registry, slotId)) {
        continue;
      }
      const key = `${slotId}::${holdingKey(ref)}`;
      const existing = claimed.get(key);
      if (existing === undefined) {
        claimed.set(key, entity.id);
        continue;
      }
      if (existing !== entity.id) {
        delete selections[slotId];
        entityChanged = true;
      }
    }
    if (entityChanged) {
      entityNext = {
        ...entity,
        slotSelections: Object.freeze(selections),
      };
      next = upsertEntity(next, entityNext);
    }
  }

  for (const entityId of [...next.entities.keys()]) {
    const entity = next.entities.get(entityId);
    if (!entity) {
      continue;
    }
    const reconciled = reconcileSlotSelections(
      entity,
      next,
      registry,
      undefined,
      universalTags,
    );
    if (reconciled !== entity) {
      next = upsertEntity(next, reconciled);
    }
  }
  return next;
}

/**
 * Select a held tag into a slot on `entity` (slot owner). The tag may live on
 * another entity (`holderEntityId`, default self) or on UniversalTags
 * (`holderEntityId: 'settings'`). No-op if invalid.
 */
export function withSlotSelection(
  entity: EntityInstance,
  slotId: string,
  tagName: string,
  holderEntityId?: string,
  state?: EngineState,
  registry?: SlotCatalog,
  universalTags?: TagCollection,
): EntityInstance {
  const holderId = holderEntityId ?? entity.id;
  const ref = normalizeSlotSelection(entity.id, {
    holderEntityId: holderId,
    tagName,
  });
  if (!ref) {
    return entity;
  }

  let tag: Tag | undefined;
  if (holderId === UNIVERSAL_TAGS_HOLDER_ID) {
    tag = universalTags?.get(tagName);
  } else {
    const holder =
      holderId === entity.id ? entity : state?.entities.get(holderId);
    tag = holder?.tags.get(tagName);
  }
  if (!tag || tag.slot !== slotId) {
    return entity;
  }

  if (state && slotCannotShare(registry, slotId)) {
    if (holdingIsSelectedElsewhere(state, slotId, ref, entity.id)) {
      return entity;
    }
  }

  return {
    ...entity,
    slotSelections: Object.freeze({
      ...entity.slotSelections,
      [slotId]: ref,
    }),
  };
}
