export interface TagEffect {
  readonly type: string;
  readonly name: string;
  readonly strength: number;
  /** Optional payload for `stat` effects. */
  readonly stat?: string;
  /** Optional payload for `pool-max` / `generate-pool` / `reserve-pool` / `cross-link.fromPool`. */
  readonly pool?: string;
  /**
   * For `reserve-pool` / `reserve-stat`: `'primary'` targets the primary entity;
   * omit to target the entity where the tag is active.
   */
  readonly scope?: 'primary' | string;
  /**
   * Pulse amount for `generate-pool` (falls back to `strength`).
   * On `cross-link`, coeff when set (else `strength`).
   */
  readonly amount?: number;
  /** Tick interval for `generate-pool` / `cross-link` generators / product capacity. */
  readonly everyTicks?: number;
  /** On `cross-link`: read base value of this stat as the source. */
  readonly fromStat?: string;
  /** On `cross-link`: read effective Available of this pool as the source. */
  readonly fromPool?: string;
  /** On `cross-link`: add source × coeff to this stat (final pass). */
  readonly toStat?: string;
  /**
   * On `cross-link`: add source × coeff to this pool’s max (live), unless
   * {@link productTag} is set (then capacity accumulates on the product tag).
   */
  readonly toPoolMax?: string;
  /** On `cross-link`: each due tick, pulse source × coeff into this pool’s Available. */
  readonly toGeneratePool?: string;
  /**
   * On `cross-link` with {@link toPoolMax}: engine-maintained product tag that
   * accumulates `pool-max` strength each due tick (growing capacity).
   */
  readonly productTag?: string;
  /**
   * On `generate-pool` / `cross-link` `toGeneratePool` / Type-expanded
   * `adjust-pool`: when true, may introduce the pool key.
   * Default false for passives.
   */
  readonly createPool?: boolean;
  /**
   * On `generate-pool`: only pulse while Available is above this absolute value.
   * Negative pulses clamp so Available never goes below this bound.
   */
  readonly whileAvailableAbove?: number;
  /**
   * On `generate-pool`: only pulse while Available is below this absolute value.
   * Positive pulses clamp so Available never goes above this bound.
   */
  readonly whileAvailableBelow?: number;
  /**
   * On `generate-pool`: like {@link whileAvailableAbove} but as % of effective Max (0..100).
   */
  readonly whileAvailableAbovePercent?: number;
  /**
   * On `generate-pool`: like {@link whileAvailableBelow} but as % of effective Max (0..100).
   */
  readonly whileAvailableBelowPercent?: number;
  /**
   * On `pool-generate-floor`: contributes `strength` to the sealed floor for `pool`.
   * Negative `generate-pool` pulses respect the summed floor.
   */
  // (type discriminator is effect.type === 'pool-generate-floor')
  /** Optional action name filter (`*` or omit = all names). */
  readonly actionName?: string;
  /** Optional action Types filter (intersection). */
  readonly actionTypes?: readonly string[];
  /** Optional pool Types filter (intersection with catalog). */
  readonly poolTypes?: readonly string[];
  /** Optional stat Types filter (intersection with catalog). */
  readonly statTypes?: readonly string[];
  /**
   * Percent points for Type/id improvements (20 = +20%).
   * On reduce* / enhance* mods: magnitude % after flats. See action-types.md.
   */
  readonly percent?: number;
  /**
   * For pool-max / stat percents: `'derived'` (default) vs `'base'` only.
   */
  readonly percentBase?: 'derived' | 'base';
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
  /** Design-time Gate/Block metadata for the content analyzer. */
  readonly analyzer?: import('./tools/analyzer/types').AnalyzerContentMeta;
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
    ...(input.analyzer !== undefined ? { analyzer: input.analyzer } : {}),
    effects: Object.freeze([...input.effects]),
  };
}
