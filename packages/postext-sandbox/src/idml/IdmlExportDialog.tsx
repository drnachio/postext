'use client';

// The Manuscript panel's Export to InDesign (#1491): the whole book laid
// out as the PDF is (every chapter after the ones before it), written as
// an IDML package and downloaded as `<title>.idml`, with what the writer
// says InDesign will show differently.

import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AlertTriangle, X } from 'lucide-react';
import type { IdmlWarning } from 'postext-idml';
import { useBookPlan, useSandboxLabels, useSandboxSelector } from '../context/SandboxContext.js';
import { layOutBookPrint } from '../book/printChain.js';
import { ensureConfigFontsLoaded } from '../controls/fonts/fontLoader.js';
import { withHyphenationLocale } from '../controls/language/hyphenation.js';
import { downloadBytes } from '../storage/persistence.js';
import { Button, IconButton, announce, usePortalContainer } from '../ui/index.js';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../ui/layout/surface.js';
import { useLayoutWorker } from '../worker/useLayoutWorker.js';
import { counted } from '../word/sandboxImport.js';
import { isolate } from '../word/WordImportDialog.js';
import { IDML_MIME, buildIdmlExport, idmlFileName } from './idmlExport.js';

export interface IdmlExportDialogProps {
  open: boolean;
  onClose: () => void;
  bookTitle: string;
}

export function IdmlExportDialog(props: IdmlExportDialogProps) {
  return (
    <Dialog.Root open={props.open} onOpenChange={(next) => { if (!next) props.onClose(); }}>
      {props.open && <IdmlExportPopup {...props} />}
    </Dialog.Root>
  );
}

/** Where an export stands: the chapters laid out, then the package. */
type Progress = { phase: 'layout'; done: number; total: number } | { phase: 'write' };

function IdmlExportPopup({ onClose, bookTitle }: IdmlExportDialogProps) {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const locale = useSandboxSelector((s) => s.locale);
  const chapters = useSandboxSelector((s) => s.chapters);
  const resources = useSandboxSelector((s) => s.resources);
  const plan = useBookPlan();
  const layoutWorker = useLayoutWorker('pdf');
  const container = usePortalContainer();
  const titleId = useId();
  const downloadRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [notes, setNotes] = useState<IdmlWarning[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closedRef = useRef(false);
  useEffect(() => {
    closedRef.current = false;
    return () => {
      closedRef.current = true;
    };
  }, []);
  useEffect(() => {
    if (notes) closeRef.current?.focus();
  }, [notes]);

  const progressText = (p: Progress | null): string =>
    p?.phase === 'layout'
      ? labels.idmlExportLayout.replace('__current__', String(Math.min(p.total, p.done + 1))).replace('__total__', String(p.total))
      : labels.idmlExportWriting;
  const fraction = (p: Progress | null): number =>
    !p ? 0 : p.phase === 'layout' ? (p.total > 0 ? (p.done / p.total) * 0.85 : 0) : 0.9;

  const run = async () => {
    setBusy(true);
    setError(null);
    setNotes(null);
    setProgress(null);
    const found: IdmlWarning[] = [];
    const name = idmlFileName(bookTitle);
    try {
      const effective = withHyphenationLocale(config, locale);
      await ensureConfigFontsLoaded(effective, chapters.map((c) => c.markdown));
      // The whole book, as the PDF's book scope lays it out.
      const docs = await layOutBookPrint({
        plan, chapters, resources, config: effective, build: layoutWorker.build,
        onChapter: (index, count) => { if (!closedRef.current) setProgress({ phase: 'layout', done: index, total: count }); },
      });
      if (closedRef.current) return;
      setProgress({ phase: 'write' });
      const bytes = await buildIdmlExport({
        docs,
        resources,
        config: effective,
        ...(bookTitle ? { title: bookTitle } : {}),
        onWarning: (w) => found.push(w),
      });
      if (closedRef.current) return;
      downloadBytes(bytes, name, IDML_MIME);
      if (found.length === 0) {
        announce(labels.idmlExportDone.replace('__file__', isolate(name)));
        onClose();
        return;
      }
      announce(counted(labels, 'idmlExportDoneNotes', found.length).replace('__file__', isolate(name)));
      setNotes(found);
    } catch (err) {
      if (closedRef.current || (err instanceof DOMException && err.name === 'AbortError')) return;
      console.error(err);
      const message = labels.idmlExportFailed.replace('__error__', err instanceof Error ? err.message : String(err));
      setError(message);
      announce(message);
    } finally {
      if (!closedRef.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };

  return (
    <Dialog.Portal container={container}>
      <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
      <Dialog.Popup
        data-postext-popup=""
        data-testid="idml-export-dialog"
        aria-labelledby={titleId}
        aria-busy={busy}
        initialFocus={downloadRef}
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-16px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto"
        style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(520px, calc(100vw - 16px))', padding: 16, fontSize: 13, lineHeight: '19px' }}
      >
        <div className="flex items-start justify-between gap-2">
          <Dialog.Title id={titleId} style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: '10px 0 0' }}>
            {labels.idmlExportTitle}
          </Dialog.Title>
          <IconButton label={labels.wordCancel} icon={<X size={14} aria-hidden="true" />} onClick={onClose} />
        </div>
        <Dialog.Description className="text-xs text-(--slate)" style={{ margin: 0 }}>
          {labels.idmlExportIntro}
        </Dialog.Description>

        {busy && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-(--slate)" aria-hidden="true">{progressText(progress)}</span>
            <div
              role="progressbar"
              aria-label={labels.idmlExportTitle}
              aria-valuetext={progressText(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(fraction(progress) * 100)}
              className="h-1 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--rule)' }}
            >
              <div className="h-full rounded-full" style={{ width: `${fraction(progress) * 100}%`, backgroundColor: 'var(--brand)', transition: 'width 120ms linear' }} />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="m-0 flex items-start gap-2 text-xs">
            <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--pt-error, #ef4444)' }} />
            <span style={{ overflowWrap: 'anywhere' }}>{error}</span>
          </p>
        )}

        {notes && (
          <div className="flex flex-col gap-2 border-t border-(--pt-control-border) pt-2">
            <p className="m-0 text-[13px] font-semibold">{labels.idmlExportNotes}</p>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {notes.map((n, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--pt-warning, #d97706)' }} />
                  <span dir="auto" style={{ overflowWrap: 'anywhere' }}>{isolate(n.message)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {notes ? (
            <Button ref={closeRef} variant="primary" size="sm" onClick={onClose}>{labels.wordExportClose}</Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>{labels.wordCancel}</Button>
              <Button ref={downloadRef} variant="primary" size="sm" onClick={() => void run()} disabled={busy}>{labels.idmlExportAction}</Button>
            </>
          )}
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
