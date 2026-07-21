import { describe, expect, it } from 'vitest';
import { createTag } from './tag';
import { TagCollection } from './tag-collection';

describe('TagCollection', () => {
  it('adds, has, gets, and lists tags', () => {
    const a = createTag({
      name: 'alpha',
      description: 'A',
      effects: [{ type: 'buff', name: 'atk', strength: 2 }],
    });
    let col = TagCollection.create();
    expect(col.size).toBe(0);
    col = col.add(a);
    expect(col.has('alpha')).toBe(true);
    expect(col.get('alpha')?.description).toBe('A');
    expect(col.list()).toHaveLength(1);
  });

  it('add is idempotent by name', () => {
    const first = createTag({
      name: 'same',
      effects: [{ type: 'x', name: 'a', strength: 1 }],
    });
    const second = createTag({
      name: 'same',
      effects: [{ type: 'x', name: 'b', strength: 99 }],
    });
    const col = TagCollection.create().add(first).add(second);
    expect(col.size).toBe(1);
    expect(col.get('same')?.effects[0]?.name).toBe('a');
  });

  it('removes tags', () => {
    const col = TagCollection.create([
      createTag({ name: 'keep', effects: [] }),
      createTag({ name: 'drop', effects: [] }),
    ]).remove('drop');
    expect(col.has('drop')).toBe(false);
    expect(col.has('keep')).toBe(true);
  });

  it('sums effect strength by type', () => {
    const col = TagCollection.create([
      createTag({
        name: 't1',
        effects: [
          { type: 'armor', name: 'a', strength: 3 },
          { type: 'other', name: 'o', strength: 10 },
        ],
      }),
      createTag({
        name: 't2',
        effects: [{ type: 'armor', name: 'b', strength: 2 }],
      }),
    ]);
    expect(col.sumEffectStrength('armor')).toBe(5);
    expect(col.sumEffectStrength('missing')).toBe(0);
  });

  it('filters and serializes round-trip', () => {
    const col = TagCollection.create([
      createTag({ name: 'hot', label: 'Hot', effects: [{ type: 'heat', name: 'h', strength: 1 }] }),
      createTag({ name: 'cold', effects: [] }),
    ]);
    const filtered = col.filter((t) => t.name === 'hot');
    expect(filtered.size).toBe(1);
    const json = filtered.toJSON();
    const restored = TagCollection.fromJSON(json);
    expect(restored.get('hot')?.label).toBe('Hot');
    expect(restored.get('hot')?.effects[0]?.strength).toBe(1);
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});
