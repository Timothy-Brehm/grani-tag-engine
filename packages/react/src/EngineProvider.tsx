import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  reduceEngineState,
  type EngineCommand,
  type EngineRegistry,
  type EngineState,
  type ReduceEngineOptions,
} from 'grani-tag-engine';

export type EngineDispatch = (command: EngineCommand) => void;

type EngineStore<THost> = {
  state: EngineState;
  dispatch: EngineDispatch;
  registry: EngineRegistry<THost>;
  host: THost;
};

const EngineStoreContext = createContext<EngineStore<unknown> | null>(null);

export type EngineProviderProps<THost = unknown> = {
  children: ReactNode;
  registry: EngineRegistry<THost>;
  host: THost;
  /** Required valid engine state (must include primaryEntityId). */
  initialState: EngineState;
};

/**
 * Holds EngineState in React and exposes immutable command dispatch.
 * Host games nest this (or mirror reduceEngineState in their own store).
 */
export function EngineProvider<THost = unknown>({
  children,
  registry,
  host,
  initialState,
}: EngineProviderProps<THost>) {
  const [state, setState] = useState<EngineState>(() => initialState);

  // Keep host/registry fresh without forcing consumers to remount.
  const optionsRef = useRef<ReduceEngineOptions<THost>>({ registry, host });
  optionsRef.current = { registry, host };

  const dispatch = useCallback<EngineDispatch>((command) => {
    setState((prev) => reduceEngineState(prev, command, optionsRef.current));
  }, []);

  const value = useMemo(
    () =>
      ({
        state,
        dispatch,
        registry,
        host,
      }) as EngineStore<unknown>,
    [state, dispatch, registry, host],
  );

  return (
    <EngineStoreContext.Provider value={value}>
      {children}
    </EngineStoreContext.Provider>
  );
}

function useEngineStore<THost = unknown>(): EngineStore<THost> {
  const store = useContext(EngineStoreContext);
  if (!store) {
    throw new Error('Engine hooks must be used within an EngineProvider');
  }
  return store as EngineStore<THost>;
}

export function useEngineState(): EngineState {
  return useEngineStore().state;
}

export function useEngineDispatch(): EngineDispatch {
  return useEngineStore().dispatch;
}

export function useEngineRegistry<THost = unknown>(): EngineRegistry<THost> {
  return useEngineStore<THost>().registry;
}

export function useEngineHost<THost = unknown>(): THost {
  return useEngineStore<THost>().host;
}

/**
 * Select a derived slice. Re-renders when the selected value changes by
 * Object.is (pass equalityFn for structural compares).
 */
export function useEngineSelector<T>(
  selector: (state: EngineState) => T,
  equalityFn: (a: T, b: T) => boolean = Object.is,
): T {
  const state = useEngineState();
  const selected = selector(state);
  const previousRef = useRef<{ value: T } | null>(null);
  if (
    previousRef.current === null ||
    !equalityFn(previousRef.current.value, selected)
  ) {
    previousRef.current = { value: selected };
  }
  return previousRef.current.value;
}
