import type { EngineCommand } from './command';
import type { EngineRegistry, HostWithTagCatalog } from './registry';
import {
  removeEntity,
  upsertEntity,
  withEngineTick,
  withPrimaryEntityId,
  withEngineSpawnCounts,
  engineStateToJSON,
  type EngineState,
} from './state';
import { TagCollection } from './tag-collection';
import { clearProcessPool, setProcessAllocation } from './process';
import {
  instantiateEntity,
  withEntityTags,
  type EntityInstance,
} from './entity';
import { selectSpawnCount } from './selectors';
import {
  reconcilePoolReservations,
  tryAdjustEntityPool,
} from './pools';
import {
  advanceContinuousActions,
  cancelContinuousAction,
  continuousProgressKey,
  pauseContinuousAction,
  pulseGenerators,
  startContinuousAction,
} from './continuous';
import {
  assignCapacity,
  clearCapacityAssignment,
} from './capacity';
import {
  holdingIsSelectedElsewhere,
  reconcileAllSlotSelections,
  reconcileSlotSelections,
  withSlotSelection,
} from './slots';
import { slotDefinitionMode } from './catalog';
import { createTag, type Tag } from './tag';
import {
  UNIVERSAL_TAGS_HOLDER_ID,
  getActiveGame,
  gameStateFromJSON,
  withActiveGame,
  withActiveGameId,
  withUniversalTags,
  type EngineDocument,
} from './document';

function lookupCatalogTagFromHost(host: unknown, name: string): Tag | undefined {
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

export type ReduceEngineOptions<THost = unknown> = {
  readonly registry: EngineRegistry<THost>;
  readonly host: THost;
  /** Settings.universalTags when reducing inside a document (default empty). */
  readonly universalTags?: import('./tag-collection').TagCollection;
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
    options.universalTags,
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
  const next = reduceEngineStateInner(state, command, options);
  if (next === state) {
    return state;
  }
  return reconcilePoolReservations(
    state,
    next,
    options.registry,
    options.universalTags ?? TagCollection.create(),
  );
}

function reduceEngineStateInner<THost = unknown>(
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
      return reconcileAllSlotSelections(
        next,
        options.registry,
        options.universalTags,
      );
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
      return reconcileAllSlotSelections(
        next,
        options.registry,
        options.universalTags,
      );
    }
    case 'adjust-pool': {
      const entity = state.entities.get(command.entityId);
      if (!entity) {
        return state;
      }
      const adjusted = tryAdjustEntityPool(
        state,
        entity,
        command.pool,
        command.delta,
        options.registry,
        options.universalTags ?? TagCollection.create(),
        state.tick,
      );
      if (!adjusted) {
        return state;
      }
      return upsertEntity(state, adjusted);
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
      return reconcileAllSlotSelections(
        next,
        options.registry,
        options.universalTags,
      );
    }
    case 'set-primary-entity':
      return withPrimaryEntityId(state, command.entityId);
    case 'tick': {
      const steps = command.steps ?? 1;
      let next = state;
      const universalTags =
        options.universalTags ?? TagCollection.create();
      for (let i = 0; i < steps; i += 1) {
        next = withEngineTick(next, next.tick + 1);
        next = pulseGenerators(next, options.registry, universalTags);
        next = advanceContinuousActions(next, {
          registry: options.registry,
          host: options.host,
          universalTags,
        });
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
        universalTags: options.universalTags,
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
      const universalTags =
        options.universalTags ?? TagCollection.create();
      const tag =
        holderId === UNIVERSAL_TAGS_HOLDER_ID
          ? universalTags.get(command.tagName)
          : state.entities.get(holderId)?.tags.get(command.tagName);
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
          universalTags,
        ),
      );
    }
    case 'settings-grant-tag':
    case 'settings-add-tag':
    case 'settings-remove-tag':
    case 'games-create':
    case 'games-switch':
    case 'games-fork':
    case 'games-delete':
      throw new Error(
        `Command "${command.type}" requires reduceEngineDocument`,
      );
    case 'set-process-allocation':
      return setProcessAllocation({
        processId: command.processId,
        allocation: command.allocation,
      });
    case 'clear-process-pool':
      return clearProcessPool(command.poolId);
    case 'assign-capacity': {
      const universalTags =
        options.universalTags ?? TagCollection.create();
      return (
        assignCapacity(
          state,
          command.converterEntityId,
          command.assignment,
          options.registry,
          universalTags,
        ) ?? state
      );
    }
    case 'clear-capacity-assignment': {
      const universalTags =
        options.universalTags ?? TagCollection.create();
      return (
        clearCapacityAssignment(
          state,
          command.converterEntityId,
          command.assignmentId,
          options.registry,
          universalTags,
        ) ?? state
      );
    }
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}

function isDocumentCommand(type: string): boolean {
  return (
    type.startsWith('settings-') ||
    type.startsWith('games-')
  );
}

/**
 * Pure document transition. Play commands apply to the active game;
 * settings-/games- commands mutate the document envelope.
 */
export function reduceEngineDocument<THost = unknown>(
  doc: EngineDocument,
  command: EngineCommand<THost>,
  options: ReduceEngineOptions<THost>,
): EngineDocument {
  const opts: ReduceEngineOptions<THost> = {
    ...options,
    universalTags: doc.settings.universalTags,
  };

  switch (command.type) {
    case 'settings-grant-tag': {
      if (doc.settings.universalTags.has(command.tagName)) {
        return doc;
      }
      const fromCatalog = lookupCatalogTagFromHost(
        options.host,
        command.tagName,
      );
      const tag = fromCatalog ?? createTag({ name: command.tagName, effects: [] });
      return withUniversalTags(doc, doc.settings.universalTags.add(tag));
    }
    case 'settings-add-tag': {
      if (doc.settings.universalTags.has(command.tag.name)) {
        return doc;
      }
      return withUniversalTags(
        doc,
        doc.settings.universalTags.add(command.tag),
      );
    }
    case 'settings-remove-tag': {
      if (!doc.settings.universalTags.has(command.name)) {
        return doc;
      }
      return withUniversalTags(
        doc,
        doc.settings.universalTags.remove(command.name),
      );
    }
    case 'games-create': {
      if (doc.games.has(command.gameId)) {
        return doc;
      }
      const games = new Map(doc.games);
      games.set(command.gameId, command.game);
      const gameMeta = new Map(doc.gameMeta);
      if (command.meta) {
        gameMeta.set(command.gameId, command.meta);
      }
      let next: EngineDocument = {
        ...doc,
        games,
        gameMeta,
      };
      if (command.switchTo !== false) {
        next = withActiveGameId(next, command.gameId);
      }
      return next;
    }
    case 'games-switch':
      return withActiveGameId(doc, command.gameId);
    case 'games-fork': {
      const fromId = command.fromGameId ?? doc.settings.activeGameId;
      const source = doc.games.get(fromId);
      if (!source || doc.games.has(command.newGameId)) {
        return doc;
      }
      const clone = gameStateFromJSON(engineStateToJSON(source));
      const games = new Map(doc.games);
      games.set(command.newGameId, clone);
      const gameMeta = new Map(doc.gameMeta);
      if (command.meta) {
        gameMeta.set(command.newGameId, command.meta);
      }
      let next: EngineDocument = { ...doc, games, gameMeta };
      if (command.switchTo) {
        next = withActiveGameId(next, command.newGameId);
      }
      return next;
    }
    case 'games-delete': {
      if (
        command.gameId === doc.settings.activeGameId ||
        doc.games.size <= 1 ||
        !doc.games.has(command.gameId)
      ) {
        return doc;
      }
      const games = new Map(doc.games);
      games.delete(command.gameId);
      const gameMeta = new Map(doc.gameMeta);
      gameMeta.delete(command.gameId);
      return { ...doc, games, gameMeta };
    }
    default: {
      if (isDocumentCommand(command.type)) {
        return doc;
      }
      const nextGame = reduceEngineState(getActiveGame(doc), command, opts);
      return withActiveGame(doc, nextGame);
    }
  }
}

export function reduceEngineCommandsDocument<THost = unknown>(
  doc: EngineDocument,
  commands: readonly EngineCommand<THost>[],
  options: ReduceEngineOptions<THost>,
): EngineDocument {
  return commands.reduce(
    (next, command) => reduceEngineDocument(next, command, options),
    doc,
  );
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
