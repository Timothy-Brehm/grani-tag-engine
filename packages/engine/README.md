# grani-tag-engine

Framework-neutral tag, entity, requirement, effect, and action evaluation library.

## Install

```bash
npm install grani-tag-engine
```

## Quick start

```ts
import {
  createEngineState,
  createTaggedEntity,
  createTag,
  EngineRegistry,
  reduceEngineState,
  isActionAvailable,
  toEngineContext,
  upsertEntity,
} from 'grani-tag-engine';

const registry = new EngineRegistry().createBuiltinAdaptors();
let state = upsertEntity(
  createEngineState(),
  createTaggedEntity({
    id: 'player',
    tags: [createTag({ name: 'ready', effects: [] })],
  }),
);

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

if (
  isActionAvailable(
    registry,
    action,
    toEngineContext(state, {}, { actorEntityId: 'player' }),
  )
) {
  state = reduceEngineState(
    state,
    { type: 'execute-action', action, actorEntityId: 'player' },
    { registry, host: {} },
  );
}
```

Entity definitions, `adjust-pool`, and `spawn-entity` are builtins. Register definitions with `registry.registerEntityDefinition(...)`.

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

Actions defined in TypeScript can also provide runtime-only predicates via `codeRequirements` (not serializable).

## Novelty (tag-based)

Discoverables (entity, action, pool-max / stat effect, or a held **tag**) may declare:

```ts
novelty: { seenTag: 'Seen_BreakCanopy', scope?: 'instance' | 'primary' }
```

Novel while `seenTag` is **absent** on the ack scope. Acknowledge with `add-tag` /
`grant-tag`. Catalog tag fields (`description`, `image`, …) on **`seenTag`** are the
display payload for badges or modals. Silent milestones use a tag with empty effects
plus `novelty.seenTag` pointing at the message catalog entry. Selectors:
`selectIsNovel`, `selectNovelOnEntity`, `selectNovelInState`.

## Reserved process API

Recurring toggles will be modeled as processes that allocate capacity from a
`primary` or host-derived `typed` pool and attempt an ordinary action per tick.
The definitions and commands are exported now, but process commands throw
`ProcessesNotImplementedError` until scheduling is implemented.

Built with tsup (ESM + `.d.ts`). Tests via Vitest.
