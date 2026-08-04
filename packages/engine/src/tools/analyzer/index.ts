/**
 * Content pathing analyzer (Gate/Block, infinite pools).
 *
 * @agentTool content-pathing-analyzer
 * @agentTool engine-tools
 */

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
} from './types';
export {
  analyzerActionKey,
  parseAnalyzerActionKey,
} from './types';

export type {
  GraphAction,
  ContentGraph,
  AnalyzeOptions,
  ReachableSlice,
  PoolAnalysis,
  UpToGateReport,
  BlockValidation,
  BlockAnnotation,
} from './analyze';
export {
  buildContentGraph,
  analyzeReachable,
  analyzeInfinitePools,
  analyzeUpToGate,
  validateBlock,
  annotateBlock,
} from './analyze';
