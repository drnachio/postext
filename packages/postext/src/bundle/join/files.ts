// A part of a book joined to the book at the level of its files (#1727):
// what the CLI's `postext join` and a host that keeps books as files use.
// The book's manifest is edited, not written again, so everything a join
// does not touch (its other editions, covers, stored layouts, view) stays
// byte for byte. The plan is the one the Sandbox follows (`planPartJoin`).

import { readBundle } from '../codec/read.js';
import { chapterFileName, fileBasename, fileExtension, isBundleManifest, pickChapterSpecs, resolveBundleLocale } from '../manifest.js';
import { MANIFEST_FILE } from '../zip.js';
import type { BundleChapterSpec, BundleFontFamilySpec, BundleManifestV2, BundleResourceSpec } from '../types.js';
import type { CustomFontFamily } from '../../types.js';
import { chapterNumbers } from './numbers.js';
import {
  bookNumbers, choiceProblems, partChapters, planPartJoin, proposeChoices, renameProblems, replacedChapter, resourceClashes,
  type JoinSide, type PartChapterInfo, type PartChoice, type PartProblem,
} from './plan.js';

export interface JoinBundleOptions {
  /** The edition (language) of the book the chapters join, and the one the
   *  part is read in. Default: the book's own language. */
  locale?: string;
  /** What becomes of each of the part's chapters, in its order. Default:
   *  what {@link inspectBundleJoin} proposes. */
  choices?: readonly PartChoice[];
  /** For a clashing resource, the id it takes instead of the proposed one. */
  renames?: Readonly<Record<string, string>>;
}

/** What a join would do, before it is done. */
export interface BundleJoinInspection {
  locale: string;
  /** The part's chapters, with their numbers and resources. */
  part: PartChapterInfo[];
  /** The book's chapters (of `locale`), with the numbers they are counted by. */
  book: { title: string; file: string; number: number | null }[];
  choices: PartChoice[];
  /** For each of the part's chapters, the position of the book's chapter it
   *  replaces, or -1. */
  replaces: number[];
  clashes: { id: string; rename: string }[];
  problems: { chapter: number; problem: PartProblem }[];
  /** Clashing resources whose new name cannot be used. */
  badNames: string[];
}

export interface BundleJoinResult {
  /** The book's files after the join: those it had, with the manifest and
   *  the chapters it changed rewritten and the part's files added. */
  files: Map<string, Uint8Array>;
  /** The paths written or rewritten. */
  written: string[];
  added: { title: string; file: string; number: number }[];
  replaced: { title: string; file: string; number: number }[];
  resources: string[];
  renamed: { from: string; to: string }[];
  fontsAdded: string[];
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function manifestOf(files: ReadonlyMap<string, Uint8Array>, what: string): BundleManifestV2 {
  const bytes = files.get(MANIFEST_FILE);
  if (!bytes) throw new Error(`${what} has no ${MANIFEST_FILE}`);
  const manifest = JSON.parse(decoder.decode(bytes)) as unknown;
  if (!isBundleManifest(manifest)) throw new Error(`${what}: ${MANIFEST_FILE} is not a postext manifest`);
  if (manifest.version !== 2) throw new Error(`${what} is a single-file bundle (manifest version 1): open and save it in the Sandbox first`);
  if (manifest.design) throw new Error(`${what} is a design file: it has no chapters`);
  return manifest;
}

/** A side of the join read as the layout reads it, its resources as the
 *  manifest's specs (wording of `locale` merged in). */
async function readSide(files: ReadonlyMap<string, Uint8Array>, locale: string, what: string) {
  const manifest = manifestOf(files, what) as BundleManifestV2;
  const read = await readBundle(manifest, async (path) => {
    const bytes = files.get(path);
    if (!bytes) throw new Error(`${what}: missing file ${path}`);
    return bytes.slice().buffer;
  }, { locale, traceContours: false, readResolution: false });
  const served = resolveBundleLocale(manifest, locale);
  const wording = new Map((manifest.localized?.[served]?.resources ?? []).map((r) => [r.id, r]));
  const specs: BundleResourceSpec[] = (manifest.resources ?? []).map((r) => ({ ...r, ...wording.get(r.id) }));
  const side: JoinSide<BundleResourceSpec> = {
    chapters: read.chapters.map((c) => ({ title: c.title, markdown: c.markdown })),
    resources: specs,
    config: read.config,
    ...(read.start?.headings ? { start: read.start.headings } : {}),
  };
  return { manifest, read, side, served };
}

/** What joining the part to the book would do, changing nothing. */
export async function inspectBundleJoin(book: ReadonlyMap<string, Uint8Array>, part: ReadonlyMap<string, Uint8Array>, options: JoinBundleOptions = {}): Promise<BundleJoinInspection> {
  const b = await readSide(book, options.locale ?? manifestOf(book, 'The book').locale ?? 'en', 'The book');
  const p = await readSide(part, b.served, 'The part');
  const choices = [...(options.choices ?? proposeChoices(b.side, p.side))];
  const specs = pickChapterSpecs(b.manifest, b.served);
  const numbers = bookNumbers(b.side);
  return {
    locale: b.served,
    part: partChapters(p.side),
    book: specs.map((s, i) => ({ title: s.title, file: s.file, number: numbers[i] ?? null })),
    choices,
    replaces: choices.map((c) => replacedChapter(b.side, c)),
    clashes: choices.length === p.side.chapters.length ? resourceClashes(b.side, p.side, choices) : [],
    problems: choices.length === p.side.chapters.length ? choiceProblems(b.side, p.side, choices) : [],
    badNames: choices.length === p.side.chapters.length ? renameProblems(b.side, p.side, choices, options.renames) : [],
  };
}

/** `path`, or `name-2.ext`, `-3`… when the book has a different file there. */
function freePath(path: string, bytes: Uint8Array, files: ReadonlyMap<string, Uint8Array>, claimed: Set<string>): string {
  const same = (p: string) => { const had = files.get(p); return had !== undefined && had.length === bytes.length && had.every((x, i) => x === bytes[i]); };
  const free = (p: string) => !claimed.has(p) && (!files.has(p) || same(p));
  if (free(path)) return path;
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const ext = fileExtension(path);
  const base = fileBasename(path).replace(new RegExp(`\\.${ext}$`), '');
  let n = 2;
  while (!free(`${dir}${base}-${n}${ext ? `.${ext}` : ''}`)) n++;
  return `${dir}${base}-${n}${ext ? `.${ext}` : ''}`;
}

/** `value` with every string that is a key of `paths` replaced by its value. */
function remapPaths<T>(value: T, paths: ReadonlyMap<string, string>): T {
  if (typeof value === 'string') return (paths.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((v) => remapPaths(v, paths)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapPaths(v, paths)])) as T;
  return value;
}

/** Every string in `value` that names one of `files`. */
function pathsIn(value: unknown, files: ReadonlyMap<string, Uint8Array>, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') { if (files.has(value)) out.add(value); }
  else if (Array.isArray(value)) for (const v of value) pathsIn(v, files, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) pathsIn(v, files, out);
  return out;
}

/**
 * Join the chosen chapters of `part` (a `.postext`'s files) to `book` (its
 * files): replaced chapters get the part's text in their own files, added
 * ones a file named after their number in the edition's chapter list, the
 * resources they bring and their files go into the manifest (renamed where
 * they clash, with every reference), and the font families the book lacks
 * come with their files. Throws when the choices or new names do not fit.
 */
export async function joinBundleFiles(book: ReadonlyMap<string, Uint8Array>, part: ReadonlyMap<string, Uint8Array>, options: JoinBundleOptions = {}): Promise<BundleJoinResult> {
  const b = await readSide(book, options.locale ?? manifestOf(book, 'The book').locale ?? 'en', 'The book');
  const p = await readSide(part, b.served, 'The part');
  const choices = options.choices ?? proposeChoices(b.side, p.side);
  const plan = planPartJoin(b.side, p.side, choices, options.renames);
  const files = new Map(book);
  const written = new Set<string>();
  const claimed = new Set<string>();
  const write = (path: string, bytes: Uint8Array) => { files.set(path, bytes); written.add(path); claimed.add(path); };
  const manifest = structuredClone(b.manifest);

  // The edition's chapter list, edited in place.
  const ownList = !Array.isArray(manifest.chapters);
  const specs: BundleChapterSpec[] = [...pickChapterSpecs(manifest, b.served)];
  const folder = specs[0]?.file.includes('/') ? specs[0].file.slice(0, specs[0].file.lastIndexOf('/') + 1) : 'chapters/';
  const added: BundleJoinResult['added'] = [];
  const replaced: BundleJoinResult['replaced'] = [];
  const original = [...specs];
  const taken = new Set([...files.keys()].filter((f) => f.startsWith(folder)).map((f) => f.slice(folder.length).replace(/\.md$/, '')));
  const widest = Math.max(specs.length + plan.steps.length, ...chapterNumbers(b.side.chapters, b.side.config, b.side.start).map((n) => n ?? 0), ...plan.steps.map((s) => s.number));
  for (const step of plan.steps) {
    if (step.kind === 'replace') {
      const spec = original[step.at]!;
      const index = specs.indexOf(spec);
      specs[index] = { ...spec, title: step.title };
      write(spec.file, encoder.encode(step.markdown));
      replaced.push({ title: step.title, file: spec.file, number: step.number });
    } else {
      const name = chapterFileName(step.number - 1, step.title, taken, widest).replace(/^chapters\//, folder);
      specs.splice(step.index, 0, { title: step.title, file: name });
      write(name, encoder.encode(step.markdown));
      added.push({ title: step.title, file: name, number: step.number });
    }
  }
  if (ownList) {
    // The key of the list the edition reads (the map's entry it picks).
    const map = b.manifest.chapters as Record<string, BundleChapterSpec[]>;
    const served = pickChapterSpecs(b.manifest, b.served);
    const key = Object.keys(map).find((k) => map[k] === served) ?? b.served;
    (manifest.chapters as Record<string, BundleChapterSpec[]>)[key] = specs;
  } else manifest.chapters = specs;

  // The resources and their files: a file of the part goes where the book
  // has none, or has the same bytes, else beside it under a new name.
  const paths = new Map<string, string>();
  for (const path of pathsIn(plan.resources, part)) paths.set(path, freePath(path, part.get(path)!, book, claimed));
  for (const [from, to] of paths) write(to, part.get(from)!);
  const brought = plan.resources.map((r) => remapPaths(r, paths));
  const ids = new Set(brought.map((r) => r.id));
  manifest.resources = [...(manifest.resources ?? []).filter((r) => !ids.has(r.id)), ...brought];
  // A resource the part's takes the place of leaves the book's wording of
  // it in every edition; the part's edition wording came in with it.
  for (const entry of Object.values(manifest.localized ?? {})) {
    if (entry.resources) entry.resources = entry.resources.filter((r) => !ids.has(r.id));
    if (entry.resources?.length === 0) delete entry.resources;
  }

  // The font families the book lacks: the part's bundled ones with their
  // files, the others (a Google font, a system one) into the shared config.
  if (plan.fontsAdded.length > 0) {
    const wanted = new Set(plan.fontsAdded.map((n) => n.toLowerCase()));
    const bundled: BundleFontFamilySpec[] = (p.manifest.fonts ?? []).filter((f) => wanted.has(f.name.toLowerCase()));
    const fontPaths = new Map<string, string>();
    for (const path of pathsIn(bundled, part)) fontPaths.set(path, freePath(path, part.get(path)!, book, claimed));
    for (const [from, to] of fontPaths) write(to, part.get(from)!);
    manifest.fonts = [...(manifest.fonts ?? []), ...bundled.map((f) => remapPaths(f, fontPaths))];
    const named = new Set(bundled.map((f) => f.name.toLowerCase()));
    const others: CustomFontFamily[] = (plan.customFonts ?? []).filter((f) => wanted.has(f.name.toLowerCase()) && !named.has(f.name.toLowerCase()));
    if (others.length > 0) manifest.config = { ...manifest.config, customFonts: [...(manifest.config?.customFonts ?? []), ...others] };
  }

  write(MANIFEST_FILE, encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`));
  return {
    files,
    written: [...written].sort(),
    added,
    replaced,
    resources: brought.map((r) => r.id),
    renamed: plan.renamed.filter((r) => r.from !== r.to),
    fontsAdded: plan.fontsAdded,
  };
}
