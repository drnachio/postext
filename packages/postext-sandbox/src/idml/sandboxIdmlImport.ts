// The Sandbox side of an InDesign import: the package read and summed up
// for the dialog, the linked pictures matched by file name, the importer
// of `postext-idml` run, its report put in the order a reader takes it in,
// and the book written as a `.postext` archive, which the Books panel
// opens as a new book the way it opens any other. The dialog and the
// `sandbox_import_idml` tool use it; the reader and the importer are
// loaded on the first import.

import { createBundle } from 'postext/bundle';
import type { FindingSeverity, IdmlDocument, IdmlImportResult, IdmlSummary, ImportFinding, ImportReport } from 'postext-idml';

/** How the document is read: as the importer decides, as composed pages
 *  that keep its geometry, or as a flowing book. */
export type IdmlLayoutChoice = 'auto' | 'pages' | 'flow';

/** An IDML package read, with what it holds. */
export interface IdmlImportFile {
  /** The file's name (`catalogue.idml`). */
  name: string;
  doc: IdmlDocument;
  summary: IdmlSummary;
}

/** A picture the reader handed over for the document's links. */
export interface IdmlLinkFile {
  name: string;
  bytes: Uint8Array;
}

/** Read `bytes` as an IDML package. Throws the reader's `IdmlError`,
 *  whose message says what the file is instead (an `.indd`, a Word
 *  document, an archive that is no package). */
export async function readIdmlFile(name: string, bytes: Uint8Array): Promise<IdmlImportFile> {
  const { inspectIdml, readIdml } = await import('postext-idml');
  const doc = readIdml(bytes);
  return { name, doc, summary: inspectIdml(doc) };
}

/** The file name a link or a picked file goes by: the last segment of
 *  its path, whichever way the slashes lean, percent-escapes read, in
 *  lower case. A link is matched by this, never by the path the document
 *  stores, which is of the machine it was made on. */
export function linkFileName(path: string): string {
  const last = path.split(/[\\/]/).pop() ?? '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // Not percent-escaped: the name as it stands.
  }
  return name.normalize('NFC').toLowerCase();
}

/** `files` with `more` added: a file of the same name takes the place of
 *  the one already there. */
export function addLinkFiles(files: readonly IdmlLinkFile[], more: readonly IdmlLinkFile[]): IdmlLinkFile[] {
  const names = new Set(more.map((f) => linkFileName(f.name)));
  return [...files.filter((f) => !names.has(linkFileName(f.name))), ...more];
}

/** The importer's `linkBytes`: the file of `files` a link names. */
export function linkLookup(files: readonly IdmlLinkFile[]): (link: { name: string }) => Uint8Array | undefined {
  const byName = new Map(files.map((f) => [linkFileName(f.name), f.bytes]));
  return (link) => byName.get(linkFileName(link.name));
}

export interface IdmlImportSettings {
  layout?: IdmlLayoutChoice;
  links?: readonly IdmlLinkFile[];
  /** The book's name; the document's title, else its file name, when
   *  left out. */
  name?: string;
  locale?: string;
}

const fileBase = (name: string): string => name.replace(/\.[^.]+$/, '');

/** The document as a Postext book. */
export async function convertIdml(file: IdmlImportFile, settings: IdmlImportSettings = {}): Promise<IdmlImportResult> {
  const { idmlToPostext } = await import('postext-idml');
  const name = settings.name?.trim() || file.doc.title || fileBase(file.name);
  return idmlToPostext(file.doc, {
    layout: settings.layout ?? 'auto',
    linkBytes: linkLookup(settings.links ?? []),
    ...(name ? { name } : {}),
    ...(settings.locale ? { locale: settings.locale } : {}),
  });
}

const SEVERITIES: readonly FindingSeverity[] = ['loss', 'warning', 'info'];

/** The findings of a report by severity, what was lost first; a severity
 *  with none is left out. `total` adds up the counts of its findings. */
export function findingsBySeverity(report: Pick<ImportReport, 'findings'>): { severity: FindingSeverity; total: number; findings: ImportFinding[] }[] {
  return SEVERITIES.flatMap((severity) => {
    const findings = report.findings.filter((f) => f.severity === severity).sort((a, b) => b.count - a.count);
    return findings.length > 0 ? [{ severity, total: findings.reduce((n, f) => n + f.count, 0), findings }] : [];
  });
}

/** The faces the book needs, a family a line: `Lora (Regular, Bold)`. */
export function fontsNeeded(result: Pick<IdmlImportResult, 'fonts'>): string[] {
  return result.fonts.map((f) => (f.styles.length > 0 ? `${f.family} (${f.styles.map((s) => s.name).join(', ')})` : f.family));
}

/** The page size most of the document's pages have, in points, and
 *  whether other pages have another. */
export function mainPageSize(summary: Pick<IdmlSummary, 'pageSizes'>): { width: number; height: number; mixed: boolean } | null {
  const size = summary.pageSizes[0];
  if (!size) return null;
  const round = (n: number): number => Math.round(n * 100) / 100;
  return { width: round(size.width), height: round(size.height), mixed: summary.pageSizes.length > 1 };
}

/** The imported book as a `.postext` archive: what the Books panel opens
 *  as a new book, with its chapters, configuration, resources and their
 *  files. `warnings` names what the archive had to leave out. */
export async function idmlBookBundle(result: IdmlImportResult): Promise<{ bytes: Uint8Array; fileName: string; warnings: string[] }> {
  const { importBundleInput } = await import('postext-idml');
  const created = await createBundle(importBundleInput(result));
  const base = result.name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'document';
  return { bytes: created.bytes, fileName: `${base}.postext`, warnings: created.warnings };
}

/** An import in the words an agent reads: how it was laid out and why,
 *  the report, the fonts to add and the links nobody gave the bytes of. */
export function describeIdmlImport(result: IdmlImportResult): Record<string, unknown> {
  const { report } = result;
  return {
    name: result.name,
    language: result.locale,
    layout: result.layout,
    reason: result.reason,
    verdict: report.verdict,
    counts: report.counts,
    chapters: result.chapters.map((c) => ({ title: c.title, characters: c.markdown.length })),
    resources: result.resources.length,
    findings: findingsBySeverity(report).flatMap((group) => group.findings.map((f) => ({
      id: f.id,
      severity: f.severity,
      count: f.count,
      says: f.message,
      ...(f.examples.length > 0 ? { examples: f.examples } : {}),
    }))),
    ...(result.fonts.length > 0 ? { fontsNeeded: fontsNeeded(result) } : {}),
    ...(result.missingLinks.length > 0 ? { missingLinks: result.missingLinks.map((l) => ({ name: l.name, uses: l.uses })) } : {}),
  };
}
