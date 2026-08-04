import type { CatalogMeta } from '../../catalog';

/** Optional analyzer metadata on tags and actions. */
export type AnalyzerContentMeta = {
  /** This content belongs to block `id`. */
  readonly blockId?: string;
  readonly blockRole?: 'entry' | 'member' | 'summary';
  /** Links this content to a GateDefinition id. */
  readonly gateId?: string;
};

export type GateDefinition = CatalogMeta & {
  /** Tag whose presence means this gate is crossed. */
  readonly tagName: string;
};

export type BlockEntry =
  | { readonly kind: 'tag'; readonly name: string }
  | {
      readonly kind: 'action';
      readonly entityDefinitionId: string;
      readonly actionName: string;
    };

export type BlockDefinition = CatalogMeta & {
  readonly entry: BlockEntry;
  /** Optional debug-collapse summary tag. */
  readonly summaryTag?: string;
};

/** `${entityDefinitionId}::${actionName}` */
export type AnalyzerActionKey = string;

export function analyzerActionKey(
  entityDefinitionId: string,
  actionName: string,
): AnalyzerActionKey {
  return `${entityDefinitionId}::${actionName}`;
}

export function parseAnalyzerActionKey(
  key: AnalyzerActionKey,
): { entityDefinitionId: string; actionName: string } | undefined {
  const idx = key.indexOf('::');
  if (idx <= 0) {
    return undefined;
  }
  return {
    entityDefinitionId: key.slice(0, idx),
    actionName: key.slice(idx + 2),
  };
}

export type InfinitePoolSource =
  | { readonly kind: 'generate-pool'; readonly tagName: string }
  | { readonly kind: 'cross-link-generate'; readonly tagName: string }
  | { readonly kind: 'farm-action'; readonly actionKey: AnalyzerActionKey };

export type InfinitePoolRow = {
  readonly pool: string;
  readonly infiniteOverTime: true;
  readonly maxAtATime: number;
  readonly sources: readonly InfinitePoolSource[];
};

export type AccumulatingPoolSource =
  | { readonly kind: 'generate-pool'; readonly tagName: string }
  | { readonly kind: 'cross-link-generate'; readonly tagName: string }
  | { readonly kind: 'farm-action'; readonly actionKey: AnalyzerActionKey };

export type AccumulatingPoolRow = {
  readonly pool: string;
  readonly maxAtATime: number;
  readonly hasInflow: true;
  readonly hasDrain: boolean;
  readonly accumulatesToCapWithoutDrain: boolean;
  readonly inflowSources: readonly AccumulatingPoolSource[];
  readonly drainSources?: readonly AccumulatingPoolSource[];
};

export type NonFarmableReason =
  | 'tag-lock-immediate'
  | 'tag-lock-later'
  | 'finite-inputs';

export type NonFarmableAction = {
  readonly actionKey: AnalyzerActionKey;
  readonly reason: NonFarmableReason;
  readonly lockTag?: string;
  readonly granterActionKey?: AnalyzerActionKey;
};

export type FiniteStockpileRow = {
  readonly pool: string;
  readonly maxAtATime: number;
};
