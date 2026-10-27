// sandbox_list_fonts and sandbox_save_font: the book's own fonts, as the
// Fonts panel lists and edits them.
import { type WebMcpTool, ToolError } from '../../modelContext.js';
import { bookFontFamilies } from '../../../sidebar/BookFonts.js';
import { fontFamilySource, loadFont } from '../../../controls/fonts/fontLoader.js';
import { faceOf, settingsNaming } from './schema.js';
import { fetchGoogleFonts } from '../../../controls/fonts/FontPicker.js';
import { FILE_PARAM, readFileInput, type FileInput } from '../../fileInput.js';
import type { CustomFontFamily, CustomFontVariant } from 'postext';
import { dispatchAndWait, type SandboxToolHost } from '../../host.js';
import { deleteFontFile, formatFromFilename, generateFontFileId, putFontFile } from '../../../storage/fontStorage.js';
import { layoutAnswer } from '../book.js';
import { familiesRenamed, familiesWithFace, familiesWithoutFace } from '../../../sidebar/FontsPanel.js';
import type { SandboxStore } from '../../../context/SandboxContext/hooks.js';

/** What createFontTools takes from resourceTools. */
export interface FontToolsDeps {
  host: SandboxToolHost;
  store: SandboxStore;
}

export function createFontTools(deps: FontToolsDeps) {
  const {
    host, store
  } = deps;
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
  return {
    listFonts, saveFont
  };
}
