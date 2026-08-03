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
      /** Must reference an entity already in state (primary is always required). */
      readonly entityId: string;
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
  | {
      readonly type: 'pause-continuous-action';
      /** `${actor}::${actionName}::${source??''}` or pass role fields below. */
      readonly progressKey?: string;
      readonly actorEntityId?: string;
      readonly actionName?: string;
      readonly sourceEntityId?: string;
    }
  | {
      readonly type: 'cancel-continuous-action';
      readonly progressKey?: string;
      readonly actorEntityId?: string;
      readonly actionName?: string;
      readonly sourceEntityId?: string;
    }
  | {
      readonly type: 'select-slot-item';
      /** Slot owner (receives passives). */
      readonly entityId: string;
      readonly slot: string;
      readonly tagName: string;
      /** Entity that holds the tag; defaults to `entityId`. Use `settings` for UniversalTags. */
      readonly holderEntityId?: string;
    }
  | {
      readonly type: 'settings-grant-tag';
      readonly tagName: string;
    }
  | {
      readonly type: 'settings-add-tag';
      readonly tag: Tag;
    }
  | {
      readonly type: 'settings-remove-tag';
      readonly name: string;
    }
  | {
      readonly type: 'games-create';
      readonly gameId: string;
      /**
       * Host-built initial playthrough. Apply UniversalTags start unlocks
       * while building this slice (see settings-and-games bootstrap pattern),
       * then pass the finished game here.
       */
      readonly game: import('./state').EngineState;
      readonly switchTo?: boolean;
      readonly meta?: import('./document').GameMeta;
    }
  | {
      readonly type: 'games-switch';
      readonly gameId: string;
    }
  | {
      readonly type: 'games-fork';
      readonly fromGameId?: string;
      readonly newGameId: string;
      readonly switchTo?: boolean;
      readonly meta?: import('./document').GameMeta;
    }
  | {
      readonly type: 'games-delete';
      readonly gameId: string;
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
