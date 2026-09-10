'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { xml } from '@codemirror/lang-xml';
import { useSandboxLabels } from '../../context/SandboxContext';
import { getEditorTheme } from '../../editor/postextTheme';
import { getBlob, putBlob } from '../../storage/blobStore';
import { invalidateResourceImage } from '../../controls/resourceImages';
import { ensureSvgTextIndex } from '../../controls/svgTextIndex';
import { wordRangeAt } from '../../controls/wordRange';
import type { InlineFocusRequest, InlineSelection } from '../../controls/InlineMarkdownInput';
import { isValidSvg, svgIntrinsicSize } from './svgIntrinsic';
import { editableRangesField, setEditableRanges, svgEditableRanges } from './svgEditableRanges';
import { scanSvgTextNodeRanges } from '../../controls/svgSource';

// ---------------------------------------------------------------------------
// SvgSourceEditor — a CodeMirror view over an SVG resource's source where only
// the text nodes are editable (see svgEditableRanges.ts). Edits are saved on a
// short debounce as a NEW blob: every cache keyed by fileId (decoded images,
// object URLs, thumbnails, the canvas registry, the text index) misses
// naturally, and the previous blob is swept by the regular prune. The parent
// folds the new id into the resource, which relayouts the document.
// ---------------------------------------------------------------------------

const SAVE_DEBOUNCE_MS = 500;

/** What a save produced: the new blob id and the (unchanged) intrinsic size. */
export interface SvgSourceCommit {
  fileId: string;
  width?: number;
  height?: number;
}

interface SvgSourceEditorProps {
  fileId: string;
  isDark: boolean;
  /** Pending caret/selection request (offsets in the SVG source). */
  focusRequest: InlineFocusRequest | null;
  onFocusConsumed: () => void;
  /** Editor selection while focused; `null` on blur. */
  onSelectionChange: (selection: InlineSelection | null) => void;
  onCommit: (commit: SvgSourceCommit) => void;
}

type Status = 'loading' | 'ready' | 'missing';

export function SvgSourceEditor({
  fileId,
  isDark,
  focusRequest,
  onFocusConsumed,
  onSelectionChange,
  onCommit,
}: SvgSourceEditorProps) {
  const labels = useSandboxLabels();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const [status, setStatus] = useState<Status>('loading');
  const [hasText, setHasText] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The blob the editor's document currently mirrors. Set on load and on
  // every save so a `fileId` prop change caused by our own commit does not
  // reload (and reset) the editor.
  const currentFileIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onFocusConsumedRef = useRef(onFocusConsumed);
  onFocusConsumedRef.current = onFocusConsumed;
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  /** Persist the current document as a new blob and hand the id up. */
  const save = async (): Promise<void> => {
    const view = viewRef.current;
    if (!view || !dirtyRef.current) return;
    dirtyRef.current = false;
    const text = view.state.doc.toString();
    if (!isValidSvg(text)) {
      setError(labelsRef.current.svgSourceInvalid);
      return;
    }
    const previous = currentFileIdRef.current;
    try {
      const bytes = new TextEncoder().encode(text).buffer;
      const newId = await putBlob(bytes, 'image/svg+xml');
      currentFileIdRef.current = newId;
      setError(null);
      ensureSvgTextIndex(newId, text);
      if (previous) invalidateResourceImage(previous);
      onCommitRef.current({ fileId: newId, ...svgIntrinsicSize(text) });
    } catch {
      dirtyRef.current = true;
      setError(labelsRef.current.svgSourceSaveFailed);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  const scheduleSave = () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveRef.current();
    }, SAVE_DEBOUNCE_MS);
  };

  // Create the view once; flush a pending save on unmount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        dirtyRef.current = true;
        scheduleSave();
      }
      if (update.selectionSet || update.focusChanged || update.docChanged) {
        if (update.view.hasFocus) {
          const sel = update.state.selection.main;
          onSelectionChangeRef.current({ from: sel.from, to: sel.to, head: sel.head });
        } else if (update.focusChanged) {
          onSelectionChangeRef.current(null);
        }
      }
    });
    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          history(),
          xml(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          themeCompartment.current.of(getEditorTheme(isDark)),
          EditorView.lineWrapping,
          svgEditableRanges(),
          updateListener,
        ],
      }),
      parent: host,
    });
    viewRef.current = view;
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void saveRef.current();
      }
      view.destroy();
      viewRef.current = null;
    };
    // Mount only: theme / callbacks flow through compartments and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeCompartment.current.reconfigure(getEditorTheme(isDark)) });
  }, [isDark]);

  // Load the blob into the editor (unless it is the one we just saved).
  useEffect(() => {
    if (currentFileIdRef.current === fileId) return;
    let cancelled = false;
    setStatus('loading');
    setError(null);
    getBlob(fileId)
      .then((rec) => {
        if (cancelled) return;
        const view = viewRef.current;
        if (!rec || rec.contentType !== 'image/svg+xml' || !view) {
          setStatus('missing');
          return;
        }
        const text = new TextDecoder().decode(rec.bytes);
        const ranges = scanSvgTextNodeRanges(text);
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          effects: setEditableRanges.of(ranges),
          // A load is not an edit: keep it out of the undo history.
          annotations: Transaction.addToHistory.of(false),
        });
        dirtyRef.current = false;
        if (saveTimerRef.current !== null) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        currentFileIdRef.current = fileId;
        ensureSvgTextIndex(fileId, text);
        setHasText(ranges.some((r) => /\S/.test(text.slice(r.start, r.end))));
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  // Consume a focus request once the document is loaded (mirrors the
  // Markdown editor's `pendingEditorFocus` consumer).
  useEffect(() => {
    if (!focusRequest || status !== 'ready') return;
    const view = viewRef.current;
    if (!view) return;
    const docLen = view.state.doc.length;
    const clamp = (n: number): number => Math.max(0, Math.min(n, docLen));
    let anchor = clamp(focusRequest.anchor);
    let head = clamp(focusRequest.head);
    if (focusRequest.selectWord && anchor === head) {
      // Expand within the text node only, never across markup.
      const ranges = view.state.field(editableRangesField);
      const range = ranges.find((r) => anchor >= r.start && anchor <= r.end);
      if (range) {
        const local = wordRangeAt(view.state.doc.sliceString(range.start, range.end), anchor - range.start);
        anchor = range.start + local.from;
        head = range.start + local.to;
      }
    }
    view.focus();
    view.dispatch({ selection: { anchor, head }, scrollIntoView: true });
    onFocusConsumedRef.current();
  }, [focusRequest, status]);

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={hostRef}
        role="group"
        aria-label={labels.svgSourceAria}
        className="rounded border"
        style={{
          borderColor: 'var(--rule)',
          height: 220,
          minHeight: 96,
          maxHeight: '40vh',
          resize: 'vertical',
          overflow: 'hidden',
          display: status === 'ready' ? 'block' : 'none',
        }}
      />
      {status === 'loading' && (
        <span className="text-xs" style={{ color: 'var(--slate)' }}>{labels.svgSourceLoading}</span>
      )}
      {status === 'missing' && (
        <span className="text-xs" style={{ color: 'var(--destructive)' }}>{labels.svgSourceMissing}</span>
      )}
      {status === 'ready' && !hasText && (
        <span className="text-xs" style={{ color: 'var(--slate)' }}>{labels.svgSourceNoText}</span>
      )}
      {error && (
        <span className="text-xs" style={{ color: 'var(--destructive)' }}>{error}</span>
      )}
    </div>
  );
}
