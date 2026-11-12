// The design actions' host for a store (the Design panel's, the Books
// panel's and the WebMCP tools').

import { useMemo } from 'react';
import { useSandboxStore, type SandboxStore } from '../context/SandboxContext.js';
import type { DesignHost } from './designActions.js';
import { designUrls } from './designSources.js';

/** The host of the design actions on `store`. */
export function designHostOf(store: Pick<SandboxStore, 'getSnapshot' | 'dispatch' | 'presetProvider'>): DesignHost {
  return {
    getState: () => store.getSnapshot(),
    dispatch: (action) => store.dispatch(action),
    sources: () => {
      const s = store.getSnapshot();
      return { locale: s.locale, designUrls: designUrls(), presets: s.presetSummaries, presetProvider: store.presetProvider };
    },
  };
}

/** The host of the design actions on the Sandbox's store. */
export function useDesignHost(): DesignHost {
  const store = useSandboxStore();
  return useMemo(() => designHostOf(store), [store]);
}
