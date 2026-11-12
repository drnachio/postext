// InDesign in both directions as tools: `sandbox_import_idml` reads an
// IDML package into a new book, as the Books panel's dialog does, and
// `sandbox_export` writes the IDML package of the book on screen with the
// options of the Manuscript panel's export dialog (`exportIdmlFile`).

import { layOutBookPrint } from '../../book/printChain.js';
import { ensureConfigFontsLoaded } from '../../controls/fonts/fontLoader.js';
import { buildIdmlExport, type IdmlExportChoices } from '../../idml/idmlExport.js';
import { idmlFontWithheld, sandboxIdmlFaces } from '../../idml/idmlFonts.js';
import { convertIdml, describeIdmlImport, idmlBookBundle, mainPageSize, readIdmlFile, readIdmlPackage, readIdmlPackageDocument, type IdmlImportFile, type IdmlLayoutChoice, type IdmlLinkFile } from '../../idml/sandboxIdmlImport.js';
import { downloadBytes } from '../../storage/persistence.js';
import { bookPagesSummary, layoutConfig, whenSettled, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { WAIT_PARAM, bookIdentity, fileParam } from './book.js';
import { readFileInput, type FileInput } from './resources.js';

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The options `sandbox_export` takes for format idml. */
export const IDML_EXPORT_PARAMS = {
  idmlLines: { type: 'string', enum: ['keep', 'reflow'], description: 'idml: keep (default) ends every line where the PDF ends it; reflow leaves the paragraphs to InDesign\'s composer, for a book that will be set again there.' },
  idmlSpreads: { type: 'string', enum: ['facing', 'single'], description: 'idml: the pages two to a spread about the spine, or a page a spread. Left out: facing for a book with mirrored margins, single for any other.' },
  idmlImages: { type: 'string', enum: ['embed', 'link'], description: 'idml: pictures inside the document (default), or linked from a Links folder beside it; linked, the file is a .zip that holds the .idml and the folder.' },
  idmlFonts: { type: 'boolean', description: 'idml: also hand over the font files of the faces the book is set in, in a Document fonts folder beside the document (the file is then a .zip). A custom family marked as not redistributable is left out and named under fontsWithheld.' },
} as const;

let builds = 0;

function holds(file: IdmlImportFile): Record<string, unknown> {
  const s = file.summary;
  const size = mainPageSize(s);
  return {
    pages: s.pages,
    ...(size ? { pageSize: { width: size.width, height: size.height, unit: 'pt', ...(size.mixed ? { otherSizes: true } : {}) } } : {}),
    stories: s.readableStories,
    fonts: [...new Set(s.fonts.map((f) => f.family).filter(Boolean))],
    pictures: { linked: s.pictures.linked, embedded: s.pictures.embedded },
    tables: s.tables,
    ...(s.attention.length > 0 ? { needsALook: s.attention } : {}),
  };
}

/** `sandbox_export` with format idml: the package (or the zip that holds
 *  it beside its folders), downloaded or handed back. */
export async function exportIdmlFile(
  host: SandboxToolHost,
  args: Record<string, unknown>,
  bookName: string,
  maxDataBytes: number,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  await whenSettled(host, { signal });
  const s = host.store.getSnapshot();
  const config = layoutConfig(s);
  const choices: Partial<IdmlExportChoices> = {
    ...(args.idmlLines !== undefined ? { lineBreaks: args.idmlLines as IdmlExportChoices['lineBreaks'] } : {}),
    ...(args.idmlSpreads !== undefined ? { spreads: args.idmlSpreads as IdmlExportChoices['spreads'] } : {}),
    ...(args.idmlImages !== undefined ? { images: args.idmlImages as IdmlExportChoices['images'] } : {}),
    ...(args.idmlFonts !== undefined ? { fonts: args.idmlFonts === true } : {}),
  };
  const notes: string[] = [];
  const clientId = `webmcp:idml:${++builds}`;
  const cancel = () => host.layout.cancel(clientId);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    await ensureConfigFontsLoaded(config, s.chapters.map((c) => c.markdown)).catch(() => undefined);
    // The whole book, as the PDF's book scope lays it out.
    const docs = await layOutBookPrint({
      plan: host.store.getPlan(s),
      chapters: s.chapters,
      resources: s.resources,
      config,
      build: (content, cfg, opts) => host.layout.build({ clientId, priority: 'pdf', content, config: cfg, cacheKey: opts.cacheKey }),
    });
    // A face is named as its file names it wherever the Sandbox has the file.
    const faces = await sandboxIdmlFaces(docs).catch(() => []);
    const file = await buildIdmlExport({
      docs,
      resources: s.resources,
      config,
      ...(bookName ? { title: bookName } : {}),
      choices,
      faces,
      withheld: idmlFontWithheld,
      onWarning: (w) => notes.push(w.message),
    });
    const answer = {
      format: 'idml',
      file: file.name,
      bytes: file.bytes.byteLength,
      mimeType: file.mime,
      pages: docs.reduce((n, d) => n + d.pages.length, 0),
      ...(file.zipped ? { holds: [file.name.replace(/\.zip$/, '.idml'), ...file.links, ...file.fonts] } : {}),
      ...(file.withheld.length > 0 ? { fontsWithheld: file.withheld } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    };
    if (args.deliver === 'data') {
      if (file.bytes.byteLength > maxDataBytes) throw new ToolError(`The idml is ${Math.round(file.bytes.byteLength / 1048576)} MB, too large to hand back in a result; ask for it as a download.`);
      return { ...answer, base64: toBase64(file.bytes) };
    }
    downloadBytes(file.bytes, file.name, file.mime);
    return { ...answer, downloaded: true };
  } catch (err) {
    if (err instanceof ToolError || (err instanceof DOMException && err.name === 'AbortError')) throw err;
    throw new ToolError(`The IDML package could not be written: ${messageOf(err)}`);
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

export function idmlTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const importIdml: WebMcpTool = {
    name: 'sandbox_import_idml',
    title: 'Sandbox: import an InDesign document',
    description: "Read an InDesign document saved as IDML (.idml) into a new book, as the Books panel's \"New book from an InDesign document\" does: its text becomes chapters, its page and styles the design, its pictures and tables resources. The books the reader has are left as they are, and the new one opens. Run it first with dryRun: true — it creates nothing and answers with what the document holds (pages, page size, stories, fonts, pictures linked and embedded, tables) and the import report: how it would be laid out and why, the verdict (faithful, approximate or lossy), the counts, every finding with its severity (loss, warning, info), count and examples, the fonts the book needs and the linked pictures nobody gave the bytes of. layout chooses composed pages that keep the document's geometry (pages) or a flowing book (flow); auto, the default, lets the importer decide. Pictures the document links to and does not carry are handed over in links, each matched by its file name alone. file may also be a zipped InDesign package (the folder File › Package makes, as a .zip): the IDML document in it is imported with the package's linked pictures and fonts (fontsFromPackage, linksFromPackage); when it holds several, document names the one to import (documents in the answer lists them). An .indd file is refused: it is saved as IDML from InDesign first. For a Word manuscript, sandbox_import_word; for a .postext book, sandbox_import_book.",
    inputSchema: {
      type: 'object',
      properties: {
        file: fileParam('The .idml file, or a zipped InDesign package that holds one: where to fetch it (url) or its bytes (base64).'),
        document: { type: 'string', description: 'A zipped package: the path inside it of the IDML document to import (Book/Book.idml). Needed when it holds more than one.' },
        dryRun: { type: 'boolean', description: 'Create nothing: answer with what the document holds and the import report.' },
        layout: { type: 'string', enum: ['auto', 'pages', 'flow'], description: 'pages: composed pages, every frame where the document has it. flow: a flowing book. auto (default): the importer decides and says why (reason).' },
        links: {
          type: 'array',
          description: 'The pictures the document links to: each a file (url or base64) with its fileName, which is what a link is matched by. missingLinks in the answer names the ones still not given.',
          items: fileParam('A linked picture; fileName as the document names it (map.png).'),
        },
        name: { type: 'string', description: "The new book's name. The document's title, else its file name, when left out." },
        language: { type: 'string', description: 'The language of the book (en, es, ja…). The one most of the text is set in when left out.' },
        wait: WAIT_PARAM,
      },
      required: ['file'],
      additionalProperties: false,
    },
    annotations: { untrustedContentHint: true },
    execute: async (args, { signal }) => {
      const picked = await readFileInput(args.file as FileInput, signal);
      const bytes = new Uint8Array(await picked.arrayBuffer());
      let file: IdmlImportFile;
      try {
        // A zip that is no IDML package itself is read as a zipped InDesign package.
        const pkg = /\.idml$/i.test(picked.name) ? null : await readIdmlPackage(picked.name, bytes).catch(() => null);
        if (pkg && !pkg.archive.documents.includes('')) {
          const { documents } = pkg.archive;
          if (documents.length === 0) throw new ToolError(`${picked.name} holds no IDML document${pkg.archive.indd.length > 0 ? ` (only ${pkg.archive.indd.join(', ')})` : ''}: in InDesign, tick Include IDML in File › Package, or save the document as IDML (File › Export).`);
          const wanted = typeof args.document === 'string' ? args.document : documents.length === 1 ? documents[0]! : null;
          if (wanted === null) throw new ToolError(`${picked.name} holds ${documents.length} IDML documents; name the one to import in document. documents: ${JSON.stringify(documents)}`);
          if (!documents.includes(wanted)) throw new ToolError(`${picked.name} has no IDML document ${JSON.stringify(wanted)}. documents: ${JSON.stringify(documents)}`);
          file = await readIdmlPackageDocument({ ...pkg, path: wanted });
        } else file = await readIdmlFile(picked.name, bytes);
      } catch (err) {
        if (err instanceof ToolError) throw err;
        // The reader's own words: an .indd, a Word document, no package.
        throw new ToolError(`${picked.name} could not be read as an InDesign document: ${messageOf(err)}`);
      }
      const links: IdmlLinkFile[] = [];
      for (const input of (args.links as FileInput[] | undefined) ?? []) {
        const link = await readFileInput(input, signal);
        links.push({ name: link.name, bytes: new Uint8Array(await link.arrayBuffer()) });
      }
      const result = await convertIdml(file, {
        layout: (args.layout as IdmlLayoutChoice | undefined) ?? 'auto',
        links,
        ...(typeof args.name === 'string' ? { name: args.name } : {}),
        ...(typeof args.language === 'string' ? { locale: args.language } : {}),
      });
      const about = {
        file: picked.name,
        ...(file.package ? { document: file.package.path || file.name, documents: file.package.archive.documents } : {}),
        holds: holds(file),
        ...describeIdmlImport(result),
      };
      if (args.dryRun === true) return { dryRun: true, imported: false, ...about };

      let project: string;
      let archiveNotes: string[];
      try {
        const bundle = await idmlBookBundle(result);
        archiveNotes = bundle.warnings;
        project = await store.projectActions.importBundleBytes(bundle.bytes, bundle.fileName);
      } catch (err) {
        throw new ToolError(`The book could not be created: ${messageOf(err)}`);
      }
      if (args.wait === false) return { imported: true, project, ...about, ...(archiveNotes.length > 0 ? { notes: archiveNotes } : {}), laidOut: false };
      // The new book opens a moment after it is stored.
      await sleep(50);
      const laidOut = await whenSettled(host, { signal });
      return { imported: true, project, ...about, ...(archiveNotes.length > 0 ? { notes: archiveNotes } : {}), opened: bookIdentity(host), laidOut, book: bookPagesSummary(host) };
    },
  };

  return [importIdml];
}
