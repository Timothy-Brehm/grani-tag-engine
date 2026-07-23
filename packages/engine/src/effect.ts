import type { EntityScope } from './entity';

export interface ActiveEffect {
  readonly type: string;
  readonly name: string;
  readonly strength: number;
}

export type AdjustPoolEffect = ActiveEffect & {
  readonly type: 'adjust-pool';
  readonly pool: string;
  /** Defaults to actor, then source. */
  readonly scope?: EntityScope;
};

export type GrantTagEffect = ActiveEffect & {
  readonly type: 'grant-tag';
  /** Defaults to actor, then source. */
  readonly scope?: EntityScope;
};

export type SpawnEntityEffect = ActiveEffect & {
  readonly type: 'spawn-entity';
  readonly definitionId: string;
  /** Optional stable instance id; generated when omitted. */
  readonly entityId?: string;
};

export type RemoveEntityEffect = ActiveEffect & {
  readonly type: 'remove-entity';
  /**
   * Defaults to source when present, otherwise actor.
   * Typical one-shot board cards: remove the source after loot.
   */
  readonly scope?: EntityScope;
};

/**
 * Offer a host-catalog message id on an entity for short-term display.
 * `name` is the message id. Defaults to source when present, otherwise actor.
 */
export type ShowMessageEffect = ActiveEffect & {
  readonly type: 'show-message';
  readonly scope?: EntityScope;
};
