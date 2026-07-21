import type { EngineCommand } from './command';
import type { EngineRegistry } from './registry';
import {
  createEngineState,
  toEngineContext,
  withEngineTags,
  withEngineTick,
  type EngineState,
} from './state';
import { executeAction, executeActionSafe } from './evaluate';
import { TagCollection } from './tag-collection';
import { clearProcessPool, setProcessAllocation } from './process';

export type ReduceEngineOptions<THost = unknown> = {
  readonly registry: EngineRegistry<THost>;
  readonly host: THost;
};

/**
 * Pure engine transition. Returns the next EngineState; never mutates input.
 */
export function reduceEngineState<THost = unknown>(
  state: EngineState,
  command: EngineCommand<THost>,
  options: ReduceEngineOptions<THost>,
): EngineState {
  switch (command.type) {
    case 'add-tag':
      return withEngineTags(state, state.tags.add(command.tag));
    case 'remove-tag':
      return withEngineTags(state, state.tags.remove(command.name));
    case 'replace-tags':
      return withEngineTags(state, TagCollection.create(command.tags));
    case 'tick': {
      const steps = command.steps ?? 1;
      return withEngineTick(state, state.tick + steps);
    }
    case 'execute-action': {
      const ctx = toEngineContext(state, options.host);
      const nextCtx =
        command.mode === 'safe'
          ? executeActionSafe(options.registry, command.action, ctx)
          : executeAction(options.registry, command.action, ctx);
      return withEngineTags(state, nextCtx.tags);
    }
    case 'set-process-allocation':
      return setProcessAllocation({
        processId: command.processId,
        allocation: command.allocation,
      });
    case 'clear-process-pool':
      return clearProcessPool(command.poolId);
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}

export function reduceEngineCommands<THost = unknown>(
  state: EngineState,
  commands: readonly EngineCommand<THost>[],
  options: ReduceEngineOptions<THost>,
): EngineState {
  return commands.reduce(
    (next, command) => reduceEngineState(next, command, options),
    state,
  );
}

/** Convenience: empty engine + reduce a command list. */
export function foldEngineCommands<THost = unknown>(
  commands: readonly EngineCommand<THost>[],
  options: ReduceEngineOptions<THost>,
  initial: EngineState = createEngineState(),
): EngineState {
  return reduceEngineCommands(initial, commands, options);
}
