import { useSyncExternalStore } from 'react';

/** Below this width the sandbox switches to its phone layout: the panel
 *  bar moves to the bottom, an open panel covers the preview instead of
 *  sitting beside it, and the preview toolbars dock along the bottom. */
export const COMPACT_MEDIA_QUERY = '(max-width: 767px)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(COMPACT_MEDIA_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

const getSnapshot = () => window.matchMedia(COMPACT_MEDIA_QUERY).matches;
const getServerSnapshot = () => false;

/** Whether the window is phone-sized (see `COMPACT_MEDIA_QUERY`). */
export function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
