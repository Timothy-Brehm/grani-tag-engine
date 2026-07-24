import { createTag, type Tag, type TagEffect } from './tag';

export type TagCollectionJSON = {
  tags: Tag[];
};

export class TagCollection {
  private readonly byName: ReadonlyMap<string, Tag>;

  private constructor(byName: ReadonlyMap<string, Tag>) {
    this.byName = byName;
  }

  static create(tags: readonly Tag[] = []): TagCollection {
    const map = new Map<string, Tag>();
    for (const tag of tags) {
      if (!map.has(tag.name)) {
        map.set(tag.name, createTag(tag));
      }
    }
    return new TagCollection(map);
  }

  get size(): number {
    return this.byName.size;
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  get(name: string): Tag | undefined {
    return this.byName.get(name);
  }

  list(): readonly Tag[] {
    return Object.freeze([...this.byName.values()]);
  }

  /** Idempotent: no-op if a tag with the same name already exists. */
  add(tag: Tag): TagCollection {
    if (this.byName.has(tag.name)) {
      return this;
    }
    const next = new Map(this.byName);
    next.set(tag.name, createTag(tag));
    return new TagCollection(next);
  }

  remove(name: string): TagCollection {
    if (!this.byName.has(name)) {
      return this;
    }
    const next = new Map(this.byName);
    next.delete(name);
    return new TagCollection(next);
  }

  filter(predicate: (tag: Tag) => boolean): TagCollection {
    return TagCollection.create(this.list().filter(predicate));
  }

  /** Sum strength of passive effects whose `type` matches across all tags. */
  sumEffectStrength(effectType: string): number {
    let total = 0;
    for (const tag of this.byName.values()) {
      for (const effect of tag.effects) {
        if (effect.type === effectType) {
          total += effect.strength;
        }
      }
    }
    return total;
  }

  toJSON(): TagCollectionJSON {
    return {
      tags: this.list().map((tag) => ({
        name: tag.name,
        ...(tag.description !== undefined ? { description: tag.description } : {}),
        ...(tag.label !== undefined ? { label: tag.label } : {}),
        ...(tag.image !== undefined ? { image: tag.image } : {}),
        effects: tag.effects.map((e: TagEffect) => ({ ...e })),
      })),
    };
  }

  static fromJSON(json: TagCollectionJSON): TagCollection {
    return TagCollection.create(json.tags ?? []);
  }
}
