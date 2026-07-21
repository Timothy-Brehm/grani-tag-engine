import { createTag, type Tag } from './tag';
import type { EngineContext } from './context';
import { withTags } from './context';
import type { TagRequirement } from './requirement';
import type { ActiveEffect } from './effect';

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

export class EngineRegistry<THost = unknown> {
  private readonly requirements = new Map<string, RequirementAdaptor<any, THost>>();
  private readonly effects = new Map<string, EffectAdaptor<any, THost>>();

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
   * Registers builtins: free, forbidden, tag requirements;
   * and grant-tag active effect (adds a minimal tag by effect.name if missing).
   * Optional host.tagCatalog (Map or record) supplies fuller tag definitions.
   */
  createBuiltinAdaptors(): this {
    this.registerRequirement('free', () => true);
    this.registerRequirement('forbidden', () => false);
    this.registerRequirement('tag', (requirement: TagRequirement, context) => {
      const present = context.tags.has(requirement.tagName);
      return requirement.exists ? present : !present;
    });

    this.registerEffect('grant-tag', {
      canHappen(effect: ActiveEffect, context) {
        return !context.tags.has(effect.name);
      },
      apply(effect: ActiveEffect, context) {
        if (context.tags.has(effect.name)) {
          return context;
        }
        const fromCatalog = lookupCatalogTag(context.host, effect.name);
        const tag = fromCatalog
          ? createTag(fromCatalog)
          : createTag({ name: effect.name, effects: [] });
        return withTags(context, context.tags.add(tag));
      },
    });

    return this;
  }
}
