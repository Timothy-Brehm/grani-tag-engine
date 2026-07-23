import type { ActionDefinition } from './action';
import type { ActiveEffect } from './effect';
import type { Requirement } from './requirement';
import type { Tag } from './tag';

/**
 * Serializable / plain engine commands.
 * Host games dispatch these; React (and other runners) never put setters in state.
 */
export type EngineCommand<THost = unknown> =
  | {
      readonly type: 'add-tag';
      readonly entityId: string;
      readonly tag: Tag;
    }
  | {
      readonly type: 'remove-tag';
      readonly entityId: string;
      readonly name: string;
    }
  | {
      readonly type: 'replace-tags';
      readonly entityId: string;
      readonly tags: readonly Tag[];
    }
  | {
      readonly type: 'adjust-pool';
      readonly entityId: string;
      readonly pool: string;
      readonly delta: number;
    }
  | {
      readonly type: 'spawn-entity';
      readonly definitionId: string;
      readonly entityId?: string;
    }
  | {
      readonly type: 'remove-entity';
      readonly entityId: string;
    }
  | {
      readonly type: 'set-primary-entity';
      readonly entityId: string | undefined;
    }
  | { readonly type: 'tick'; readonly steps?: number }
  | {
      readonly type: 'execute-action';
      readonly action: ActionDefinition<Requirement, ActiveEffect, THost>;
      readonly actorEntityId?: string;
      readonly sourceEntityId?: string;
      readonly targetEntityId?: string;
      /** Default `strict` (FireAction). `safe` re-checks canHappen per effect. */
      readonly mode?: 'strict' | 'safe';
      /**
       * Who initiated the action for metric counting.
       * Default `manual`. Processes should pass `automatic`.
       */
      readonly execution?: 'manual' | 'automatic';
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
    }
  | {
      readonly type: 'seen-entity';
      readonly entityId: string;
    }
  | {
      readonly type: 'seen-action';
      readonly entityId: string;
      readonly actionId: string;
    }
  | {
      readonly type: 'seen-pool';
      readonly entityId: string;
      readonly pool: string;
    }
  | {
      readonly type: 'seen-stat';
      readonly entityId: string;
      readonly stat: string;
    }
  | {
      /** Mark entity + current offered actions/pools/stats seen (bootstrap). */
      readonly type: 'seen-entity-content';
      readonly entityId: string;
      readonly actionIds?: readonly string[];
    }
  | {
      /**
       * While this entity’s sheet is shown (selected), accumulate one tick of
       * shown-time for the listed pools/stats (auto-seen at NOVELTY_AUTO_SEEN_TICKS).
       */
      readonly type: 'novelty-sheet-tick';
      readonly entityId: string;
      readonly pools?: readonly string[];
      readonly stats?: readonly string[];
    };
