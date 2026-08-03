export interface TagEffect {
  readonly type: string;
  readonly name: string;
  readonly strength: number;
  /** Optional payload for `stat` effects. */
  readonly stat?: string;
  /** Optional payload for `pool-max` / `generate-pool` / `reserve-pool` / `pool-link`. */
  readonly pool?: string;
  /**
   * For `reserve-pool`: `'primary'` reserves on the primary entity;
   * omit to reserve on the entity where the tag is active.
   */
  readonly scope?: 'primary' | string;
  /** Pulse amount for `generate-pool` (falls back to `strength`). Link coeff when set on outbound `stat`. */
  readonly amount?: number;
  /** Tick interval for `generate-pool` / `toGeneratePool` / product-tag capacity. */
  readonly everyTicks?: number;
  /**
   * On `stat`: add `baseStat * (amount ?? 1)` to this pool’s max each select
   * (live). Ignored for the live term when {@link productTag} is also set.
   */
  readonly toPoolMax?: string;
  /**
   * On `stat`: each due tick, pulse `baseStat * (amount ?? 1)` into this pool’s Available.
   */
  readonly toGeneratePool?: string;
  /**
   * On `stat` with {@link toPoolMax}: engine-maintained product tag that
   * accumulates `pool-max` strength each due tick (growing capacity).
   */
  readonly productTag?: string;
  /**
   * On `pool-link`: add `effectiveAvailable(pool) * coeff` to this stat.
   */
  readonly toStat?: string;
  /**
   * On `generate-pool` / `toGeneratePool`: when true, may introduce the pool key.
   * Default false for passive pulses.
   */
  readonly createPool?: boolean;
  /** Optional action filter for `continuous-speed` (`*` or omit = all). */
  readonly actionName?: string;
  /** Additive duration modifier for `continuous-speed` (applied first). */
  readonly addTicks?: number;
  /** Multiplicative duration modifier for `continuous-speed`. */
  readonly multiply?: number;
  /** Divisor duration modifier for `continuous-speed`. */
  readonly divide?: number;
  /** Progress per tick for `continuous-speed` (default 1 when none). */
  readonly generatorCount?: number;
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
  /**
   * Longer / design notes. Prefer {@link displayText} for player-facing copy
   * (modals, tooltips driven by novelty ack tags).
   */
  readonly description?: string;
  readonly label?: string;
  /** Player-facing body text (modals, novelty messages). */
  readonly displayText?: string;
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
  /**
   * Catalog slot id (`SlotDefinition.id`). When set, only the active item in
   * that slot contributes passives / dependent tags.
   */
  readonly slot?: string;
  /**
   * Optional best-only ordinal (smaller wins). Omit ⇒ lowest priority so a
   * forgotten tier does not beat numbered competitors.
   */
  readonly tier?: number;
  /**
   * Nested tags projected into the active evaluation set while this tag is an
   * active root. Not held in TagCollection.
   */
  readonly dependentTags?: readonly Tag<TEffect>[];
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
    ...(input.displayText !== undefined
      ? { displayText: input.displayText }
      : {}),
    ...(input.image !== undefined ? { image: input.image } : {}),
    ...(input.novelty !== undefined ? { novelty: input.novelty } : {}),
    ...(input.slot !== undefined ? { slot: input.slot } : {}),
    ...(input.tier !== undefined ? { tier: input.tier } : {}),
    ...(input.dependentTags !== undefined
      ? {
          dependentTags: Object.freeze(
            input.dependentTags.map((child) => createTag(child)),
          ),
        }
      : {}),
    effects: Object.freeze([...input.effects]),
  };
}
