import { createTag, type Tag } from './tag';
import type { EngineContext } from './context';
import {
  getScopedEntity,
  withEngineState,
  withScopedEntity,
} from './context';
import type {
  EntityCountRequirement,
  PoolMaxRequirement,
  StatRequirement,
  TagRequirement,
} from './requirement';
import type {
  AdjustPoolEffect,
  GrantTagEffect,
  SpawnEntityEffect,
} from './effect';
import type { EntityDefinition, EntityScope } from './entity';
import {
  adjustEntityPool,
  instantiateEntity,
  withEntityTags,
} from './entity';
import {
  selectActiveCount,
  selectPoolCurrent,
  selectPoolMax,
  selectSpawnCount,
  selectStatValue,
} from './selectors';
import {
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
   * Registers builtins: free/forbidden/tag/stat/pool-max/entity-count
   * requirements and grant-tag/adjust-pool/spawn-entity effects.
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
        const nextEntity = withEntityTags(entity, entity.tags.add(tag));
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
        const entity = instantiateEntity(definition, entityId);
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

    return this;
  }
}
