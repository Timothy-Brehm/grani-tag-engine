import { createTag, type Tag } from './tag';
import type { EngineContext } from './context';
import {
  getScopedEntity,
  resolveScopedEntityId,
  withEngineState,
  withScopedEntity,
} from './context';
import type {
  EntityCountRequirement,
  MetricRequirement,
  PoolMaxRequirement,
  StatRequirement,
  TagRequirement,
} from './requirement';
import type {
  AdjustPoolEffect,
  GrantTagEffect,
  RemoveEntityEffect,
  ShowMessageEffect,
  SpawnEntityEffect,
} from './effect';
import type { EntityDefinition, EntityScope } from './entity';
import {
  adjustEntityPool,
  instantiateEntity,
  withEntityTags,
} from './entity';
import { offerMessage } from './novelty';
import {
  selectActionCount,
  selectPoolHighWater,
  selectPoolLifetimeUsed,
  selectPoolLowWater,
  selectPoolMaxHighWater,
  selectStatHighWater,
  selectStatLowWater,
  selectTagGrantedAt,
} from './metrics';
import {
  selectActiveCount,
  selectPoolCurrent,
  selectPoolMax,
  selectSpawnCount,
  selectStatValue,
} from './selectors';
import {
  removeEntity,
  upsertEntity,
  withEngineSpawnCounts,
} from './state';

export type RequirementAdaptor<TReq, THost = unknown> = (
  requirement: TReq,
  context: EngineContext<THost>,
) => boolean;

export type EffectAdaptor<TEffect, THost = unknown> = {
  canHappen(effect: TEffect, context: EngineContext<THost>): boolean;
  apply(effect: TEffect, context: EngineContext<THost>): EngineContext<THost>;
};

export type HostWithTagCatalog = {
  tagCatalog?: ReadonlyMap<string, Tag> | Readonly<Record<string, Tag>>;
};

function lookupCatalogTag(host: unknown, name: string): Tag | undefined {
  if (!host || typeof host !== 'object' || !('tagCatalog' in host)) {
    return undefined;
  }
  const catalog = (host as HostWithTagCatalog).tagCatalog;
  if (!catalog) {
    return undefined;
  }
  if (catalog instanceof Map) {
    return catalog.get(name);
  }
  const record = catalog as Readonly<Record<string, Tag>>;
  if (Object.prototype.hasOwnProperty.call(record, name)) {
    return record[name];
  }
  return undefined;
}

function defaultRequirementScope(
  context: EngineContext<unknown>,
  scope?: EntityScope,
): EntityScope {
  if (scope) {
    return scope;
  }
  if (context.sourceEntityId) {
    return 'source';
  }
  return 'actor';
}

function defaultEffectScope(
  context: EngineContext<unknown>,
  scope?: EntityScope,
): EntityScope {
  if (scope) {
    return scope;
  }
  if (context.actorEntityId) {
    return 'actor';
  }
  return 'source';
}

/** Prefer source for consumable board cards; fall back to actor. */
function defaultRemoveEntityScope(
  context: EngineContext<unknown>,
  scope?: EntityScope,
): EntityScope {
  if (scope) {
    return scope;
  }
  if (context.sourceEntityId) {
    return 'source';
  }
  return 'actor';
}

export class EngineRegistry<THost = unknown> {
  private readonly requirements = new Map<string, RequirementAdaptor<any, THost>>();
  private readonly effects = new Map<string, EffectAdaptor<any, THost>>();
  private readonly entityDefinitions = new Map<string, EntityDefinition>();

  registerRequirement(
    type: string,
    adaptor: RequirementAdaptor<any, THost>,
  ): this {
    this.requirements.set(type, adaptor);
    return this;
  }

  registerEffect(type: string, adaptor: EffectAdaptor<any, THost>): this {
    this.effects.set(type, adaptor);
    return this;
  }

  registerEntityDefinition(definition: EntityDefinition): this {
    this.entityDefinitions.set(definition.id, definition);
    return this;
  }

  getEntityDefinition(id: string): EntityDefinition | undefined {
    return this.entityDefinitions.get(id);
  }

  listEntityDefinitions(): readonly EntityDefinition[] {
    return Object.freeze([...this.entityDefinitions.values()]);
  }

  isRequirementMet(
    requirement: { type: string },
    context: EngineContext<THost>,
  ): boolean {
    const adaptor = this.requirements.get(requirement.type);
    if (!adaptor) {
      throw new Error(`No requirement adaptor registered for type "${requirement.type}"`);
    }
    return adaptor(requirement, context);
  }

  canApplyEffect(
    effect: { type: string },
    context: EngineContext<THost>,
  ): boolean {
    const adaptor = this.effects.get(effect.type);
    if (!adaptor) {
      throw new Error(`No effect adaptor registered for type "${effect.type}"`);
    }
    return adaptor.canHappen(effect, context);
  }

  applyEffect(
    effect: { type: string },
    context: EngineContext<THost>,
  ): EngineContext<THost> {
    const adaptor = this.effects.get(effect.type);
    if (!adaptor) {
      throw new Error(`No effect adaptor registered for type "${effect.type}"`);
    }
    return adaptor.apply(effect, context);
  }

  /**
   * Registers builtins: free/forbidden/tag/stat/pool-max/entity-count/metric
   * requirements and grant-tag/adjust-pool/spawn-entity/remove-entity/show-message effects.
   */
  createBuiltinAdaptors(): this {
    this.registerRequirement('free', () => true);
    this.registerRequirement('forbidden', () => false);

    this.registerRequirement('tag', (requirement: TagRequirement, context) => {
      const scope = defaultRequirementScope(context, requirement.scope);
      const entity = getScopedEntity(context, scope);
      const present = entity?.tags.has(requirement.tagName) ?? false;
      return requirement.exists ? present : !present;
    });

    this.registerRequirement('stat', (requirement: StatRequirement, context) => {
      const scope = defaultRequirementScope(context, requirement.scope);
      const entity = getScopedEntity(context, scope);
      if (!entity) {
        return false;
      }
      return selectStatValue(entity, requirement.stat) >= requirement.amount;
    });

    this.registerRequirement(
      'pool-max',
      (requirement: PoolMaxRequirement, context) => {
        const scope = defaultRequirementScope(context, requirement.scope);
        const entity = getScopedEntity(context, scope);
        if (!entity) {
          return false;
        }
        return selectPoolMax(entity, requirement.pool) > requirement.amount;
      },
    );

    this.registerRequirement(
      'entity-count',
      (requirement: EntityCountRequirement, context) => {
        const count = selectActiveCount(
          context.engine,
          requirement.definitionId,
        );
        if (requirement.min !== undefined && count < requirement.min) {
          return false;
        }
        if (requirement.max !== undefined && count > requirement.max) {
          return false;
        }
        return true;
      },
    );

    this.registerRequirement('metric', (requirement: MetricRequirement, context) => {
      if (requirement.metric === 'engine-tick') {
        return context.engine.tick >= requirement.amount;
      }
      const scope = defaultRequirementScope(context, requirement.scope);
      const entity = getScopedEntity(context, scope);
      if (!entity) {
        return false;
      }
      switch (requirement.metric) {
        case 'action-manual':
          return (
            selectActionCount(entity, requirement.actionId, 'manual') >=
            requirement.amount
          );
        case 'action-automatic':
          return (
            selectActionCount(entity, requirement.actionId, 'automatic') >=
            requirement.amount
          );
        case 'action-total':
          return (
            selectActionCount(entity, requirement.actionId, 'total') >=
            requirement.amount
          );
        case 'pool-current':
          return selectPoolCurrent(entity, requirement.pool) >= requirement.amount;
        case 'pool-high-water':
          return (
            selectPoolHighWater(entity, requirement.pool) >= requirement.amount
          );
        case 'pool-low-water': {
          const low = selectPoolLowWater(entity, requirement.pool);
          return low !== undefined && low <= requirement.amount;
        }
        case 'pool-max-high-water':
          return (
            selectPoolMaxHighWater(entity, requirement.pool) >=
            requirement.amount
          );
        case 'pool-lifetime-used':
          return (
            selectPoolLifetimeUsed(entity, requirement.pool) >=
            requirement.amount
          );
        case 'stat-high-water':
          return (
            selectStatHighWater(entity, requirement.stat) >= requirement.amount
          );
        case 'stat-low-water': {
          const low = selectStatLowWater(entity, requirement.stat);
          return low !== undefined && low <= requirement.amount;
        }
        case 'tag-held-for': {
          if (!entity.tags.has(requirement.tagName)) {
            return false;
          }
          const granted = selectTagGrantedAt(entity, requirement.tagName);
          if (granted === undefined) {
            return false;
          }
          return context.engine.tick - granted >= requirement.amount;
        }
        default: {
          const _exhaustive: never = requirement;
          return _exhaustive;
        }
      }
    });

    this.registerEffect('grant-tag', {
      canHappen: (effect: GrantTagEffect, context) => {
        const scope = defaultEffectScope(context, effect.scope);
        const entity = getScopedEntity(context, scope);
        return Boolean(entity && !entity.tags.has(effect.name));
      },
      apply: (effect: GrantTagEffect, context) => {
        const scope = defaultEffectScope(context, effect.scope);
        const entity = getScopedEntity(context, scope);
        if (!entity || entity.tags.has(effect.name)) {
          return context;
        }
        const fromCatalog = lookupCatalogTag(context.host, effect.name);
        const tag = fromCatalog
          ? createTag(fromCatalog)
          : createTag({ name: effect.name, effects: [] });
        const nextEntity = withEntityTags(
          entity,
          entity.tags.add(tag),
          context.engine.tick,
        );
        return withScopedEntity(context, scope, nextEntity);
      },
    });

    this.registerEffect('adjust-pool', {
      canHappen: (effect: AdjustPoolEffect, context) => {
        const scope = defaultEffectScope(context, effect.scope);
        const entity = getScopedEntity(context, scope);
        if (!entity) {
          return false;
        }
        const current = selectPoolCurrent(entity, effect.pool);
        const max = selectPoolMax(entity, effect.pool);
        return effect.strength > 0
          ? current < max
          : current > -effect.strength;
      },
      apply: (effect: AdjustPoolEffect, context) => {
        const scope = defaultEffectScope(context, effect.scope);
        const entity = getScopedEntity(context, scope);
        if (!entity) {
          return context;
        }
        const max = selectPoolMax(entity, effect.pool);
        const nextEntity = adjustEntityPool(
          entity,
          effect.pool,
          effect.strength,
          max,
          context.engine.tick,
        );
        return withScopedEntity(context, scope, nextEntity);
      },
    });

    this.registerEffect('spawn-entity', {
      canHappen: (effect: SpawnEntityEffect, context) => {
        const definition = this.getEntityDefinition(effect.definitionId);
        if (!definition) {
          return false;
        }
        const active = selectActiveCount(context.engine, definition.id);
        const created = selectSpawnCount(context.engine, definition.id);
        if (
          definition.maxActive !== undefined &&
          active >= definition.maxActive
        ) {
          return false;
        }
        if (
          definition.maxCreated !== undefined &&
          created >= definition.maxCreated
        ) {
          return false;
        }
        if (effect.entityId && context.engine.entities.has(effect.entityId)) {
          return false;
        }
        return true;
      },
      apply: (effect: SpawnEntityEffect, context) => {
        const definition = this.getEntityDefinition(effect.definitionId);
        if (!definition) {
          return context;
        }
        const created = selectSpawnCount(context.engine, definition.id);
        const entityId =
          effect.entityId ?? `${definition.id}:${created + 1}`;
        if (context.engine.entities.has(entityId)) {
          return context;
        }
        const entity = instantiateEntity(
          definition,
          entityId,
          context.engine.tick,
        );
        const engine = withEngineSpawnCounts(
          upsertEntity(context.engine, entity),
          {
            ...context.engine.spawnCounts,
            [definition.id]: created + 1,
          },
        );
        return withEngineState(context, engine);
      },
    });

    this.registerEffect('remove-entity', {
      canHappen: (effect: RemoveEntityEffect, context) => {
        const scope = defaultRemoveEntityScope(context, effect.scope);
        return Boolean(getScopedEntity(context, scope));
      },
      apply: (effect: RemoveEntityEffect, context) => {
        const scope = defaultRemoveEntityScope(context, effect.scope);
        const id = resolveScopedEntityId(context, scope);
        if (!id || !context.engine.entities.has(id)) {
          return context;
        }
        return withEngineState(context, removeEntity(context.engine, id));
      },
    });

    this.registerEffect('show-message', {
      canHappen: (effect: ShowMessageEffect, context) => {
        const scope = defaultRemoveEntityScope(context, effect.scope);
        const entity = getScopedEntity(context, scope);
        if (!entity || !effect.name) {
          return false;
        }
        return (
          !entity.novelty.seenMessages[effect.name] &&
          !entity.novelty.offeredMessages[effect.name]
        );
      },
      apply: (effect: ShowMessageEffect, context) => {
        const scope = defaultRemoveEntityScope(context, effect.scope);
        const entity = getScopedEntity(context, scope);
        if (!entity || !effect.name) {
          return context;
        }
        return withScopedEntity(
          context,
          scope,
          offerMessage(entity, effect.name),
        );
      },
    });

    return this;
  }
}
