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

/**
 * Gate on tracked metrics (action counts, water marks, live pool current, time).
 *
 * Timing uses engine `tick` (not wall-clock). Hosts may display `tick / N` as
 * seconds if they advance ticks at a fixed rate.
 *
 * - Most metrics: met when value `>= amount`
 * - Low-water metrics (`pool-low-water`, `stat-low-water`): met when value
 *   `<= amount` (e.g. ever hit 0 Life → `{ metric: 'pool-low-water', pool: 'Life', amount: 0 }`)
 */
export type MetricRequirement =
  | {
      readonly type: 'metric';
      readonly metric: 'engine-tick';
      readonly amount: number;
    }
  | {
      readonly type: 'metric';
      readonly metric: 'action-manual' | 'action-automatic' | 'action-total';
      readonly actionId: string;
      readonly amount: number;
      /** Defaults to source, then actor. */
      readonly scope?: EntityScope;
    }
  | {
      readonly type: 'metric';
      readonly metric:
        | 'pool-current'
        | 'pool-high-water'
        | 'pool-low-water'
        | 'pool-max-high-water'
        | 'pool-lifetime-used';
      readonly pool: string;
      readonly amount: number;
      readonly scope?: EntityScope;
    }
  | {
      readonly type: 'metric';
      readonly metric: 'stat-high-water' | 'stat-low-water';
      readonly stat: string;
      readonly amount: number;
      readonly scope?: EntityScope;
    }
  | {
      readonly type: 'metric';
      /** Tag still present and `tick - tagGrantedAt >= amount`. */
      readonly metric: 'tag-held-for';
      readonly tagName: string;
      readonly amount: number;
      readonly scope?: EntityScope;
    };

export type BuiltinRequirement =
  | FreeRequirement
  | ForbiddenRequirement
  | TagRequirement
  | StatRequirement
  | PoolMaxRequirement
  | EntityCountRequirement
  | MetricRequirement;

export type Requirement =
  | BuiltinRequirement
  | { readonly type: string; readonly [key: string]: unknown };
