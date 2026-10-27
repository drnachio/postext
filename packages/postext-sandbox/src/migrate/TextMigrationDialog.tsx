'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { renderPageToCanvas, type PostextConfig, type Resource, type TextMigrationReport, type VDTDocument } from 'postext';
import { useBookPlan, useSandboxDispatch, useSandboxLabels, useSandboxSelector, useSandboxStateGetter, useSandboxStore } from '../context/SandboxContext.js';
import { composeBookMemo } from '../book/compose.js';
import type { Chapter } from '../book/types.js';
import { withHyphenationLocale } from '../controls/language/hyphenation.js';
import { useLayoutService } from '../worker/LayoutServiceContext.js';
import { Button, IconButton, Switch, announce, usePortalContainer } from '../ui/index.js';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../ui/layout/surface.js';
import type { SandboxLabels } from '../types/index.js';
import { closeTextMigration, useTextMigrationRequest, type TextMigrationReason } from './migrationRequest.js';
import {
  PAGE_DIFFERENCE_THRESHOLD,
  bookKeyOf,
  changedResources,
  dropMigrationSnapshot,
  formatBytes,
  holdsContent,
  migrateBook,
  canUndoMigrationWrite,
  undoMigrationWrite,
  writeBook,
  pictureDifference,
  saveMigrationSnapshot,
  type MigrationRecord,
  type MigrationSnapshot,
} from './textMigration.js';

/** Width of the page pictures compared, in CSS px; they are drawn at
 *  twice that, so a screen of double density shows them sharp. */
const PREVIEW_WIDTH = 460;
const PICTURE_WIDTH = PREVIEW_WIDTH * 2;

/** «Move the text to the Markdown» (#874): what the migration of the book
 *  on screen would do, a page-by-page before and after drawn by the
 *  Sandbox's own layout and painter, and the move itself, undoable. */
export function TextMigrationDialog() {
  const request = useTextMigrationRequest();
  return (
    <Dialog.Root open={request !== null} onOpenChange={(next) => { if (!next) closeTextMigration(); }}>
      {request && <TextMigrationPopup key={request.serial} reason={request.reason} />}
    </Dialog.Root>
  );
}

type PagePicture = { before?: string; after?: string; marked?: string; difference?: number; failed?: boolean };

const DIFFERENCE_LABEL: Record<string, keyof SandboxLabels> = {
  box: 'textMigrationDiffBox',
  stroke: 'textMigrationDiffStroke',
  dropCap: 'textMigrationDiffDropCap',
  paragraphIndent: 'textMigrationDiffParagraphIndent',
  height: 'textMigrationDiffHeight',
  side: 'textMigrationDiffSide',
  flow: 'textMigrationDiffFlow',
  repeated: 'textMigrationDiffRepeated',
};

const LEFT_LABEL: Record<TextMigrationReport['left'][number]['reason'], keyof SandboxLabels> = {
  placeholder: 'textMigrationLeftPlaceholder',
  anchor: 'textMigrationLeftAnchor',
  unused: 'textMigrationLeftUnused',
  notPage: 'textMigrationLeftNotPage',
};


/** Paint one page into a PNG data URL `width` px wide, on white. */
function pagePicture(doc: VDTDocument, index: number, width: number): { url: string; pixels: Uint8ClampedArray; width: number; height: number } | null {
  const page = doc.pages[index];
  if (!page || typeof document === 'undefined') return null;
  const big = document.createElement('canvas');
  const scale = (width * 2) / page.width;
  renderPageToCanvas(page, doc, big, { scale });
  const out = document.createElement('canvas');
  out.width = width;
  out.height = Math.max(1, Math.round((page.height / page.width) * width));
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(big, 0, 0, page.width * scale, page.height * scale, 0, 0, out.width, out.height);
  big.width = 1;
  big.height = 1;
  return { url: out.toDataURL('image/png'), pixels: ctx.getImageData(0, 0, out.width, out.height).data, width: out.width, height: out.height };
}

/** The page after, faded, with what changed in red: the pixels that differ
 *  from the page before by more than a trace of anti-aliasing. */
function markedPicture(after: { pixels: Uint8ClampedArray; width: number; height: number }, before: { pixels: Uint8ClampedArray }): string {
  const out = document.createElement('canvas');
  out.width = after.width;
  out.height = after.height;
  const ctx = out.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(after.width, after.height);
  const a = after.pixels;
  const b = before.pixels;
  for (let i = 0; i < img.data.length; i += 4) {
    const d = Math.abs(a[i]! - (b[i] ?? 0)) + Math.abs(a[i + 1]! - (b[i + 1] ?? 0)) + Math.abs(a[i + 2]! - (b[i + 2] ?? 0));
    const grey = 255 - (255 - (a[i]! + a[i + 1]! + a[i + 2]!) / 3) * 0.25;
    img.data[i] = d > 60 ? 220 : grey;
    img.data[i + 1] = d > 60 ? 30 : grey;
    img.data[i + 2] = d > 60 ? 30 : grey;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out.toDataURL('image/png');
}

function TextMigrationPopup({ reason }: { reason: TextMigrationReason }) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const getState = useSandboxStateGetter();
  const config = useSandboxSelector((s) => s.config);
  const chapters = useSandboxSelector((s) => s.chapters);
  const resources = useSandboxSelector((s) => s.resources);
  const locale = useSandboxSelector((s) => s.locale);
  const plan = useBookPlan();
  const service = useLayoutService();
  const container = usePortalContainer();
  const titleId = useId();
  const applyRef = useRef<HTMLButtonElement>(null);
  const fmt = (n: number): string => n.toLocaleString(locale);

  const [share, setShare] = useState(true);
  const [chips, setChips] = useState(true);
  const [removeUnused, setRemoveUnused] = useState(true);
  // Words on pictures as their labels (#941): offered when the book has
  // some, and off until asked for (the pages move the most).
  const [labelsOn, setLabelsOn] = useState(false);
  const [mark, setMark] = useState(false);
  const [phase, setPhase] = useState<'ask' | 'working' | 'done' | 'undone'>('ask');
  // The book as it was when the dialog opened: the preview compares with it,
  // and the move applies to it.
  const [source] = useState(() => ({ config, chapters, resources }));
  const [snapshotKey, setSnapshotKey] = useState<string | null>(null);
  const [record, setRecord] = useState<MigrationRecord | null>(null);
  const history = useSandboxStore().history;

  const result = useMemo(
    () => migrateBook(source, { shareTemplates: share, highlightsToChips: chips, unusedStyles: removeUnused ? 'remove' : 'keep', ...(labelsOn ? { labelsOnPictures: true } : {}) }),
    [source, share, chips, removeUnused, labelsOn],
  );
  // How many words the option would turn into labels: looked for once,
  // when the book has a picture to put them on.
  const labelCandidates = useMemo(
    () => (source.resources.some((r) => r.kind === 'bitmap' || r.kind === 'svg')
      ? migrateBook(source, { shareTemplates: share, highlightsToChips: chips, unusedStyles: removeUnused ? 'remove' : 'keep', labelsOnPictures: true }).report.labels.labels
      : 0),
    // The count of words on pictures does not depend on the other options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source],
  );
  const report = result.report;
  const stylesBefore = source.config.headingStyles?.length ?? 0;
  const stylesAfter = result.config.headingStyles?.length ?? 0;
  const contentBefore = report.contentInConfigBefore;

  // Nothing to offer after an import that needs nothing.
  const [needed] = useState(() => reason !== 'import' || holdsContent(source.config, source.chapters));
  useEffect(() => {
    if (!needed) closeTextMigration();
  }, [needed]);

  // Before and after, page by page: each chapter with migrated pages laid
  // out twice on the shared worker, its fences' pages painted and compared.
  const [pictures, setPictures] = useState<Record<string, PagePicture>>({});
  const [selected, setSelected] = useState(0);
  const clientBase = useId();
  useEffect(() => {
    setPictures({});
    if (result.unchanged || report.pages.length === 0) return;
    let cancelled = false;
    const afterChapters: Chapter[] = source.chapters.map((c) => {
      const md = result.chapters.find((x) => x.id === c.id)?.markdown;
      return md === undefined ? c : { ...c, markdown: md };
    });
    const ids = [...new Set(report.pages.map((p) => p.chapterId))];
    const build = (chaptersList: readonly Chapter[], cfg: PostextConfig, id: string, side: string, bookResources: readonly Resource[]) => {
      const book = composeBookMemo(chaptersList, id);
      const chapterPlan = plan.byId[id];
      return service.build({
        clientId: `${clientBase}:${side}:${id}`,
        priority: 'background',
        content: { markdown: book.markdown, metadata: book.metadata, resources: bookResources as Resource[], ...(chapterPlan?.continuation ? { continuation: chapterPlan.continuation } : {}), ...(chapterPlan?.outline ? { outline: chapterPlan.outline } : {}) },
        config: withHyphenationLocale(cfg, locale),
      });
    };
    void (async () => {
      for (const id of ids) {
        try {
          const before = await build(source.chapters, source.config, id, 'before', source.resources);
          const after = await build(afterChapters, result.config, id, 'after', result.resources ?? source.resources);
          if (cancelled) return;
          const next: Record<string, PagePicture> = {};
          for (const p of report.pages.filter((x) => x.chapterId === id)) {
            const index = after.pages.findIndex((pg) => pg.composed?.fenceIndex === p.fence);
            const key = `${p.chapterId}:${p.fence}`;
            const a = index >= 0 ? pagePicture(after, index, PICTURE_WIDTH) : null;
            const b = index >= 0 ? pagePicture(before, index, PICTURE_WIDTH) : null;
            next[key] = a && b ? { before: b.url, after: a.url, marked: markedPicture(a, b), difference: pictureDifference(a.pixels, b.pixels) } : { failed: true };
          }
          setPictures((prev) => ({ ...prev, ...next }));
        } catch (err) {
          if ((err as { name?: string } | null)?.name === 'AbortError') return;
          const failed: Record<string, PagePicture> = {};
          for (const p of report.pages.filter((x) => x.chapterId === id)) failed[`${p.chapterId}:${p.fence}`] = { failed: true };
          setPictures((prev) => ({ ...prev, ...failed }));
        }
      }
    })();
    return () => {
      cancelled = true;
      service.cancel(clientBase);
    };
    // The plan and resources are read as they are when the preview starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, service, clientBase]);

  const pageKey = (i: number) => {
    const p = report.pages[i];
    return p ? `${p.chapterId}:${p.fence}` : '';
  };
  const measured = report.pages.filter((p) => pictures[`${p.chapterId}:${p.fence}`]?.difference !== undefined);
  const different = measured.filter((p) => pictures[`${p.chapterId}:${p.fence}`]!.difference! > PAGE_DIFFERENCE_THRESHOLD);
  const chapterTitle = (id: string) => source.chapters.find((c) => c.id === id)?.title ?? id;
  const shown = pictures[pageKey(selected)];

  const apply = async () => {
    setPhase('working');
    const s = getState();
    const key = bookKeyOf(s);
    const snap: MigrationSnapshot = {
      version: 1,
      savedAt: Date.now(),
      config: source.config,
      chapters: source.chapters.map((c) => ({ ...c })),
      activeChapterId: s.activeChapterId,
      movedChars: report.movedChars,
      templates: report.templates.length,
      // The pictures the move gives anchors to, as they were.
      resources: changedResources(source.resources, result.resources).map((r) => source.resources.find((o) => o.id === r.id)!),
    };
    await saveMigrationSnapshot(key, snap);
    // Steps of the one history: the chapters, then the design.
    setRecord(writeBook(dispatch, getState(), result.config, new Map(result.chapters.map((c) => [c.id, c.markdown])), result.resources));
    setSnapshotKey(key);
    setPhase('done');
    announce(labels.textMigrationDone.replace('__pages__', fmt(report.pages.length)).replace('__templates__', fmt(report.templates.length)));
  };

  const undo = async () => {
    // The move's own steps while they are the latest; else the book as it
    // was written back as new steps (undoable in turn).
    if (history && record && canUndoMigrationWrite(history, record)) undoMigrationWrite(history, record);
    else writeBook(dispatch, getState(), source.config, new Map(source.chapters.map((c) => [c.id, c.markdown])), source.resources);
    if (snapshotKey) await dropMigrationSnapshot(snapshotKey);
    setPhase('undone');
    announce(labels.textMigrationUndone);
  };

  const intro = (reason === 'import' ? labels.textMigrationIntroImport : labels.textMigrationIntroChecks)
    .replace('__chars__', fmt(contentBefore.chars))
    .replace('__styles__', fmt(contentBefore.warnings));
  const shared = report.templates.filter((t) => !t.extends && t.pages === 0).length;
  const statRow = (text: string) => <li className="m-0">{text}</li>;

  if (!needed) return null;
  return (
    <Dialog.Portal container={container}>
      <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
      <Dialog.Popup
        data-postext-popup=""
        data-testid="text-migration-dialog"
        aria-labelledby={titleId}
        initialFocus={applyRef}
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-16px)] -translate-x-1/2 -translate-y-1/2 flex-col"
        style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(980px, calc(100vw - 16px))', fontSize: 13, lineHeight: '19px' }}
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-3">
          <Dialog.Title id={titleId} style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: '10px 0 0' }}>
            {labels.textMigrationTitle}
          </Dialog.Title>
          <IconButton label={labels.textMigrationClose} icon={<X size={14} aria-hidden="true" />} onClick={closeTextMigration} />
        </div>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-3">
          <Dialog.Description className="text-xs text-(--slate)" style={{ margin: 0 }}>
            {result.unchanged ? labels.textMigrationNothing : intro}
          </Dialog.Description>

          {!result.unchanged && (
            <>
              <section aria-labelledby={`${titleId}-summary`} className="flex flex-col gap-1">
                <h3 id={`${titleId}-summary`} className="m-0 text-[13px] font-semibold">{labels.textMigrationSummaryHeading}</h3>
                <ul className="m-0 flex list-disc flex-col gap-0.5 ps-5 text-xs">
                  {statRow(labels.textMigrationMoved.replace('__elements__', fmt(report.movedElements)).replace('__chars__', fmt(report.movedChars)))}
                  {statRow(labels.textMigrationPages.replace('__count__', fmt(report.pages.length)))}
                  {statRow(labels.textMigrationTemplates.replace('__count__', fmt(report.templates.length)).replace('__shared__', fmt(shared)))}
                  {statRow(labels.textMigrationHeadingStyles.replace('__before__', fmt(stylesBefore)).replace('__after__', fmt(stylesAfter)))}
                  {statRow(labels.textMigrationStylesCreated
                    .replace('__paragraph__', fmt(report.paragraphStylesCreated.length))
                    .replace('__reused__', fmt(report.paragraphStylesReused.length))
                    .replace('__chips__', fmt(report.chipStylesCreated.length)))}
                  {report.chips > 0 && statRow(labels.textMigrationChips.replace('__count__', fmt(report.chips)))}
                  {labelsOn && report.labels.labels > 0 && statRow(labels.textMigrationLabels
                    .replace('__labels__', fmt(report.labels.labels))
                    .replace('__pictures__', fmt(report.labels.pictures))
                    .replace('__anchors__', fmt(report.labels.anchors))
                    .replace('__styles__', fmt(report.labels.labelStylesCreated.length + report.labels.labelStylesReused.length)))}
                  {statRow(labels.textMigrationConfigSize.replace('__before__', formatBytes(report.configBytesBefore)).replace('__after__', formatBytes(report.configBytesAfter)))}
                  {statRow(labels.textMigrationCheckCount.replace('__before__', fmt(report.contentInConfigBefore.warnings)).replace('__after__', fmt(report.contentInConfigAfter.warnings)))}
                </ul>
              </section>

              {phase === 'ask' && (
                <section aria-labelledby={`${titleId}-options`} className="flex flex-col gap-1">
                  <h3 id={`${titleId}-options`} className="m-0 text-[13px] font-semibold">{labels.textMigrationOptionsHeading}</h3>
                  <OptionRow label={labels.textMigrationOptionShare} checked={share} onChange={setShare} />
                  <OptionRow label={labels.textMigrationOptionChips} checked={chips} onChange={setChips} />
                  {labelCandidates > 0 && (
                    <>
                      <OptionRow label={labels.textMigrationOptionLabels.replace('__count__', fmt(labelCandidates))} checked={labelsOn} onChange={setLabelsOn} describedBy={`${titleId}-labels-hint`} />
                      <p id={`${titleId}-labels-hint`} className="m-0 text-[11px] text-(--slate)">{labels.textMigrationOptionLabelsHint}</p>
                    </>
                  )}
                  {report.unusedStyles.length > 0 || (removeUnused && report.headingStylesRemoved.length > 0)
                    ? <OptionRow label={labels.textMigrationOptionUnused.replace('__count__', fmt(Math.max(report.unusedStyles.length, report.headingStylesRemoved.length)))} checked={removeUnused} onChange={setRemoveUnused} />
                    : null}
                </section>
              )}

              <section aria-labelledby={`${titleId}-pages`} className="flex flex-col gap-2">
                <h3 id={`${titleId}-pages`} className="m-0 text-[13px] font-semibold">{labels.textMigrationPreviewHeading}</h3>
                <p className="m-0 text-xs text-(--slate)" role="status">
                  {measured.length < report.pages.length
                    ? labels.textMigrationPageMeasuring
                    : labels.textMigrationDifferentCount.replace('__count__', fmt(different.length)).replace('__total__', fmt(report.pages.length))}
                </p>
                <OptionRow label={labels.textMigrationMarkDifferences} checked={mark} onChange={setMark} />
                <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
                  <ul className="m-0 flex max-h-[420px] list-none flex-col overflow-y-auto p-0" aria-label={labels.textMigrationPagesHeading}>
                    {report.pages.map((p, i) => {
                      const pic = pictures[`${p.chapterId}:${p.fence}`];
                      const looks = pic?.difference === undefined ? null : pic.difference > PAGE_DIFFERENCE_THRESHOLD;
                      return (
                        <li key={`${p.chapterId}:${p.fence}`}>
                          <button
                            type="button"
                            aria-pressed={selected === i}
                            data-difference={pic?.difference !== undefined ? pic.difference.toFixed(2) : undefined}
                            onClick={() => setSelected(i)}
                            className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded border-0 bg-transparent px-2 py-1.5 text-start text-xs text-(--foreground) outline-(--brand) hover:bg-(--surface) focus-visible:outline-2 aria-pressed:bg-(--surface)"
                            style={{ minHeight: 44 }}
                          >
                            <span className="font-medium" style={{ overflowWrap: 'anywhere' }}>
                              {labels.textMigrationPageRow.replace('__chapter__', chapterTitle(p.chapterId)).replace('__page__', fmt(p.fence + 1)).replace('__template__', p.template)}
                            </span>
                            <span className="flex items-center gap-1 text-(--slate)">
                              {looks === null ? null : looks
                                ? <AlertTriangle size={12} aria-hidden="true" style={{ color: 'var(--pt-warning, #d97706)' }} />
                                : <CheckCircle2 size={12} aria-hidden="true" style={{ color: 'var(--pt-success, #16a34a)' }} />}
                              {pic?.failed ? labels.textMigrationRenderFailed : looks === null ? labels.textMigrationPageMeasuring : looks ? labels.textMigrationPageDifferent : labels.textMigrationPageSame}
                              {p.differences.length > 0 && ` · ${p.differences.map((d) => (DIFFERENCE_LABEL[d] ? labels[DIFFERENCE_LABEL[d]!] : d)).join(' · ')}`}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="grid grid-cols-2 gap-3">
                    {(['before', 'after'] as const).map((side) => (
                      <figure key={side} className="m-0 flex min-w-0 flex-col items-center gap-1">
                        {shown?.[side]
                          ? <img src={side === 'after' && mark && shown.marked ? shown.marked : shown[side]} alt={`${side === 'before' ? labels.textMigrationBefore : labels.textMigrationAfter}: ${report.pages[selected]?.template ?? ''}`} width={PREVIEW_WIDTH} data-testid={`text-migration-${side}`} className="block w-full rounded border border-(--pt-control-border)" style={{ height: 'auto' }} />
                          : <div className="flex w-full items-center justify-center rounded border border-dashed border-(--pt-control-border) text-xs text-(--slate)" style={{ aspectRatio: '230 / 288' }}>{shown?.failed ? labels.textMigrationRenderFailed : labels.textMigrationPageMeasuring}</div>}
                        <figcaption className="text-xs text-(--slate)">{side === 'before' ? labels.textMigrationBefore : labels.textMigrationAfter}</figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              </section>

              {report.left.length > 0 && (
                <section aria-labelledby={`${titleId}-left`} className="flex flex-col gap-1">
                  <h3 id={`${titleId}-left`} className="m-0 text-[13px] font-semibold">{labels.textMigrationLeftHeading}</h3>
                  <ul className="m-0 flex list-disc flex-col gap-0.5 ps-5 text-xs">
                    {report.left.slice(0, 12).map((l, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{labels[LEFT_LABEL[l.reason]].replace('__path__', l.path)}</li>)}
                    {report.left.length > 12 && <li>…</li>}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-(--pt-control-border) px-4 py-3">
          {phase === 'done' && <p role="status" className="m-0 me-auto text-xs">{labels.textMigrationDone.replace('__pages__', fmt(report.pages.length)).replace('__templates__', fmt(report.templates.length))}</p>}
          {phase === 'undone' && <p role="status" className="m-0 me-auto text-xs">{labels.textMigrationUndone}</p>}
          {phase === 'ask' || phase === 'working' ? (
            <>
              <Button variant="outline" size="sm" onClick={closeTextMigration}>{labels.textMigrationCancel}</Button>
              <Button ref={applyRef} variant="primary" size="sm" disabled={result.unchanged || phase === 'working'} onClick={() => void apply()}>
                {phase === 'working' ? labels.textMigrationWorking : labels.textMigrationApply}
              </Button>
            </>
          ) : (
            <>
              {phase === 'done' && <Button variant="outline" size="sm" onClick={() => void undo()}>{labels.textMigrationUndo}</Button>}
              <Button variant="primary" size="sm" onClick={closeTextMigration}>{labels.textMigrationClose}</Button>
            </>
          )}
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}

function OptionRow({ label, checked, onChange, describedBy }: { label: string; checked: boolean; onChange: (v: boolean) => void; describedBy?: string }) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={id} className="text-xs">{label}</label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} ariaLabel={label} {...(describedBy ? { ariaDescribedBy: describedBy } : {})} />
    </div>
  );
}
