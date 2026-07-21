import type { ActionDefinition } from './action';
import type { Tag } from './tag';

/**
 * Serializable / plain engine commands.
 * Host games dispatch these; React (and other runners) never put setters in state.
 */
export type EngineCommand =
  | { readonly type: 'add-tag'; readonly tag: Tag }
  | { readonly type: 'remove-tag'; readonly name: string }
  | { readonly type: 'replace-tags'; readonly tags: readonly Tag[] }
  | { readonly type: 'tick'; readonly steps?: number }
  | {
      readonly type: 'execute-action';
      readonly action: ActionDefinition;
      /** Default `strict` (FireAction). `safe` re-checks canHappen per effect. */
      readonly mode?: 'strict' | 'safe';
    };
