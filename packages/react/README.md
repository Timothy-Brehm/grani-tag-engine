# @grani/react

Optional React bindings for [`grani-tag-engine`](../engine).

## Install

```bash
npm install grani-tag-engine @grani/react
# peer: react ^18 || ^19
```

## Usage

```tsx
import { EngineRegistry, createEngineState } from 'grani-tag-engine';
import {
  EngineProvider,
  useEngineState,
  useEngineDispatch,
  useEngineSelector,
  useGameLoop,
} from '@grani/react';

const registry = new EngineRegistry().createBuiltinAdaptors();

export function App() {
  return (
    <EngineProvider registry={registry} host={{}} initialState={createEngineState()}>
      <Game />
    </EngineProvider>
  );
}

function Game() {
  useGameLoop({ intervalMs: 1000 });
  const tick = useEngineSelector((s) => s.tick);
  const dispatch = useEngineDispatch();
  const tags = useEngineState().tags;

  return (
    <button
      type="button"
      onClick={() =>
        dispatch({
          type: 'add-tag',
          tag: { name: 'clicked', effects: [] },
        })
      }
    >
      tick={tick} tags={tags.size}
    </button>
  );
}
```

Host games that already own a React store can call `reduceEngineState` directly
instead of mounting `EngineProvider`.
