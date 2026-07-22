import type { EngineCommand } from './command';
import type { EngineRegistry } from './registry';
import {
  createEngineState,
  removeEntity,
  toEngineContext,
  upsertEntity,
  withEngineTick,
  withPrimaryEntityId,
  withEngineSpawnCounts,
  type EngineState,
} from './state';
import { executeAction, executeActionSafe } from './evaluate';
import { TagCollection } from './tag-collection';
import { clearProcessPool, setProcessAllocation } from './process';
import {
  adjustEntityPool,
  instantiateEntity,
  withEntityTags,
} from './entity';
import { selectPoolMax, selectSpawnCount } from './selectors';

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
    case 'add-tag': {
      const entity = state.entities.get(command.entityId);
      if (!entity || entity.tags.has(command.tag.name)) {
        return state;
      }
      return upsertEntity(
        state,
        withEntityTags(entity, entity.tags.add(command.tag)),
      );
    }
    case 'remove-tag': {
      const entity = state.entities.get(command.entityId);
      if (!entity) {
        return state;
      }
      return upsertEntity(
        state,
        withEntityTags(entity, entity.tags.remove(command.name)),
      );
    }
    case 'replace-tags': {
      const entity = state.entities.get(command.entityId);
      if (!entity) {
        return state;
      }
      return upsertEntity(
        state,
        withEntityTags(entity, TagCollection.create(command.tags)),
      );
    }
    case 'adjust-pool': {
      const entity = state.entities.get(command.entityId);
      if (!entity) {
        return state;
      }
      const max = selectPoolMax(entity, command.pool);
      return upsertEntity(
        state,
        adjustEntityPool(entity, command.pool, command.delta, max),
      );
    }
    case 'spawn-entity': {
      const definition = options.registry.getEntityDefinition(
        command.definitionId,
      );
      if (!definition) {
        return state;
      }
      const created = selectSpawnCount(state, definition.id);
      const entityId = command.entityId ?? `${definition.id}:${created + 1}`;
      if (state.entities.has(entityId)) {
        return state;
      }
      const active = [...state.entities.values()].filter(
        (entry) => entry.definitionId === definition.id,
      ).length;
      if (
        definition.maxActive !== undefined &&
        active >= definition.maxActive
      ) {
        return state;
      }
      if (
        definition.maxCreated !== undefined &&
        created >= definition.maxCreated
      ) {
        return state;
      }
      const entity = instantiateEntity(definition, entityId);
      return withEngineSpawnCounts(upsertEntity(state, entity), {
        ...state.spawnCounts,
        [definition.id]: created + 1,
      });
    }
    case 'remove-entity':
      return removeEntity(state, command.entityId);
    case 'set-primary-entity':
      return withPrimaryEntityId(state, command.entityId);
    case 'tick': {
      const steps = command.steps ?? 1;
      return withEngineTick(state, state.tick + steps);
    }
    case 'execute-action': {
      const ctx = toEngineContext(state, options.host, {
        actorEntityId: command.actorEntityId,
        sourceEntityId: command.sourceEntityId,
        targetEntityId: command.targetEntityId,
      });
      const nextCtx =
        command.mode === 'safe'
          ? executeActionSafe(options.registry, command.action, ctx)
          : executeAction(options.registry, command.action, ctx);
      return nextCtx.engine;
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
