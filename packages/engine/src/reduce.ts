import type { EngineCommand } from './command';
import type { EngineRegistry } from './registry';
import {
  removeEntity,
  upsertEntity,
  withEngineTick,
  withPrimaryEntityId,
  withEngineSpawnCounts,
  type EngineState,
} from './state';
import { TagCollection } from './tag-collection';
import { clearProcessPool, setProcessAllocation } from './process';
import {
  adjustEntityPool,
  instantiateEntity,
  withEntityTags,
  type EntityInstance,
} from './entity';
import { selectPoolMax, selectSpawnCount } from './selectors';
import {
  advanceContinuousActions,
  cancelContinuousAction,
  continuousProgressKey,
  pauseContinuousAction,
  pulseGenerators,
  startContinuousAction,
} from './continuous';
import {
  holdingIsSelectedElsewhere,
  reconcileAllSlotSelections,
  reconcileSlotSelections,
  withSlotSelection,
} from './slots';
import { slotDefinitionMode } from './catalog';

export type ReduceEngineOptions<THost = unknown> = {
  readonly registry: EngineRegistry<THost>;
  readonly host: THost;
};

function applyEntityTags<THost>(
  state: EngineState,
  entity: EntityInstance,
  tags: TagCollection,
  options: ReduceEngineOptions<THost>,
  preferTagName?: string,
): EngineState {
  const withTags = withEntityTags(
    entity,
    tags,
    state.tick,
    options.registry,
    state.entities,
  );
  const provisional = upsertEntity(state, withTags);
  const reconciled = reconcileSlotSelections(
    provisional.entities.get(entity.id)!,
    provisional,
    options.registry,
    preferTagName,
  );
  return upsertEntity(provisional, reconciled);
}

function resolveProgressKey(command: {
  readonly progressKey?: string;
  readonly actorEntityId?: string;
  readonly actionName?: string;
  readonly sourceEntityId?: string;
}): string | undefined {
  if (command.progressKey) {
    return command.progressKey;
  }
  if (command.actorEntityId && command.actionName) {
    return continuousProgressKey({
      actorEntityId: command.actorEntityId,
      actionName: command.actionName,
      sourceEntityId: command.sourceEntityId,
    });
  }
  return undefined;
}

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
      return applyEntityTags(
        state,
        entity,
        entity.tags.add(command.tag),
        options,
        command.tag.name,
      );
    }
    case 'remove-tag': {
      const entity = state.entities.get(command.entityId);
      if (!entity) {
        return state;
      }
      const next = applyEntityTags(
        state,
        entity,
        entity.tags.remove(command.name),
        options,
      );
      return reconcileAllSlotSelections(next, options.registry);
    }
    case 'replace-tags': {
      const entity = state.entities.get(command.entityId);
      if (!entity) {
        return state;
      }
      const next = applyEntityTags(
        state,
        entity,
        TagCollection.create(command.tags),
        options,
      );
      return reconcileAllSlotSelections(next, options.registry);
    }
    case 'adjust-pool': {
      const entity = state.entities.get(command.entityId);
      if (!entity) {
        return state;
      }
      const max = selectPoolMax(
        entity,
        command.pool,
        options.registry,
        state.entities,
      );
      return upsertEntity(
        state,
        adjustEntityPool(
          entity,
          command.pool,
          command.delta,
          max,
          state.tick,
        ),
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
      const entity = instantiateEntity(definition, entityId, state.tick);
      const provisional = upsertEntity(state, entity);
      const reconciled = reconcileSlotSelections(
        provisional.entities.get(entityId)!,
        provisional,
        options.registry,
      );
      return withEngineSpawnCounts(upsertEntity(provisional, reconciled), {
        ...state.spawnCounts,
        [definition.id]: created + 1,
      });
    }
    case 'remove-entity': {
      const next = removeEntity(state, command.entityId);
      return reconcileAllSlotSelections(next, options.registry);
    }
    case 'set-primary-entity':
      return withPrimaryEntityId(state, command.entityId);
    case 'tick': {
      const steps = command.steps ?? 1;
      let next = state;
      for (let i = 0; i < steps; i += 1) {
        next = withEngineTick(next, next.tick + 1);
        next = pulseGenerators(next, options.registry);
        next = advanceContinuousActions(next, options);
      }
      return next;
    }
    case 'execute-action': {
      const actorEntityId =
        command.actorEntityId ?? state.primaryEntityId;
      return startContinuousAction(state, {
        registry: options.registry,
        host: options.host,
        action: command.action,
        actorEntityId,
        sourceEntityId: command.sourceEntityId,
        targetEntityId: command.targetEntityId,
        execution: command.execution ?? 'manual',
        mode: command.mode ?? 'strict',
      });
    }
    case 'pause-continuous-action': {
      const key = resolveProgressKey(command);
      if (!key) {
        return state;
      }
      return pauseContinuousAction(state, key);
    }
    case 'cancel-continuous-action': {
      const key = resolveProgressKey(command);
      if (!key) {
        return state;
      }
      return cancelContinuousAction(state, key);
    }
    case 'select-slot-item': {
      const entity = state.entities.get(command.entityId);
      if (!entity) {
        return state;
      }
      const holderId = command.holderEntityId ?? command.entityId;
      const holder = state.entities.get(holderId);
      const tag = holder?.tags.get(command.tagName);
      if (!tag || tag.slot !== command.slot) {
        return state;
      }
      if (slotDefinitionMode(options.registry.getSlotDefinition(command.slot)) !== 'selectable') {
        return state;
      }
      if (
        options.registry.getSlotDefinition(command.slot)?.cannotShareTag &&
        holdingIsSelectedElsewhere(
          state,
          command.slot,
          { holderEntityId: holderId, tagName: command.tagName },
          command.entityId,
        )
      ) {
        return state;
      }
      return upsertEntity(
        state,
        withSlotSelection(
          entity,
          command.slot,
          command.tagName,
          holderId,
          state,
          options.registry,
        ),
      );
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
  initial: EngineState,
): EngineState {
  return reduceEngineCommands(initial, commands, options);
}
