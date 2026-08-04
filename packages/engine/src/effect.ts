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

/** Passive: while active, reserves `strength` of `pool` (Available decreases). */
export type ReservePoolEffect = ActiveEffect & {
  readonly type: 'reserve-pool';
  readonly pool: string;
  /**
   * `'primary'` → reserve on the game primary; omit → entity where the tag is active.
   */
  readonly scope?: 'primary';
};

/** Passive: while active, reserves `strength` of `stat` (effective value decreases). */
export type ReserveStatEffect = ActiveEffect & {
  readonly type: 'reserve-stat';
  readonly stat: string;
  /**
   * `'primary'` → reserve on the game primary; omit → entity where the tag is active.
   */
  readonly scope?: 'primary';
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
