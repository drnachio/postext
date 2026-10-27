// The book's resources (pictures, diagrams, tables, videos) and its own
// fonts: what the Resources and Fonts panels do, done with the functions
// the panels call.

import { type ScoreFormat, type Resource, DEFAULT_COLOR_PALETTE, scoreFormatOfFile, bitmapInfo, type CustomFontFamily, type CustomFontVariant } from 'postext';
import type { SandboxAction } from '../../context/SandboxContext.js';
import { fontFamilySource, loadFont } from '../../controls/fonts/fontLoader.js';
import { fetchGoogleFonts } from '../../controls/fonts/FontPicker.js';
import { invalidateResourceImage } from '../../controls/media/resourceImages.js';
import { ensureSvgTextIndex } from '../../controls/media/svgTextIndex.js';
import { typesWithVideo, typesWithExample, newResource, bitmapReplaced, svgReplaced, svgSourceSaved, bitmapWithResolution, bitmapAtFileResolution, svgWithInlineFonts, isPdfBytes, renameResource } from '../../panels/resources/resourceEdits.js';
import { slugify, uniqueSlug } from '../../panels/resources/slugify.js';
import { readSvgFaces } from '../../panels/resources/svg/svgFaces.js';
import { isValidSvg, svgIntrinsicSize } from '../../panels/resources/svg/svgIntrinsic.js';
import { resourceFromFile } from '../../panels/resources/uploads/uploadFiles.js';
import { videoFormatOf } from '../../panels/resources/video/videoMedia.js';
import { bookFontFamilies } from '../../sidebar/BookFonts.js';
import { familiesRenamed, familiesWithFace, familiesWithoutFace } from '../../sidebar/FontsPanel.js';
import { getBlob, putBlob, deleteBlob } from '../../storage/blobStore.js';
import { deleteFontFile, formatFromFilename, generateFontFileId, putFontFile } from '../../storage/fontStorage.js';
import { mergePatch } from '../configPaths.js';
import { FILE_PARAM, type FileInput, readFileInput } from '../fileInput.js';
import { type SandboxToolHost, dispatchAndWait } from '../host.js';
import { type WebMcpTool, ToolError } from '../modelContext.js';
import { MARKS_SCHEMA, type MarksInput, withMarks } from '../resourceMarks.js';
import { readSvgSymbols, addZones } from '../../panels/resources/svg/svgSymbols.js';
import { renameResourceInText, renameResourceInResources, configPathsNaming } from '../resourceRefs.js';
import { TABLE_SCHEMA, type TableInput, hasTableContent, buildTable } from '../resourceTable.js';
import { VIDEO_SCHEMA, type VideoInput, withVideoEdits } from '../resourceVideo.js';
import { layoutAnswer } from './book.js';
import { tableRows, typesOf, sizeOf, PLACEMENT_SCHEMA, defined, withPlacement, faceOf, settingsNaming } from './resources/schema.js';

export { readFileInput, type FileInput } from '../fileInput.js';

export function resourceTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const listResources: WebMcpTool = {
    name: 'sandbox_list_resources',
    title: 'Sandbox: the book\'s resources',
    description: 'The pictures, diagrams, tables, videos and music examples of the book, which the text places with ::resource{id="…"} and cites with :ref{id="…"}: each one\'s id, kind, type, caption, size and how often the text uses it. With an id: that resource in full — its record (a table\'s cells with their formatting under resource.table.model.rows, which sandbox_save_resource takes back as table.cells; a picture\'s marks; a video\'s source and player), the source of an SVG and what became of the fonts its text names, the texts of a table\'s cells as rows.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Give this resource in full.' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (args) => {
      const s = store.getSnapshot();
      const text = s.chapters.map((c) => c.markdown).join('\n');
      const uses = (id: string): number => text.split(`id="${id}"`).length - 1;
      if (args.id !== undefined) {
        const resource = s.resources.find((r) => r.id === args.id);
        if (!resource) throw new ToolError(`No resource with id ${JSON.stringify(args.id)}. The ids: ${s.resources.map((r) => r.id).join(', ') || 'none'}.`);
        const answer: Record<string, unknown> = { resource, usedInText: uses(resource.id) };
        if (resource.kind === 'svg' && resource.svg) {
          const blob = await getBlob(resource.svg.fileId).catch(() => null);
          if (blob) answer.svg = new TextDecoder().decode(blob.bytes);
          // What the detail pane lists under the picture's fonts: each face
          // its text names, embedded when the document and the picture
          // both say so, else only named.
          const embedded = s.config.diagramStyle?.inlineFonts !== false && resource.svg.inlineFonts !== false;
          try {
            answer.fonts = { embedded, faces: await readSvgFaces(resource.svg.fileId, embedded) };
          } catch {
            answer.fonts = { embedded, unavailable: 'The faces could not be read here.' };
          }
        }
        if (resource.kind === 'table' && resource.table) {
          answer.rows = tableRows(resource.table.model);
          answer.tableStyles = (s.config.tableStyles ?? []).map((t) => ({ id: t.id, ...(t.name ? { name: t.name } : {}) }));
        }
        if (resource.kind === 'score' && resource.score) {
          // The styles a score can be set in (#1173).
          answer.scoreStyles = (s.config.scoreStyles ?? []).map((t) => ({ id: t.id, ...(t.name ? { name: t.name } : {}) }));
        }
        return answer;
      }
      return {
        types: typesOf(s).map((t) => ({ id: t.id, name: t.name })),
        resources: s.resources.map((r) => ({
          id: r.id,
          kind: r.kind,
          type: r.typeId,
          ...(r.caption ? { caption: r.caption } : {}),
          ...(sizeOf(r) ? { size: sizeOf(r) } : {}),
          ...(r.kind === 'table' && r.table ? { rows: r.table.model.rows.length, columns: r.table.model.rows[0]?.length ?? 0 } : {}),
          ...(r.kind === 'video' && r.video ? { source: r.video.source } : {}),
          ...(r.kind === 'score' && r.score ? { format: r.score.format, ...(r.score.styleId ? { styleId: r.score.styleId } : {}) } : {}),
          usedInText: uses(r.id),
        })),
      };
    },
  };

  const saveResource: WebMcpTool = {
    name: 'sandbox_save_resource',
    title: 'Sandbox: add or change a resource',
    description: 'Add a resource to the book or change one, as the Resources panel does. A new resource takes a picture file (PNG, JPEG, WebP, GIF or SVG, by url or base64), the source of an SVG, a table, a video (a YouTube or Vimeo link, a video file, or the address of one), or a music score (notation in ABC, MusicXML, MEI or Humdrum). An existing id changes what is given and keeps the rest: its content (a replaced picture keeps its declared resolution, its print master and its marks; an edited svg source detaches the print master, which was made for the old drawing), its caption, note, alternative text, type and placement, a bitmap\'s resolution, an SVG\'s print master and fonts, a table\'s cells and style, a picture\'s safe area and lettering marks, a video\'s poster, range and player, and its id (newId, which also renames it where the book refers to it). The text places it with ::resource{id="…"}. Answers with the stored record and the pages the book came to.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The resource to change, or the id to give a new one (letters, digits, hyphens). A new resource without one is named after its file or caption.' },
        newId: { type: 'string', description: 'Another id for the resource named by id (letters, digits, hyphens; it is written as a slug).' },
        updateReferences: { type: 'boolean', description: 'With newId: also rewrite the id where the book refers to it — ::resource, :ref and \\ref marks and comic panels (art=) in every chapter, :ref marks in the other resources\' captions, notes and table cells, and the table cells that show it (default true). The Resources panel renames without it. Settings of the design that name the id are listed in the answer, not changed.' },
        type: { type: 'string', description: 'The resource type id (figure, table, video, or one the book defines); it decides the numbering and the caption label.' },
        caption: { type: 'string' },
        note: { type: 'string', description: 'A note set under the caption (a source, a credit).' },
        altText: { type: 'string', description: 'What the picture shows, for readers who cannot see it.' },
        image: { ...FILE_PARAM, description: 'A picture file (PNG, JPEG, WebP, GIF or SVG): where to fetch it (url) or its bytes (base64).' },
        svg: { type: 'string', description: 'The source of an SVG drawing. On an SVG resource it is an edit of its source.' },
        table: TABLE_SCHEMA,
        video: VIDEO_SCHEMA,
        score: {
          type: 'object',
          description: 'A music example (#1172): its notation, typed (source and format) or read from a file (.abc, .musicxml, .mei, .krn), and the named score style it is set in. A new score gets the Example type unless "type" names another. On a score resource, what is given changes and the rest is kept.',
          properties: {
            format: { type: 'string', enum: ['abc', 'musicxml', 'mei', 'humdrum'], description: 'The notation format (read from the file name when a file is given).' },
            source: { type: 'string', description: 'The notation.' },
            file: { ...FILE_PARAM, description: 'A notation file whose text becomes the source: where to fetch it (url) or its bytes (base64).' },
            styleId: { type: ['string', 'null'], description: 'A score style of the book (scoreStyles); null sets it in the document score style.' },
          },
          additionalProperties: false,
        },
        placement: PLACEMENT_SCHEMA,
        resolution: { type: ['number', 'string', 'null'], description: 'A bitmap\'s resolution in pixels per inch, which sets its natural print size: a number (1 to 4800), "file" for the one its file states, or null to leave it to the book\'s layout.bitmapResolution setting.' },
        embedFonts: { type: 'boolean', description: 'An SVG: embed the fonts its text names when the picture is shown or exported, as the book\'s diagramStyle.inlineFonts says (true, the default), or keep its markup as it is (false).' },
        printMaster: { ...FILE_PARAM, type: ['object', 'null'], description: 'An SVG\'s print master: a single-page PDF of the same figure, which the PDF export embeds in place of the SVG (url or base64). null removes it.' },
        marks: MARKS_SCHEMA,
        fields: { type: 'object', description: 'Any other fields of the resource record, merged in member by member (objects merge, null removes a member, anything else replaces): one field of bitmap, svg, video or table can be set without restating the rest. Not checked; id, kind and createdAt are never changed.' },
        wait: { type: 'boolean', description: 'Wait for the book to be laid out again (default true).' },
      },
      additionalProperties: false,
    },
    // The record it answers with carries the book's captions, and a
    // video's title as its platform gives it.
    annotations: { untrustedContentHint: true },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const now = Date.now();
      const existing = args.id !== undefined ? s.resources.find((r) => r.id === args.id) : undefined;
      const ids = new Set(s.resources.map((r) => r.id));
      const tableInput = args.table as TableInput | undefined;
      const videoInput = args.video as VideoInput | undefined;
      const scoreInput = args.score as { format?: ScoreFormat; source?: string; file?: FileInput; styleId?: string | null } | undefined;
      // What replaces the content: a table's members may also only change
      // the table that is there, and a video's the video.
      const tableContent = tableInput !== undefined && (hasTableContent(tableInput) || existing?.kind !== 'table');
      const contents = [args.image !== undefined, args.svg !== undefined, tableContent, videoInput !== undefined, scoreInput !== undefined].filter(Boolean).length;
      if (contents > 1 || (contents === 1 && tableInput !== undefined && !tableContent)) throw new ToolError('Give one content: an image, an svg source, a table, a video or a score.');
      if (existing && scoreInput !== undefined && existing.kind !== 'score') {
        throw new ToolError(`${JSON.stringify(existing.id)} is a ${existing.kind} resource. A score is a resource of its own: add one with "score" and no id (or a new id).`);
      }
      if (!existing && contents === 0) {
        const needs = 'needs an image, an svg source or a table (or "video" for a video, "score" for a music example)';
        throw new ToolError(args.id !== undefined ? `No resource with id ${JSON.stringify(args.id)} to change; a new one ${needs}. The ids: ${[...ids].join(', ') || 'none'}.` : `A new resource ${needs}.`);
      }
      if (existing && videoInput !== undefined && existing.kind !== 'video') {
        throw new ToolError(`${JSON.stringify(existing.id)} is a ${existing.kind} resource. A video is a resource of its own: add one with "video" and no id (or a new id).`);
      }
      if (!existing && args.newId !== undefined) throw new ToolError('newId renames a resource the book has; give a new resource its id with "id".');

      let types = typesOf(s);
      const actions: SandboxAction[] = [];
      const notes: string[] = [];
      const answer: Record<string, unknown> = {};
      if (!existing && videoInput !== undefined && (args.type === undefined || args.type === 'video')) {
        // Videos are numbered in a sequence of their own: a book whose
        // types predate them gets the Video type with its first video.
        const withVideo = typesWithVideo(types, s.locale);
        if (withVideo) {
          types = withVideo;
          // The Video type comes with the video (#454): no step of its own.
          actions.push({ type: 'UPDATE_CONFIG', payload: { resourceTypes: withVideo }, history: false });
          answer.addedType = 'video';
        }
      }
      if (!existing && scoreInput !== undefined && (args.type === undefined || args.type === 'example')) {
        // Music examples are numbered in a sequence of their own (#1172).
        const withExample = typesWithExample(types, s.locale);
        if (withExample) {
          types = withExample;
          actions.push({ type: 'UPDATE_CONFIG', payload: { resourceTypes: withExample }, history: false });
          answer.addedType = 'example';
        }
      }
      if (args.type !== undefined && types.length > 0 && !types.some((t) => t.id === args.type)) {
        throw new ToolError(`No resource type ${JSON.stringify(args.type)}. The types: ${types.map((t) => t.id).join(', ')}.`);
      }
      const typeFor = (kind: 'table' | 'picture' | 'video' | 'score'): string => (args.type as string | undefined)
        ?? (kind === 'score' ? 'example' : kind === 'video' ? 'video' : kind === 'table' ? types.find((t) => t.id === 'table')?.id : types.find((t) => t.id === 'figure')?.id)
        ?? types.find((t) => t.id !== 'video')?.id
        ?? types[0]?.id
        ?? (kind === 'table' ? 'table' : 'figure');

      // The record the edits are laid on: the resource there is, or a new
      // one of the kind its content makes it.
      let base: Resource;
      let nameHint = '';
      /** The picture the previews hold for the resource, once it is replaced. */
      let stale: string | undefined;
      if (existing) base = { ...existing };
      else {
        const kind = videoInput !== undefined ? 'video' : scoreInput !== undefined ? 'score' : tableContent ? 'table' : 'picture';
        base = { ...newResource(kind === 'picture' ? 'bitmap' : kind, typeFor(kind), ids), createdAt: now };
        // A new table is built from what was handed over, not from the
        // empty grid the panel's "Add table" starts with.
        delete base.table;
      }

      if (args.image !== undefined) {
        const file = await readFileInput(args.image as FileInput, signal);
        if (videoFormatOf(file)) throw new ToolError(`"${file.name}" is a video file: hand it over as video: { file }.`);
        const made = await resourceFromFile(file, '', new Set());
        if (!made || (made.kind !== 'bitmap' && made.kind !== 'svg')) throw new ToolError(`That file is not a picture the Sandbox takes (${file.type || 'unknown type'}): PNG, JPEG, WebP, GIF or SVG.`);
        stale = existing?.bitmap?.fileId ?? existing?.svg?.fileId;
        base = defined({ ...base, ...(made.bitmap ? bitmapReplaced(base, made.bitmap) : svgReplaced(base, made.svg!)) });
        if (base.svg) base.svg = defined(base.svg);
        nameHint = file.name.replace(/\.[^.]+$/, '');
      } else if (args.svg !== undefined) {
        const source = args.svg as string;
        if (!isValidSvg(source)) throw new ToolError('The svg source does not parse as an SVG document (it needs an <svg> root in the SVG namespace).');
        const fileId = await putBlob(new TextEncoder().encode(source).buffer as ArrayBuffer, 'image/svg+xml');
        const size = svgIntrinsicSize(source);
        if (existing?.kind === 'svg' && existing.svg) {
          // An edit of the drawing's source, as the source editor saves it.
          stale = existing.svg.fileId;
          if (existing.svg.pdfFileId) answer.printMasterDetached = true;
          base = { ...base, ...svgSourceSaved(base, { fileId, ...size }) };
          base.svg = defined(base.svg!);
          try {
            ensureSvgTextIndex(fileId, source);
          } catch {
            // The previews index the text themselves when they decode it.
          }
        } else {
          stale = existing?.bitmap?.fileId;
          base = defined({ ...base, kind: 'svg', svg: { fileId, ...size }, bitmap: undefined, table: undefined, video: undefined });
        }
      } else if (tableInput !== undefined) {
        const table = buildTable(tableInput, existing?.kind === 'table' ? existing.table : undefined, {
          imageIds: new Set(s.resources.filter((r) => (r.kind === 'bitmap' && r.bitmap) || (r.kind === 'svg' && r.svg)).map((r) => r.id)),
          styleIds: (s.config.tableStyles ?? []).map((t) => t.id),
          palette: s.config.colorPalette ?? DEFAULT_COLOR_PALETTE,
        });
        base = defined({ ...base, kind: 'table', table, bitmap: undefined, svg: undefined, video: undefined });
      } else if (scoreInput !== undefined) {
        let source = scoreInput.source;
        let format = scoreInput.format;
        if (scoreInput.file !== undefined) {
          const file = await readFileInput(scoreInput.file, signal);
          source = await file.text();
          format ??= scoreFormatOfFile(file.name);
          nameHint = file.name.replace(/\.[^.]+$/, '');
        }
        const was = base.score ?? { format: 'abc' as const, source: '' };
        const score: NonNullable<Resource['score']> = { ...was, ...(format ? { format } : {}), ...(source !== undefined ? { source } : {}) };
        if (scoreInput.styleId === null) delete score.styleId;
        else if (scoreInput.styleId !== undefined) {
          if (!(s.config.scoreStyles ?? []).some((st) => st.id === scoreInput.styleId)) {
            notes.push(`No score style ${JSON.stringify(scoreInput.styleId)} in the book yet: the score is set in the document score style until one is added.`);
          }
          score.styleId = scoreInput.styleId;
        }
        base = defined({ ...base, kind: 'score', score });
      } else if (videoInput !== undefined) {
        const edited = await withVideoEdits(base, videoInput, { fresh: !existing, signal });
        if (edited.resource.video?.poster?.fileId !== existing?.video?.poster?.fileId) stale = existing?.video?.poster?.fileId;
        base = edited.resource;
        notes.push(...edited.notes);
        // A new video is named after its file, as a dropped one is.
        const fileName = videoInput.file?.fileName ?? (videoInput.file?.url && !videoInput.file.url.startsWith('data:') ? videoInput.file.url.split(/[?#]/)[0]!.split('/').pop() : undefined) ?? '';
        nameHint = fileName.replace(/\.[^.]+$/, '');
      }

      if (!existing) {
        const wanted = slugify((args.id as string | undefined) ?? nameHint) || slugify((args.caption as string | undefined) ?? '');
        base.id = uniqueSlug(wanted, ids, base.kind === 'table' ? 'table' : base.kind === 'video' ? 'video' : base.kind === 'score' ? 'score' : base.kind === 'svg' ? 'svg' : 'image');
      }
      if (args.type !== undefined) base.typeId = args.type as string;
      for (const key of ['caption', 'note', 'altText'] as const) {
        if (args[key] === undefined) continue;
        if (args[key] === '') delete base[key];
        else base[key] = args[key] as string;
      }
      if (args.placement !== undefined) {
        const placement = withPlacement(base.placement, args.placement as Record<string, unknown>);
        if (placement) base.placement = placement;
        else delete base.placement;
      }

      if (args.resolution !== undefined) {
        const bitmap = base.kind === 'bitmap' ? base.bitmap : undefined;
        if (!bitmap) throw new ToolError(`resolution is a bitmap's; ${JSON.stringify(base.id)} is a ${base.kind}.`);
        if (args.resolution === null) base.bitmap = bitmapWithResolution(bitmap, undefined);
        else if (typeof args.resolution === 'number') {
          if (!(args.resolution >= 1 && args.resolution <= 4800)) throw new ToolError('resolution is 1 to 4800 pixels per inch.');
          base.bitmap = bitmapWithResolution(bitmap, args.resolution);
        } else if (args.resolution === 'file') {
          // The resolution the record carries, else the one its file's
          // header states.
          const record = bitmap.fileResolution === undefined ? await getBlob(bitmap.fileId).catch(() => null) : null;
          const stated = bitmap.fileResolution ?? (record ? bitmapInfo(record.bytes)?.resolution?.x : undefined);
          if (stated === undefined) throw new ToolError('The file of this bitmap states no resolution. Give one as a number, or null to leave it to the book\'s layout.bitmapResolution setting.');
          base.bitmap = bitmapAtFileResolution(bitmap, stated);
        } else throw new ToolError('resolution is a number of pixels per inch, "file" or null.');
      }

      if (args.embedFonts !== undefined || args.printMaster !== undefined) {
        const svg = base.kind === 'svg' ? base.svg : undefined;
        if (!svg) throw new ToolError(`${args.embedFonts !== undefined ? 'embedFonts' : 'printMaster'} is an SVG's; ${JSON.stringify(base.id)} is a ${base.kind}.`);
        let next = svg;
        if (args.embedFonts !== undefined) {
          next = svgWithInlineFonts(next, args.embedFonts as boolean);
          if (s.config.diagramStyle?.inlineFonts === false) notes.push('The book embeds no fonts in its SVG pictures (diagramStyle.inlineFonts is off), whatever this picture says.');
        }
        if (args.printMaster !== undefined) {
          const previous = next.pdfFileId;
          if (args.printMaster === null) {
            if (previous) await deleteBlob(previous).catch(() => undefined);
            next = defined({ ...next, pdfFileId: undefined });
          } else {
            const file = await readFileInput(args.printMaster as FileInput, signal);
            const buffer = await file.arrayBuffer();
            if (!isPdfBytes(buffer)) throw new ToolError(`"${file.name}" is not a PDF file (it does not start with %PDF).`);
            const pdfFileId = await putBlob(buffer, 'application/pdf');
            if (previous) await deleteBlob(previous).catch(() => undefined);
            next = { ...next, pdfFileId };
            delete answer.printMasterDetached;
          }
        }
        base.svg = next;
      }

      if (args.marks !== undefined) {
        const input = args.marks as MarksInput;
        if (input.svgSymbols !== undefined) {
          // The drawing's own symbols become avoid zones, added to those the
          // call gives or the picture has (#994).
          const symbols = input.svgSymbols;
          if (base.kind !== 'svg' || !base.svg) throw new ToolError(`svgSymbols is an SVG's; ${JSON.stringify(base.id)} is a ${base.kind}.`);
          if (!symbols.idPrefix?.trim() && !symbols.className?.trim()) throw new ToolError('svgSymbols names the symbols by idPrefix or className.');
          const record = await getBlob(base.svg.fileId).catch(() => null);
          const found = record ? readSvgSymbols(new TextDecoder().decode(record.bytes), { idPrefix: symbols.idPrefix?.trim(), className: symbols.className?.trim() }) : undefined;
          if (!found) throw new ToolError('The drawing could not be measured here (it is not an SVG with a size, or this page has no document).');
          const merged = addZones(input.avoid ?? base.avoid ?? [], found);
          notes.push(merged.added > 0 ? `${merged.added} avoid zone${merged.added === 1 ? '' : 's'} added over the drawing's symbols.` : 'No element of the drawing matched that is not covered by a zone already.');
          input.avoid = merged.zones;
        }
        const { svgSymbols: _symbols, ...marksInput } = input;
        void _symbols;
        const marked = withMarks(base, marksInput, (s.config.labelStyles ?? []).map((l) => l.id));
        base = marked.resource;
        notes.push(...marked.notes);
      }
      if (args.fields !== undefined) {
        const { id: _id, kind: _kind, createdAt: _created, ...rest } = args.fields as Record<string, unknown>;
        void _id; void _kind; void _created;
        base = mergePatch(base, rest);
      }
      base.updatedAt = now;

      let id = base.id;
      if (args.newId !== undefined && existing) {
        const wanted = slugify(args.newId as string);
        if (!wanted) throw new ToolError(`${JSON.stringify(args.newId)} leaves no id: an id is made of letters and digits, with hyphens between words.`);
        if (wanted !== existing.id && ids.has(wanted)) throw new ToolError(`Another resource has the id ${JSON.stringify(wanted)}. The ids: ${[...ids].join(', ')}.`);
        if (wanted !== existing.id) {
          // The rename's own steps, gathered to be dispatched with the rest.
          const renamed = await renameResource(existing.id, { ...base, id: wanted }, s.resources, (action) => actions.push(action));
          base = renamed;
          id = renamed.id;
          const report: Record<string, unknown> = { from: existing.id, to: id };
          // The text as it stands, after the files this call read.
          const current = store.getSnapshot();
          if (args.updateReferences !== false) {
            let inText = 0;
            const chapters: number[] = [];
            current.chapters.forEach((c, i) => {
              const text = c.id === current.activeChapterId ? current.markdown : c.markdown;
              const changes = renameResourceInText(text, existing.id, id);
              if (changes.length === 0) return;
              inText += changes.length;
              chapters.push(i + 1);
              actions.push({ type: 'EDIT_CHAPTER_MARKDOWN', payload: { chapterId: c.id, changes, baseLength: text.length } });
            });
            const others = renameResourceInResources(current.resources, existing.id, id);
            for (const other of others) actions.push({ type: 'UPSERT_RESOURCE', payload: { ...other.resource, updatedAt: now } });
            report.referencesRewritten = inText + others.reduce((sum, o) => sum + o.count, 0);
            report.inChapters = chapters;
            if (others.length > 0) report.inResources = others.map((o) => o.resource.id);
          }
          const design = configPathsNaming(current.config, existing.id);
          if (design.length > 0) {
            report.designStillNames = design;
            notes.push(`The design still names ${JSON.stringify(existing.id)} at ${design.join(', ')}: set ${design.length > 1 ? 'them' : 'it'} to ${JSON.stringify(id)} with sandbox_set_config.`);
          }
          answer.renamed = report;
        }
      }
      // New marks on a resource that was there are a step of the undo
      // history (#866), as the Resources panel's are.
      if (!answer.renamed) actions.push({ type: 'UPSERT_RESOURCE', payload: base, ...(existing && args.marks !== undefined ? { history: { merge: false } } : {}) });
      await dispatchAndWait(host, actions);
      if (stale) invalidateResourceImage(stale);
      return {
        id,
        created: !existing,
        resource: base,
        use: `::resource{id="${id}"}`,
        ...answer,
        ...(notes.length > 0 ? { notes } : {}),
        ...(await layoutAnswer(host, args.wait, signal)),
      };
    },
  };

  const deleteResource: WebMcpTool = {
    name: 'sandbox_delete_resource',
    title: 'Sandbox: delete a resource',
    description: 'Delete a resource and its file from the book. It cannot be undone; places in the text that use it are left pointing at nothing and show up as warnings.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, wait: { type: 'boolean', description: 'Wait for the book to be laid out again (default true).' } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { consequentialHint: true },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const resource = s.resources.find((r) => r.id === args.id);
      if (!resource) throw new ToolError(`No resource with id ${JSON.stringify(args.id)}. The ids: ${s.resources.map((r) => r.id).join(', ') || 'none'}.`);
      const usedInText = s.chapters.map((c) => c.markdown).join('\n').split(`id="${resource.id}"`).length - 1;
      await dispatchAndWait(host, { type: 'DELETE_RESOURCE', payload: resource.id });
      const fileId = resource.bitmap?.fileId ?? resource.svg?.fileId ?? resource.video?.poster?.fileId;
      if (fileId) invalidateResourceImage(fileId);
      return { deleted: resource.id, stillUsedInText: usedInText, ...(await layoutAnswer(host, args.wait, signal)) };
    },
  };

  const listFonts: WebMcpTool = {
    name: 'sandbox_list_fonts',
    title: 'Sandbox: fonts',
    description: "The font families the book sets its text in — each with what it sets (body, headings, other) and where it comes from: custom (files uploaded into the book), google or fontsource (the open-font catalogue), or missing (no service has it, or its files were removed) —, the families uploaded into the book with their faces (weight, style, file), and, with search, families of the catalogue whose name matches. A family is put to use by writing its name into a fontFamily setting (bodyText.fontFamily, a heading style's, a paragraph style's) with sandbox_set_config; catalogue families load on demand.",
    inputSchema: {
      type: 'object',
      properties: { search: { type: 'string', description: 'Part of a family name to look up in the catalogue.' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async (args) => {
      const s = store.getSnapshot();
      const used = bookFontFamilies(s.config, s.chapters.map((c) => c.markdown));
      const custom = s.config.customFonts ?? [];
      // Where a family comes from is known once the loader has asked for
      // it, which the viewers do for the families on show.
      const pending = used.map((u) => u.family).filter((f) => fontFamilySource(f) === undefined && !custom.some((c) => c.name === f));
      if (pending.length > 0 && typeof document !== 'undefined') {
        await Promise.race([
          Promise.all(pending.map((f) => loadFont(f).catch(() => undefined))),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      }
      const answer: Record<string, unknown> = {
        inUse: used.map((u) => ({
          family: u.family,
          roles: [...(u.body ? ['body'] : []), ...(u.headings ? ['headings'] : []), ...(u.body || u.headings ? [] : ['other'])],
          source: fontFamilySource(u.family) ?? (custom.some((c) => c.name === u.family && c.variants.length > 0) ? 'custom' : 'unknown'),
        })),
        custom: custom.map((f) => ({
          family: f.name,
          faces: f.variants.map((v) => ({
            ...faceOf(v),
            // Two files for one weight and style: the Checks panel asks
            // for one of them to go.
            ...(f.variants.filter((o) => o.weight === v.weight && o.style === v.style).length > 1 ? { duplicate: true } : {}),
          })),
        })),
      };
      const search = (args.search as string | undefined)?.trim().toLowerCase();
      if (search) {
        const catalogue = await fetchGoogleFonts();
        const found = catalogue.filter((f) => f.family.toLowerCase().includes(search));
        answer.catalogue = found.slice(0, 50).map((f) => ({ family: f.family, subsets: f.subsets }));
        if (found.length > 50) answer.more = found.length - 50;
      }
      return answer;
    },
  };

  const saveFont: WebMcpTool = {
    name: 'sandbox_save_font',
    title: 'Sandbox: add, change or remove a custom font',
    description: "The book's own fonts, as the Fonts panel keeps them. add: upload a font file (WOFF2, WOFF, TTF or OTF, by url or base64) as one face — a weight and a style — of a custom family; a face of that weight and style already there is replaced, and the answer says so. update_face: give a face another weight or style. rename_family: give a family another name; the fontFamily settings that name the old one are listed, not changed. remove: take away a family, or its faces of a weight, a style or a file name. remove_all: take away every custom font. A removed face's file is deleted and cannot be brought back. A family's name is used like any other in a fontFamily setting, and travels with the book in its .postext file.",
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'update_face', 'rename_family', 'remove', 'remove_all'] },
        family: { type: 'string', description: 'The family name (every action but remove_all).' },
        weight: { type: 'integer', minimum: 1, maximum: 1000, description: 'add: the face\'s weight (default 400). update_face, remove: the faces of this weight.' },
        style: { type: 'string', enum: ['normal', 'italic'], description: 'add: the face\'s style (default normal). update_face, remove: the faces of this style.' },
        fileName: { type: 'string', description: 'update_face, remove: the face uploaded under this file name, as sandbox_list_fonts gives it.' },
        file: FILE_PARAM,
        newFamily: { type: 'string', description: 'rename_family: the family\'s new name.' },
        newWeight: { type: 'integer', minimum: 1, maximum: 1000, description: 'update_face: the weight the face is declared at.' },
        newStyle: { type: 'string', enum: ['normal', 'italic'], description: 'update_face: the style the face is declared as.' },
        wait: { type: 'boolean', description: 'Wait for the book to be laid out again (default true).' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const families: CustomFontFamily[] = [...(s.config.customFonts ?? [])];
      const write = async (next: CustomFontFamily[]): Promise<void> => {
        await dispatchAndWait(host, { type: 'UPDATE_CONFIG', payload: { customFonts: next.length > 0 ? next : undefined }, history: { merge: false } });
      };
      const facesOf = (list: readonly CustomFontFamily[], family: string) => (list.find((f) => f.name === family)?.variants ?? []).map(faceOf);
      if (args.action === 'remove_all') {
        const files = families.flatMap((f) => f.variants);
        await Promise.all(files.map((v) => deleteFontFile(v.fileId).catch(() => undefined)));
        await write([]);
        return { removedFamilies: families.map((f) => f.name), removedFaces: files.length, ...(await layoutAnswer(host, args.wait, signal)) };
      }
      const name = ((args.family as string | undefined) ?? '').trim();
      if (!name) throw new ToolError(`${args.action} needs the family's name (family).`);
      const at = families.findIndex((f) => f.name === name);
      if (args.action === 'add') {
        if (args.file === undefined) throw new ToolError('add needs the font file.');
        const file = await readFileInput(args.file as FileInput, signal);
        const format = formatFromFilename(file.name);
        if (!format) throw new ToolError(`"${file.name}" is not a font file the Sandbox takes: its name must end in .woff2, .woff, .ttf or .otf (give fileName when the URL has none).`);
        const fileId = generateFontFileId();
        await putFontFile({ fileId, fileName: file.name, format, buffer: await file.arrayBuffer() });
        const face: CustomFontVariant = { weight: (args.weight as number | undefined) ?? 400, style: (args.style as 'normal' | 'italic' | undefined) ?? 'normal', fileId, format, fileName: file.name };
        let replaced: CustomFontVariant[] = [];
        if (at < 0) families.push({ name, variants: [face] });
        else {
          // A face of the same weight and style is replaced, not doubled.
          replaced = families[at]!.variants.filter((v) => v.weight === face.weight && v.style === face.style);
          for (const v of replaced) await deleteFontFile(v.fileId).catch(() => undefined);
          families[at] = { ...families[at]!, variants: [...families[at]!.variants.filter((v) => !replaced.includes(v)), face] };
        }
        await write(families);
        return {
          family: name,
          faces: facesOf(families, name),
          ...(replaced.length > 0 ? { replaced: true, replacedFiles: replaced.map((v) => v.fileName ?? v.format) } : {}),
          ...(await layoutAnswer(host, args.wait, signal)),
        };
      }
      if (at < 0) throw new ToolError(`No custom family named ${JSON.stringify(name)}. The custom families: ${families.map((f) => f.name).join(', ') || 'none'}.`);
      const family = families[at]!;
      if (args.action === 'rename_family') {
        const wanted = ((args.newFamily as string | undefined) ?? '').trim();
        if (!wanted) throw new ToolError('rename_family needs the new name (newFamily).');
        if (wanted !== name && families.some((f) => f.name === wanted)) throw new ToolError(`Another custom family is named ${JSON.stringify(wanted)}.`);
        const next = familiesRenamed(families, name, wanted);
        if (!next) return { family: name, renamed: false, faces: facesOf(families, name) };
        await write(next);
        // The panel renames the family and nothing else: the settings that
        // name it keep the old name until they are set again.
        const stillNamedBy = settingsNaming(s.config, name);
        return {
          family: wanted,
          renamed: true,
          from: name,
          faces: facesOf(next, wanted),
          stillNamedBy,
          ...(stillNamedBy.length > 0 ? { note: `These settings still name ${JSON.stringify(name)}, which is no longer a family of the book: set them to ${JSON.stringify(wanted)} with sandbox_set_config.` } : {}),
          ...(await layoutAnswer(host, args.wait, signal)),
        };
      }
      const picked = family.variants.filter((v) => (args.fileName === undefined || v.fileName === args.fileName)
        && (args.weight === undefined || v.weight === args.weight)
        && (args.style === undefined || v.style === args.style));
      const listed = `Its faces: ${family.variants.map((v) => `${v.weight} ${v.style} (${v.fileName ?? v.format})`).join('; ') || 'none'}.`;
      if (args.action === 'update_face') {
        if (args.newWeight === undefined && args.newStyle === undefined) throw new ToolError('update_face needs newWeight or newStyle.');
        if (picked.length !== 1) throw new ToolError(`${picked.length === 0 ? 'The family has no face of that file name, weight and style' : `${picked.length} faces match: name one by its fileName, weight and style`}. ${listed}`);
        const next = familiesWithFace(families, name, family.variants.indexOf(picked[0]!), {
          ...(args.newWeight !== undefined ? { weight: args.newWeight as number } : {}),
          ...(args.newStyle !== undefined ? { style: args.newStyle as 'normal' | 'italic' } : {}),
        });
        await write(next);
        return { family: name, faces: facesOf(next, name), ...(await layoutAnswer(host, args.wait, signal)) };
      }
      if (picked.length === 0 && family.variants.length > 0) throw new ToolError(`The family has no face of that file name, weight and style. ${listed}`);
      for (const v of picked) await deleteFontFile(v.fileId).catch(() => undefined);
      const left = family.variants.filter((v) => !picked.includes(v));
      // Each face goes as the panel takes one away, the last first; a
      // family left without a face goes with them.
      let next: CustomFontFamily[] = families;
      for (const index of picked.map((v) => family.variants.indexOf(v)).sort((a, b) => b - a)) next = familiesWithoutFace(next, name, index);
      if (left.length === 0) next = next.filter((f) => f.name !== name);
      await write(next);
      return { family: name, removedFaces: picked.length, familyRemoved: left.length === 0, ...(left.length > 0 ? { faces: left.map(faceOf) } : {}), ...(await layoutAnswer(host, args.wait, signal)) };
    },
  };

  return [listResources, saveResource, deleteResource, listFonts, saveFont];
}
