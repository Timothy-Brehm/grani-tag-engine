export type { Tag, TagEffect } from './tag';
export { createTag } from './tag';

export type { TagCollectionJSON } from './tag-collection';
export { TagCollection } from './tag-collection';

export type {
  FreeRequirement,
  ForbiddenRequirement,
  TagRequirement,
  BuiltinRequirement,
  Requirement,
} from './requirement';

export type { ActiveEffect } from './effect';

export type { ActionDefinition, RequirementCheck } from './action';

export type { EngineContext } from './context';
export { withTags } from './context';

export type { RequirementAdaptor, EffectAdaptor } from './registry';
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

export type { EngineState, EngineStateJSON } from './state';
export {
  createEngineState,
  engineStateToJSON,
  engineStateFromJSON,
  toEngineContext,
  withEngineTags,
  withEngineTick,
} from './state';

export type { EngineCommand } from './command';

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
