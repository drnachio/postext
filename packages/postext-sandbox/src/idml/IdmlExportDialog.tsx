'use client';

// The Manuscript panel's Export to InDesign (#1491): the whole book laid
// out as the PDF is (every chapter after the ones before it), written as
// an IDML package and downloaded as `<title>.idml`, with what the writer
// says InDesign will show differently. The reader chooses whether the
// lines are kept, how the pages pair, whether pictures are linked and
// whether the fonts travel with it; with linked pictures or fonts the
// package is downloaded in a zip beside its folders.

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AlertTriangle, X } from 'lucide-react';
import type { IdmlWarning } from 'postext-idml';
import { useBookPlan, useSandboxLabels, useSandboxSelector } from '../context/SandboxContext.js';
import { layOutBookPrint } from '../book/printChain.js';
import { ensureConfigFontsLoaded } from '../controls/fonts/fontLoader.js';
import { withHyphenationLocale } from '../controls/language/hyphenation.js';
import { downloadBytes } from '../storage/persistence.js';
import { Button, IconButton, Select, Switch, announce, usePortalContainer, type SelectOption } from '../ui/index.js';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../ui/layout/surface.js';
import { useLayoutWorker } from '../worker/useLayoutWorker.js';
import { counted } from '../word/sandboxImport.js';
import { isolate } from '../word/WordImportDialog.js';
import { DEFAULT_IDML_CHOICES, buildIdmlExport, type IdmlExportChoices } from './idmlExport.js';
import { idmlFontWithheld, sandboxIdmlFaces } from './idmlFonts.js';

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
type Progress = { phase: 'layout'; done: number; total: number } | { phase: 'fonts' } | { phase: 'write' };

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
  const fontsId = useId();
  const fontsHelpId = useId();
  const [choices, setChoices] = useState<IdmlExportChoices>(DEFAULT_IDML_CHOICES);
  const choose = <K extends keyof IdmlExportChoices>(key: K, value: IdmlExportChoices[K]) => setChoices((c) => ({ ...c, [key]: value }));
  const [withheld, setWithheld] = useState<string[]>([]);
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
      : p?.phase === 'fonts' ? labels.idmlExportFontsGathering : labels.idmlExportWriting;
  const fraction = (p: Progress | null): number =>
    !p ? 0 : p.phase === 'layout' ? (p.total > 0 ? (p.done / p.total) * 0.8 : 0) : p.phase === 'fonts' ? 0.85 : 0.92;

  const run = async () => {
    setBusy(true);
    setError(null);
    setNotes(null);
    setProgress(null);
    const found: IdmlWarning[] = [];
    setWithheld([]);
    try {
      const effective = withHyphenationLocale(config, locale);
      await ensureConfigFontsLoaded(effective, chapters.map((c) => c.markdown));
      // The whole book, as the PDF's book scope lays it out.
      const docs = await layOutBookPrint({
        plan, chapters, resources, config: effective, build: layoutWorker.build,
        onChapter: (index, count) => { if (!closedRef.current) setProgress({ phase: 'layout', done: index, total: count }); },
      });
      if (closedRef.current) return;
      // The font files the Sandbox has: with them a face is named as its
      // file names it, whether or not the files travel with the package.
      setProgress({ phase: 'fonts' });
      const faces = await sandboxIdmlFaces(docs);
      if (closedRef.current) return;
      setProgress({ phase: 'write' });
      const file = await buildIdmlExport({
        docs,
        resources,
        config: effective,
        choices,
        faces,
        withheld: idmlFontWithheld,
        ...(bookTitle ? { title: bookTitle } : {}),
        onWarning: (w) => found.push(w),
      });
      if (closedRef.current) return;
      const name = file.name;
      downloadBytes(file.bytes, name, file.mime);
      setWithheld(file.withheld);
      if (found.length === 0 && file.withheld.length === 0) {
        announce(labels.idmlExportDone.replace('__file__', isolate(name)));
        onClose();
        return;
      }
      announce(found.length === 0 ? labels.idmlExportDone.replace('__file__', isolate(name)) : counted(labels, 'idmlExportDoneNotes', found.length).replace('__file__', isolate(name)));
      if (file.withheld.length > 0) announce(labels.idmlExportFontsWithheld.replace('__list__', () => file.withheld.map(isolate).join(labels.frameStylesListSeparator)));
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

  const lineOptions: SelectOption<IdmlExportChoices['lineBreaks']>[] = [
    { value: 'keep', label: labels.idmlExportLinesKeep, description: labels.idmlExportLinesKeepHelp },
    { value: 'reflow', label: labels.idmlExportLinesReflow, description: labels.idmlExportLinesReflowHelp },
  ];
  const spreadOptions: SelectOption<IdmlExportChoices['spreads']>[] = [
    { value: 'auto', label: labels.idmlExportSpreadsAuto, description: labels.idmlExportSpreadsAutoHelp },
    { value: 'facing', label: labels.idmlExportSpreadsFacing },
    { value: 'single', label: labels.idmlExportSpreadsSingle },
  ];
  const imageOptions: SelectOption<IdmlExportChoices['images']>[] = [
    { value: 'embed', label: labels.idmlExportImagesEmbed },
    { value: 'link', label: labels.idmlExportImagesLink },
  ];
  // Folders travel beside the package in a zip.
  const zipped = choices.images === 'link' || choices.fonts;
  const optionRow = (label: string, control: ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-2" style={{ minHeight: 44 }}>
      <span className="text-xs">{label}</span>
      {control}
    </div>
  );

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

        {!notes && (
          <div className="flex flex-col gap-2">
            {optionRow(labels.idmlExportLines, (
              <Select<IdmlExportChoices['lineBreaks']> size="sm" value={choices.lineBreaks} onValueChange={(v) => choose('lineBreaks', v)} options={lineOptions} ariaLabel={labels.idmlExportLines} disabled={busy} />
            ))}
            {optionRow(labels.idmlExportSpreads, (
              <Select<IdmlExportChoices['spreads']> size="sm" value={choices.spreads} onValueChange={(v) => choose('spreads', v)} options={spreadOptions} ariaLabel={labels.idmlExportSpreads} disabled={busy} />
            ))}
            {optionRow(labels.idmlExportImages, (
              <Select<IdmlExportChoices['images']> size="sm" value={choices.images} onValueChange={(v) => choose('images', v)} options={imageOptions} ariaLabel={labels.idmlExportImages} disabled={busy} />
            ))}
            <div className="flex items-center justify-between gap-2" style={{ minHeight: 44 }}>
              <label htmlFor={fontsId} className="cursor-pointer text-xs">
                {labels.idmlExportFonts}
                <span id={fontsHelpId} className="block text-(--slate)">{labels.idmlExportFontsHelp}</span>
              </label>
              <Switch id={fontsId} checked={choices.fonts} onCheckedChange={(v) => choose('fonts', v)} ariaDescribedBy={fontsHelpId} disabled={busy} />
            </div>
            {zipped && <p role="status" className="m-0 text-xs text-(--slate)">{labels.idmlExportZipNote}</p>}
          </div>
        )}

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
            {withheld.length > 0 && (
              <p className="m-0 text-xs" style={{ overflowWrap: 'anywhere' }}>
                {labels.idmlExportFontsWithheld.replace('__list__', () => withheld.map(isolate).join(labels.frameStylesListSeparator))}
              </p>
            )}
            {notes.length > 0 && <p className="m-0 text-[13px] font-semibold">{labels.idmlExportNotes}</p>}
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
              <Button ref={downloadRef} variant="primary" size="sm" onClick={() => void run()} disabled={busy}>{zipped ? labels.idmlExportActionZip : labels.idmlExportAction}</Button>
            </>
          )}
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
