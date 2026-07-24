export type EntityScope = 'actor' | 'source' | 'target';

export type NoveltyAckJSON = {
  seenTag: string;
  scope?: 'instance' | 'primary';
};

export type TagEffectJSON = {
  type: string;
  name: string;
  strength: number;
  stat?: string;
  pool?: string;
  novelty?: NoveltyAckJSON;
  [key: string]: unknown;
};

export type TagJSON = {
  name: string;
  description?: string;
  label?: string;
  image?: string;
  novelty?: NoveltyAckJSON;
  effects: TagEffectJSON[];
};

export type RequirementJSON =
  | { type: 'free' }
  | { type: 'forbidden' }
  | {
      type: 'tag';
      tagName: string;
      exists: boolean;
      scope?: EntityScope;
    }
  | {
      type: 'stat';
      stat: string;
      amount: number;
      scope?: EntityScope;
    }
  | {
      type: 'pool-max';
      pool: string;
      amount: number;
      scope?: EntityScope;
    }
  | {
      type: 'entity-count';
      definitionId: string;
      min?: number;
      max?: number;
    }
  | {
      type: 'metric';
      metric: 'engine-tick';
      amount: number;
    }
  | {
      type: 'metric';
      metric: 'action-manual' | 'action-automatic' | 'action-total';
      actionId: string;
      amount: number;
      scope?: EntityScope;
    }
  | {
      type: 'metric';
      metric:
        | 'pool-current'
        | 'pool-high-water'
        | 'pool-low-water'
        | 'pool-max-high-water'
        | 'pool-lifetime-used';
      pool: string;
      amount: number;
      scope?: EntityScope;
    }
  | {
      type: 'metric';
      metric: 'stat-high-water' | 'stat-low-water';
      stat: string;
      amount: number;
      scope?: EntityScope;
    }
  | {
      type: 'metric';
      metric: 'tag-held-for';
      tagName: string;
      amount: number;
      scope?: EntityScope;
    };

export type ActiveEffectJSON =
  | {
      type: 'adjust-pool';
      name: string;
      strength: number;
      pool: string;
      scope?: EntityScope;
    }
  | {
      type: 'grant-tag';
      name: string;
      strength: number;
      scope?: EntityScope;
    }
  | {
      type: 'spawn-entity';
      name: string;
      strength: number;
      definitionId: string;
      entityId?: string;
    }
  | {
      type: 'remove-entity';
      name: string;
      strength: number;
      scope?: EntityScope;
    };

export type ActionDefinitionJSON = {
  name: string;
  description?: string;
  label?: string;
  sourceId?: string;
  novelty?: NoveltyAckJSON;
  requirements: RequirementJSON[];
  costs: ActiveEffectJSON[];
  results: ActiveEffectJSON[];
  sideEffects: ActiveEffectJSON[];
};

export type EntityDefinitionJSON = {
  id: string;
  displayName?: string;
  description?: string;
  initialTags?: TagJSON[];
  initialPools?: Record<string, number>;
  actions?: ActionDefinitionJSON[];
  novelty?: NoveltyAckJSON;
  maxActive?: number;
  maxCreated?: number;
};

export type EntityCatalog = {
  entities: EntityDefinitionJSON[];
};
