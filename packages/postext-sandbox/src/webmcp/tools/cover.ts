// The book's print cover for an agent (#1669): what the Cover panel shows
// of a version's sheet (its size, spine, panels, texts and the design's
// items), the cover's text written into a panel or a text box, and the
// sheet written as a PDF or a panel as a picture. The versions and the
// cover's design are settings: sandbox_set_config writes them
// (production.versions, cover).

import type { CoverSheetKind } from 'postext/production';
import { buildCover } from 'postext/production';
import { createPdfWorker } from 'postext-pdf/worker';
import { ensureConfigFontsLoaded } from '../../controls/fonts/fontLoader.js';
import { withHyphenationLocale } from '../../controls/language/hyphenation.js';
import { bookVersions, coverBuildInput, pickVersion, type CoverBook } from '../../cover/coverInput.js';
import { coverFileName, writeCoverPdf } from '../../cover/coverPdf.js';
import { coverSlotTexts, coverTextSlots, setCoverSlotText } from '../../cover/coverText.js';
import { designerItems } from '../../cover/designer/designerModel.js';
import { canvasJpeg, paintCoverZone } from '../../cover/paintCover.js';
import { layOutPrintedCover } from '../../cover/printedCover.js';
import type { SandboxState } from '../../context/SandboxContext.js';
import { downloadBytes } from '../../storage/persistence.js';
import { createPdfFontProvider } from '../../viewport/pdf/pdfFontProvider.js';
import { dispatchAndWait, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { MAX_DATA_BYTES, toBase64 } from './library.js';
import { detailFor, titleFor } from '../../sidebar/WarningsPanel.js';

const SHEETS: readonly CoverSheetKind[] = ['cover', 'jacket', 'endpaperFront', 'endpaperBack'];
const ZONES = ['front', 'back', 'spine', 'flapFront', 'flapBack'] as const;

const VERSION_PARAM = { type: 'string', description: 'The version, by id (production.versions[].id); the book\'s first when left out.' } as const;
const SHEET_PARAM = { type: 'string', enum: SHEETS, description: 'cover (default), jacket (a hardcover\'s dust jacket), endpaperFront or endpaperBack.' } as const;

const mm = (v: number) => Math.round(v * 100) / 100;

function coverBook(host: SandboxToolHost, s: SandboxState): CoverBook {
  return {
    config: withHyphenationLocale(s.config, s.locale),
    chapters: s.chapters,
    resources: s.resources,
    coverMarkdown: s.coverMarkdown,
    bookPages: host.store.getPlan(s).bookPages,
  };
}

/** The version and sheet asked for, built; a ToolError naming what the
 *  book has when either is not there. */
function built(host: SandboxToolHost, args: Record<string, unknown>) {
  const s = host.store.getSnapshot();
  const versions = bookVersions(s.config);
  if (versions.length === 0) throw new ToolError('The book has no print version: add one to production.versions with sandbox_set_config (for example { "id": "pb", "name": "Paperback", "binding": "perfect" }), or in the Cover panel.');
  const id = args.version as string | undefined;
  if (id !== undefined && !versions.some((v) => v.id === id)) throw new ToolError(`No version ${JSON.stringify(id)}. The versions: ${versions.map((v) => v.id).join(', ')}.`);
  const version = pickVersion(s.config, id)!;
  const sheet = (args.sheet as CoverSheetKind | undefined) ?? 'cover';
  const book = coverBook(host, s);
  const out = buildCover(coverBuildInput(book, version, sheet));
  if (!('config' in out)) throw new ToolError(`The ${sheet} of ${version.id} cannot be built: ${out.issues.map((i) => i.kind).join(', ')}.`);
  return { s, book, version, sheet, built: out };
}

export function coverTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;
  const get: WebMcpTool = {
    name: 'sandbox_cover_get',
    title: 'Sandbox: read the print cover',
    description: "Read the print cover of one of the book's versions, as the Cover panel shows it: the versions (id, name, binding, ISBN), the sheet's size in mm with its spine (measured from the book's pages and paper), the sheets the version has (cover, a hardcover's jacket, endpapers), each panel's rectangle on the sheet in mm (front, back, spine, flaps), the slots the cover's text goes in with the text each has, the design's items placed on the sheet (text boxes, pictures, logos, effects, finishes) and the issues building it raised. The front and the spine the text leaves empty take the title, subtitle and author from the book's metadata. Versions and the cover's design are settings: sandbox_set_config writes production.versions and cover (cover.textBoxes, cover.elements, cover.finishes…); the cover's text is written with sandbox_cover_write_text.",
    inputSchema: { type: 'object', properties: { version: VERSION_PARAM, sheet: SHEET_PARAM }, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async (args) => {
      const { s, version, sheet, built: b } = built(host, args);
      const texts = coverSlotTexts(s.coverMarkdown);
      const slots = coverTextSlots(b.sheet.zones.map((z) => z.name), s.config.cover?.textBoxes);
      return {
        versions: bookVersions(s.config).map((v) => ({ id: v.id, name: v.name, binding: v.binding, ...(v.isbn ? { isbn: v.isbn } : {}) })),
        version: version.id,
        sheet,
        sheets: SHEETS.filter((k) => k === 'cover' || (k === 'jacket' ? !!b.sheets.jacket : !!b.sheets.endpapers)),
        size: { widthMm: mm(b.sheet.width), heightMm: mm(b.sheet.height), spineMm: mm(b.sheet.spine), pages: b.sheets.spine.pages },
        zones: b.sheet.zones.map((z) => ({ name: z.name, xMm: mm(z.rect.x), yMm: mm(z.rect.y), widthMm: mm(z.rect.width), heightMm: mm(z.rect.height) })),
        slots: slots.map((slot) => ({ slot, text: texts[slot] ?? null })),
        ...(Object.keys(texts).some((k) => !slots.includes(k)) ? { otherSlots: Object.keys(texts).filter((k) => !slots.includes(k)) } : {}),
        items: designerItems(s.config.cover, b.sheet).map((i) => ({ layer: i.layer, id: i.id, kind: i.kind, ...(i.rect ? { rectMm: { x: mm(i.rect.x), y: mm(i.rect.y), width: mm(i.rect.width), height: mm(i.rect.height) } } : {}) })),
        issues: b.issues,
      };
    },
  };

  const writeText: WebMcpTool = {
    name: 'sandbox_cover_write_text',
    title: 'Sandbox: write the cover\'s text',
    description: "Write the text of one slot of the print cover, as the Cover panel's Texts do: a panel of the sheet (back for the blurb, front, spine, flapFront and flapBack for the flaps, pastedown and flyleaf on an endpaper) or a text box of the cover's design (cover.textBoxes, by name). The text is Markdown, laid out in the cover's typography (the book's paragraph styles, cover-title, cover-subtitle, cover-author and cover-spine among them). Writing the front or the spine replaces the title, subtitle and author they take from the metadata; text null removes the slot's text, which brings them back. One cover text serves every version and sheet. The change is one step of the undo history (sandbox_undo). Answers with the slots and their texts.",
    inputSchema: {
      type: 'object',
      properties: {
        slot: { type: 'string', description: 'The panel or text box, as sandbox_cover_get lists it in slots.' },
        text: { type: ['string', 'null'], description: 'Its Markdown; null removes it.' },
        version: VERSION_PARAM,
        sheet: SHEET_PARAM,
      },
      required: ['slot', 'text'],
      additionalProperties: false,
    },
    execute: async (args) => {
      const { s, built: b } = built(host, args);
      const slot = args.slot as string;
      const slots = coverTextSlots(b.sheet.zones.map((z) => z.name), s.config.cover?.textBoxes);
      if (!slots.includes(slot)) throw new ToolError(`This sheet has no slot ${JSON.stringify(slot)}. Its slots: ${slots.join(', ')}. A text box is added to cover.textBoxes with sandbox_set_config first.`);
      const text = args.text as string | null;
      const next = setCoverSlotText(s.coverMarkdown, slot, text === null ? null : String(text));
      const after = await dispatchAndWait(host, { type: 'SET_COVER_MARKDOWN', payload: next });
      const texts = coverSlotTexts(after.coverMarkdown);
      return { slots: slots.map((name) => ({ slot: name, text: texts[name] ?? null })) };
    },
  };

  const exportCover: WebMcpTool = {
    name: 'sandbox_cover_export',
    title: 'Sandbox: export the print cover',
    description: "Write a sheet of the print cover as the Cover panel does: pdf, the whole sheet for the printer (back, spine and front with the flaps, the bleed and the fold marks, written with the book's PDF settings: colour space, output profile, PDF/X), answered with the preflight's findings; or jpeg, one panel as a picture (zone: front by default, back, spine, a flap) with its long side in px. The file is downloaded by the reader's browser, or handed back base64-encoded with deliver: \"data\".",
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['pdf', 'jpeg'] },
        version: VERSION_PARAM,
        sheet: SHEET_PARAM,
        zone: { type: 'string', enum: ZONES, description: 'jpeg: the panel (default front).' },
        longSide: { type: 'integer', minimum: 200, maximum: 6000, description: 'jpeg: the picture\'s long side in px (default 2400).' },
        deliver: { type: 'string', enum: ['download', 'data'], description: 'download (default) saves the file through the browser; data hands it back in the result.' },
      },
      required: ['format'],
      additionalProperties: false,
    },
    execute: async (args) => {
      const { book, version, sheet } = built(host, args);
      const format = args.format as 'pdf' | 'jpeg';
      let clients = 0;
      const laid = await layOutPrintedCover(book, {
        build: (content, config) => host.layout.build({ clientId: `webmcp:cover:${++clients}`, priority: 'preview', content, config }),
        fonts: async (config, markdown, doc) => { if (!doc) await ensureConfigFontsLoaded(config, markdown); },
      }, { version: version.id, sheet });
      if (!laid) throw new ToolError('The cover could not be laid out.');
      let file: { name: string; bytes: Uint8Array; mime: string };
      let about: Record<string, unknown> = {};
      if (format === 'pdf') {
        const worker = createPdfWorker();
        try {
          const { bytes, findings } = await writeCoverPdf(laid.built, laid.doc, worker, createPdfFontProvider());
          file = { name: `${coverFileName(`${version.id}-${sheet}`)}.pdf`, bytes, mime: 'application/pdf' };
          const { labels, locale } = store.getSnapshot();
          about = { findings: findings.map((f) => ({ kind: f.payload.kind, title: titleFor(f.payload, labels), detail: detailFor(f.payload, labels, locale) })) };
        } finally {
          worker.dispose();
        }
      } else {
        const zone = (args.zone as string | undefined) ?? 'front';
        const canvas = paintCoverZone(laid.built, laid.doc, zone, (args.longSide as number | undefined) ?? 2400);
        if (!canvas) throw new ToolError(`The ${sheet} has no ${zone}. Its panels: ${laid.built.sheet.zones.map((z) => z.name).join(', ')}.`);
        const bytes = await canvasJpeg(canvas);
        about = { widthPx: canvas.width, heightPx: canvas.height };
        canvas.width = 0;
        canvas.height = 0;
        if (!bytes) throw new ToolError('The picture could not be painted.');
        file = { name: `${coverFileName(`${version.id}-${zone}`)}.jpg`, bytes, mime: 'image/jpeg' };
      }
      const answer = { format, version: version.id, sheet, file: file.name, bytes: file.bytes.byteLength, mimeType: file.mime, ...about };
      if (args.deliver === 'data') {
        if (file.bytes.byteLength > MAX_DATA_BYTES) throw new ToolError(`The ${format} is ${Math.round(file.bytes.byteLength / 1048576)} MB, too large to hand back in a result; ask for it as a download.`);
        return { ...answer, base64: toBase64(file.bytes) };
      }
      downloadBytes(file.bytes, file.name, file.mime);
      return { ...answer, downloaded: true };
    },
  };

  return [get, writeText, exportCover];
}
