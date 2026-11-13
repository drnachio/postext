// The fonts a package carries, put into the book: each face the book is
// set in is matched to a font file of the package by its PostScript name
// (which the document records for every font it uses), else by family and
// style. The book then names those files in `config.customFonts`, with
// every other face of the same families the package carries, so that the
// bold and the italic of the text find a file too. What cannot be carried
// is a finding: a face with no file, a file in a format Postext does not
// read, a face whose licence forbids embedding. A font collection (.ttc)
// is split into its faces first, so a face packaged in one is carried as
// a single font file.

import type { CustomFontFamily, CustomFontVariant } from 'postext';
import { splitFontCollection } from '../package/collection.js';
import { readFontFace, type FontFace } from '../package/fontFace.js';
import type { Context } from './context.js';
import type { IdmlFontFile, ImportedFont } from './types.js';
import { italicOf, weightOf } from './values.js';

const norm = (s: string | undefined): string => (s ?? '').normalize('NFC').toLowerCase().replace(/[\s_-]+/g, '');
const stem = (path: string): string => (path.split('/').pop() ?? path).replace(/\.[a-z0-9]+$/i, '');

interface Face extends FontFace {
  file: string;
  bytes: Uint8Array;
}

const UNUSABLE: Record<string, string> = {
  collection: 'a font collection (.ttc) whose list of faces cannot be read',
  type1: 'a PostScript Type 1 font',
  suitcase: 'a Mac font suitcase',
  woff: 'a WOFF 1 file',
  unknown: 'no font format Postext reads',
};

/** The path a face of the collection at `path` goes by: the collection's
 *  path with a file name after it, made of the face's PostScript name
 *  (`Document fonts/PTSans.ttc/PTSans-Narrow.ttf`). The book's file then
 *  has the name of the face, and the path still says where it came from. */
function collectionFaceName(path: string, face: FontFace, index: number): string {
  const name = face.postScriptName?.replace(/[^\w.-]+/g, '-') || `${stem(path)}-${index + 1}`;
  return `${path}/${name}.${face.format}`;
}

/** Put the package's fonts into the book: `config.customFonts`, the files,
 *  and on each face of `fonts` the file that carries it. */
export function carryFonts(ctx: Context, fonts: ImportedFont[], files: readonly IdmlFontFile[]): CustomFontFamily[] {
  const faces: Face[] = [];
  const broken: string[] = [];
  for (const f of files) {
    // A collection is opened into its faces, each read as a file of its
    // own (#1558). Only the faces the text is set in, and their family's
    // others, go into the book, as with single files.
    const split = splitFontCollection(f.bytes);
    if (split) {
      for (const part of split) {
        const read = part.bytes && readFontFace('', part.bytes);
        if (!part.bytes || !read || 'unusable' in read) {
          broken.push(`${f.name.split('/').pop()} (face ${part.index + 1})`);
          continue;
        }
        faces.push({ ...read, file: collectionFaceName(f.name, read, part.index), bytes: part.bytes });
      }
      continue;
    }
    const read = readFontFace(f.name, f.bytes);
    if ('unusable' in read) {
      ctx.rep.add(`fontFile.${read.unusable}`, 'warning', `A font file of the package is ${UNUSABLE[read.unusable]}, which a Postext book cannot carry`, f.name.split('/').pop());
      continue;
    }
    faces.push({ ...read, file: f.name, bytes: f.bytes });
  }
  if (broken.length) ctx.rep.add('fontFile.collection', 'warning', 'A face of a font collection (.ttc) could not be taken out of it, so the book cannot carry it', broken.slice(0, 5).join(', '), broken.length);

  const recorded = new Map(ctx.doc.fonts.map((f) => [`${f.family}\u0000${f.style}`, f]));
  const familyOf = (face: Face, family: string): boolean => norm(face.family) === norm(family) || norm(face.legacyFamily) === norm(family);
  const match = (family: string, style: string): Face | undefined => {
    const ps = recorded.get(`${family}\u0000${style}`)?.postScriptName;
    if (ps) {
      const byPs = faces.find((f) => norm(f.postScriptName) === norm(ps)) ?? faces.find((f) => f.format === 'woff2' && norm(stem(f.file)) === norm(ps));
      if (byPs) return byPs;
    }
    const full = norm(`${family} ${style}`);
    return faces.find((f) => norm(f.family) === norm(family) && norm(f.style) === norm(style))
      ?? faces.find((f) => norm(f.fullName) === full || (norm(style) === 'regular' && norm(f.fullName) === norm(family)))
      ?? faces.find((f) => familyOf(f, family) && f.weight === weightOf(style) && f.italic === italicOf(style));
  };

  const ids = new Set<string>();
  const fileId = (face: Face): string => {
    const name = (face.file.split('/').pop() ?? 'font').replace(/[^\w.-]+/g, '-');
    let id = `fonts/${name}`;
    for (let n = 2; ids.has(id); n++) id = `fonts/${name.replace(/(\.[a-z0-9]+)?$/i, `-${n}$1`)}`;
    ids.add(id);
    ctx.files.set(id, face.bytes);
    return id;
  };

  const out: CustomFontFamily[] = [];
  const carried = new Map<Face, string>();
  const missing: string[] = [];
  const restricted = new Set<string>();
  for (const font of fonts) {
    const variants: CustomFontVariant[] = [];
    const taken = new Set<string>();
    const add = (face: Face, weight: number, italic: boolean): string => {
      let id = carried.get(face);
      const slot = `${weight}${italic ? 'i' : ''}`;
      if (taken.has(slot)) return id ?? '';
      taken.add(slot);
      if (!id) carried.set(face, (id = fileId(face)));
      variants.push({ weight, style: italic ? 'italic' : 'normal', fileId: id, format: face.format, fileName: face.file.split('/').pop() ?? face.file });
      if (face.restricted) restricted.add(face.file.split('/').pop() ?? face.file);
      return id;
    };
    // The faces the text is set in, at the weight and slant the book asks for.
    for (const style of font.styles) {
      const face = match(font.family, style.name);
      if (face) style.file = face.file;
      if (face) add(face, style.weight, style.italic);
      else missing.push(`${font.family} ${style.name}`);
    }
    // The family's other faces in the package, at their own.
    if (variants.length) for (const face of faces) if (familyOf(face, font.family) && !carried.has(face)) add(face, face.weight, face.italic);
    if (variants.length) out.push({ name: font.family, variants });
  }

  const count = [...carried.keys()].length;
  if (count) ctx.rep.add('fontsCarried', 'info', 'Font files of the package go into the book with it, so its text is set in the document\'s faces', out.map((f) => f.name).join(', '), count);
  if (missing.length) ctx.rep.add('fontNotInPackage', 'warning', 'A face the text is set in has no font file in the package: the book sets it in another face until the font is added', missing.slice(0, 5).join(', '), missing.length);
  if (restricted.size) ctx.rep.add('fontRestricted', 'warning', 'The licence a font file states does not allow embedding it: the book carries it to set its pages; check the licence before passing the book on', [...restricted].slice(0, 5).join(', '), restricted.size);
  return out;
}
