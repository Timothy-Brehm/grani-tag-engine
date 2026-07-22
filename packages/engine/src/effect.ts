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
