'use client';

// What the InDesign import dialog shows of a document and of its import:
// what the package holds, and the importer's report (verdict, counts, the
// findings by severity with a count and an example each, the fonts the
// book needs and the links still missing).

import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { FindingSeverity, IdmlImportResult, IdmlSummary } from 'postext-idml';
import type { SandboxLabels } from '../types/index.js';
import { isolate } from '../word/WordImportDialog.js';
import { findingsBySeverity, fontsCarried, fontsNeeded, mainPageSize } from './sandboxIdmlImport.js';

const SEVERITY_LABEL: Record<FindingSeverity, keyof SandboxLabels> = {
  loss: 'idmlImportSeverityLoss',
  warning: 'idmlImportSeverityWarning',
  info: 'idmlImportSeverityInfo',
};

function SeverityIcon({ severity, size = 13 }: { severity: FindingSeverity; size?: number }) {
  if (severity === 'loss') return <XCircle size={size} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--pt-error, #ef4444)' }} />;
  if (severity === 'warning') return <AlertTriangle size={size} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--pt-warning, #d97706)' }} />;
  return <Info size={size} aria-hidden="true" className="mt-0.5 shrink-0 text-(--slate)" />;
}

/** The package before it is imported: pages and their size, stories,
 *  fonts named, pictures linked and embedded, tables; for a document read
 *  from a zipped package, the linked pictures the package gave. */
export function IdmlHoldings({ summary, labels, packageLinks }: { summary: IdmlSummary; labels: SandboxLabels; packageLinks?: number | undefined }) {
  const size = mainPageSize(summary);
  const families = [...new Set(summary.fonts.map((f) => f.family).filter(Boolean))];
  const rows: [string, string][] = [
    [labels.idmlImportPages, String(summary.pages)],
    ...(size
      ? [[labels.idmlImportPageSize, (size.mixed ? labels.idmlImportPageSizeMixed : labels.idmlImportPageSizeValue).replace('__width__', String(size.width)).replace('__height__', String(size.height))] as [string, string]]
      : []),
    [labels.idmlImportStories, String(summary.readableStories)],
    [labels.idmlImportFonts, families.length > 0 ? families.map(isolate).join(labels.frameStylesListSeparator) : '0'],
    [labels.idmlImportPictures, labels.idmlImportPicturesValue.replace('__linked__', String(summary.pictures.linked)).replace('__embedded__', String(summary.pictures.embedded))],
    ...(packageLinks !== undefined ? [[labels.idmlImportPackageLinks, String(packageLinks)] as [string, string]] : []),
    [labels.idmlImportTables, String(summary.tables)],
  ];
  return (
    <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="text-(--slate)">{name}</dt>
          <dd className="m-0" style={{ overflowWrap: 'anywhere' }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The importer's report on a document read as a book. */
export function IdmlImportReport({ result, labels, fromPackage = false }: { result: IdmlImportResult; labels: SandboxLabels; fromPackage?: boolean }) {
  const { report } = result;
  const verdict = report.verdict === 'faithful' ? labels.idmlImportVerdictFaithful : report.verdict === 'approximate' ? labels.idmlImportVerdictApproximate : labels.idmlImportVerdictLossy;
  const fonts = fontsNeeded(result);
  const carried = fontsCarried(result);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 flex items-start gap-2 font-semibold">
        {report.verdict === 'faithful'
          ? <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--pt-success, #16a34a)' }} />
          : <SeverityIcon severity={report.verdict === 'lossy' ? 'loss' : 'warning'} size={16} />}
        {verdict}
      </p>
      <p className="m-0 text-xs text-(--slate)">
        {labels.idmlImportCounts
          .replace('__chapters__', String(result.chapters.length))
          .replace('__paragraphs__', String(report.counts.paragraphs))
          .replace('__pictures__', String(report.counts.pictures))
          .replace('__tables__', String(report.counts.tables))
          .replace('__notes__', String(report.counts.footnotes))}
      </p>
      {findingsBySeverity(report).map((group) => (
        <div key={group.severity} className="flex flex-col gap-1.5">
          <p className="m-0 text-xs font-semibold">{labels[SEVERITY_LABEL[group.severity]].replace('__count__', String(group.total))}</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {group.findings.map((f) => (
              <li key={f.id} className="flex items-start gap-2 text-xs">
                <SeverityIcon severity={f.severity} />
                {/* The importer's own words, in the language it writes them. */}
                <span dir="auto" style={{ overflowWrap: 'anywhere' }}>
                  {isolate(f.message)} ×{f.count}
                  {f.examples[0] && (
                    <span className="block text-(--slate)">{labels.wordFindingExamples.replace('__list__', () => isolate(`“${f.examples[0]}”`))}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {carried.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-xs font-semibold">{labels.idmlImportFontsCarried}</p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs">
            {carried.map((f) => (
              <li key={f} className="flex items-start gap-1.5" dir="auto" style={{ overflowWrap: 'anywhere' }}>
                <CheckCircle2 size={12} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--pt-success, #16a34a)' }} />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      {fonts.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-xs font-semibold">{labels.idmlImportFontsNeeded}</p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs">
            {fonts.map((f) => <li key={f} dir="auto" style={{ overflowWrap: 'anywhere' }}>{f}</li>)}
          </ul>
          <p className="m-0 text-xs text-(--slate)">{fromPackage ? labels.idmlImportFontsMissingHelp : labels.idmlImportFontsHelp}</p>
        </div>
      )}
    </div>
  );
}
