import type { ActionDefinition } from './action';
import type { ActiveEffect } from './effect';
import type { Requirement } from './requirement';
import type { Tag } from './tag';

/**
 * Serializable / plain engine commands.
 * Host games dispatch these; React (and other runners) never put setters in state.
 */
export type EngineCommand<THost = unknown> =
  | { readonly type: 'add-tag'; readonly tag: Tag }
  | { readonly type: 'remove-tag'; readonly name: string }
  | { readonly type: 'replace-tags'; readonly tags: readonly Tag[] }
  | { readonly type: 'tick'; readonly steps?: number }
  | {
      readonly type: 'execute-action';
      readonly action: ActionDefinition<Requirement, ActiveEffect, THost>;
      /** Default `strict` (FireAction). `safe` re-checks canHappen per effect. */
      readonly mode?: 'strict' | 'safe';
    }
  /** Reserved recurring-action endpoints. They currently throw explicitly. */
  | {
      readonly type: 'set-process-allocation';
      readonly processId: string;
      readonly allocation: number;
    }
  | {
      readonly type: 'clear-process-pool';
      readonly poolId: string;
    };
