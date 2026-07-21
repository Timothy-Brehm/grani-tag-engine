import { useEffect, useRef } from 'react';
import { useEngineDispatch } from './EngineProvider';

export type UseGameLoopOptions = {
  /** Interval in milliseconds. Default 1000. */
  intervalMs?: number;
  /** When false, the loop is paused. Default true. */
  enabled?: boolean;
  /** Tick steps dispatched each interval. Default 1. */
  steps?: number;
};

/**
 * Dispatches `{ type: 'tick' }` on an interval using the provider's dispatch,
 * so each tick always reduces against the latest EngineState.
 */
export function useGameLoop(options: UseGameLoopOptions = {}): void {
  const { intervalMs = 1000, enabled = true, steps = 1 } = options;
  const dispatch = useEngineDispatch();
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const id = setInterval(() => {
      dispatch({ type: 'tick', steps: stepsRef.current });
    }, intervalMs);
    return () => clearInterval(id);
  }, [dispatch, enabled, intervalMs]);
}
