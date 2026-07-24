/**
 * Novelty acknowledgement: a catalog tag that is **present when not novel**.
 * Display copy/image live on that tag’s catalog definition; ack is `grant-tag` /
 * `add-tag` of `seenTag` onto the scoped holder.
 */
export type NoveltyAck = {
  readonly seenTag: string;
  /**
   * Who must hold `seenTag`.
   * - `instance` (default): the entity that owns the discoverable
   * - `primary`: `EngineState.primaryEntityId` (once per run / cross-instance)
   */
  readonly scope?: 'instance' | 'primary';
};

export type NovelKind = 'entity' | 'action' | 'pool' | 'stat' | 'tag';

export type NovelRef = {
  readonly entityId: string;
  readonly seenTag: string;
  readonly scope: 'instance' | 'primary';
  readonly kind: NovelKind;
  /** Action name, pool id, stat id, entity definition id, or tag name. */
  readonly key: string;
};
