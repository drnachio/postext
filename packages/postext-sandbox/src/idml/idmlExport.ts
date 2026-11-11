// The IDML export of the Sandbox (#1491): the whole book, laid out as the
// PDF is, written by `postext-idml` as an InDesign Markup package. The
// writer is loaded on the first export. The export dialog and the
// `sandbox_export` tool use it. With linked pictures or the fonts
// included, the package travels in a zip beside its `Links` and
// `Document fonts` folders.

import { baseFontFamily, documentFontFaces, type PostextConfig, type Resource, type VDTDocument } from 'postext';
import type { IdmlWarning } from 'postext-idml';
import { zipSync, type Zippable } from 'fflate';
import { getBlob } from '../storage/blobStore.js';

export const IDML_MIME = 'application/vnd.adobe.indesign-idml-package';
export const ZIP_MIME = 'application/zip';

/** Characters a file name cannot hold on some system. */
const UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f]+/g;

/** `<book title>.idml` (`document.idml` for a book without a title). */
export function idmlFileName(bookTitle: string): string {
  const name = bookTitle.replace(UNSAFE_NAME, ' ').replace(/\s+/g, ' ').trim();
  return `${name || 'document'}.idml`;
}

/** Every stored file id the book names: its resources' pictures (bitmaps,
 *  video posters, SVG sources and their PDF print masters) and the pictures
 *  of its design (any `fileId` or `pdfFileId` in the configuration). */
export function idmlFileIds(resources: readonly Resource[], config: PostextConfig): string[] {
  const ids = new Set<string>();
  const add = (id: unknown) => {
    if (typeof id === 'string' && id && !id.startsWith('data:')) ids.add(id);
  };
  for (const r of resources) {
    if (r.kind === 'bitmap') add(r.bitmap?.fileId);
    else if (r.kind === 'svg') {
      add(r.svg?.fileId);
      add(r.svg?.pdfFileId);
    } else if (r.kind === 'video') add(r.video?.poster?.fileId);
  }
  const walk = (value: unknown) => {
    if (Array.isArray(value)) for (const v of value) walk(v);
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (k === 'fileId' || k === 'pdfFileId') add(v);
        else walk(v);
      }
    }
  };
  walk(config);
  return [...ids];
}

/** The bytes of a `data:` URL (base64 or percent-encoded). */
export function dataUrlBytes(url: string): Uint8Array | undefined {
  const comma = url.indexOf(',');
  if (!url.startsWith('data:') || comma < 0) return undefined;
  const body = url.slice(comma + 1);
  try {
    if (/;base64$/i.test(url.slice(0, comma))) return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
    return new TextEncoder().encode(decodeURIComponent(body));
  } catch {
    return undefined;
  }
}

/** What the dialog asks of the package. */
export interface IdmlExportChoices {
  /** `keep`: every line ends where Postext ended it; `reflow`: the
   *  paragraphs are left to InDesign's composer. */
  lineBreaks: 'keep' | 'reflow';
  /** `auto`: as the writer decides (facing for mirrored margins). */
  spreads: 'auto' | 'facing' | 'single';
  /** `link`: the pictures in a `Links` folder beside the package. */
  images: 'embed' | 'link';
  /** The font files in a `Document fonts` folder beside the package. */
  fonts: boolean;
}

export const DEFAULT_IDML_CHOICES: IdmlExportChoices = { lineBreaks: 'keep', spreads: 'auto', images: 'embed', fonts: false };

/** The font file of a face the book is set in. */
export interface IdmlFace {
  family: string;
  weight: number;
  italic: boolean;
  /** TrueType or OpenType bytes (a WOFF2 decoded). */
  bytes: Uint8Array;
}

/** Answers with the file, or the files, of a face; rejects for a face it
 *  has none of (the Sandbox's PDF font provider is one). */
export type IdmlFontProvider = (family: string, weight: number, style: 'normal' | 'italic', request?: { codePoints: ReadonlySet<number> }) => Promise<Uint8Array | readonly Uint8Array[]>;

const sameFamily = (a: string, b: string): boolean => baseFontFamily(a).trim().toLowerCase() === baseFontFamily(b).trim().toLowerCase();

/** The font files of the faces the laid-out book is set in, as far as
 *  `provider` has them: a face it cannot give is left out, and the writer
 *  names it from its weight and slant. A face of several files (a family
 *  cut by script) gives the first one, which holds the book's own script. */
export async function idmlFaces(docs: readonly VDTDocument[], provider: IdmlFontProvider, codePoints?: ReadonlySet<number>): Promise<IdmlFace[]> {
  const asked = new Map<string, { family: string; weight: number; italic: boolean }>();
  for (const doc of docs) {
    for (const face of documentFontFaces(doc)) {
      const family = baseFontFamily(face.family);
      asked.set(`${family.toLowerCase()}|${face.weight}|${face.style}`, { family, weight: face.weight, italic: face.style === 'italic' });
    }
  }
  const faces = await Promise.all([...asked.values()].map(async (face): Promise<IdmlFace | null> => {
    try {
      const answer = await provider(face.family, face.weight, face.italic ? 'italic' : 'normal', codePoints ? { codePoints } : undefined);
      const bytes = answer instanceof Uint8Array ? answer : answer[0];
      return bytes && bytes.byteLength > 0 ? { ...face, bytes } : null;
    } catch {
      return null;
    }
  }));
  return faces.filter((f): f is IdmlFace => f !== null);
}

/** The face of `faces` that sets `family` at `weight` and slant: of the
 *  family's own, one of the slant asked when there is any, the nearest
 *  weight. Undefined for a family with no file. */
export function pickIdmlFace(faces: readonly IdmlFace[], family: string, weight: number, italic: boolean): IdmlFace | undefined {
  const own = faces.filter((f) => sameFamily(f.family, family));
  const slanted = own.filter((f) => f.italic === italic);
  const pool = slanted.length > 0 ? slanted : own;
  return pool.reduce<IdmlFace | undefined>((best, f) => (!best || Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best), undefined);
}

export interface IdmlExportInput {
  /** The book's chapters laid out (`layOutBookPrint`). */
  docs: readonly VDTDocument[];
  resources: readonly Resource[];
  config: PostextConfig;
  title?: string;
  /** Unset choices are the defaults ({@link DEFAULT_IDML_CHOICES}). */
  choices?: Partial<IdmlExportChoices>;
  /** The font files of the book's faces ({@link idmlFaces}). Given, a
   *  face is named as its file names it, whatever `choices.fonts` says. */
  faces?: readonly IdmlFace[];
  /** Whether a family may not be handed on (`redistributable: false`):
   *  its files stay out of `Document fonts`. */
  withheld?: (family: string) => boolean;
  onWarning?: (w: IdmlWarning) => void;
}

export interface IdmlExport {
  /** What is downloaded: the `.idml`, or the zip that holds it beside
   *  its folders. */
  bytes: Uint8Array;
  name: string;
  mime: string;
  zipped: boolean;
  /** The `.idml` itself. */
  idml: Uint8Array;
  /** Paths of the pictures linked (`Links/…`) and the font files
   *  (`Document fonts/…`) that travel beside it. */
  links: string[];
  fonts: string[];
  /** Families whose files were left out as their licence asks. */
  withheld: string[];
}

/** Write the IDML package of the laid-out book. */
export async function buildIdmlExport(input: IdmlExportInput): Promise<IdmlExport> {
  const choices = { ...DEFAULT_IDML_CHOICES, ...input.choices };
  const faces = input.faces ?? [];
  const bytes = new Map<string, Uint8Array>();
  for (const id of idmlFileIds(input.resources, input.config)) {
    const rec = await getBlob(id).catch(() => null);
    if (rec) bytes.set(id, new Uint8Array(rec.bytes));
  }
  const { idmlDocument } = await import('postext-idml');
  const result = idmlDocument({
    docs: input.docs,
    resourceBytes: (id) => bytes.get(id) ?? (id.startsWith('data:') ? dataUrlBytes(id) : undefined),
    images: choices.images,
    lineBreaks: choices.lineBreaks,
    ...(choices.spreads !== 'auto' ? { spreads: choices.spreads } : {}),
    // A face is named as its file names it, which is how InDesign finds it.
    ...(faces.length > 0 ? { fontFile: (family: string, weight: number, italic: boolean) => pickIdmlFace(faces, family, weight, italic)?.bytes } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.onWarning ? { onWarning: input.onWarning } : {}),
  });
  const name = idmlFileName(input.title ?? '');
  const beside: { path: string; bytes: Uint8Array }[] = choices.images === 'link' ? [...result.links] : [];
  const withheld = new Set<string>();
  const fonts: string[] = [];
  if (choices.fonts) {
    for (const f of result.fonts) {
      const family = faces.find((x) => x.bytes === f.bytes)?.family;
      if (family && input.withheld?.(family)) {
        withheld.add(family);
        continue;
      }
      beside.push(f);
      fonts.push(f.path);
    }
  }
  const about = { idml: result.bytes, links: choices.images === 'link' ? result.links.map((l) => l.path) : [], fonts, withheld: [...withheld] };
  if (beside.length === 0) return { bytes: result.bytes, name, mime: IDML_MIME, zipped: false, ...about };
  // The package is a zip already: stored as it is, beside its folders.
  const files: Zippable = { [name]: [result.bytes, { level: 0 }] };
  for (const f of beside) files[f.path] = f.bytes;
  return { bytes: zipSync(files, { level: 6 }), name: name.replace(/\.idml$/, '.zip'), mime: ZIP_MIME, zipped: true, ...about };
}
