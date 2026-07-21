# grani-tag-engine

Framework-neutral tag, requirement, effect, and action evaluation library.

## Install

```bash
npm install grani-tag-engine
```

## Quick start

```ts
import {
  createEngineState,
  createTag,
  EngineRegistry,
  reduceEngineState,
  isActionAvailable,
  toEngineContext,
} from 'grani-tag-engine';

const registry = new EngineRegistry().createBuiltinAdaptors();
let state = createEngineState({
  tags: [createTag({ name: 'ready', effects: [] })],
});

state = reduceEngineState(
  state,
  { type: 'tick' },
  { registry, host: {} },
);

const action = {
  name: 'unlock',
  requirements: [{ type: 'tag', tagName: 'ready', exists: true }],
  costs: [],
  results: [{ type: 'grant-tag', name: 'unlocked', strength: 1 }],
  sideEffects: [],
};

if (isActionAvailable(registry, action, toEngineContext(state, {}))) {
  state = reduceEngineState(
    state,
    { type: 'execute-action', action },
    { registry, host: {} },
  );
}
```

React runners: install `@grani/react` for `EngineProvider` / `useGameLoop`, or call `reduceEngineState` from your own store.

## Custom requirements

Serializable host requirements are registered by type:

```ts
type LevelRequirement = { type: 'my-game/level'; minimum: number };

registry.registerRequirement(
  'my-game/level',
  (requirement: LevelRequirement, context) =>
    context.host.level >= requirement.minimum,
);
```

Actions defined in TypeScript can also provide runtime-only predicates:

```ts
const action = {
  // requirements/costs/results...
  codeRequirements: [
    (context) => context.host.specialScenarioIsActive,
  ],
};
```

Functions are not serializable; use registered requirement types for JSON content.

## Reserved process API

Recurring toggles will be modeled as processes that allocate capacity from a
`primary` or host-derived `typed` pool and attempt an ordinary action per tick.
The definitions and commands are exported now, but process commands throw
`ProcessesNotImplementedError` until scheduling is implemented.

Built with tsup (ESM + `.d.ts`). Tests via Vitest.
