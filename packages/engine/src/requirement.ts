export type FreeRequirement = { readonly type: 'free' };
export type ForbiddenRequirement = { readonly type: 'forbidden' };

export type EntityScope = 'actor' | 'source' | 'target';

export type TagRequirement = {
  readonly type: 'tag';
  readonly tagName: string;
  readonly exists: boolean;
  /** Defaults to source, then actor. */
  readonly scope?: EntityScope;
};

export type StatRequirement = {
  readonly type: 'stat';
  readonly stat: string;
  readonly amount: number;
  /** Defaults to source, then actor. */
  readonly scope?: EntityScope;
};

export type PoolMaxRequirement = {
  readonly type: 'pool-max';
  readonly pool: string;
  readonly amount: number;
  /** Defaults to source, then actor. */
  readonly scope?: EntityScope;
};

export type EntityCountRequirement = {
  readonly type: 'entity-count';
  readonly definitionId: string;
  readonly min?: number;
  readonly max?: number;
};

export type BuiltinRequirement =
  | FreeRequirement
  | ForbiddenRequirement
  | TagRequirement
  | StatRequirement
  | PoolMaxRequirement
  | EntityCountRequirement;

export type Requirement =
  | BuiltinRequirement
  | { readonly type: string; readonly [key: string]: unknown };
