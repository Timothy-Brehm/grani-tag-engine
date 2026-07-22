import type { TagCollection } from './tag-collection';
import type { EngineState } from './state';
import type { EntityInstance, EntityScope } from './entity';
import { withEntityTags } from './entity';
import { upsertEntity } from './state';

export interface EngineContext<THost = unknown> {
  readonly engine: EngineState;
  readonly host: THost;
  /**
   * Convenience tag view for the focused entity (actor, else source, else
   * target). Prefer scoped helpers for multi-entity actions.
   */
  readonly tags: TagCollection;
  readonly actorEntityId?: string;
  readonly sourceEntityId?: string;
  readonly targetEntityId?: string;
}

export function resolveScopedEntityId(
  context: EngineContext<unknown>,
  scope: EntityScope,
): string | undefined {
  switch (scope) {
    case 'actor':
      return context.actorEntityId;
    case 'source':
      return context.sourceEntityId;
    case 'target':
      return context.targetEntityId;
  }
}

export function getScopedEntity(
  context: EngineContext<unknown>,
  scope: EntityScope,
): EntityInstance | undefined {
  const id = resolveScopedEntityId(context, scope);
  return id ? context.engine.entities.get(id) : undefined;
}

export function withEngineState<THost>(
  ctx: EngineContext<THost>,
  engine: EngineState,
): EngineContext<THost> {
  const focusId =
    ctx.actorEntityId ?? ctx.sourceEntityId ?? ctx.targetEntityId;
  const focus = focusId ? engine.entities.get(focusId) : undefined;
  return {
    ...ctx,
    engine,
    tags: focus?.tags ?? ctx.tags,
  };
}

export function withTags<THost>(
  ctx: EngineContext<THost>,
  tags: TagCollection,
): EngineContext<THost> {
  const focusId =
    ctx.actorEntityId ?? ctx.sourceEntityId ?? ctx.targetEntityId;
  if (!focusId) {
    return { ...ctx, tags };
  }
  const entity = ctx.engine.entities.get(focusId);
  if (!entity) {
    return { ...ctx, tags };
  }
  const nextEngine = upsertEntity(
    ctx.engine,
    withEntityTags(entity, tags, ctx.engine.tick),
  );
  return withEngineState(ctx, nextEngine);
}

export function withScopedEntity<THost>(
  ctx: EngineContext<THost>,
  _scope: EntityScope,
  entity: EntityInstance,
): EngineContext<THost> {
  return withEngineState(ctx, upsertEntity(ctx.engine, entity));
}
