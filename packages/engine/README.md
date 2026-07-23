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

## Messages (host catalog + engine seen state)

Short-term player text (modals, banners) uses host-owned catalog entries (text,
image key, optional priority). The engine only tracks message **ids** on entities:

- Effect: `{ type: 'show-message', name: 'welcome', strength: 1 }` (default scope:
  source, else actor). Fire-once if already offered or seen.
- Select: `selectUnseenMessages(entity)` / `selectUnseenMessagesInState(state)`
- Ack: `{ type: 'seen-message', entityId, messageId }`

## Reserved process API

Recurring toggles will be modeled as processes that allocate capacity from a
`primary` or host-derived `typed` pool and attempt an ordinary action per tick.
The definitions and commands are exported now, but process commands throw
`ProcessesNotImplementedError` until scheduling is implemented.

Built with tsup (ESM + `.d.ts`). Tests via Vitest.
