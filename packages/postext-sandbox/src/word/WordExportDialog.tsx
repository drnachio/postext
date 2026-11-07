'use client';

// The Manuscript panel's Export to Word (#1397): the kind of document
// (semantic: Word styles to write in; formatted: the printed pages to check
// the layout on), what to export, then the file, with the progress of a
// formatted export and what Word will show differently.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AlertTriangle, X } from 'lucide-react';
import { preferredWordVariant } from 'postext/word';
import { useBookPlan, useSandboxLabels, useSandboxSelector } from '../context/SandboxContext.js';
import { withHyphenationLocale } from '../controls/language/hyphenation.js';
import { downloadBytes } from '../storage/persistence.js';
import type { SandboxLabels } from '../types/index.js';
import { Button, IconButton, Select, announce, usePortalContainer, type SelectOption } from '../ui/index.js';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../ui/layout/surface.js';
import { createPdfFontProvider } from '../viewport/pdf/pdfFontProvider.js';
import { useLayoutService } from '../worker/LayoutServiceContext.js';
import { counted } from './sandboxImport.js';
import { isolate } from './WordImportDialog.js';
import { DOCX_MIME, buildWordExport, docxFileName, wordChapters, type WordExportNote, type WordExportProgress, type WordScope, type WordVariant } from './wordExport.js';

export interface WordExportDialogProps {
  open: boolean;
  onClose: () => void;
  bookTitle: string;
}

export function WordExportDialog(props: WordExportDialogProps) {
  return (
    <Dialog.Root open={props.open} onOpenChange={(next) => { if (!next) props.onClose(); }}>
      {props.open && <WordExportPopup {...props} />}
    </Dialog.Root>
  );
}

/** A font note in words. */
export function fontNoteText(labels: SandboxLabels, note: Extract<WordExportNote, { kind: 'font' }>): string {
  const key = ({
    restricted: 'wordFontRestricted',
    cff: 'wordFontCff',
    variable: 'wordFontVariable',
    missing: 'wordFontMissing',
    'merge-failed': 'wordFontMergeFailed',
    'preview-print': 'wordFontPreviewPrint',
  } as const)[note.reason];
  return labels[key].replace('__family__', isolate(note.family));
}

/** Where a running export stands, in words. */
function progressText(labels: SandboxLabels, p: WordExportProgress | null): string {
  if (!p) return labels.wordExportWriting;
  const fill = (s: string) => s.replace('__current__', String(Math.min(p.total, p.done + (p.phase === 'layout' ? 1 : 0)))).replace('__total__', String(p.total));
  if (p.phase === 'layout') return fill(labels.wordExportLaying);
  if (p.phase === 'fonts') return fill(labels.wordExportFonts);
  if (p.phase === 'pages') return fill(labels.wordExportPages);
  return labels.wordExportWriting;
}

/** The share of the export done: layout first, then fonts, then pages. */
function progressFraction(p: WordExportProgress | null): number {
  if (!p || p.total <= 0) return 0;
  const part = Math.min(1, p.done / p.total);
  if (p.phase === 'layout') return part * 0.5;
  if (p.phase === 'fonts') return 0.5 + part * 0.15;
  if (p.phase === 'pages') return 0.65 + part * 0.35;
  return 0.9;
}

let exports = 0;

function WordExportPopup({ onClose, bookTitle }: WordExportDialogProps) {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const locale = useSandboxSelector((s) => s.locale);
  const chapters = useSandboxSelector((s) => s.chapters);
  const resources = useSandboxSelector((s) => s.resources);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const plan = useBookPlan();
  const service = useLayoutService();
  const container = usePortalContainer();
  const titleId = useId();
  const variantId = useId();
  const downloadRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [scope, setScope] = useState<WordScope>(chapters.length > 1 ? 'chapter' : 'book');
  // The variant the reader picked; until then the one that suits what is
  // exported: Formatted when it is mostly composed or comic pages, which
  // the semantic document only stands in for (#1444).
  const [picked, setVariant] = useState<WordVariant | null>(null);
  const suggested = useMemo(() => preferredWordVariant(wordChapters(chapters, scope, activeChapterId)), [chapters, scope, activeChapterId]);
  const variant = picked ?? suggested;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<WordExportProgress | null>(null);
  const [notes, setNotes] = useState<WordExportNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One layout client per dialog: closing it drops the layout under way.
  const clientRef = useRef(`word-export:${++exports}`);
  const closedRef = useRef(false);
  useEffect(() => {
    const clientId = clientRef.current;
    // Mounted again (React's development double mount): open once more.
    closedRef.current = false;
    return () => {
      closedRef.current = true;
      service.cancel(clientId);
    };
  }, [service]);
  useEffect(() => {
    if (notes) closeRef.current?.focus();
  }, [notes]);

  const run = async () => {
    setBusy(true);
    setError(null);
    setNotes(null);
    setProgress(null);
    const found: WordExportNote[] = [];
    const chapter = chapters.find((c) => c.id === activeChapterId);
    const name = docxFileName(bookTitle, scope === 'chapter' && chapters.length > 1 ? chapter?.title ?? '' : null);
    try {
      const bytes = await buildWordExport({
        variant,
        scope,
        service,
        clientId: clientRef.current,
        chapters,
        activeChapterId,
        resources,
        config: withHyphenationLocale(config, locale),
        plan,
        title: bookTitle,
        fontProvider: variant === 'formatted' ? createPdfFontProvider() : undefined,
        onProgress: (p) => { if (!closedRef.current) setProgress(p); },
        onNote: (n) => found.push(n),
      });
      if (closedRef.current) return;
      downloadBytes(bytes, name, DOCX_MIME);
      if (found.length === 0) {
        announce(labels.wordExportDone.replace('__file__', isolate(name)));
        onClose();
        return;
      }
      announce(counted(labels, 'wordExportDoneNotes', found.length).replace('__file__', isolate(name)));
      setNotes(found);
    } catch (err) {
      if (closedRef.current || (err instanceof DOMException && err.name === 'AbortError')) return;
      console.error(err);
      const message = labels.wordExportFailed.replace('__error__', err instanceof Error ? err.message : String(err));
      setError(message);
      announce(message);
    } finally {
      if (!closedRef.current) setBusy(false);
    }
  };

  const scopeOptions: SelectOption<WordScope>[] = [
    { value: 'chapter', label: labels.wordExportScopeChapter },
    { value: 'book', label: labels.wordExportScopeBook },
  ];
  const variants: { value: WordVariant; label: string; hint: string }[] = [
    { value: 'semantic', label: labels.wordExportSemantic, hint: labels.wordExportSemanticHint },
    { value: 'formatted', label: labels.wordExportFormatted, hint: labels.wordExportFormattedHint },
  ];
  const fontNotes = (notes ?? []).filter((n): n is Extract<WordExportNote, { kind: 'font' }> => n.kind === 'font');
  const contentNotes = (notes ?? []).filter((n): n is Extract<WordExportNote, { kind: 'content' }> => n.kind === 'content');

  return (
    <Dialog.Portal container={container}>
      <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
      <Dialog.Popup
        data-postext-popup=""
        data-testid="word-export-dialog"
        aria-labelledby={titleId}
        aria-busy={busy}
        initialFocus={downloadRef}
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-16px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto"
        style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(520px, calc(100vw - 16px))', padding: 16, fontSize: 13, lineHeight: '19px' }}
      >
        <div className="flex items-start justify-between gap-2">
          <Dialog.Title id={titleId} style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: '10px 0 0' }}>
            {labels.wordExportTitle}
          </Dialog.Title>
          <IconButton label={labels.wordCancel} icon={<X size={14} aria-hidden="true" />} onClick={onClose} />
        </div>
        <Dialog.Description className="text-xs text-(--slate)" style={{ margin: 0 }}>
          {labels.wordExportIntro}
        </Dialog.Description>

        <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0" disabled={busy}>
          <legend id={variantId} className="mb-1 p-0 text-xs font-semibold">{labels.wordExportVariant}</legend>
          {variants.map((v) => (
            <label
              key={v.value}
              className="flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2"
              style={{ minHeight: 44, borderColor: variant === v.value ? 'var(--brand)' : 'var(--pt-control-border)' }}
            >
              <input
                type="radio"
                name={variantId}
                value={v.value}
                checked={variant === v.value}
                onChange={() => setVariant(v.value)}
                className="mt-1 shrink-0 accent-(--brand)"
                style={{ width: 16, height: 16 }}
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{v.label}</span>
                <span className="text-xs text-(--slate)">{v.hint}</span>
              </span>
            </label>
          ))}
          {picked === null && suggested === 'formatted' && (
            <p className="m-0 text-xs text-(--slate)">{labels.wordExportPagesSuggested}</p>
          )}
        </fieldset>

        {chapters.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs">{labels.wordExportScope}</span>
            <Select<WordScope> size="sm" value={scope} onValueChange={setScope} options={scopeOptions} ariaLabel={labels.wordExportScope} disabled={busy} />
          </div>
        )}

        {busy && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-(--slate)" aria-hidden="true">{progressText(labels, progress)}</span>
            {/* The bar carries the words: a live region would read every page out. */}
            <div
              role="progressbar"
              aria-label={labels.wordExportTitle}
              aria-valuetext={progressText(labels, progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressFraction(progress) * 100)}
              className="h-1 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--rule)' }}
            >
              <div className="h-full rounded-full" style={{ width: `${progressFraction(progress) * 100}%`, backgroundColor: 'var(--brand)', transition: 'width 120ms linear' }} />
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
            <p className="m-0 text-[13px] font-semibold">{labels.wordExportNotes}</p>
            {fontNotes.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {fontNotes.map((n, i) => (
                  <li key={`f${i}`} className="flex items-start gap-2 text-xs">
                    <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--pt-warning, #d97706)' }} />
                    <span style={{ overflowWrap: 'anywhere' }}>{fontNoteText(labels, n)}</span>
                  </li>
                ))}
              </ul>
            )}
            {contentNotes.length > 0 && (
              <>
                <p className="m-0 text-xs">{labels.wordExportNotesContent}</p>
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-(--slate)">
                  {contentNotes.map((n, i) => (
                    <li key={`c${i}`} dir="auto" style={{ overflowWrap: 'anywhere' }}>{isolate(n.message)}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {notes ? (
            <Button ref={closeRef} variant="primary" size="sm" onClick={onClose}>{labels.wordExportClose}</Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>{labels.wordCancel}</Button>
              <Button ref={downloadRef} variant="primary" size="sm" onClick={() => void run()} disabled={busy}>{labels.wordExportAction}</Button>
            </>
          )}
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
