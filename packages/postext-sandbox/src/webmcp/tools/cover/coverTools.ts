// The book's print cover for an agent (#1669): what the Cover panel shows
// of a version's sheet (its size, spine, panels, texts and the design's
// items), the cover's text written into a panel or a text box, and the
// sheet written as a PDF or a panel as a picture. The versions and the
// cover's design are settings: sandbox_set_config writes them
// (production.versions, cover). A case, a jacket or an endpaper may take a
// design of its own and texts of its own (#1673), and the collection's
// catalogue and this book's volume are the book's (production.collection).

import type { CoverSheetKind, CoverSheetName } from 'postext/production';
import { buildCover, coverSheetNames } from 'postext/production';
import { createPdfWorker } from 'postext-pdf/worker';
import { ensureConfigFontsLoaded } from '../../../controls/fonts/fontLoader.js';
import { withHyphenationLocale } from '../../../controls/language/hyphenation.js';
import { bookVersions, coverBuildInput, pickVersion, type CoverBook } from '../../../cover/coverInput.js';
import { coverFileName, writeCoverPdf } from '../../../cover/coverPdf.js';
import { coverSlotTexts, coverTextSlots, setCoverSlotText } from '../../../cover/coverText.js';
import { designerItems } from '../../../cover/designer/designerModel.js';
import { chooseSheetDesign, designOf, sheetDesignChoices, sheetDesignTarget, withDesign } from '../../../cover/sheetDesign.js';
import { catalogueIdValid } from '../../../cover/collection.js';
import { productionPatch, setCollection } from '../../../cover/versions.js';
import { canvasJpeg, paintCoverZone } from '../../../cover/paintCover.js';
import { layOutPrintedCover } from '../../../cover/printedCover.js';
import type { SandboxState } from '../../../context/SandboxContext.js';
import { downloadBytes } from '../../../storage/persistence.js';
import { createPdfFontProvider } from '../../../viewport/pdf/pdfFontProvider.js';
import { dispatchAndWait, type SandboxToolHost } from '../../host.js';
import { ToolError, type WebMcpTool } from '../../modelContext.js';
import { MAX_DATA_BYTES, toBase64 } from '../library.js';
import { detailFor, titleFor } from '../../../sidebar/WarningsPanel.js';

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
  // The names the sheet answers to (case, cover…), the design it is drawn
  // with: its own (cover.sheets) when it has one, else the book's.
  const names = coverSheetNames(sheet, out.sheet);
  const target = sheetDesignTarget(s.config.cover, names);
  return { s, book, version, sheet, built: out, names, target, design: designOf(s.config.cover, target) };
}

/** The names a sheet's own texts are written for; none on a paperback's
 *  cover, whose texts are the shared ones. */
const ownTextNames = (names: readonly CoverSheetName[]) => (names[0] === 'cover' ? undefined : names);

function slotList(markdown: string | undefined, slots: readonly string[], names: readonly CoverSheetName[]) {
  const texts = coverSlotTexts(markdown);
  const own = ownTextNames(names);
  const mine = own ? coverSlotTexts(markdown, own) : {};
  return slots.map((slot) => ({ slot, text: texts[slot] ?? null, ...(own && slot in mine ? { sheetText: mine[slot] } : {}) }));
}

export function coverTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;
  const get: WebMcpTool = {
    name: 'sandbox_cover_get',
    title: 'Sandbox: read the print cover',
    description: "Read the print cover of one of the book's versions, as the Cover panel shows it: the versions (id, name, binding, ISBN), the sheet's size in mm with its spine (measured from the book's pages and paper), the sheets the version has (cover, a hardcover's jacket, endpapers), each panel's rectangle on the sheet in mm (front, back, spine, flaps), the slots the cover's text goes in with the shared text each has (and sheetText, the text a case, jacket or endpaper has for itself alone), the design the sheet is drawn with (design.uses: book, or the name of its own in cover.sheets: case, jacket, endpapers, endpaperFront, endpaperBack; design.choices: the own designs it may take), that design's items placed on the sheet (text boxes, pictures, logos, effects, finishes, catalogues), the collection (name, ISBN, catalogue of titles with id, title and picture resource, and volume: the title that is this book) and the issues building it raised. The front and the spine the text leaves empty take the title, subtitle and author from the book's metadata. Versions and the cover's design are settings: sandbox_set_config writes production.versions, production.collection and cover (cover.textBoxes, cover.elements, cover.sheets…); sandbox_cover_sheet_design gives a sheet a design of its own, sandbox_cover_set_collection writes the catalogue and the volume, and the cover's text is written with sandbox_cover_write_text.",
    inputSchema: { type: 'object', properties: { version: VERSION_PARAM, sheet: SHEET_PARAM }, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async (args) => {
      const { s, version, sheet, built: b, names, target, design } = built(host, args);
      const texts = coverSlotTexts(s.coverMarkdown);
      const slots = coverTextSlots(b.sheet.zones.map((z) => z.name), design.textBoxes);
      const collection = s.config.production?.collection;
      return {
        versions: bookVersions(s.config).map((v) => ({ id: v.id, name: v.name, binding: v.binding, ...(v.isbn ? { isbn: v.isbn } : {}) })),
        version: version.id,
        sheet,
        sheets: SHEETS.filter((k) => k === 'cover' || (k === 'jacket' ? !!b.sheets.jacket : !!b.sheets.endpapers)),
        size: { widthMm: mm(b.sheet.width), heightMm: mm(b.sheet.height), spineMm: mm(b.sheet.spine), pages: b.sheets.spine.pages },
        zones: b.sheet.zones.map((z) => ({ name: z.name, xMm: mm(z.rect.x), yMm: mm(z.rect.y), widthMm: mm(z.rect.width), heightMm: mm(z.rect.height) })),
        slots: slotList(s.coverMarkdown, slots, names),
        ...(Object.keys(texts).some((k) => !slots.includes(k)) ? { otherSlots: Object.keys(texts).filter((k) => !slots.includes(k)) } : {}),
        design: { uses: target ?? 'book', choices: sheetDesignChoices(names), ...(s.config.cover?.sheets ? { sheetDesigns: Object.keys(s.config.cover.sheets) } : {}) },
        ...(collection ? { collection } : {}),
        items: designerItems(design, b.sheet).map((i) => ({ layer: i.layer, id: i.id, kind: i.kind, ...(i.rect ? { rectMm: { x: mm(i.rect.x), y: mm(i.rect.y), width: mm(i.rect.width), height: mm(i.rect.height) } } : {}) })),
        issues: b.issues,
      };
    },
  };

  const writeText: WebMcpTool = {
    name: 'sandbox_cover_write_text',
    title: 'Sandbox: write the cover\'s text',
    description: "Write the text of one slot of the print cover, as the Cover panel's Texts do: a panel of the sheet (back for the blurb, front, spine, flapFront and flapBack for the flaps, pastedown and flyleaf on an endpaper) or a text box of the cover's design (cover.textBoxes, by name). The text is Markdown, laid out in the cover's typography (the book's paragraph styles, cover-title, cover-subtitle, cover-author and cover-spine among them). Writing the front or the spine replaces the title, subtitle and author they take from the metadata; text null removes the slot's text, which brings them back. One cover text serves every version and sheet; with thisSheetOnly true the text is written for the sheet asked for alone (a frame with sheet=\"case\", \"jacket\", \"endpaperFront\"…, on a case, a jacket or an endpaper), which takes the shared text's place there, and null removes it. The change is one step of the undo history (sandbox_undo). Answers with the slots and their texts.",
    inputSchema: {
      type: 'object',
      properties: {
        slot: { type: 'string', description: 'The panel or text box, as sandbox_cover_get lists it in slots.' },
        text: { type: ['string', 'null'], description: 'Its Markdown; null removes it.' },
        thisSheetOnly: { type: 'boolean', description: 'Write the text of this sheet alone (a case, a jacket or an endpaper), not the one every sheet shares. Default false.' },
        version: VERSION_PARAM,
        sheet: SHEET_PARAM,
      },
      required: ['slot', 'text'],
      additionalProperties: false,
    },
    execute: async (args) => {
      const { s, sheet, built: b, names, design } = built(host, args);
      const slot = args.slot as string;
      const slots = coverTextSlots(b.sheet.zones.map((z) => z.name), design.textBoxes);
      if (!slots.includes(slot)) throw new ToolError(`This sheet has no slot ${JSON.stringify(slot)}. Its slots: ${slots.join(', ')}. A text box is added to cover.textBoxes with sandbox_set_config first.`);
      const own = args.thisSheetOnly === true ? ownTextNames(names) : undefined;
      if (args.thisSheetOnly === true && !own) throw new ToolError(`The ${sheet} of this version is the book's cover itself: its texts are the shared ones. A case, a jacket or an endpaper takes texts of its own.`);
      const text = args.text as string | null;
      const next = setCoverSlotText(s.coverMarkdown, slot, text === null ? null : String(text), own);
      const after = await dispatchAndWait(host, { type: 'SET_COVER_MARKDOWN', payload: next });
      return { slots: slotList(after.coverMarkdown, slots, names) };
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

  const sheetDesign: WebMcpTool = {
    name: 'sandbox_cover_sheet_design',
    title: 'Sandbox: a sheet\'s own cover design',
    description: "Choose the design a sheet of a hardcover is drawn with, as the Cover panel's \"Design of this sheet\" does: book (the book's cover design; the sheet's own is dropped), or one of its own in cover.sheets (own: the case's or the jacket's, or this endpaper's alone; endpapers: one for both endpapers), started as a copy of the book's when it has none. patch then changes fields of the design the sheet is drawn with (background, image, zones, elements, textBoxes…; null removes a field), so { \"image\": null, \"background\": { \"hex\": \"#24452f\", \"model\": \"hex\" } } gives a case a plain cloth ground. The designer then edits that design while the sheet is shown. One step of the undo history (sandbox_undo). Answers with the design the sheet uses and its fields.",
    inputSchema: {
      type: 'object',
      properties: {
        version: VERSION_PARAM,
        sheet: SHEET_PARAM,
        design: { type: 'string', enum: ['book', 'own', 'endpapers'], description: 'book, own or (on an endpaper) endpapers. Left out: the design the sheet has now.' },
        patch: { type: 'object', description: 'Fields of the sheet\'s design to set (null removes one); with design book, the book\'s cover design is changed.' },
      },
      additionalProperties: false,
    },
    execute: async (args) => {
      const { s, sheet, names } = built(host, args);
      const choices = sheetDesignChoices(names);
      let cover = s.config.cover;
      if (args.design !== undefined) {
        const want = args.design as 'book' | 'own' | 'endpapers';
        if (want !== 'book' && choices.length === 0) throw new ToolError(`The ${sheet} of this version is the book's cover itself: its design is the book's (cover).`);
        if (want === 'endpapers' && !choices.includes('endpapers')) throw new ToolError('design endpapers is for an endpaper sheet (endpaperFront or endpaperBack).');
        cover = chooseSheetDesign(cover, names, want === 'book' ? null : want === 'endpapers' ? 'endpapers' : choices[0]!);
      }
      const target = sheetDesignTarget(cover, names);
      const patch = args.patch as Record<string, unknown> | undefined;
      if (patch) {
        if ('sheets' in patch) throw new ToolError('patch changes one design; cover.sheets is set with sandbox_set_config.');
        const next: Record<string, unknown> = { ...designOf(cover, target), ...patch };
        for (const [k, v] of Object.entries(next)) if (v === null || v === undefined) delete next[k];
        cover = withDesign(cover, target, next);
      }
      if (cover === s.config.cover) return { sheet, uses: target ?? 'book', choices, design: designOf(cover, target) };
      const after = await dispatchAndWait(host, { type: 'UPDATE_CONFIG', payload: { cover }, history: { merge: false } });
      const uses = sheetDesignTarget(after.config.cover, names);
      return { sheet, uses: uses ?? 'book', choices, design: designOf(after.config.cover, uses) };
    },
  };

  const setCollectionTool: WebMcpTool = {
    name: 'sandbox_cover_set_collection',
    title: 'Sandbox: the collection\'s catalogue',
    description: "Write the collection the book belongs to, as the Cover panel's Collection does: its name and ISBN, its catalogue (the titles in order, each { id, title, resource? }: an id of letters, digits, - and _, the title, and a picture of the book's resources by id) and its volume (the catalogue id that is this book, null for none). ::catalogue in the cover's text sets the titles as a list (cover-catalogue, this book in cover-catalogue-current), and a cover element of kind catalogue lays out their pictures in a grid (columns, gap, first, last, stroke outlining this book). A field left out stays as it is; catalogue replaces the whole list. One step of the undo history. Answers with the collection.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        isbn: { type: ['string', 'null'] },
        catalogue: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, resource: { type: 'string' } }, required: ['id', 'title'], additionalProperties: false },
        },
        volume: { type: ['string', 'null'], description: 'The catalogue id that is this book.' },
      },
      additionalProperties: false,
    },
    execute: async (args) => {
      const s = store.getSnapshot();
      const production = s.config.production;
      const next: Record<string, unknown> = { name: '', ...production?.collection };
      if (args.name !== undefined) next.name = String(args.name);
      if (args.isbn !== undefined) next.isbn = args.isbn === null || args.isbn === '' ? undefined : String(args.isbn);
      if (args.catalogue !== undefined) {
        const list = args.catalogue as { id: string; title: string; resource?: string }[];
        const seen = new Set<string>();
        for (const e of list) {
          if (!catalogueIdValid(e.id)) throw new ToolError(`Catalogue id ${JSON.stringify(e.id)}: letters, digits, - and _ only.`);
          if (seen.has(e.id)) throw new ToolError(`Catalogue id ${JSON.stringify(e.id)} is used twice.`);
          seen.add(e.id);
          if (e.resource && !s.resources.some((r) => r.id === e.resource)) throw new ToolError(`No resource ${JSON.stringify(e.resource)} in the book. Its pictures: ${s.resources.filter((r) => r.kind === 'bitmap' || r.kind === 'svg').map((r) => r.id).join(', ') || 'none'}.`);
        }
        next.catalogue = list.length > 0 ? list.map((e) => ({ id: e.id, title: e.title, ...(e.resource ? { resource: e.resource } : {}) })) : undefined;
      }
      if (args.volume !== undefined) next.volume = args.volume === null ? undefined : String(args.volume);
      const catalogue = (next.catalogue as { id: string }[] | undefined) ?? [];
      if (next.volume !== undefined && !catalogue.some((e) => e.id === next.volume)) {
        if (args.volume !== undefined) throw new ToolError(`No title ${JSON.stringify(next.volume)} in the catalogue. Its ids: ${catalogue.map((e) => e.id).join(', ') || 'none'}.`);
        delete next.volume;
      }
      for (const [k, v] of Object.entries(next)) if (v === undefined) delete next[k];
      const after = await dispatchAndWait(host, { type: 'UPDATE_CONFIG', payload: productionPatch(setCollection(production, next as never)), history: { merge: false } });
      return { collection: after.config.production?.collection ?? null };
    },
  };

  return [get, writeText, exportCover, sheetDesign, setCollectionTool];
}
