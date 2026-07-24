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
  MetricRequirement,
  BuiltinRequirement,
  Requirement,
} from './requirement';

export type {
  ActiveEffect,
  AdjustPoolEffect,
  GrantTagEffect,
  RemoveEntityEffect,
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
  withEntityMetrics,
  adjustEntityPool,
  instantiateEntity,
} from './entity';

export type {
  ActionCountMetric,
  LifetimeUsedMetric,
  EntityMetrics,
  EntityMetricsJSON,
  ActionExecutionKind,
} from './metrics';
export {
  emptyEntityMetrics,
  entityMetricsToJSON,
  entityMetricsFromJSON,
  refreshEntityHighWaters,
  recordActionExecution,
  recordPoolLifetimeUsed,
  recordTagGrants,
  selectActionCount,
  selectActionFirstTick,
  selectActionLastTick,
  selectPoolHighWater,
  selectPoolLifetimeUsed,
  selectPoolLifetimeUsedFirstTick,
  selectPoolLifetimeUsedLastTick,
  selectPoolLowWater,
  selectPoolMaxHighWater,
  selectStatHighWater,
  selectStatLowWater,
  selectTagGrantedAt,
} from './metrics';

export type { NovelKind, NovelRef, NoveltyAck } from './novelty-types';
export {
  selectNoveltyHolder,
  selectIsNovel,
  selectEntityIsNovel,
  selectActionIsNovel,
  selectPoolIsNovel,
  selectStatIsNovel,
  selectTagIsNovel,
  selectNovelOnEntity,
  selectNovelInState,
  selectEntityHasNovel,
  selectEntityIsNew,
  selectActionIsNew,
  selectPoolIsNew,
  selectStatIsNew,
  selectEntityHasNew,
} from './novelty';

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
