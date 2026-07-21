import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from './action';
import { EngineRegistry } from './registry';
import { TagCollection } from './tag-collection';
import { createTag } from './tag';
import {
  executeAction,
  executeActionSafe,
  isActionAvailable,
  codeRequirementsMet,
  requirementsMet,
} from './evaluate';

describe('registry builtins and actions', () => {
  const registry = new EngineRegistry().createBuiltinAdaptors();

  it('evaluates free, forbidden, and tag requirements', () => {
    const ctx = {
      tags: TagCollection.create([createTag({ name: 'marked', effects: [] })]),
      host: {},
    };
    expect(requirementsMet(registry, [{ type: 'free' }], ctx)).toBe(true);
    expect(requirementsMet(registry, [{ type: 'forbidden' }], ctx)).toBe(false);
    expect(
      requirementsMet(registry, [{ type: 'tag', tagName: 'marked', exists: true }], ctx),
    ).toBe(true);
    expect(
      requirementsMet(registry, [{ type: 'tag', tagName: 'marked', exists: false }], ctx),
    ).toBe(false);
    expect(
      requirementsMet(registry, [{ type: 'tag', tagName: 'other', exists: false }], ctx),
    ).toBe(true);
  });

  it('checks availability and executes grant-tag results', () => {
    const action: ActionDefinition = {
      name: 'grant',
      requirements: [{ type: 'free' }],
      costs: [],
      results: [{ type: 'grant-tag', name: 'bonus', strength: 1 }],
      sideEffects: [],
    };
    const ctx = { tags: TagCollection.create(), host: {} };
    expect(isActionAvailable(registry, action, ctx)).toBe(true);
    const next = executeAction(registry, action, ctx);
    expect(next.tags.has('bonus')).toBe(true);
    expect(isActionAvailable(registry, action, next)).toBe(false);
  });

  it('executeActionSafe skips effects that cannot happen', () => {
    const action: ActionDefinition = {
      name: 'maybe',
      requirements: [{ type: 'free' }],
      costs: [],
      results: [
        { type: 'grant-tag', name: 'a', strength: 1 },
        { type: 'grant-tag', name: 'a', strength: 1 },
      ],
      sideEffects: [{ type: 'grant-tag', name: 'b', strength: 1 }],
    };
    const ctx = { tags: TagCollection.create(), host: {} };
    const next = executeActionSafe(registry, action, ctx);
    expect(next.tags.has('a')).toBe(true);
    expect(next.tags.has('b')).toBe(true);
    expect(next.tags.size).toBe(2);
  });

  it('uses host tagCatalog when granting', () => {
    const catalog = {
      fancy: createTag({
        name: 'fancy',
        description: 'from catalog',
        effects: [{ type: 'glow', name: 'g', strength: 4 }],
      }),
    };
    const action: ActionDefinition = {
      name: 'from-catalog',
      requirements: [],
      costs: [],
      results: [{ type: 'grant-tag', name: 'fancy', strength: 1 }],
      sideEffects: [],
    };
    const next = executeAction(registry, action, {
      tags: TagCollection.create(),
      host: { tagCatalog: catalog },
    });
    expect(next.tags.get('fancy')?.description).toBe('from catalog');
    expect(next.tags.sumEffectStrength('glow')).toBe(4);
  });

  it('supports registered host requirements and code-only checks', () => {
    type Host = { level: number; enabled: boolean };
    type LevelRequirement = {
      type: 'example/level';
      minimum: number;
    };
    const hostRegistry = new EngineRegistry<Host>()
      .createBuiltinAdaptors()
      .registerRequirement(
        'example/level',
        (requirement: LevelRequirement, context) =>
          context.host.level >= requirement.minimum,
      );
    const context = {
      tags: TagCollection.create(),
      host: { level: 4, enabled: true },
    };

    expect(
      requirementsMet(
        hostRegistry,
        [{ type: 'example/level', minimum: 3 }],
        context,
      ),
    ).toBe(true);
    expect(
      codeRequirementsMet(
        [(ctx) => ctx.host.enabled, (ctx) => ctx.host.level < 5],
        context,
      ),
    ).toBe(true);
  });
});
