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
  HasSlotRequirement,
  MetricRequirement,
  PoolMaxRequirement,
  StatRequirement,
  TagRequirement,
} from './requirement';
import type {
  AdjustPoolEffect,
  GrantTagEffect,
  RemoveEntityEffect,
  SpawnEntityEffect,
} from './effect';
import type { EntityDefinition, EntityScope } from './entity';
import {
  instantiateEntity,
  withEntityTags,
} from './entity';
import {
  entityHasActiveTag,
  entityHasHeldSlot,
  reconcileSlotSelections,
} from './slots';
import {
  collectionHasHeldSlot,
  entitiesWithUniversal,
} from './document';
import { tryAdjustEntityPool } from './pools';
import { TagCollection } from './tag-collection';
import type {
  PoolDefinition,
  SlotDefinition,
  StatDefinition,
} from './catalog';
import type {
  BlockDefinition,
  GateDefinition,
} from './tools/analyzer/types';
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
  selectPoolEffectiveAvailableMax,
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
  private readonly slotDefinitions = new Map<string, SlotDefinition>();
  private readonly poolDefinitions = new Map<string, PoolDefinition>();
  private readonly statDefinitions = new Map<string, StatDefinition>();
  private readonly gateDefinitions = new Map<string, GateDefinition>();
  private readonly blockDefinitions = new Map<string, BlockDefinition>();

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

  registerSlotDefinition(definition: SlotDefinition): this {
    this.slotDefinitions.set(definition.id, definition);
    return this;
  }

  getSlotDefinition(id: string): SlotDefinition | undefined {
    return this.slotDefinitions.get(id);
  }

  listSlotDefinitions(): readonly SlotDefinition[] {
    return Object.freeze([...this.slotDefinitions.values()]);
  }

  registerPoolDefinition(definition: PoolDefinition): this {
    this.poolDefinitions.set(definition.id, definition);
    return this;
  }

  getPoolDefinition(id: string): PoolDefinition | undefined {
    return this.poolDefinitions.get(id);
  }

  listPoolDefinitions(): readonly PoolDefinition[] {
    return Object.freeze([...this.poolDefinitions.values()]);
  }

  registerStatDefinition(definition: StatDefinition): this {
    this.statDefinitions.set(definition.id, definition);
    return this;
  }

  getStatDefinition(id: string): StatDefinition | undefined {
    return this.statDefinitions.get(id);
  }

  listStatDefinitions(): readonly StatDefinition[] {
    return Object.freeze([...this.statDefinitions.values()]);
  }

  registerGateDefinition(definition: GateDefinition): this {
    this.gateDefinitions.set(definition.id, definition);
    return this;
  }

  getGateDefinition(id: string): GateDefinition | undefined {
    return this.gateDefinitions.get(id);
  }

  listGateDefinitions(): readonly GateDefinition[] {
    return Object.freeze([...this.gateDefinitions.values()]);
  }

  registerBlockDefinition(definition: BlockDefinition): this {
    this.blockDefinitions.set(definition.id, definition);
    return this;
  }

  getBlockDefinition(id: string): BlockDefinition | undefined {
    return this.blockDefinitions.get(id);
  }

  listBlockDefinitions(): readonly BlockDefinition[] {
    return Object.freeze([...this.blockDefinitions.values()]);
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
   * Registers builtins: free/forbidden/tag/has-slot/has-slot-local/
   * has-slot-universal/stat/pool-max/entity-count/metric requirements and
   * grant-tag/adjust-pool/spawn-entity/remove-entity effects.
   * Tag passives include reserve-pool (derived reservation).
   */
  createBuiltinAdaptors(): this {
    this.registerRequirement('free', () => true);
    this.registerRequirement('forbidden', () => false);

    const evalMap = (context: EngineContext<THost>) =>
      entitiesWithUniversal(context.engine, context.universalTags);

    const activeOpts = (
      context: EngineContext<THost>,
      entity: { id: string },
    ) => ({
      universalTags: context.universalTags,
      mergeUnslottedUniversal:
        entity.id === context.engine.primaryEntityId,
    });

    this.registerRequirement('tag', (requirement: TagRequirement, context) => {
      const scope = defaultRequirementScope(context, requirement.scope);
      const entity = getScopedEntity(context, scope);
      const present = entity
        ? entityHasActiveTag(
            entity,
            requirement.tagName,
            this,
            evalMap(context),
            {
              universalTags: context.universalTags,
              mergeUnslottedUniversal: false,
            },
          )
        : false;
      return requirement.exists ? present : !present;
    });

    const hasSlotPresent = (
      requirement: HasSlotRequirement,
      context: EngineContext<THost>,
      mode: 'any' | 'local' | 'universal',
    ): boolean => {
      const local =
        mode === 'universal'
          ? false
          : (() => {
              const scope = defaultRequirementScope(context, requirement.scope);
              const entity = getScopedEntity(context, scope);
              return entity
                ? entityHasHeldSlot(entity, requirement.slot)
                : false;
            })();
      const universal =
        mode === 'local'
          ? false
          : collectionHasHeldSlot(context.universalTags, requirement.slot);
      if (mode === 'local') {
        return local;
      }
      if (mode === 'universal') {
        return universal;
      }
      return local || universal;
    };

    const registerHasSlot = (
      type: 'has-slot' | 'has-slot-local' | 'has-slot-universal',
      mode: 'any' | 'local' | 'universal',
    ) => {
      this.registerRequirement(type, (requirement: HasSlotRequirement, context) => {
        const present = hasSlotPresent(requirement, context, mode);
        const exists = requirement.exists ?? true;
        return exists ? present : !present;
      });
    };
    registerHasSlot('has-slot', 'any');
    registerHasSlot('has-slot-local', 'local');
    registerHasSlot('has-slot-universal', 'universal');

    this.registerRequirement('stat', (requirement: StatRequirement, context) => {
      const scope = defaultRequirementScope(context, requirement.scope);
      const entity = getScopedEntity(context, scope);
      if (!entity) {
        return false;
      }
      return (
        selectStatValue(
          entity,
          requirement.stat,
          this,
          evalMap(context),
          activeOpts(context, entity),
          context.engine,
          context.universalTags,
        ) >= requirement.amount
      );
    });

    this.registerRequirement(
      'pool-max',
      (requirement: PoolMaxRequirement, context) => {
        const scope = defaultRequirementScope(context, requirement.scope);
        const entity = getScopedEntity(context, scope);
        if (!entity) {
          return false;
        }
        return (
          selectPoolMax(
            entity,
            requirement.pool,
            this,
            evalMap(context),
            activeOpts(context, entity),
            context.engine,
            context.universalTags,
          ) > requirement.amount
        );
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
          return (
            selectPoolCurrent(entity, requirement.pool, this) >=
            requirement.amount
          );
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
        const withTags = withEntityTags(
          entity,
          entity.tags.add(tag),
          context.engine.tick,
          this,
          context.engine.entities,
        );
        const provisional = upsertEntity(context.engine, withTags);
        const nextEntity = reconcileSlotSelections(
          provisional.entities.get(entity.id)!,
          provisional,
          this,
          tag.name,
        );
        return withEngineState(
          context,
          upsertEntity(provisional, nextEntity),
        );
      },
    });

    this.registerEffect('adjust-pool', {
      canHappen: (effect: AdjustPoolEffect, context) => {
        const scope = defaultEffectScope(context, effect.scope);
        const entity = getScopedEntity(context, scope);
        if (!entity) {
          return false;
        }
        const current = selectPoolCurrent(entity, effect.pool, this);
        const universalTags =
          context.universalTags ?? TagCollection.create();
        const availableMax = selectPoolEffectiveAvailableMax(
          context.engine,
          entity,
          effect.pool,
          this,
          universalTags,
        );
        return effect.strength > 0
          ? current < availableMax
          : current >= -effect.strength;
      },
      apply: (effect: AdjustPoolEffect, context) => {
        const scope = defaultEffectScope(context, effect.scope);
        const entity = getScopedEntity(context, scope);
        if (!entity) {
          return context;
        }
        const universalTags =
          context.universalTags ?? TagCollection.create();
        const nextEntity = tryAdjustEntityPool(
          context.engine,
          entity,
          effect.pool,
          effect.strength,
          this,
          universalTags,
          context.engine.tick,
        );
        if (!nextEntity) {
          return context;
        }
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

    return this;
  }
}
