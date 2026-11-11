'use client';

// The Books panel's "New book from an InDesign document": the package is
// read and summed up, the reader chooses how it is laid out and hands
// over the pictures it links to, the importer of `postext-idml` runs and
// its report is shown, and the button creates the book as the panel
// creates one from a `.postext` file. The logic is in
// ./sandboxIdmlImport.ts.

import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AlertTriangle, FolderOpen, Images, X } from 'lucide-react';
import type { IdmlImportResult } from 'postext-idml';
import { useSandboxLabels, useSandboxProjects } from '../context/SandboxContext.js';
import { Button, IconButton, Select, announce, usePortalContainer, type SelectOption } from '../ui/index.js';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../ui/layout/surface.js';
import { DialogSection, isolate } from '../word/WordImportDialog.js';
import { IdmlHoldings, IdmlImportReport } from './IdmlImportReport.js';
import { addLinkFiles, convertIdml, idmlBookBundle, linkFileName, readIdmlFile, type IdmlImportFile, type IdmlLayoutChoice, type IdmlLinkFile } from './sandboxIdmlImport.js';

/** The file picked in the Books panel, as read from disk. */
export interface IdmlPickedFile {
  name: string;
  bytes: Uint8Array;
}

export interface IdmlImportDialogProps {
  file: IdmlPickedFile | null;
  onClose: () => void;
  /** Told once the book is created and on screen. */
  onCreated?: () => void;
}

export function IdmlImportDialog({ file, onClose, onCreated }: IdmlImportDialogProps) {
  return (
    <Dialog.Root open={file !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      {file && <IdmlImportPopup key={file.name} file={file} onClose={onClose} onCreated={onCreated} />}
    </Dialog.Root>
  );
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Yield to the browser, so that a status line is painted before a long
 *  synchronous step. */
const nextFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function IdmlImportPopup({ file, onClose, onCreated }: { file: IdmlPickedFile; onClose: () => void; onCreated?: () => void }) {
  const labels = useSandboxLabels();
  const { importBundleBytes } = useSandboxProjects();
  const container = usePortalContainer();
  const titleId = useId();
  const linksHelpId = useId();
  const createRef = useRef<HTMLButtonElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [read, setRead] = useState<IdmlImportFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<IdmlLayoutChoice>('auto');
  const [links, setLinks] = useState<IdmlLinkFile[]>([]);
  const [result, setResult] = useState<IdmlImportResult | null>(null);
  // What the importer decides left to itself, kept while another layout
  // is tried.
  const [auto, setAuto] = useState<{ layout: 'pages' | 'flow'; reason: string } | null>(null);
  const [converting, setConverting] = useState(false);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The package, read once.
  useEffect(() => {
    let stale = false;
    void (async () => {
      await nextFrame();
      try {
        const opened = await readIdmlFile(file.name, file.bytes);
        if (!stale) setRead(opened);
      } catch (err) {
        if (stale) return;
        // The reader's own words: an .indd, a Word document, no package.
        const message = labels.idmlImportFailed.replace('__file__', isolate(file.name)).replace('__error__', () => isolate(messageOf(err)));
        setError(message);
        announce(message);
      }
    })();
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the labels do not change while the dialog is open
  }, [file]);

  // The import, run again when the layout or the pictures change.
  useEffect(() => {
    if (!read) return;
    let stale = false;
    setConverting(true);
    void (async () => {
      await nextFrame();
      try {
        const next = await convertIdml(read, { layout, links });
        if (stale) return;
        setResult(next);
        setError(null);
        if (layout === 'auto') setAuto({ layout: next.layout, reason: next.reason });
      } catch (err) {
        if (stale) return;
        setResult(null);
        setError(labels.idmlImportFailed.replace('__file__', isolate(file.name)).replace('__error__', () => isolate(messageOf(err))));
      } finally {
        if (!stale) setConverting(false);
      }
    })();
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above
  }, [read, layout, links]);

  // Only the files a link names are read: a folder may hold much else.
  const takeFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = [...(e.target.files ?? [])];
    e.target.value = '';
    if (picked.length === 0 || !result) return;
    const wanted = new Set(result.missingLinks.map((l) => linkFileName(l.name)));
    const matching = picked.filter((f) => wanted.has(linkFileName(f.name)));
    if (matching.length === 0) {
      setLinkNote(labels.idmlImportLinksNoMatch);
      announce(labels.idmlImportLinksNoMatch);
      return;
    }
    const more = await Promise.all(matching.map(async (f): Promise<IdmlLinkFile> => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    setLinkNote(null);
    setLinks((have) => addLinkFiles(have, more));
  };

  const create = async () => {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const bundle = await idmlBookBundle(result);
      await importBundleBytes(bundle.bytes, bundle.fileName);
      announce(labels.idmlImportDone.replace('__name__', isolate(result.name)).replace('__file__', isolate(file.name)));
      onCreated?.();
      onClose();
    } catch (err) {
      console.error(err);
      const message = labels.idmlImportCreateFailed.replace('__error__', () => isolate(messageOf(err)));
      setError(message);
      announce(message);
      setBusy(false);
    }
  };

  const layoutName = (l: 'pages' | 'flow'): string => (l === 'pages' ? labels.idmlImportLayoutPages : labels.idmlImportLayoutFlow);
  const layoutOptions: SelectOption<IdmlLayoutChoice>[] = [
    { value: 'auto', label: labels.idmlImportLayoutAuto, description: labels.idmlImportLayoutAutoHelp },
    { value: 'pages', label: labels.idmlImportLayoutPages, description: labels.idmlImportLayoutPagesHelp },
    { value: 'flow', label: labels.idmlImportLayoutFlow, description: labels.idmlImportLayoutFlowHelp },
  ];
  const missing = result?.missingLinks ?? [];
  const linkTotal = links.length + missing.length;

  return (
    <Dialog.Portal container={container}>
      <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
      <Dialog.Popup
        data-postext-popup=""
        data-testid="idml-import-dialog"
        aria-labelledby={titleId}
        aria-busy={busy || converting || (!read && !error)}
        initialFocus={createRef}
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-16px)] -translate-x-1/2 -translate-y-1/2 flex-col"
        style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(720px, calc(100vw - 16px))', fontSize: 13, lineHeight: '19px' }}
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-3">
          <Dialog.Title id={titleId} style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: '10px 0 0', overflowWrap: 'anywhere' }}>
            {labels.idmlImportTitle.replace('__file__', isolate(file.name))}
          </Dialog.Title>
          <IconButton label={labels.wordCancel} icon={<X size={14} aria-hidden="true" />} onClick={onClose} />
        </div>
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto px-4 pb-2">
          <Dialog.Description className="text-xs text-(--slate)" style={{ margin: '0 0 8px' }}>
            {labels.idmlImportIntro}
          </Dialog.Description>

          {!read && !error && <p role="status" className="m-0 text-xs text-(--slate)">{labels.idmlImportReading}</p>}
          {error && (
            <p role="alert" className="m-0 mb-2 flex items-start gap-2 text-xs">
              <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--pt-error, #ef4444)' }} />
              <span style={{ overflowWrap: 'anywhere' }}>{error}</span>
            </p>
          )}

          {read && (
            <>
              <DialogSection title={labels.idmlImportHolds}>
                <IdmlHoldings summary={read.summary} labels={labels} />
              </DialogSection>

              <DialogSection title={labels.idmlImportLayout}>
                <Select<IdmlLayoutChoice> size="sm" value={layout} onValueChange={setLayout} options={layoutOptions} ariaLabel={labels.idmlImportLayout} disabled={busy} className="min-w-[220px] self-start" />
                {auto && (
                  <p className="m-0 text-xs text-(--slate)" style={{ overflowWrap: 'anywhere' }}>
                    {labels.idmlImportLayoutReason.replace('__layout__', layoutName(auto.layout)).replace('__reason__', () => isolate(auto.reason))}
                  </p>
                )}
              </DialogSection>

              {linkTotal > 0 && (
                <DialogSection title={labels.idmlImportLinks}>
                  <p id={linksHelpId} className="m-0 text-xs text-(--slate)">{labels.idmlImportLinksHelp}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" icon={<Images size={13} aria-hidden="true" />} disabled={busy || converting} aria-describedby={linksHelpId} onClick={() => filesRef.current?.click()}>
                      {labels.idmlImportLinksFiles}
                    </Button>
                    <Button variant="outline" size="sm" icon={<FolderOpen size={13} aria-hidden="true" />} disabled={busy || converting} aria-describedby={linksHelpId} onClick={() => folderRef.current?.click()}>
                      {labels.idmlImportLinksFolder}
                    </Button>
                    <span role="status" className="text-xs">
                      {labels.idmlImportLinksFound.replace('__found__', String(links.length)).replace('__total__', String(linkTotal))}
                    </span>
                    <input ref={filesRef} type="file" multiple onChange={(e) => void takeFiles(e)} className="hidden" aria-hidden="true" tabIndex={-1} />
                    <input
                      ref={(el) => {
                        folderRef.current = el;
                        // Not an attribute React knows: the picker then takes a folder.
                        el?.setAttribute('webkitdirectory', '');
                      }}
                      type="file"
                      multiple
                      onChange={(e) => void takeFiles(e)}
                      className="hidden"
                      aria-hidden="true"
                      tabIndex={-1}
                    />
                  </div>
                  {linkNote && <p role="status" className="m-0 text-xs text-(--slate)">{linkNote}</p>}
                  {missing.length > 0 && (
                    <p className="m-0 text-xs" style={{ overflowWrap: 'anywhere' }}>
                      {labels.idmlImportLinksMissing.replace('__list__', () => missing.map((l) => isolate(l.name)).join(labels.frameStylesListSeparator))}
                    </p>
                  )}
                </DialogSection>
              )}

              <DialogSection title={labels.idmlImportReport}>
                {result
                  ? <IdmlImportReport result={result} labels={labels} />
                  : !error && <p role="status" className="m-0 text-xs text-(--slate)">{labels.idmlImportReading}</p>}
              </DialogSection>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-(--pt-control-border) px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>{labels.wordCancel}</Button>
          <Button ref={createRef} variant="primary" size="sm" disabled={!result || busy || converting} onClick={() => void create()}>
            {busy ? labels.idmlImportWorking : converting && read ? labels.idmlImportReading : labels.idmlImportAction}
          </Button>
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
