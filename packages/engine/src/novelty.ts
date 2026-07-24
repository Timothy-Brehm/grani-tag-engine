import type { EntityInstance } from './entity';
import type { EngineState } from './state';
import type { TagEffect } from './tag';
import type { NovelRef, NoveltyAck } from './novelty-types';
import {
  selectPoolMax,
  selectPrimaryEntity,
  selectStatValue,
} from './selectors';

export type { NovelKind, NovelRef, NoveltyAck } from './novelty-types';

type ActionNoveltyView = {
  readonly name: string;
  readonly novelty?: NoveltyAck;
};

type EntityDefinitionNoveltyView = {
  readonly id: string;
  readonly novelty?: NoveltyAck;
  readonly actions?: readonly ActionNoveltyView[];
};

function noveltyScope(novelty: NoveltyAck): 'instance' | 'primary' {
  return novelty.scope ?? 'instance';
}

/** Holder entity for an ack tag, if resolvable. */
export function selectNoveltyHolder(
  state: EngineState,
  subject: EntityInstance,
  novelty: NoveltyAck,
): EntityInstance | undefined {
  if (noveltyScope(novelty) === 'primary') {
    return selectPrimaryEntity(state);
  }
  return subject;
}

/**
 * True when novelty is configured and the ack tag is missing on the holder.
 * No `novelty` config ⇒ not tracked (not novel).
 */
export function selectIsNovel(
  state: EngineState,
  subject: EntityInstance,
  novelty: NoveltyAck | undefined,
): boolean {
  if (!novelty?.seenTag) {
    return false;
  }
  const holder = selectNoveltyHolder(state, subject, novelty);
  if (!holder) {
    return false;
  }
  return !holder.tags.has(novelty.seenTag);
}

export function selectEntityIsNovel(
  state: EngineState,
  entity: EntityInstance,
  definitionNovelty: NoveltyAck | undefined,
): boolean {
  return selectIsNovel(state, entity, definitionNovelty);
}

export function selectActionIsNovel(
  state: EngineState,
  entity: EntityInstance,
  action: ActionNoveltyView,
): boolean {
  return selectIsNovel(state, entity, action.novelty);
}

function effectNovelty(effect: TagEffect): NoveltyAck | undefined {
  const raw = effect.novelty;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const seenTag = (raw as NoveltyAck).seenTag;
  if (typeof seenTag !== 'string' || !seenTag) {
    return undefined;
  }
  const scope = (raw as NoveltyAck).scope;
  return {
    seenTag,
    ...(scope === 'primary' || scope === 'instance' ? { scope } : {}),
  };
}

function tagNovelty(tag: { novelty?: NoveltyAck }): NoveltyAck | undefined {
  const raw = tag.novelty;
  if (!raw?.seenTag) {
    return undefined;
  }
  return {
    seenTag: raw.seenTag,
    ...(raw.scope === 'primary' || raw.scope === 'instance'
      ? { scope: raw.scope }
      : {}),
  };
}

/** A held tag is novel when it declares `novelty` and the ack tag is absent. */
export function selectTagIsNovel(
  state: EngineState,
  entity: EntityInstance,
  tag: { readonly name: string; readonly novelty?: NoveltyAck },
): boolean {
  return selectIsNovel(state, entity, tagNovelty(tag));
}

export function selectPoolIsNovel(
  state: EngineState,
  entity: EntityInstance,
  pool: string,
): boolean {
  const inPlay =
    Object.prototype.hasOwnProperty.call(entity.pools, pool) ||
    selectPoolMax(entity, pool) > 0;
  if (!inPlay) {
    return false;
  }
  for (const tag of entity.tags.list()) {
    for (const effect of tag.effects) {
      if (effect.type !== 'pool-max' || effect.pool !== pool) {
        continue;
      }
      const novelty = effectNovelty(effect);
      if (novelty && selectIsNovel(state, entity, novelty)) {
        return true;
      }
    }
  }
  return false;
}

export function selectStatIsNovel(
  state: EngineState,
  entity: EntityInstance,
  stat: string,
): boolean {
  const inPlay =
    selectStatValue(entity, stat) !== 0 ||
    entity.tags.list().some((tag) =>
      tag.effects.some(
        (effect) => effect.type === 'stat' && effect.stat === stat,
      ),
    );
  if (!inPlay) {
    return false;
  }
  for (const tag of entity.tags.list()) {
    for (const effect of tag.effects) {
      if (effect.type !== 'stat' || effect.stat !== stat) {
        continue;
      }
      const novelty = effectNovelty(effect);
      if (novelty && selectIsNovel(state, entity, novelty)) {
        return true;
      }
    }
  }
  return false;
}

/** Collect in-play novel refs for one entity (unordered). */
export function selectNovelOnEntity(
  state: EngineState,
  entity: EntityInstance,
  options: {
    readonly definition?: EntityDefinitionNoveltyView;
    readonly actions?: readonly ActionNoveltyView[];
  } = {},
): NovelRef[] {
  const out: NovelRef[] = [];
  const definition = options.definition;
  if (
    definition?.novelty &&
    selectEntityIsNovel(state, entity, definition.novelty)
  ) {
    out.push({
      entityId: entity.id,
      seenTag: definition.novelty.seenTag,
      scope: noveltyScope(definition.novelty),
      kind: 'entity',
      key: entity.definitionId,
    });
  }

  const actions = options.actions ?? definition?.actions ?? [];
  for (const action of actions) {
    if (action.novelty && selectActionIsNovel(state, entity, action)) {
      out.push({
        entityId: entity.id,
        seenTag: action.novelty.seenTag,
        scope: noveltyScope(action.novelty),
        kind: 'action',
        key: action.name,
      });
    }
  }

  const poolKeys = new Set<string>(Object.keys(entity.pools));
  for (const tag of entity.tags.list()) {
    for (const effect of tag.effects) {
      if (effect.type === 'pool-max' && typeof effect.pool === 'string') {
        poolKeys.add(effect.pool);
      }
    }
  }
  for (const pool of poolKeys) {
    if (!selectPoolIsNovel(state, entity, pool)) {
      continue;
    }
    for (const tag of entity.tags.list()) {
      for (const effect of tag.effects) {
        if (effect.type !== 'pool-max' || effect.pool !== pool) {
          continue;
        }
        const novelty = effectNovelty(effect);
        if (novelty && selectIsNovel(state, entity, novelty)) {
          out.push({
            entityId: entity.id,
            seenTag: novelty.seenTag,
            scope: noveltyScope(novelty),
            kind: 'pool',
            key: pool,
          });
        }
      }
    }
  }

  const statKeys = new Set<string>();
  for (const tag of entity.tags.list()) {
    for (const effect of tag.effects) {
      if (effect.type === 'stat' && typeof effect.stat === 'string') {
        statKeys.add(effect.stat);
      }
    }
  }
  for (const stat of statKeys) {
    if (!selectStatIsNovel(state, entity, stat)) {
      continue;
    }
    for (const tag of entity.tags.list()) {
      for (const effect of tag.effects) {
        if (effect.type !== 'stat' || effect.stat !== stat) {
          continue;
        }
        const novelty = effectNovelty(effect);
        if (novelty && selectIsNovel(state, entity, novelty)) {
          out.push({
            entityId: entity.id,
            seenTag: novelty.seenTag,
            scope: noveltyScope(novelty),
            kind: 'stat',
            key: stat,
          });
        }
      }
    }
  }

  for (const tag of entity.tags.list()) {
    const novelty = tagNovelty(tag);
    if (novelty && selectIsNovel(state, entity, novelty)) {
      out.push({
        entityId: entity.id,
        seenTag: novelty.seenTag,
        scope: noveltyScope(novelty),
        kind: 'tag',
        key: tag.name,
      });
    }
  }

  return out;
}

/** All novel refs in the engine (unordered). */
export function selectNovelInState(
  state: EngineState,
  resolveDefinition: (
    definitionId: string,
  ) => EntityDefinitionNoveltyView | undefined = () => undefined,
): NovelRef[] {
  const out: NovelRef[] = [];
  for (const entity of state.entities.values()) {
    out.push(
      ...selectNovelOnEntity(state, entity, {
        definition: resolveDefinition(entity.definitionId),
      }),
    );
  }
  return out;
}

/** True if the entity has any configured novelty still unacked. */
export function selectEntityHasNovel(
  state: EngineState,
  entity: EntityInstance,
  options: {
    readonly definition?: EntityDefinitionNoveltyView;
    readonly actions?: readonly ActionNoveltyView[];
  } = {},
): boolean {
  return selectNovelOnEntity(state, entity, options).length > 0;
}

/** @deprecated Prefer {@link selectEntityIsNovel}. */
export const selectEntityIsNew = selectEntityIsNovel;
/** @deprecated Prefer {@link selectActionIsNovel}. */
export const selectActionIsNew = selectActionIsNovel;
/** @deprecated Prefer {@link selectPoolIsNovel}. */
export const selectPoolIsNew = selectPoolIsNovel;
/** @deprecated Prefer {@link selectStatIsNovel}. */
export const selectStatIsNew = selectStatIsNovel;
/** @deprecated Prefer {@link selectEntityHasNovel}. */
export const selectEntityHasNew = selectEntityHasNovel;
