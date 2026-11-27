'use client';

// "Add chapters from another book" (the Manuscript panel): the chapters of
// a .postext — a part of this book made or edited apart — each with what
// becomes of it: added at its number, put in place of the book's chapter
// with that number, or left out. The resources named as ones the book keeps
// using are listed with the name each takes. Nothing changes until the
// dialog's button. The plan is postext's (`planPartJoin`, the one
// `postext join` follows); presets/partBundle.ts applies it.

import { type ReactNode, type RefObject, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AlertTriangle, X } from 'lucide-react';
import { choiceProblems, partChapters, planPartJoin, proposeChoices, renameProblems, replacedChapter, resourceClashes, type PartAction, type PartChoice, type PartProblem } from 'postext/bundle';
import { useSandboxDispatch, useSandboxLabels, useSandboxStore } from '../context/SandboxContext.js';
import type { SandboxLabels } from '../types/index.js';
import { Button, IconButton, announce, usePortalContainer } from '../ui/index.js';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../ui/layout/surface.js';
import { isolate } from '../word/WordImportDialog.js';
import { joinPart, openBook, partSide, readPartBundle } from './partBundle.js';
import type { LoadedPreset } from './types.js';

/** A .postext picked in the Manuscript panel. */
export interface PartImportFile {
  name: string;
  bytes: Uint8Array;
}

export function PartImportDialog({ file, onClose }: { file: PartImportFile | null; onClose: () => void }) {
  return (
    <Dialog.Root open={file !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      {file && <PartImportPopup file={file} onClose={onClose} />}
    </Dialog.Root>
  );
}

const WARNING = 'var(--pt-warning, #d97706)';

function problemText(labels: SandboxLabels, problem: PartProblem, n: number): string {
  if (problem === 'noSuchChapter') return labels.partImportNoSuchChapter.replace('__n__', String(n));
  if (problem === 'sameNumber') return labels.partImportSameNumber.replace('__n__', String(n));
  if (problem === 'unnumbered') return labels.partImportUnnumbered;
  return labels.partImportBadNumber;
}

function PartImportPopup({ file, onClose }: { file: PartImportFile; onClose: () => void }) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const store = useSandboxStore();
  const container = usePortalContainer();
  const titleId = useId();
  const applyRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [part, setPart] = useState<{ file: PartImportFile; part: LoadedPreset } | { file: PartImportFile; failed: true } | null>(null);
  const [choices, setChoices] = useState<PartChoice[]>([]);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const s = store.getSnapshot();
    readPartBundle(file.bytes, file.name, s.locale, (n) => labels.chapterUntitled.replace('__n__', String(n)))
      .then((loaded) => {
        if (!live) return;
        setPart({ file, part: loaded });
        setChoices(proposeChoices(openBook(store.getSnapshot()), partSide(loaded)));
        setRenames({});
      })
      .catch((err: unknown) => {
        console.error(err);
        if (live) setPart({ file, failed: true });
      });
    return () => {
      live = false;
    };
  }, [file, store, labels]);

  const loaded = part?.file === file && 'part' in part ? part.part : null;
  const book = openBook(store.getSnapshot());
  const side = useMemo(() => (loaded ? partSide(loaded) : null), [loaded]);
  const info = useMemo(() => (side ? partChapters(side) : []), [side]);
  const ready = side !== null && choices.length === info.length;
  const clashes = ready ? resourceClashes(book, side, choices) : [];
  const problems = ready ? choiceProblems(book, side, choices) : [];
  const nameOf = (id: string, proposed: string) => renames[id] ?? proposed;
  // A new name must be an id every reference reads, free in the book and the part.
  const badNames = ready ? renameProblems(book, side, choices, renames) : [];
  const fontsAdded = ready && problems.length === 0 && badNames.length === 0 ? planPartJoin(book, side, choices, renames).fontsAdded : [];
  const chosen = choices.filter((c) => c.action !== 'skip').length;

  if (part === null || part.file !== file) {
    return (
      <Shell titleId={titleId} container={container} initialFocus={cancelRef} labels={labels} onClose={onClose}>
        <p role="status" className="m-0 text-xs">{labels.partImportReading.replace('__file__', isolate(file.name))}</p>
        <div className="flex justify-end"><Button ref={cancelRef} variant="outline" size="sm" onClick={onClose}>{labels.wordCancel}</Button></div>
      </Shell>
    );
  }
  if (!loaded) {
    return (
      <Shell titleId={titleId} container={container} initialFocus={cancelRef} labels={labels} onClose={onClose}>
        <p role="alert" className="m-0 text-xs">{labels.partImportFailed.replace('__file__', isolate(file.name))}</p>
        <div className="flex justify-end"><Button ref={cancelRef} variant="primary" size="sm" onClick={onClose}>{labels.wordExportClose}</Button></div>
      </Shell>
    );
  }

  const setChoice = (i: number, next: Partial<PartChoice>) => setChoices((all) => all.map((c, k) => (k === i ? { ...c, ...next } : c)));
  const apply = async () => {
    setBusy(true);
    try {
      await joinPart(store.getSnapshot(), loaded, choices, renames, dispatch);
      announce(labels.partImportDone.replace('__file__', isolate(file.name)));
    } catch (err) {
      console.error(err);
      announce(labels.partImportFailed.replace('__file__', isolate(file.name)));
    }
    setBusy(false);
    onClose();
  };

  return (
    <Shell titleId={titleId} container={container} initialFocus={applyRef} labels={labels} onClose={onClose}>
      <Dialog.Description className="text-xs text-(--slate)" style={{ margin: 0 }}>
        {labels.partImportIntro.replace('__file__', isolate(file.name))}
      </Dialog.Description>
      <ul className="m-0 flex list-none flex-col p-0">
        {info.map((c, i) => {
          const choice = choices[i] ?? { action: 'skip' as PartAction, number: c.number ?? 1 };
          const at = replacedChapter(book, choice);
          const problem = problems.find((p) => p.chapter === i);
          const rowId = `${titleId}-${i}`;
          return (
            <li key={i} className="flex flex-col gap-1 border-b border-(--pt-control-border) py-2 text-xs last:border-b-0">
              <span id={rowId} className="font-semibold" style={{ overflowWrap: 'anywhere' }}>
                {c.number === null
                  ? labels.partImportNoNumber.replace('__title__', isolate(c.title))
                  : labels.partImportChapter.replace('__n__', String(c.number)).replace('__title__', isolate(c.title))}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={labels.partImportWhat.replace('__title__', isolate(c.title))}
                  value={choice.action}
                  onChange={(e) => setChoice(i, { action: e.target.value as PartAction })}
                  className="rounded border border-(--pt-control-border) bg-(--pt-control-bg) px-1 py-0.5 text-xs"
                >
                  <option value="add">{labels.partImportAdd}</option>
                  <option value="replace">{labels.partImportReplace}</option>
                  <option value="skip">{labels.partImportSkip}</option>
                </select>
                {choice.action !== 'skip' && (
                  <label className="flex items-center gap-1">
                    {labels.partImportNumber}
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={Number.isFinite(choice.number) ? choice.number : ''}
                      onChange={(e) => setChoice(i, { number: Math.floor(Number(e.target.value)) })}
                      className="w-16 rounded border border-(--pt-control-border) bg-(--pt-control-bg) px-1 py-0.5 text-xs"
                    />
                  </label>
                )}
                {at >= 0 && <span className="text-(--slate)">{labels.partImportInPlaceOf.replace('__title__', isolate(book.chapters[at]!.title))}</span>}
              </span>
              {problem && (
                <span role="alert" className="flex items-start gap-1">
                  <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: WARNING }} />
                  {problemText(labels, problem.problem, choice.number)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {clashes.length > 0 && (
        <section className="flex flex-col gap-1 text-xs">
          <h3 className="m-0 text-[13px] font-semibold">{labels.partImportClashes}</h3>
          <p className="m-0 text-(--slate)">{labels.partImportClashesHint}</p>
          {clashes.map((c) => (
            <label key={c.id} className="flex flex-wrap items-center gap-2">
              <code>{isolate(c.id)}</code>
              <span aria-hidden="true">→</span>
              <input
                aria-label={labels.partImportNewName.replace('__id__', isolate(c.id))}
                aria-invalid={badNames.includes(c.id)}
                value={nameOf(c.id, c.rename)}
                onChange={(e) => setRenames((all) => ({ ...all, [c.id]: e.target.value.trim() }))}
                className="rounded border border-(--pt-control-border) bg-(--pt-control-bg) px-1 py-0.5 text-xs"
              />
              {badNames.includes(c.id) && <span role="alert">{labels.partImportBadName}</span>}
            </label>
          ))}
        </section>
      )}
      {fontsAdded.length > 0 && <p className="m-0 text-xs">{labels.partImportFonts.replace('__fonts__', fontsAdded.map(isolate).join(', '))}</p>}
      <p className="m-0 text-xs text-(--slate)">{labels.partImportDesignKept}</p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button ref={cancelRef} variant="outline" size="sm" onClick={onClose}>{labels.wordCancel}</Button>
        <Button ref={applyRef} variant="primary" size="sm" onClick={() => void apply()} disabled={busy || chosen === 0 || problems.length > 0 || badNames.length > 0}>
          {labels.partImportApply}
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ titleId, container, initialFocus, labels, onClose, children }: {
  titleId: string;
  container: ReturnType<typeof usePortalContainer>;
  initialFocus: RefObject<HTMLButtonElement | null>;
  labels: SandboxLabels;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Portal container={container}>
      <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
      <Dialog.Popup
        data-postext-popup=""
        data-testid="part-import-dialog"
        aria-labelledby={titleId}
        initialFocus={initialFocus}
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-16px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto"
        style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(560px, calc(100vw - 16px))', padding: 16, fontSize: 13, lineHeight: '19px' }}
      >
        <div className="flex items-start justify-between gap-2">
          <Dialog.Title id={titleId} style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: '10px 0 0' }}>
            {labels.partImportTitle}
          </Dialog.Title>
          <IconButton label={labels.wordCancel} icon={<X size={14} aria-hidden="true" />} onClick={onClose} />
        </div>
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
