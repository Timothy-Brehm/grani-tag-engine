import type { EntityInstance } from './entity';
import type { EngineState } from './state';
import type { Tag } from './tag';
import type { TagCollection } from './tag-collection';

/** Sum strength of tag passive effects whose type matches. */
export function sumTagEffectStrength(
  tags: TagCollection | readonly Tag[],
  effectType: string,
): number {
  const list = 'list' in tags ? tags.list() : tags;
  let total = 0;
  for (const tag of list) {
    for (const effect of tag.effects) {
      if (effect.type === effectType) {
        total += effect.strength;
      }
    }
  }
  return total;
}

/**
 * Sum strength of tag effects matching type where an extra payload field
 * equals `keyValue` (e.g. type `stat` with field `stat` === 'Strength').
 */
export function sumTaggedFieldStrength(
  tags: TagCollection | readonly Tag[],
  effectType: string,
  field: string,
  keyValue: string,
): number {
  const list = 'list' in tags ? tags.list() : tags;
  let total = 0;
  for (const tag of list) {
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

export function selectEntity(
  state: EngineState,
  entityId: string,
): EntityInstance | undefined {
  return state.entities.get(entityId);
}

export function selectEntitiesByDefinition(
  state: EngineState,
  definitionId: string,
): EntityInstance[] {
  return [...state.entities.values()].filter(
    (entity) => entity.definitionId === definitionId,
  );
}

export function selectStatValue(
  entity: EntityInstance,
  stat: string,
): number {
  return sumTaggedFieldStrength(entity.tags, 'stat', 'stat', stat);
}

export function selectPoolMax(
  entity: EntityInstance,
  pool: string,
): number {
  return sumTaggedFieldStrength(entity.tags, 'pool-max', 'pool', pool);
}

export function selectPoolCurrent(
  entity: EntityInstance,
  pool: string,
): number {
  return entity.pools[pool] ?? 0;
}

export function selectActiveCount(
  state: EngineState,
  definitionId: string,
): number {
  return selectEntitiesByDefinition(state, definitionId).length;
}

export function selectSpawnCount(
  state: EngineState,
  definitionId: string,
): number {
  return state.spawnCounts[definitionId] ?? 0;
}

/** The engine's designated primary entity, if any (typically the player). */
export function selectPrimaryEntity(
  state: EngineState,
): EntityInstance | undefined {
  if (state.primaryEntityId === undefined) {
    return undefined;
  }
  return state.entities.get(state.primaryEntityId);
}

export function selectPrimaryEntityId(
  state: EngineState,
): string | undefined {
  return state.primaryEntityId;
}

export type UnseenMessageRef = {
  readonly entityId: string;
  readonly messageId: string;
};

/** All unseen host-catalog message ids across entities (no order guarantee). */
export function selectUnseenMessagesInState(
  state: EngineState,
): UnseenMessageRef[] {
  const out: UnseenMessageRef[] = [];
  for (const entity of state.entities.values()) {
    for (const messageId of Object.keys(entity.novelty.offeredMessages)) {
      if (!entity.novelty.seenMessages[messageId]) {
        out.push({ entityId: entity.id, messageId });
      }
    }
  }
  return out;
}
