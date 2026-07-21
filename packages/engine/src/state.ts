import { TagCollection, type TagCollectionJSON } from './tag-collection';
import type { Tag } from './tag';
import type { EngineContext } from './context';

/** Serializable, framework-neutral engine slice owned by the core package. */
export interface EngineState {
  readonly tags: TagCollection;
  /** Monotonic tick counter advanced by the `tick` command. */
  readonly tick: number;
}

export type EngineStateJSON = {
  tags: TagCollectionJSON;
  tick: number;
};

export function createEngineState(
  input: {
    tags?: readonly Tag[] | TagCollection;
    tick?: number;
  } = {},
): EngineState {
  const tags =
    input.tags instanceof TagCollection
      ? input.tags
      : TagCollection.create(input.tags ?? []);
  return {
    tags,
    tick: input.tick ?? 0,
  };
}

export function engineStateToJSON(state: EngineState): EngineStateJSON {
  return {
    tags: state.tags.toJSON(),
    tick: state.tick,
  };
}

export function engineStateFromJSON(json: EngineStateJSON): EngineState {
  return createEngineState({
    tags: TagCollection.fromJSON(json.tags ?? { tags: [] }),
    tick: json.tick ?? 0,
  });
}

/** View engine state as an evaluation context for a host payload. */
export function toEngineContext<THost>(
  state: EngineState,
  host: THost,
): EngineContext<THost> {
  return { tags: state.tags, host };
}

export function withEngineTags(
  state: EngineState,
  tags: TagCollection,
): EngineState {
  return { tags, tick: state.tick };
}

export function withEngineTick(state: EngineState, tick: number): EngineState {
  return { tags: state.tags, tick };
}
