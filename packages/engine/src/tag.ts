export interface TagEffect {
  readonly type: string;
  readonly name: string;
  readonly strength: number;
  /** Optional payload for `stat` effects. */
  readonly stat?: string;
  /** Optional payload for `pool-max` / regen effects. */
  readonly pool?: string;
  /**
   * Optional novelty ack for this pool/stat contribution.
   * Present `seenTag` on the ack scope ⇒ not novel.
   */
  readonly novelty?: {
    readonly seenTag: string;
    readonly scope?: 'instance' | 'primary';
  };
  readonly [key: string]: unknown;
}

export interface Tag<TEffect extends TagEffect = TagEffect> {
  readonly name: string;
  readonly description?: string;
  readonly label?: string;
  /** Optional host asset key for novelty / message presentation. */
  readonly image?: string;
  /**
   * When this tag is present on an entity, it may be novel until `seenTag`
   * is granted on the ack scope. Use for silent milestones that only exist
   * to drive a message/modal (display lives on the `seenTag` catalog entry).
   */
  readonly novelty?: {
    readonly seenTag: string;
    readonly scope?: 'instance' | 'primary';
  };
  readonly effects: readonly TEffect[];
}

export function createTag<TEffect extends TagEffect = TagEffect>(
  input: Tag<TEffect>,
): Tag<TEffect> {
  return {
    name: input.name,
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.image !== undefined ? { image: input.image } : {}),
    ...(input.novelty !== undefined ? { novelty: input.novelty } : {}),
    effects: Object.freeze([...input.effects]),
  };
}
