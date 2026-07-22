export interface TagEffect {
  readonly type: string;
  readonly name: string;
  readonly strength: number;
  /** Optional payload for `stat` effects. */
  readonly stat?: string;
  /** Optional payload for `pool-max` / regen effects. */
  readonly pool?: string;
  readonly [key: string]: unknown;
}

export interface Tag<TEffect extends TagEffect = TagEffect> {
  readonly name: string;
  readonly description?: string;
  readonly label?: string;
  readonly effects: readonly TEffect[];
}

export function createTag<TEffect extends TagEffect = TagEffect>(
  input: Tag<TEffect>,
): Tag<TEffect> {
  return {
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.label !== undefined ? { label: input.label } : {}),
    effects: Object.freeze([...input.effects]),
  };
}
