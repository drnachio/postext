'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight, Info, X } from 'lucide-react';
import type { PdfColorSpace, ResolvedPrintConfig } from 'postext';
import type { PrintPdfReport } from 'postext-pdf/worker';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { Button, Collapsible, IconButton, cn, usePortalContainer } from '../../ui/index.js';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../../ui/layout/surface.js';
import { findingSeverity, pdfCheckItems, pdfCheckVerdict, type PdfCheckGroup, type PdfCheckItem, type PdfCheckSeverity } from '../../print/pdfCheck.js';
import { fill } from '../../print/fillTokens.js';
import { detailFor } from '../../sidebar/WarningsPanel/details.js';
import { titleFor } from '../../sidebar/WarningsPanel/titles.js';
import type { Warning } from '../../warnings/types.js';

export interface PdfCheckDialogProps {
  open: boolean;
  onClose: () => void;
  onDownload: () => void;
  onRegenerate: () => void;
  onOpenReview: () => void;
  report: PrintPdfReport | undefined;
  /** The file is still being read back. */
  reading: boolean;
  print: ResolvedPrintConfig;
  colorSpace: PdfColorSpace;
  bookSpotInks: readonly string[];
  cutLines: boolean;
  stale: boolean;
  chapterOnly: boolean;
  /** The preflight's findings on the rendered pages and the PDF's font
   *  warnings, worded as the Checks panel words them. */
  findings: readonly Warning[];
  /** The preflight ran (the book is set up for print). */
  preflightRan: boolean;
}

export function PdfCheckDialog(props: PdfCheckDialogProps) {
  return (
    <Dialog.Root open={props.open} onOpenChange={(next) => { if (!next) props.onClose(); }}>
      {props.open && <PdfCheckPopup {...props} />}
    </Dialog.Root>
  );
}

const ICONS: Record<PdfCheckSeverity, typeof Info> = { critical: AlertOctagon, warning: AlertTriangle, info: Info, ok: CheckCircle2 };
const COLORS: Record<PdfCheckSeverity, string> = {
  critical: 'var(--destructive)',
  warning: 'var(--brand)',
  info: 'var(--slate)',
  ok: 'var(--success, #3f9f5f)',
};

function Row({ severity, title, detail, page }: { severity: PdfCheckSeverity; title: string; detail?: string; page?: string }) {
  const Icon = ICONS[severity];
  return (
    <li className="flex items-start gap-2" style={{ padding: '4px 0' }}>
      <Icon size={14} aria-hidden="true" style={{ color: COLORS[severity], flexShrink: 0, marginTop: 2 }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span style={{ fontWeight: 500 }}>{title}</span>
          {page && <span className="shrink-0 text-xs text-(--slate)">{page}</span>}
        </div>
        {detail && <div className="text-xs text-(--slate)" style={{ overflowWrap: 'anywhere' }}>{detail}</div>}
      </div>
    </li>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--slate)', margin: '4px 0 2px' }}>{title}</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{children}</ul>
    </section>
  );
}

/** Preflight findings of one kind: how many, on which pages, and each. */
interface FindingKind {
  title: string;
  severity: PdfCheckSeverity;
  pages: number[];
  details: { id: string; text: string; page?: number }[];
}

/** Findings that hold for the whole job, not a page. */
const JOB_WIDE = new Set(['spotInks', 'spotInkConflict', 'spotInkName', 'spotInkSimilar']);

function groupFindings(findings: readonly Warning[], labels: ReturnType<typeof useSandboxLabels>): FindingKind[] {
  const byTitle = new Map<string, FindingKind>();
  for (const w of findings) {
    if (w.payload.kind !== 'preflight') continue;
    const title = titleFor(w.payload, labels);
    let k = byTitle.get(title);
    if (!k) byTitle.set(title, (k = { title, severity: w.payload.check.severity, pages: [], details: [] }));
    const page = JOB_WIDE.has(w.payload.check.kind) ? undefined : w.payload.page;
    if (page !== undefined && !k.pages.includes(page)) k.pages.push(page);
    k.details.push({ id: w.id, text: detailFor(w.payload, labels), ...(page !== undefined ? { page } : {}) });
  }
  return [...byTitle.values()];
}

/** `3, 5–9, 12`: runs of pages joined. */
function pageRuns(pages: readonly number[]): string {
  const sorted = [...pages].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    runs.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return runs.join(', ');
}

/** How many cases a closed group shows before "and N more". */
const SHOWN = 30;

function FindingGroup({ group, labels }: { group: FindingKind; labels: ReturnType<typeof useSandboxLabels> }) {
  const Icon = ICONS[group.severity];
  const [open, setOpen] = useState(false);
  const single = group.details.length === 1;
  const pages = group.pages.length > 0 ? fill(labels.pdfCheckPage, { page: pageRuns(group.pages) }) : undefined;
  if (single) {
    const d = group.details[0]!;
    return <Row severity={group.severity} title={group.title} detail={d.text} {...(pages ? { page: pages } : {})} />;
  }
  return (
    <li style={{ padding: '2px 0' }}>
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <Collapsible.Trigger
          className={cn(
            'flex min-h-11 w-full cursor-pointer items-start gap-2 rounded border-0 bg-transparent px-0 py-1.5 text-start text-(--foreground)',
            'hover:bg-(--surface) focus-visible:outline-2 outline-(--brand)',
          )}
        >
          <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-(--slate) rtl:-scale-x-100" style={{ marginTop: 3, transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 200ms ease' }} />
          <Icon size={14} aria-hidden="true" style={{ color: COLORS[group.severity], flexShrink: 0, marginTop: 2 }} />
          <span className="min-w-0 flex-1">
            <span style={{ fontWeight: 500 }}>{group.title}</span>
            <span className="text-xs text-(--slate)"> · {fill(labels.pdfCheckCases, { count: group.details.length })}</span>
            {pages && <span className="block text-xs text-(--slate)" style={{ overflowWrap: 'anywhere' }}>{pages}</span>}
          </span>
        </Collapsible.Trigger>
        <Collapsible.Panel data-postext-collapsible="">
          <ul className="text-xs text-(--slate)" style={{ listStyle: 'none', margin: '2px 0 0', paddingInlineStart: 43 }}>
            {group.details.slice(0, SHOWN).map((d) => (
              <li key={d.id} className="flex justify-between gap-2">
                <span style={{ overflowWrap: 'anywhere' }}>{d.text}</span>
                {d.page !== undefined && <span className="shrink-0">{fill(labels.pdfCheckPage, { page: d.page })}</span>}
              </li>
            ))}
            {group.details.length > SHOWN && <li>{fill(labels.pdfCheckMore, { count: group.details.length - SHOWN })}</li>}
          </ul>
        </Collapsible.Panel>
      </Collapsible.Root>
    </li>
  );
}

function PdfCheckPopup(props: PdfCheckDialogProps) {
  const labels = useSandboxLabels();
  const container = usePortalContainer();
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const { report, reading, findings } = props;

  const items = useMemo(
    () => (reading ? [] : pdfCheckItems({
      report,
      print: props.print,
      colorSpace: props.colorSpace,
      bookSpotInks: props.bookSpotInks,
      cutLines: props.cutLines,
      stale: props.stale,
      chapterOnly: props.chapterOnly,
    }, labels)),
    [reading, report, props.print, props.colorSpace, props.bookSpotInks, props.cutLines, props.stale, props.chapterOnly, labels],
  );
  const sortedFindings = useMemo(
    () => [...findings].sort((a, b) => ['critical', 'warning', 'info', 'ok'].indexOf(findingSeverity(a)) - ['critical', 'warning', 'info', 'ok'].indexOf(findingSeverity(b))),
    [findings],
  );
  const verdict = pdfCheckVerdict(items, findings);
  // In reading order: the verdict above says how bad the worst is.
  const byGroup = (g: PdfCheckGroup): PdfCheckItem[] => items.filter((i) => i.group === g);
  const preflightKinds = useMemo(() => groupFindings(sortedFindings.filter((w) => w.payload.kind === 'preflight'), labels), [sortedFindings, labels]);

  // Never "ready": a clean result is no problems in what was read.
  const verdictText = verdict === 'critical' ? labels.pdfCheckHasCritical : verdict === 'warning' ? labels.pdfCheckHasWarnings : labels.pdfCheckReady;
  const VerdictIcon = ICONS[verdict === 'info' ? 'ok' : verdict];

  return (
    <Dialog.Portal container={container}>
      <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
      <Dialog.Popup
        data-postext-popup=""
        data-testid="pdf-check-dialog"
        aria-labelledby={titleId}
        initialFocus={primaryRef}
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-16px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3"
        style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(560px, calc(100vw - 16px))', padding: 16, fontSize: 13, lineHeight: '19px' }}
      >
        <div className="flex items-start justify-between gap-2">
          <Dialog.Title id={titleId} style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: '10px 0 0' }}>
            {labels.pdfCheckTitle}
          </Dialog.Title>
          <IconButton label={labels.pdfCheckCancel} icon={<X size={14} aria-hidden="true" />} onClick={props.onClose} />
        </div>
        <Dialog.Description className="text-xs text-(--slate)" style={{ margin: 0 }}>
          {labels.pdfCheckIntro}
        </Dialog.Description>

        {reading ? (
          <p role="status" className="text-xs text-(--slate)" style={{ margin: 0 }}>{labels.pdfCheckReading}</p>
        ) : (
          <>
            <div
              role="status"
              className="flex items-center gap-2"
              style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${COLORS[verdict === 'info' ? 'ok' : verdict]}`, fontWeight: 600 }}
            >
              <VerdictIcon size={16} aria-hidden="true" style={{ color: COLORS[verdict === 'info' ? 'ok' : verdict] }} />
              {verdictText}
            </div>
            <p className="text-xs text-(--slate)" style={{ margin: 0 }}>{labels.pdfCheckNotChecked}</p>
            <div className="flex min-h-0 flex-col gap-2 overflow-y-auto" style={{ paddingInlineEnd: 4 }}>
              <Group title={labels.pdfCheckGroupOutput}>
                {byGroup('output').map((i) => <Row key={i.id} severity={i.severity} title={i.title} {...(i.detail ? { detail: i.detail } : {})} />)}
              </Group>
              <Group title={labels.pdfCheckGroupFonts}>
                {byGroup('fonts').map((i) => <Row key={i.id} severity={i.severity} title={i.title} {...(i.detail ? { detail: i.detail } : {})} />)}
                {sortedFindings.filter((w) => w.payload.kind !== 'preflight').map((w) => (
                  <Row key={w.id} severity={findingSeverity(w)} title={titleFor(w.payload, labels)} detail={detailFor(w.payload, labels)} />
                ))}
              </Group>
              <Group title={labels.pdfCheckGroupInks}>
                {byGroup('inks').map((i) => <Row key={i.id} severity={i.severity} title={i.title} {...(i.detail ? { detail: i.detail } : {})} />)}
              </Group>
              <Group title={labels.pdfCheckGroupReproduction}>
                {!props.preflightRan ? (
                  <Row severity="info" title={labels.pdfCheckReproductionOff} />
                ) : preflightKinds.length > 0 ? (
                  preflightKinds.map((k) => <FindingGroup key={k.title} group={k} labels={labels} />)
                ) : (
                  <Row severity="ok" title={labels.pdfCheckReproductionNone} />
                )}
              </Group>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {props.preflightRan && findings.length > 0 && (
              <Button variant="outline" size="sm" onClick={props.onOpenReview}>{labels.pdfCheckOpenReview}</Button>
            )}
            {props.stale && (
              <Button variant="outline" size="sm" onClick={props.onRegenerate}>{labels.pdfCheckRegenerate}</Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={props.onClose}>{labels.pdfCheckCancel}</Button>
            <Button ref={primaryRef} variant="primary" size="sm" onClick={props.onDownload} disabled={reading}>
              {verdict === 'critical' ? labels.pdfCheckDownloadAnyway : labels.pdfCheckDownload}
            </Button>
          </div>
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
