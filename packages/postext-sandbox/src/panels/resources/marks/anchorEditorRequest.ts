import type { Dispatch } from 'react';
import type { SandboxAction } from '../../../context/SandboxContext.js';

// ---------------------------------------------------------------------------
// Opening a picture's anchor editor from elsewhere (#866): a warning, a
// label double-clicked on a page. The request names the resource and either
// an anchor to pick or a name to place (a label waiting for its anchor);
// the Resources panel opens on the resource and the picture's field opens
// its dialog when it mounts, taking the request once.
// ---------------------------------------------------------------------------

export interface AnchorEditorRequest {
  resourceId: string;
  /** An anchor of the picture to pick in the list. */
  anchor?: string;
  /** A name the text uses that the picture has no anchor for: the next
   *  click on the picture places it. */
  place?: string;
}

let pending: AnchorEditorRequest | null = null;
const listeners = new Set<() => void>();

/** Open the Resources panel on `request.resourceId` with its anchor
 *  editor. */
export function requestAnchorEditor(dispatch: Dispatch<SandboxAction>, request: AnchorEditorRequest): void {
  pending = { ...request };
  dispatch({ type: 'SET_PANEL', payload: 'resources' });
  dispatch({ type: 'SET_ACTIVE_RESOURCE', payload: request.resourceId });
  for (const l of [...listeners]) l();
}

/** The request waiting for `resourceId`, taken (null when there is none). */
export function takeAnchorEditorRequest(resourceId: string): AnchorEditorRequest | null {
  if (!pending || pending.resourceId !== resourceId) return null;
  const r = pending;
  pending = null;
  return r;
}

/** Called when a request is made (the field is already on screen). */
export function onAnchorEditorRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
