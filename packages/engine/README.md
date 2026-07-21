# grani-tag-engine

Framework-neutral tag, requirement, effect, and action evaluation library.

## Install

```bash
npm install grani-tag-engine
```

## Quick start

```ts
import {
  TagCollection,
  createTag,
  EngineRegistry,
  isActionAvailable,
  executeAction,
} from 'grani-tag-engine';

const tags = TagCollection.create([
  createTag({ name: 'ready', effects: [] }),
]);
const registry = new EngineRegistry().createBuiltinAdaptors();
const ctx = { tags, host: {} };

const action = {
  name: 'unlock',
  requirements: [{ type: 'tag', tagName: 'ready', exists: true }],
  costs: [],
  results: [{ type: 'grant-tag', name: 'unlocked', strength: 1 }],
  sideEffects: [],
};

if (isActionAvailable(registry, action, ctx)) {
  const next = executeAction(registry, action, ctx);
}
```

Built with tsup (ESM + `.d.ts`). Tests via Vitest.
