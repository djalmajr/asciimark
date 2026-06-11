// Latest-wins guard for out-of-order async resolutions: concurrent loads
// (rapid workspace-root switches, popover-open refreshes) may settle in any
// order, and only the most recently started run may commit its result.

export interface GenerationGuard {
  /** Start a run, superseding every previous one. The returned predicate is
   *  true only while this run is still the latest. */
  begin: () => () => boolean;
}

export function createGenerationGuard(): GenerationGuard {
  let generation = 0;
  return {
    begin: () => {
      const current = ++generation;
      return () => current === generation;
    },
  };
}
