// Read a `.docx` (Office Open XML) into the Word model: styles, numbering,
// body blocks, footnotes and endnotes, pictures, core properties and the
// import template a Postext export embeds. Runs in the browser and in Node.

import { unzipSync } from 'fflate';
import type { WordDocument, WordMedia } from './model.js';
import { child, textOf, parseXml, localName } from './xml.js';
import { type ReadContext, readBlocks, readNotes } from './docxRead/body.js';
import { type Files, readXml, readText, TEMPLATE_XML_ROOT, DocxReadError, readRels, readStyles, readNumbering, type Relationship, MEDIA_TYPES } from './docxRead/parts.js';

export { TEMPLATE_XML_ROOT, TEMPLATE_XML_NS, DocxReadError } from './docxRead/parts.js';

function readCore(files: Files): { title?: string; author?: string } {
  const root = readXml(files, 'docProps/core.xml');
  if (!root) return {};
  const title = child(root, 'title');
  const creator = child(root, 'creator');
  return {
    title: title ? textOf(title).trim() || undefined : undefined,
    author: creator ? textOf(creator).trim() || undefined : undefined,
  };
}

function readEmbeddedTemplate(files: Files): unknown {
  for (const path of Object.keys(files)) {
    if (!/^customXml\/item\d+\.xml$/.test(path)) continue;
    const text = readText(files, path);
    if (!text || !text.includes(TEMPLATE_XML_ROOT)) continue;
    try {
      const root = parseXml(text);
      if (localName(root.name) !== TEMPLATE_XML_ROOT) continue;
      return JSON.parse(textOf(root));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Read a `.docx` file's bytes. Throws {@link DocxReadError} when it is not a
 *  Word document (an old binary `.doc`, a renamed file, a broken zip). */
export function readDocx(data: ArrayBuffer | Uint8Array): WordDocument {
  let files: Files;
  try {
    files = unzipSync(data instanceof Uint8Array ? data : new Uint8Array(data));
  } catch {
    throw new DocxReadError('not a zip');
  }
  const pkgRels = readRels(files, '');
  const officeDoc = [...pkgRels.values()].find((r) => r.type === 'officeDocument');
  const docPath = officeDoc?.target ?? 'word/document.xml';
  const docRoot = readXml(files, docPath);
  const body = child(docRoot, 'body');
  if (!docRoot || !body) throw new DocxReadError('no document part');
  const rels = readRels(files, docPath);
  const partOf = (type: string): string | undefined => [...rels.values()].find((r) => r.type === type)?.target;

  const { styles, defaultParagraph, defaultSize } = readStyles(readXml(files, partOf('styles') ?? 'word/styles.xml'));
  const numbering = readNumbering(readXml(files, partOf('numbering') ?? 'word/numbering.xml'));
  const revisions = { insertions: 0, deletions: 0, comments: 0 };
  const ctx: ReadContext = { rels, styles, revisions, fields: [] };
  const blocks = readBlocks(body, ctx);
  const footnotes = readNotes(files, partOf('footnotes'), ctx, 'footnote');
  const endnotes = readNotes(files, partOf('endnotes'), ctx, 'endnote');

  const media = new Map<string, WordMedia>();
  const collectMedia = (relMap: Map<string, Relationship>): void => {
    for (const [id, rel] of relMap) {
      if (rel.type !== 'image' || rel.external || media.has(id)) continue;
      const bytes = files[rel.target];
      if (!bytes) continue;
      const ext = rel.target.split('.').pop()?.toLowerCase() ?? '';
      media.set(id, { path: rel.target, bytes, contentType: MEDIA_TYPES[ext] ?? 'application/octet-stream' });
    }
  };
  collectMedia(rels);

  return {
    blocks,
    styles,
    defaultParagraphStyle: defaultParagraph,
    ...(defaultSize !== undefined ? { defaultFontSizeHalfPoints: defaultSize } : {}),
    numbering,
    footnotes,
    endnotes,
    media,
    ...readCore(files),
    embeddedTemplate: readEmbeddedTemplate(files),
    revisions,
  };
}
