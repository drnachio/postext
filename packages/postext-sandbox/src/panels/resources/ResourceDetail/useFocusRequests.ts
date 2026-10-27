// Preview clicks routed to the resource's fields, and the selection each
// field reports back for the preview highlight.
import { useSandboxSelector, type ResourceFocusTarget } from '../../../context/SandboxContext.js';
import { useMemo, useCallback } from 'react';
import type { TableFocusRequest } from '../TableEditor/TableEditor.js';
import type { InlineSelection } from '../../../controls/inputs/InlineMarkdownInput.js';
import type { TableCellPos, Resource } from 'postext';
import type { SandboxAction } from '../../../context/SandboxContext/state.js';

/** What useFocusRequests takes from ResourceDetail. */
export interface UseFocusRequestsDeps {
  resource: Resource;
  dispatch: React.Dispatch<SandboxAction>;
}

export function useFocusRequests(deps: UseFocusRequestsDeps) {
  const {
    resource, dispatch
  } = deps;
  // Preview click → panel: the pending request addressed to this resource is
  // routed to the matching field by its target kind and cleared once applied;
  // every field reports its selection back for the preview highlight. Read
  // through a selector so unrelated state changes leave this pane alone.
  const pending = useSandboxSelector((s) => (s.pendingResourceFocus?.resourceId === resource.id ? s.pendingResourceFocus : null));
  const captionRequest = pending?.target.kind === 'caption' ? pending : null;
  const noteRequest = pending?.target.kind === 'note' ? pending : null;
  const svgRequest = pending?.target.kind === 'svgText' ? pending : null;
  const cellRequest = useMemo<TableFocusRequest | null>(() => {
    if (!pending || pending.target.kind !== 'cell') return null;
    const { row, col } = pending.target;
    return { row, col, anchor: pending.anchor, head: pending.head, selectWord: pending.selectWord };
  }, [pending]);
  const consumeFocus = useCallback(
    () => dispatch({ type: 'SET_PENDING_RESOURCE_FOCUS', payload: null }),
    [dispatch],
  );
  const reportSelection = useCallback(
    (target: ResourceFocusTarget, sel: InlineSelection | null) => {
      dispatch({
        type: 'SET_RESOURCE_SELECTION',
        payload: sel ? { resourceId: resource.id, target, from: sel.from, to: sel.to, head: sel.head } : null,
      });
    },
    [dispatch, resource.id],
  );
  const onCaptionSelection = useCallback((sel: InlineSelection | null) => reportSelection({ kind: 'caption' }, sel), [reportSelection]);
  const onNoteSelection = useCallback((sel: InlineSelection | null) => reportSelection({ kind: 'note' }, sel), [reportSelection]);
  const onSvgSelection = useCallback((sel: InlineSelection | null) => reportSelection({ kind: 'svgText' }, sel), [reportSelection]);
  const onCellSelection = useCallback(
    (pos: TableCellPos, sel: InlineSelection | null) => reportSelection({ kind: 'cell', row: pos.row, col: pos.col }, sel),
    [reportSelection],
  );
  return {
    captionRequest, noteRequest, svgRequest, cellRequest, consumeFocus, onCaptionSelection,
    onNoteSelection, onSvgSelection, onCellSelection
  };
}
