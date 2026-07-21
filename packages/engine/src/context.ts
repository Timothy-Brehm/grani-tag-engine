import type { TagCollection } from './tag-collection';

export interface EngineContext<THost = unknown> {
  readonly tags: TagCollection;
  readonly host: THost;
}

export function withTags<THost>(
  ctx: EngineContext<THost>,
  tags: TagCollection,
): EngineContext<THost> {
  return { tags, host: ctx.host };
}
