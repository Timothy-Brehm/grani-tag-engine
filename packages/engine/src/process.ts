import type { ActionDefinition } from './action';

/**
 * Future recurring-action model.
 *
 * - `primary`: a general pool, fixed capacity 1 unless configured otherwise.
 * - `typed`: a host-owned capacity such as the number of factories available.
 *
 * Both are represented as capacity pools so adding a process does not change
 * the semantics of one-shot ActionDefinition execution.
 */
export type ProcessPoolKind = 'primary' | 'typed';

export type ProcessCapacity =
  | { readonly type: 'fixed'; readonly value: number }
  | {
      /** Host-defined capacity resolver, registered in a future process registry. */
      readonly type: string;
      readonly [key: string]: unknown;
    };

export interface ProcessPoolDefinition {
  readonly id: string;
  readonly kind: ProcessPoolKind;
  readonly capacity: ProcessCapacity;
}

export interface ProcessDefinition {
  readonly id: string;
  readonly poolId: string;
  /** Atomic action attempted once per tick for each allocated slot. */
  readonly action: ActionDefinition;
}

export interface ProcessSelection {
  readonly processId: string;
  /** Supports multiple factories assigned to the same output later. */
  readonly allocation: number;
}

export class ProcessesNotImplementedError extends Error {
  constructor(operation: string) {
    super(
      `Process operation "${operation}" is not implemented yet. ` +
        'Process types are reserved for recurring per-tick actions.',
    );
    this.name = 'ProcessesNotImplementedError';
  }
}

/** Explicit future endpoint; throws rather than pretending selection succeeded. */
export function setProcessAllocation(
  _selection: ProcessSelection,
): never {
  throw new ProcessesNotImplementedError('set-process-allocation');
}

/** Explicit future endpoint; throws rather than pretending the pool was cleared. */
export function clearProcessPool(_poolId: string): never {
  throw new ProcessesNotImplementedError('clear-process-pool');
}
