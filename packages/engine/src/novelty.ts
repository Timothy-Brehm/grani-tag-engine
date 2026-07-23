import type { EntityInstance } from './entity';
import { selectPoolMax, selectStatValue } from './selectors';
import type { Tag } from './tag';

export type EntityNovelty = {
  /** False until host acknowledges the entity (bootstrap should set true). */
  readonly entitySeen: boolean;
  /** Action ids acknowledged as seen. Offered + missing ⇒ new. */
  readonly seenActions: Readonly<Record<string, true>>;
  readonly seenPools: Readonly<Record<string, true>>;
  readonly seenStats: Readonly<Record<string, true>>;
  /**
   * Message ids offered for host display (modal / short text).
   * Unseen = offered and not in `seenMessages`.
   */
  readonly offeredMessages: Readonly<Record<string, true>>;
  /** Message ids the host has acknowledged (history kept). */
  readonly seenMessages: Readonly<Record<string, true>>;
};

export type EntityNoveltyJSON = {
  entitySeen?: boolean;
  seenActions?: Record<string, true | boolean>;
  seenPools?: Record<string, true | boolean>;
  seenStats?: Record<string, true | boolean>;
  offeredMessages?: Record<string, true | boolean>;
  seenMessages?: Record<string, true | boolean>;
  /** @deprecated Host-owned; ignored on load. */
  poolShownTicks?: Record<string, number>;
  /** @deprecated Host-owned; ignored on load. */
  statShownTicks?: Record<string, number>;
};

export function emptyEntityNovelty(entitySeen = false): EntityNovelty {
  return {
    entitySeen,
    seenActions: Object.freeze({}),
    seenPools: Object.freeze({}),
    seenStats: Object.freeze({}),
    offeredMessages: Object.freeze({}),
    seenMessages: Object.freeze({}),
  };
}

function freezeTrueMap(
  input: Readonly<Record<string, true | boolean>> | undefined,
): Readonly<Record<string, true>> {
  const out: Record<string, true> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value) {
      out[key] = true;
    }
  }
  return Object.freeze(out);
}

export function entityNoveltyToJSON(novelty: EntityNovelty): EntityNoveltyJSON {
  return {
    entitySeen: novelty.entitySeen,
    seenActions: { ...novelty.seenActions },
    seenPools: { ...novelty.seenPools },
    seenStats: { ...novelty.seenStats },
    offeredMessages: { ...novelty.offeredMessages },
    seenMessages: { ...novelty.seenMessages },
  };
}

export function entityNoveltyFromJSON(
  json: EntityNoveltyJSON | undefined,
): EntityNovelty {
  if (!json) {
    return emptyEntityNovelty(false);
  }
  return {
    entitySeen: json.entitySeen ?? false,
    seenActions: freezeTrueMap(json.seenActions),
    seenPools: freezeTrueMap(json.seenPools),
    seenStats: freezeTrueMap(json.seenStats),
    offeredMessages: freezeTrueMap(json.offeredMessages),
    seenMessages: freezeTrueMap(json.seenMessages),
  };
}

function withNovelty(
  entity: EntityInstance,
  novelty: EntityNovelty,
): EntityInstance {
  return { ...entity, novelty };
}

function collectStatKeys(tags: { list(): readonly Tag[] }): string[] {
  const keys = new Set<string>();
  for (const tag of tags.list()) {
    for (const effect of tag.effects) {
      if (effect.type !== 'stat') {
        continue;
      }
      const payload = effect as Tag['effects'][number] & Record<string, unknown>;
      if (typeof payload.stat === 'string') {
        keys.add(payload.stat);
      }
    }
  }
  return [...keys];
}

function collectPoolKeys(entity: EntityInstance): string[] {
  const keys = new Set<string>(Object.keys(entity.pools));
  for (const tag of entity.tags.list()) {
    for (const effect of tag.effects) {
      if (effect.type !== 'pool-max') {
        continue;
      }
      const payload = effect as Tag['effects'][number] & Record<string, unknown>;
      if (typeof payload.pool === 'string') {
        keys.add(payload.pool);
      }
    }
  }
  return [...keys];
}

/**
 * Mark the entity and its current actions/pools/stats as seen.
 * Use for bootstrap loadout so starting content is not badged.
 */
export function markEntityNoveltySeen(
  entity: EntityInstance,
  offeredActionIds: readonly string[] = [],
): EntityInstance {
  const seenActions: Record<string, true> = { ...entity.novelty.seenActions };
  for (const actionId of offeredActionIds) {
    seenActions[actionId] = true;
  }
  const seenPools: Record<string, true> = { ...entity.novelty.seenPools };
  for (const pool of collectPoolKeys(entity)) {
    seenPools[pool] = true;
  }
  const seenStats: Record<string, true> = { ...entity.novelty.seenStats };
  for (const stat of collectStatKeys(entity.tags)) {
    seenStats[stat] = true;
  }
  return withNovelty(entity, {
    ...entity.novelty,
    entitySeen: true,
    seenActions: Object.freeze(seenActions),
    seenPools: Object.freeze(seenPools),
    seenStats: Object.freeze(seenStats),
  });
}

export function markEntitySeen(entity: EntityInstance): EntityInstance {
  if (entity.novelty.entitySeen) {
    return entity;
  }
  return withNovelty(entity, { ...entity.novelty, entitySeen: true });
}

export function markActionSeen(
  entity: EntityInstance,
  actionId: string,
): EntityInstance {
  if (entity.novelty.seenActions[actionId]) {
    return entity;
  }
  return withNovelty(entity, {
    ...entity.novelty,
    seenActions: Object.freeze({
      ...entity.novelty.seenActions,
      [actionId]: true,
    }),
  });
}

export function markPoolSeen(
  entity: EntityInstance,
  pool: string,
): EntityInstance {
  if (entity.novelty.seenPools[pool]) {
    return entity;
  }
  return withNovelty(entity, {
    ...entity.novelty,
    seenPools: Object.freeze({
      ...entity.novelty.seenPools,
      [pool]: true,
    }),
  });
}

export function markStatSeen(
  entity: EntityInstance,
  stat: string,
): EntityInstance {
  if (entity.novelty.seenStats[stat]) {
    return entity;
  }
  return withNovelty(entity, {
    ...entity.novelty,
    seenStats: Object.freeze({
      ...entity.novelty.seenStats,
      [stat]: true,
    }),
  });
}

/**
 * Offer a host-catalog message id for display.
 * No-op if already seen (fire-once) or already offered.
 */
export function offerMessage(
  entity: EntityInstance,
  messageId: string,
): EntityInstance {
  if (
    entity.novelty.seenMessages[messageId] ||
    entity.novelty.offeredMessages[messageId]
  ) {
    return entity;
  }
  return withNovelty(entity, {
    ...entity.novelty,
    offeredMessages: Object.freeze({
      ...entity.novelty.offeredMessages,
      [messageId]: true,
    }),
  });
}

/** Acknowledge a message; keeps history in `seenMessages`. */
export function markMessageSeen(
  entity: EntityInstance,
  messageId: string,
): EntityInstance {
  if (entity.novelty.seenMessages[messageId]) {
    if (!entity.novelty.offeredMessages[messageId]) {
      return entity;
    }
    const offered: Record<string, true> = {
      ...entity.novelty.offeredMessages,
    };
    delete offered[messageId];
    return withNovelty(entity, {
      ...entity.novelty,
      offeredMessages: Object.freeze(offered),
    });
  }
  const offered: Record<string, true> = { ...entity.novelty.offeredMessages };
  delete offered[messageId];
  return withNovelty(entity, {
    ...entity.novelty,
    offeredMessages: Object.freeze(offered),
    seenMessages: Object.freeze({
      ...entity.novelty.seenMessages,
      [messageId]: true,
    }),
  });
}

export function selectEntityIsNew(entity: EntityInstance): boolean {
  return !entity.novelty.entitySeen;
}

export function selectActionIsNew(
  entity: EntityInstance,
  actionId: string,
): boolean {
  return !entity.novelty.seenActions[actionId];
}

export function selectPoolIsNew(
  entity: EntityInstance,
  pool: string,
): boolean {
  if (entity.novelty.seenPools[pool]) {
    return false;
  }
  // Only badge pools that actually exist / have capacity on the entity.
  return (
    Object.prototype.hasOwnProperty.call(entity.pools, pool) ||
    selectPoolMax(entity, pool) > 0
  );
}

export function selectStatIsNew(
  entity: EntityInstance,
  stat: string,
): boolean {
  if (entity.novelty.seenStats[stat]) {
    return false;
  }
  return (
    selectStatValue(entity, stat) !== 0 ||
    collectStatKeys(entity.tags).includes(stat)
  );
}

/** Host-catalog message ids offered on this entity and not yet acknowledged. */
export function selectUnseenMessages(entity: EntityInstance): string[] {
  const unseen: string[] = [];
  for (const messageId of Object.keys(entity.novelty.offeredMessages)) {
    if (!entity.novelty.seenMessages[messageId]) {
      unseen.push(messageId);
    }
  }
  return unseen;
}

export function selectMessageIsNew(
  entity: EntityInstance,
  messageId: string,
): boolean {
  return (
    Boolean(entity.novelty.offeredMessages[messageId]) &&
    !entity.novelty.seenMessages[messageId]
  );
}

/**
 * True if the entity itself is new or it has any unseen offered actions /
 * present pools / present stats.
 * Unseen messages are polled separately via {@link selectUnseenMessages}.
 */
export function selectEntityHasNew(
  entity: EntityInstance,
  offeredActionIds: readonly string[] = [],
): boolean {
  if (selectEntityIsNew(entity)) {
    return true;
  }
  for (const actionId of offeredActionIds) {
    if (selectActionIsNew(entity, actionId)) {
      return true;
    }
  }
  for (const pool of collectPoolKeys(entity)) {
    if (selectPoolIsNew(entity, pool)) {
      return true;
    }
  }
  for (const stat of collectStatKeys(entity.tags)) {
    if (selectStatIsNew(entity, stat)) {
      return true;
    }
  }
  return false;
}
