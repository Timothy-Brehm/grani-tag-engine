export type { Tag, TagEffect } from './tag';
export { createTag } from './tag';

export type { TagCollectionJSON } from './tag-collection';
export { TagCollection } from './tag-collection';

export type {
  FreeRequirement,
  ForbiddenRequirement,
  TagRequirement,
  StatRequirement,
  PoolMaxRequirement,
  EntityCountRequirement,
  BuiltinRequirement,
  Requirement,
} from './requirement';

export type {
  ActiveEffect,
  AdjustPoolEffect,
  GrantTagEffect,
  SpawnEntityEffect,
} from './effect';

export type { ActionDefinition, RequirementCheck } from './action';

export type {
  EntityScope,
  EntityPoolMap,
  EntityInstance,
  EntityInstanceJSON,
  EntityDefinition,
} from './entity';
export {
  createEntityInstance,
  entityInstanceToJSON,
  entityInstanceFromJSON,
  withEntityTags,
  withEntityPools,
  adjustEntityPool,
  instantiateEntity,
} from './entity';

export type { EngineContext } from './context';
export {
  withTags,
  withEngineState,
  withScopedEntity,
  getScopedEntity,
  resolveScopedEntityId,
} from './context';

export type { RequirementAdaptor, EffectAdaptor, HostWithTagCatalog } from './registry';
export { EngineRegistry } from './registry';

export {
  requirementsMet,
  codeRequirementsMet,
  costsPayable,
  anyResultPossible,
  isActionAvailable,
  executeAction,
  executeActionSafe,
} from './evaluate';

export type { EngineState, EngineStateJSON, ActionRoles } from './state';
export {
  createEngineState,
  engineStateToJSON,
  engineStateFromJSON,
  toEngineContext,
  withEngineTick,
  withEngineEntities,
  withEngineSpawnCounts,
  withPrimaryEntityId,
  upsertEntity,
  removeEntity,
  createTaggedEntity,
} from './state';

export type { EngineCommand } from './command';

export {
  sumTagEffectStrength,
  sumTaggedFieldStrength,
  selectEntity,
  selectEntitiesByDefinition,
  selectStatValue,
  selectPoolMax,
  selectPoolCurrent,
  selectActiveCount,
  selectSpawnCount,
  selectPrimaryEntity,
  selectPrimaryEntityId,
} from './selectors';

export type {
  ProcessPoolKind,
  ProcessCapacity,
  ProcessPoolDefinition,
  ProcessDefinition,
  ProcessSelection,
} from './process';
export {
  ProcessesNotImplementedError,
  setProcessAllocation,
  clearProcessPool,
} from './process';

export type { ReduceEngineOptions } from './reduce';
export {
  reduceEngineState,
  reduceEngineCommands,
  foldEngineCommands,
} from './reduce';
