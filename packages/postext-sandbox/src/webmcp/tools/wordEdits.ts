// The Word round trip as tools (#1397, #1458): `sandbox_export` writes
// either Word document (`exportWordFile`: content only, or the book's
// design), and `sandbox_apply_word_edits` reads
// an edited export back into the book, as the Manuscript panel's export
// dialog and review dialog do.

import { DocxReadError, type DocxComment, type DocxEdit, type DocxImportNote } from 'postext/word';
import type { SandboxState } from '../../context/SandboxContext.js';
import { downloadBytes } from '../../storage/persistence.js';
import { createPdfFontProvider } from '../../viewport/pdf/pdfFontProvider.js';
import { DOCX_MIME, buildWordExport, docxFileName, type WordExportNote, type WordVariant } from '../../word/wordExport.js';
import { isWordExport, rebuildWordMap, reviewChanges, reviewWordEdits, writeWordEdits } from '../../word/wordEdits.js';
import { chapterText, stateReaches } from '../chapterEdits.js';
import { layoutConfig, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { WAIT_PARAM, fileParam, layoutAnswer } from './book.js';
import { readFileInput, type FileInput } from './resources.js';

/** How long the edits may take to reach the state. */
const LANDING_MS = 5000;

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A chapter id as the tools name a chapter: its position from 1. */
const positionOf = (s: SandboxState, id: string | undefined): number | null => {
  const i = id === undefined ? -1 : s.chapters.findIndex((c) => c.id === id);
  return i < 0 ? null : i + 1;
};

function describeNote(s: SandboxState, n: WordExportNote): Record<string, unknown> {
  if (n.kind === 'font') return { font: n.family, reason: n.reason, ...(n.detail ? { detail: n.detail } : {}) };
  const chapter = positionOf(s, n.chapter);
  return { code: n.code, message: n.message, ...(chapter ? { chapter } : {}) };
}

/** What the import says about the file as a whole, for the answer. */
function describeImportNote(s: SandboxState, n: DocxImportNote): Record<string, unknown> {
  const message: Record<DocxImportNote['code'], string> = {
    'map-rebuilt': 'The file came back without its export map (Google Docs leaves it out): the map was written again from the book.',
    'book-changed': 'The book changed since the file was exported, and the file carries no copy of the text it was exported with: it was compared with the book as it is now, so a change made in the book since then may be listed as an edit that undoes it. Check the list before applying.',
    'book-unverified': 'The file does not say what the book was like when it was exported: if the book changed since, those changes may be listed as edits that undo them.',
    'writer-changed': "The file was written by another version of Postext: its text was matched with the book's passage by passage.",
    'chapters-missing': 'Chapters of the file are no longer in the book: the changes made in them are left out.',
  };
  const chapters = (n.chapters ?? []).map((id) => positionOf(s, id)).filter((x): x is number => x !== null);
  return {
    code: n.code,
    message: message[n.code],
    ...(chapters.length > 0 ? { chapters } : {}),
    ...(n.unplaced ? { passagesOfTheBookNotInTheFile: n.unplaced } : {}),
    ...(n.foreign ? { passagesOfTheFileNotInTheBook: n.foreign } : {}),
  };
}

export const VARIANT_PARAM = {
  type: 'string',
  enum: ['semantic', 'formatted'],
  description: "docx: both are flowing, editable text built from the Markdown (Word styles, lists, footnotes, tables), for Word or Google Docs. semantic is content only: plain styles that name each part and no page design, for correcting the words. formatted (default) is the same text with the book's design as far as Word allows (page size, margins, columns, embedded fonts, openers, boxes, running heads). Both carry the marks that take the edits made in Word back into the book (sandbox_apply_word_edits).",
} as const;

/** `sandbox_export` with format docx: the file, downloaded or handed back. */
export async function exportWordFile(
  host: SandboxToolHost,
  args: Record<string, unknown>,
  bookName: string,
  maxDataBytes: number,
): Promise<Record<string, unknown>> {
  const variant = (args.variant as WordVariant | undefined) ?? 'formatted';
  const scope = (args.scope as 'chapter' | 'book' | undefined) ?? 'book';
  const s = host.store.getSnapshot();
  const notes: WordExportNote[] = [];
  let bytes: Uint8Array;
  try {
    bytes = await buildWordExport({
      variant,
      scope,
      chapters: s.chapters,
      activeChapterId: s.activeChapterId,
      resources: s.resources,
      config: layoutConfig(s),
      title: bookName,
      ...(variant === 'formatted' ? { fontProvider: createPdfFontProvider() } : {}),
      onNote: (n) => notes.push(n),
    });
  } catch (err) {
    throw new ToolError(`The Word document could not be written: ${messageOf(err)}`);
  }
  const active = s.chapters.find((c) => c.id === s.activeChapterId);
  const file = docxFileName(bookName, scope === 'chapter' && s.chapters.length > 1 ? active?.title ?? '' : null);
  const answer = {
    format: 'docx',
    variant,
    scope,
    file,
    bytes: bytes.byteLength,
    mimeType: DOCX_MIME,
    ...(notes.length > 0 ? { notes: notes.map((n) => describeNote(s, n)) } : {}),
  };
  if (args.deliver === 'data') {
    if (bytes.byteLength > maxDataBytes) throw new ToolError(`The docx is ${Math.round(bytes.byteLength / 1048576)} MB, too large to hand back in a result; ask for it as a download.`);
    return { ...answer, base64: toBase64(bytes) };
  }
  downloadBytes(bytes, file, DOCX_MIME);
  return { ...answer, downloaded: true };
}

function describeEdit(s: SandboxState, e: DocxEdit): Record<string, unknown> {
  const chapter = positionOf(s, e.chapter);
  return {
    status: e.status,
    kind: e.kind,
    ...(chapter ? { chapter } : e.chapter !== undefined ? { chapterId: e.chapter } : {}),
    ...(e.resourceId !== undefined ? { resource: e.resourceId, field: e.field } : {}),
    before: e.before,
    after: e.after,
    ...(e.reason ? { reason: e.reason } : {}),
    ...(e.citation !== undefined ? { citation: e.citation, ...(e.citationPart ? { citationPart: e.citationPart } : {}) } : {}),
  };
}

function describeComment(s: SandboxState, c: DocxComment): Record<string, unknown> {
  const chapter = positionOf(s, c.chapter);
  return {
    ...(chapter ? { chapter } : {}),
    ...(c.resourceId !== undefined ? { resource: c.resourceId } : {}),
    ...(c.author ? { author: c.author } : {}),
    text: c.text,
    ...(c.start >= 0 && c.chapter !== undefined ? { on: (chapterText(s, c.chapter) ?? '').slice(c.start, c.end) } : {}),
  };
}

export function wordEditTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const applyEdits: WebMcpTool = {
    name: 'sandbox_apply_word_edits',
    title: 'Sandbox: bring back an edited Word export',
    description: "Read a .docx that sandbox_export (format docx) or the export dialog wrote from this book and was then edited in Word or Google Docs, and put the changes made in it into the book's chapters and resources, as the Manuscript panel's Word import does with such a file. Every change found is listed: applied (it goes in), conflict (the same text also changed in the book since the export, or is no longer there) or rejected (text the book makes itself, such as a number or a label, or formatting it cannot place), with reason; a change inside a printed citation names it (citation: its keys; citationPart: prefix, locator or suffix): a part the author wrote goes into the citation, and a change to the text the bibliography writes is rejected (reason citation). variant is the export the file is (formatted, semantic or facsimile), writer the writer its properties name. The comments left in Word are listed too. Run it first with dryRun: true to see the list; without it the applied changes are written as one change that sandbox_undo takes back whole. A file saved by Google Docs comes back without the map of its marks: the map is written again from the book, and notes says so, and whether the book changed since the export (then a change made in the book since may be listed as an edit that undoes it). A .docx that was not exported from the Sandbox goes through sandbox_import_word instead.",
    inputSchema: {
      type: 'object',
      properties: {
        file: fileParam('The edited .docx: where to fetch it (url) or its bytes (base64).'),
        dryRun: { type: 'boolean', description: 'Change nothing: answer with the changes found and what each would do.' },
        wait: WAIT_PARAM,
      },
      required: ['file'],
      additionalProperties: false,
    },
    annotations: { untrustedContentHint: true },
    execute: async (args, { signal }) => {
      const input = await readFileInput(args.file as FileInput, signal);
      const bytes = new Uint8Array(await input.arrayBuffer());
      // A .docx is a zip archive: anything else is no Word document at all.
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new ToolError(`${input.name} is not a .docx file (a .doc is saved as .docx from Word first).`);
      if (!isWordExport(bytes)) {
        throw new ToolError(`${input.name} was not exported from the Sandbox (it carries no export marks): sandbox_import_word brings in any other Word document.`);
      }
      const s = store.getSnapshot();
      let review: ReturnType<typeof reviewWordEdits>;
      try {
        // A file Google Docs saved kept its marks and lost their map: the
        // map is written again from the book as it is now.
        const rebuilt = await rebuildWordMap(bytes, { ...s, config: layoutConfig(s) });
        if (rebuilt === null) throw new ToolError(`${input.name} was exported from Postext, but its text is not in this book: open the book it was exported from and apply it there.`);
        review = reviewWordEdits(bytes, s, rebuilt);
      } catch (err) {
        if (err instanceof ToolError) throw err;
        if (!(err instanceof DocxReadError)) console.error(err);
        throw new ToolError(`${input.name} could not be read back: ${messageOf(err)}`);
      }
      const about = {
        file: input.name,
        variant: review.result.variant,
        writer: review.result.writer,
        counts: review.counts,
        edits: review.result.edits.map((e) => describeEdit(s, e)),
        ...(review.result.comments.length > 0 ? { comments: review.result.comments.map((c) => describeComment(s, c)) } : {}),
        ...(review.notes.length > 0 ? { notes: review.notes.map((n) => describeImportNote(s, n)) } : {}),
      };
      if (args.dryRun === true) {
        return { dryRun: true, ...about, wouldChange: { chapters: [...review.chapterTexts.keys()].map((id) => positionOf(s, id)), resources: review.resources.map((r) => r.id) } };
      }
      if (!reviewChanges(review)) return { applied: false, ...about, changed: false };
      const written = writeWordEdits((a) => store.dispatch(a), store.history, s, review);
      const landed = await stateReaches(host, () => {
        const now = store.getSnapshot();
        return written.chapters.every((id) => chapterText(now, id) === review.chapterTexts.get(id))
          && written.resources.every((id) => now.resources.find((r) => r.id === id)?.updatedAt !== s.resources.find((r) => r.id === id)?.updatedAt);
      }, LANDING_MS);
      // The group closes by itself once the chapter in the editor has taken
      // its edit (a render later).
      if (!landed) {
        // What did arrive stays one change.
        written.group?.close();
        throw new ToolError('The book changed while the edits were on their way: read the file again with dryRun and apply it to the book as it is now.');
      }
      const after = store.getSnapshot();
      return {
        applied: true,
        ...about,
        changed: true,
        chapters: written.chapters.map((id) => positionOf(after, id)),
        ...(written.resources.length > 0 ? { resources: written.resources } : {}),
        undo: 'sandbox_undo takes all these changes back at once.',
        ...(await layoutAnswer(host, args.wait, signal)),
      };
    },
  };

  return [applyEdits];
}
