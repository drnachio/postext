// What the user hands the CLI, read into one shape: a packed `.postext`, an
// unpacked folder with its `preset.json`, or loose Markdown chapters (with
// an optional configuration, pictures and fonts), which go through
// `createBundle` so they are read exactly as a bundle would be.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import type { PostextConfig, Resource } from 'postext';
import {
  bitmapSize,
  createBundle,
  fontFormatFromFile,
  isBitmapFile,
  isSvgFile,
  openBundle,
  readBundle,
  resourceFromSpec,
  svgSize,
  type BundleFontFile,
  type BundleManifest,
  type BundleResourceSpec,
  type CreateBundleInput,
} from 'postext/bundle';
import { CliError, UsageError, type Options } from './args';
import { fontBytes, readFontMeta } from './fonts';
import type { Reporter } from './log';

export interface BookChapter {
  title: string;
  /** Path inside the book. */
  file?: string;
  markdown: string;
}

export interface Book {
  kind: 'bundle' | 'folder' | 'markdown';
  name: string;
  id: string;
  description?: string;
  locale: string;
  locales?: string[];
  chapters: BookChapter[];
  /** Ready for the engine: defaults, the book's settings, the locale's,
   *  --config and --set. */
  config: PostextConfig;
  resources: Resource[];
  fonts: BundleFontFile[];
  /** Every file of the book by path (= `fileId`). */
  files: Map<string, Uint8Array>;
  manifest?: BundleManifest;
  /** Path of the cover picture inside the book. */
  thumbnail?: string;
  /** What to watch for changes (--watch). */
  watchPaths: string[];
}

const MARKDOWN_EXT = new Set(['.md', '.markdown', '.mdx', '.txt']);
const SKIP_DIRS = new Set(['node_modules', '.git']);

/** Every file under `dir`, by path relative to it with forward slashes. */
export function readTree(dir: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.set(relative(dir, path).split(sep).join('/'), new Uint8Array(readFileSync(path)));
    }
  };
  walk(dir);
  return files;
}

const isZip = (bytes: Uint8Array) => bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;

/** The first `# ` heading of a chapter, else `Chapter n`. */
function chapterTitle(markdown: string, n: number): string {
  let fence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const text = m[1]!.replace(/\{[^}]*\}\s*$/, '').replace(/[*_`\\]/g, '').trim();
      if (text) return text;
    }
  }
  return `Chapter ${n}`;
}

function readJson(path: string, what: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new CliError(`${what} ${path} is not valid JSON: ${(err as Error).message}`);
  }
}

/** A config file may be a bare configuration or a preset.json. */
function readConfigFile(path: string): PostextConfig {
  const data = readJson(path, 'Configuration') as Record<string, unknown>;
  const config = data && typeof data.config === 'object' && (data.chapters || data.markdownFile || data.name) ? data.config : data;
  return config as PostextConfig;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** `over` merged into `base`: objects key by key, anything else replaced. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(over)) return over as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in out ? deepMerge(out[k], v) : v;
  return out as T;
}

/** Apply `--set path=value`: dotted path, numeric segments index arrays;
 *  the value is read as JSON when it parses (numbers, booleans, objects),
 *  else as text. */
export function applySet(config: PostextConfig, assignments: readonly string[]): PostextConfig {
  const root = structuredClone(config) as Record<string, unknown>;
  for (const assignment of assignments) {
    const eq = assignment.indexOf('=');
    if (eq <= 0) throw new UsageError(`--set takes PATH=VALUE (got "${assignment}")`);
    const path = assignment.slice(0, eq).trim().split('.');
    const raw = assignment.slice(eq + 1);
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
    let node: Record<string, unknown> | unknown[] = root;
    path.forEach((key, i) => {
      const last = i === path.length - 1;
      const index = /^\d+$/.test(key) ? Number(key) : undefined;
      const container = node as Record<string | number, unknown>;
      const slot = index ?? key;
      if (last) {
        container[slot] = value;
        return;
      }
      let next = container[slot];
      if (!next || typeof next !== 'object') {
        next = /^\d+$/.test(path[i + 1]!) ? [] : {};
        container[slot] = next;
      }
      node = next as Record<string, unknown>;
    });
  }
  return root as PostextConfig;
}

// ---------------------------------------------------------------------------
// Loose Markdown
// ---------------------------------------------------------------------------

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** The Markdown files the inputs name, in order (a folder: its Markdown
 *  files by name). */
function markdownFiles(inputs: readonly string[]): string[] {
  const out: string[] = [];
  for (const input of inputs) {
    if (!existsSync(input)) throw new CliError(`No such file or folder: ${input}`);
    if (statSync(input).isDirectory()) {
      const names = readdirSync(input).filter((n) => MARKDOWN_EXT.has(extname(n).toLowerCase()) && !n.startsWith('.')).sort(naturalCompare);
      out.push(...names.map((n) => join(input, n)));
    } else out.push(input);
  }
  return out;
}

/** Pictures in `dir` as resources (`resources.json` beside them may give
 *  ids, captions, types; otherwise every picture is a figure named by its
 *  file name). */
function looseResources(dir: string): { resources: Resource[]; files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  const resources: Resource[] = [];
  if (!existsSync(dir)) throw new CliError(`No such resources folder: ${dir}`);
  const tree = readTree(dir);
  const fileId = (file: string) => `resources/${file}`;
  for (const [file, bytes] of tree) files.set(fileId(file), bytes);
  const specFile = join(dir, 'resources.json');
  const sizeOf = (file: string) => {
    const bytes = tree.get(file);
    if (!bytes) return undefined;
    return isSvgFile(file) ? svgSize(new TextDecoder().decode(bytes)) : bitmapSize(bytes);
  };
  if (existsSync(specFile)) {
    const specs = readJson(specFile, 'Resources') as BundleResourceSpec[];
    if (!Array.isArray(specs)) throw new CliError(`${specFile} must hold an array of resources`);
    for (const spec of specs) resources.push(resourceFromSpec(spec, spec.file ? sizeOf(spec.file) : undefined, fileId));
    return { resources, files };
  }
  const taken = new Set<string>();
  for (const file of [...tree.keys()].sort(naturalCompare)) {
    if (!isBitmapFile(file) && !isSvgFile(file)) continue;
    const id = basename(file, extname(file));
    if (taken.has(id)) continue;
    taken.add(id);
    resources.push(resourceFromSpec({ id, typeId: 'figure', kind: isSvgFile(file) ? 'svg' : 'bitmap', file } as BundleResourceSpec, sizeOf(file), fileId));
  }
  return { resources, files };
}

/** The `createBundle` input for loose Markdown and the options that come
 *  with it. Shared by `pack` (which writes it) and every other command. */
export async function looseBundleInput(inputs: readonly string[], opts: Options): Promise<CreateBundleInput> {
  const mdFiles = markdownFiles(inputs);
  if (mdFiles.length === 0) throw new CliError('No Markdown files found (.md) in the input');
  const chapters = mdFiles.map((f, i) => {
    const markdown = readFileSync(f, 'utf8');
    return { title: chapterTitle(markdown, i + 1), markdown };
  });
  let config: PostextConfig = {};
  const configPath = opts.string('config');
  if (configPath) config = readConfigFile(configPath);
  const files = new Map<string, Uint8Array>();
  let resources: Resource[] = [];
  const resourcesDir = opts.string('resources');
  if (resourcesDir) {
    const loose = looseResources(resourcesDir);
    resources = loose.resources;
    for (const [k, v] of loose.files) files.set(k, v);
  }
  const fontsDir = opts.string('fonts');
  if (fontsDir) {
    const families = new Map<string, NonNullable<PostextConfig['customFonts']>[number]>();
    const tree = readTree(fontsDir);
    for (const [file, bytes] of tree) {
      const format = fontFormatFromFile(file);
      if (!format || format === 'woff') continue;
      const decoded = await fontBytes(file, bytes);
      const face = await readFontMeta(decoded.bytes);
      if (!face) continue;
      const fileId = `fonts/${file}`;
      files.set(fileId, bytes);
      const family = families.get(face.family) ?? { name: face.family, variants: [] };
      family.variants.push({ weight: face.weight, style: face.style, fileId, format, fileName: basename(file) });
      families.set(face.family, family);
    }
    config = { ...config, customFonts: [...(config.customFonts ?? []), ...families.values()] };
  }
  const name = opts.string('name') ?? (inputs.length === 1 ? basename(resolve(inputs[0]!), extname(inputs[0]!)) : chapters[0]!.title);
  return {
    name,
    locale: opts.string('locale') ?? config.locale ?? 'en',
    chapters,
    config,
    resources,
    files,
    // A fixed date: the same sources make the same bundle.
    mtime: new Date(1980, 0, 1),
  };
}

// ---------------------------------------------------------------------------
// Any input
// ---------------------------------------------------------------------------

export type InputKind = 'bundle' | 'folder' | 'markdown';

export function inputKind(inputs: readonly string[]): InputKind {
  if (inputs.length === 1) {
    const input = inputs[0]!;
    if (!existsSync(input)) throw new CliError(`No such file or folder: ${input}`);
    const st = statSync(input);
    if (st.isDirectory()) return existsSync(join(input, 'preset.json')) ? 'folder' : 'markdown';
    if (/\.(postext|zip)$/i.test(input)) return 'bundle';
    const head = readFileSync(input).subarray(0, 4);
    if (isZip(head)) return 'bundle';
  }
  return 'markdown';
}

export async function loadBook(inputs: readonly string[], opts: Options, reporter: Reporter): Promise<Book> {
  if (inputs.length === 0) throw new UsageError('Give a book: a .postext file, a folder or Markdown files');
  const locale = opts.string('locale');
  const kind = inputKind(inputs);
  const warn = (message: string) => reporter.warn({ kind: 'bundle', severity: 'warning', message });
  let book: Book;
  if (kind === 'folder') {
    const dir = inputs[0]!;
    const files = readTree(dir);
    let manifest: unknown;
    try {
      manifest = JSON.parse(new TextDecoder().decode(files.get('preset.json')!));
    } catch (err) {
      throw new CliError(`${join(dir, 'preset.json')} is not valid JSON: ${(err as Error).message}`);
    }
    const read = await readBundle(manifest, async (path) => {
      const bytes = files.get(path);
      if (!bytes) throw new Error(`Missing file "${path}" (named in preset.json)`);
      return bytes.slice().buffer;
    }, { ...(locale ? { locale } : {}), onWarning: warn }).catch((err: Error) => {
      throw new CliError(`${dir}: ${err.message}`);
    });
    const m = read.manifest;
    book = {
      kind,
      name: m.name,
      id: m.id,
      ...(m.description ? { description: m.description } : {}),
      locale: read.locale,
      ...(m.locales ? { locales: m.locales } : {}),
      chapters: read.chapters.map((c, i) => ({ title: c.title || chapterTitle(c.markdown, i + 1), file: c.file, markdown: c.markdown })),
      config: read.config,
      resources: read.resources,
      fonts: read.fonts,
      files,
      manifest: m,
      ...(m.thumbnail && files.has(m.thumbnail) ? { thumbnail: m.thumbnail } : {}),
      watchPaths: [dir],
    };
  } else {
    let bytes: Uint8Array;
    let watchPaths: string[];
    if (kind === 'bundle') {
      bytes = new Uint8Array(readFileSync(inputs[0]!));
      watchPaths = [inputs[0]!];
    } else {
      const created = await createBundle(await looseBundleInput(inputs, opts));
      for (const w of created.warnings) warn(w);
      bytes = created.bytes;
      watchPaths = [...inputs, ...['config', 'resources', 'fonts'].map((k) => opts.string(k)).filter((p): p is string => !!p)];
    }
    const opened = await openBundle(bytes, locale ? { locale } : {}).catch((err: Error) => {
      throw new CliError(`${inputs.join(' ')}: ${err.message}`);
    });
    for (const w of opened.warnings) warn(w);
    book = {
      kind,
      name: opened.name,
      id: opened.id,
      ...(opened.description ? { description: opened.description } : {}),
      locale: opened.locale,
      ...(opened.locales ? { locales: opened.locales } : {}),
      chapters: opened.chapters.map((c) => ({ title: c.title, file: c.file, markdown: c.markdown })),
      config: opened.config,
      resources: opened.resources,
      fonts: opened.fonts,
      files: opened.files,
      manifest: opened.manifest,
      ...(opened.thumbnail ? { thumbnail: opened.thumbnail } : {}),
      watchPaths,
    };
  }
  // --config over a book's own settings (loose Markdown has it already).
  const configPath = opts.string('config');
  if (configPath && kind !== 'markdown') book.config = deepMerge(book.config, readConfigFile(configPath));
  const sets = opts.list('set');
  if (sets.length > 0) book.config = applySet(book.config, sets);
  if (book.chapters.length === 0) throw new CliError('The book has no chapters');
  return book;
}

/** 1-based chapter list ("1,3-5") as 0-based indices. */
export function parseChapterList(spec: string, count: number): number[] {
  const out = new Set<number>();
  for (const part of spec.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+)?)?$/.exec(part);
    if (!m) throw new UsageError(`--chapters: "${part}" is not a chapter number or range`);
    const a = Number(m[1]);
    // A range stops at the last chapter; a single number past it is a mistake.
    const b = m[2] !== undefined || part.endsWith('-') ? Math.min(count, m[2] !== undefined ? Number(m[2]) : count) : a;
    if (a < 1 || a > count) throw new UsageError(`--chapters: the book has ${count} chapter${count === 1 ? '' : 's'} (asked for ${a})`);
    for (let i = a; i <= b; i++) out.add(i - 1);
  }
  return [...out].sort((x, y) => x - y);
}

