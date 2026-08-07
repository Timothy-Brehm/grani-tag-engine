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
  HasSlotRequirement,
  MetricRequirement,
  BuiltinRequirement,
  Requirement,
} from './requirement';

export type {
  EngineDocument,
  EngineDocumentJSON,
  EngineSettings,
  EngineSettingsJSON,
  GameMeta,
} from './document';
export {
  UNIVERSAL_TAGS_HOLDER_ID,
  DEFAULT_GAME_ID,
  createEngineDocument,
  wrapGameAsDocument,
  getActiveGame,
  migrateEngineStateToDocument,
  engineDocumentToJSON,
  engineDocumentFromJSON,
  gameStateFromJSON,
  createUniversalHolderEntity,
  entitiesWithUniversal,
  withActiveGame,
  withActiveGameId,
  withUniversalTags,
  collectionHasHeldSlot,
  selectUniversalUnslottedActiveTags,
} from './document';

export type { ActiveTagOptions } from './slots';

export type {
  CatalogMeta,
  SlotDefinition,
  PoolDefinition,
  StatDefinition,
  SlotMode,
  CatalogWarning,
  CatalogWarningKind,
  CatalogRegistryView,
} from './catalog';
export {
  slotDefinitionMode,
  collectCatalogWarnings,
} from './catalog';

export type {
  AnalyzerContentMeta,
  GateDefinition,
  BlockDefinition,
  BlockEntry,
  AnalyzerActionKey,
  InfinitePoolRow,
  InfinitePoolSource,
  AccumulatingPoolRow,
  AccumulatingPoolSource,
  NonFarmableAction,
  NonFarmableReason,
  FiniteStockpileRow,
  GraphAction,
  ContentGraph,
  AnalyzeOptions,
  ReachableSlice,
  PoolAnalysis,
  UpToGateReport,
  BlockValidation,
  BlockAnnotation,
  GameDebugContentJSON,
  DebugContentTool,
} from './tools';
export {
  analyzerActionKey,
  parseAnalyzerActionKey,
  buildContentGraph,
  analyzeReachable,
  analyzeInfinitePools,
  analyzeUpToGate,
  validateBlock,
  annotateBlock,
  ENGINE_DEBUG_TAG_NAME,
  ENGINE_DEBUG_CONTENT_KIND,
  createDebugCapabilityTag,
  createDebugContentTool,
  loadDebugTagSource,
  mergeTagCatalogs,
} from './tools';

export type { SlotCatalog } from './slots';
export {
  tagBestOnlyScore,
  tagBestOnlyTier,
  listHeldTagsInSlot,
  entityHasHeldSlot,
  entityHasHeldTag,
  entityHasActiveTag,
  selectSlotSelection,
  selectSlotWinner,
  selectActiveRootTags,
  selectActiveTags,
  flattenDependentTags,
  sumActiveTaggedFieldStrength,
  sumActiveTagEffectStrength,
  reconcileSlotSelections,
  reconcileAllSlotSelections,
  withSlotSelection,
  holdingIsSelectedElsewhere,
  resolveSlotSelectionTag,
} from './slots';

export type {
  ActiveEffect,
  AdjustPoolEffect,
  GrantTagEffect,
  LockTagEffect,
  RemoveEntityEffect,
  ReservePoolEffect,
  ReserveStatEffect,
  SpawnEntityEffect,
} from './effect';

export type { ActionDefinition, RequirementCheck } from './action';

export type { RecipeEffectSlot } from './action-improvements';
export {
  REDUCE_EFFECT_TYPE,
  ENHANCE_EFFECT_TYPE,
  reduceEffect,
  enhanceEffect,
  relieveFlat,
  relievePercent,
  resolveAdjustPoolEffect,
  materializeAdjustPools,
  applySlotMagnitudeModifiers,
  materializeSlotEffects,
  listMatchingContinuousSpeedEffects,
  applyCostBonuses,
  materializeActionResults,
} from './action-improvements';

export type { ActionMatchFilter, ActionMatchTarget } from './action-match';
export {
  normalizeTypes,
  normalizeActionTypes,
  typesIntersect,
  actionMatchesFilter,
  poolCatalogTypes,
  statCatalogTypes,
  poolMatchesTarget,
  statMatchesTarget,
  listPoolsMatchingTypes,
  listStatsMatchingTypes,
} from './action-match';

export type {
  ContinuousActionSnapshot,
  ContinuousProgressRecord,
  ContinuousActiveJob,
  ContinuousProgressMap,
  ContinuousActiveMap,
  ContinuousProgressRecordJSON,
  ContinuousActiveJobJSON,
} from './continuous';
export {
  actionDurationTicks,
  continuousProgressKey,
  continuousProgressPercent,
  snapshotAction,
  actionFromSnapshot,
  selectContinuousSlotMax,
  selectAllowInstantWhileContinuous,
  selectEffectiveDurationTicks,
  selectContinuousProgressDelta,
  startContinuousAction,
  pauseContinuousAction,
  cancelContinuousAction,
  advanceContinuousActions,
  pulseGenerators,
  buildOverTimeSlice,
  canPayRequiredOverTimeSlice,
  scaleEffectStrength,
  recipeEffectsFromSnapshotJSON,
  MAX_ACTION_DURATION_TICKS,
  CONTINUOUS_PROGRESS_DECIMALS,
  roundContinuousProgress,
} from './continuous';

export type {
  EntityScope,
  EntityPoolMap,
  EntityInstance,
  EntityInstanceJSON,
  EntityDefinition,
  EntityMap,
  SlotSelectionRef,
  SlotSelectionJSON,
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
  normalizeSlotSelection,
  normalizeSlotSelections,
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
  withContextUniversalTags,
} from './context';

export type { RequirementAdaptor, EffectAdaptor, HostWithTagCatalog } from './registry';
export { EngineRegistry } from './registry';

export {
  requirementsMet,
  codeRequirementsMet,
  costsPayable,
  anyResultPossible,
  emptyOrPayable,
  hasProductiveEffect,
  isActionStartable,
  isActionContinuable,
  isActionFinishable,
  isActionAvailable,
  executeAction,
  executeActionSafe,
} from './evaluate';

export type { EngineState, EngineStateJSON, ActionRoles } from './state';
export {
  createEngineState,
  createPrimaryEngineState,
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

export type { EngineVersionParts } from './version';
export {
  ENGINE_VERSION,
  parseEngineVersion,
  engineVersionCompatibilityKey,
  isCompatibleEngineVersion,
  assertCompatibleEngineVersion,
} from './version';

export type { EngineCommand } from './command';

export {
  sumTagEffectStrength,
  sumTaggedFieldStrength,
  selectEntity,
  selectEntitiesByDefinition,
  selectStatValue,
  selectBaseStatValue,
  selectBasePoolMax,
  selectCrossLinkPoolMaxBonus,
  selectCrossLinkStatBonus,
  selectPoolMax,
  selectPoolMaxRaw,
  selectPoolCurrent,
  selectPoolAvailable,
  selectPoolReserved,
  selectPoolContents,
  selectPoolAvailableMax,
  selectPoolEffectiveAvailableMax,
  selectPoolEffectiveAvailable,
  selectPoolEffectiveReserved,
  selectPoolDisplayCurrent,
  selectPoolDisplayMax,
  poolCapacityStep,
  poolDisplayStep,
  crossLinkCoeff,
  crossLinkSourceValue,
  selectActiveCount,
  selectSpawnCount,
  selectPrimaryEntity,
  selectPrimaryEntityId,
  selectContinuousActiveJobs,
  selectContinuousProgress,
  POOL_QUANTITY_DECIMALS,
  roundPoolQuantity,
  floorPoolQuantity,
  DEFAULT_CAPACITY_STEP,
  DEFAULT_DISPLAY_STEP,
} from './selectors';

export {
  computeReservedByEntity,
  reconcilePoolReservations,
  tryAdjustEntityPool,
} from './pools';
export type { TryAdjustPoolOptions } from './pools';

export type {
  CapacityAssignment,
  CapacityAssignmentJSON,
  CapacityClawback,
} from './capacity';
export {
  DEFAULT_CAPACITY_CLAWBACK,
  normalizeCapacityClawback,
  assignmentEfficiency,
  assignmentEveryTicks,
  resolveAssignmentCommit,
  resolveAssignmentProvide,
  selectAssignmentPoolMaxBonus,
  selectAssignmentStatBonus,
  selectAssignmentPoolReserved,
  selectStatReserved,
  selectStatValueGross,
  canAcceptCapacityAssignment,
  assignCapacity,
  clearCapacityAssignment,
} from './capacity';

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
  reduceEngineDocument,
  reduceEngineCommandsDocument,
} from './reduce';
