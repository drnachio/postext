/**
 * A recipe in several languages as one book (#1209). The pen writes one
 * bundle per edition (lib/probe.js `sandboxBundle`, on the pen's engine).
 * This module puts them together, with the engine of the working tree
 * (the one the Sandbox ships), as a book in several languages: the
 * settings every edition shares as its general settings (`commonConfig`
 * of the editions' configurations, `locale` aside) and, per language, the
 * fields it sets otherwise. Each edition's folder gets the book with its
 * own language first (`<lang>/<slug>.postext` opens in `<lang>`), the other
 * editions beside it.
 *
 * Every edition of the book is read back and compared with the bundle the
 * pen wrote for it: chapters, configuration (defaults stripped), resources
 * (files compared by their bytes), start, cover Markdown (#1671), title.
 * An edition that does not read back the same is left out of the book,
 * with a note; a book of one edition is the pen's bundle as it was.
 * Editions whose bundles name the same language (the English and Spanish
 * pages of a novel set in Arabic both write `ar`) cannot share a book: the
 * first in `sample.locales` order stays.
 *
 * Run by Node's type stripping: erasable TypeScript.
 */
import crypto from "node:crypto";
import {
  commonConfig,
  createBundle,
  openBundleZip,
  pickBundleMeta,
  readBundle,
  sameConfig,
  stripConfigDefaults,
} from "postext";
import type { PostextConfig, Resource } from "postext";
import type { SampleLocale } from "../../src/lib/cookbook/types.ts";

/** The date every file of a bundle carries (lib/probe.js ZIP_EPOCH). */
const ZIP_EPOCH = new Date(1980, 0, 1, 0, 0, 0);

/** One edition as its own bundle holds it. */
interface Edition {
  variant: SampleLocale;
  /** The bundle's language tag (`en`, `ar-MA`, `en-us`). */
  tag: string;
  bytes: Buffer;
  name: string;
  description?: string;
  chapters: { title: string; markdown: string }[];
  config: PostextConfig;
  resources: Resource[];
  start?: unknown;
  /** The print cover's Markdown (`cover.md`, #1671). */
  coverMarkdown?: string;
  canvasScope?: "book";
  thumbnail?: { data: Uint8Array; mime: string };
  /** The bundle's files by path (= the fileIds above). */
  files: Map<string, Uint8Array>;
}

export interface EditionBooks {
  /** The bundle each edition's folder gets. */
  books: Map<SampleLocale, Buffer>;
  /** Per edition, what the run says about its book. */
  notes: Map<SampleLocale, string[]>;
}

const primaryTag = (tag: string) => tag.split(/[-_]/)[0]!.toLowerCase();
const sha1 = (bytes: Uint8Array) => crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 16);

/** Plain JSON: drops undefined and functions. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null)) as T;

async function readEdition(variant: SampleLocale, bytes: Buffer, locale?: string): Promise<Edition> {
  const zip = openBundleZip(new Uint8Array(bytes));
  const manifest = zip.manifest as { locale?: string; thumbnail?: string; view?: { canvasScope?: "book" } };
  const read = await readBundle(zip.manifest, zip.readFile, { ...(locale ? { locale } : {}), traceContours: false });
  const meta = pickBundleMeta(read.manifest, read.locale);
  const thumb = manifest.thumbnail && zip.files.get(manifest.thumbnail);
  return {
    variant,
    tag: read.locale,
    bytes,
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    chapters: read.chapters.map((c) => ({ title: c.title, markdown: c.markdown })),
    config: plain(read.config),
    resources: plain(read.resources),
    ...(read.start ? { start: plain(read.start) } : {}),
    ...(read.coverMarkdown ? { coverMarkdown: read.coverMarkdown } : {}),
    ...(manifest.view?.canvasScope === "book" ? { canvasScope: "book" as const } : {}),
    ...(thumb ? { thumbnail: { data: thumb, mime: manifest.thumbnail!.endsWith(".png") ? "image/png" : "image/webp" } } : {}),
    files: zip.files,
  };
}

/** The fileIds a resource names. */
function resourceFiles(r: Resource): string[] {
  const any = r as unknown as {
    bitmap?: { fileId?: string }; svg?: { fileId?: string; pdfFileId?: string };
    video?: { fileId?: string; poster?: { fileId?: string } };
  };
  return [any.bitmap?.fileId, any.svg?.fileId, any.svg?.pdfFileId, any.video?.fileId, any.video?.poster?.fileId]
    .filter((id): id is string => typeof id === "string");
}

/** `value` with every string `rename` maps replaced (fileIds). */
function renamed<T>(value: T, rename: Map<string, string>): T {
  if (rename.size === 0) return value;
  return JSON.parse(JSON.stringify(value), (_key, v) => (typeof v === "string" && rename.has(v) ? rename.get(v) : v)) as T;
}

/** A configuration as compared: defaults stripped, fonts named by family,
 *  weight, style and the bytes of their files. */
function configKey(config: PostextConfig, files: Map<string, Uint8Array>): { config: unknown; fonts: string[] } {
  const stripped = plain(stripConfigDefaults(config)) as Record<string, unknown>;
  delete stripped.customFonts;
  const fonts = (config.customFonts ?? []).flatMap((family) => (family.variants ?? []).map((v) => {
    const bytes = v.fileId ? files.get(v.fileId) : undefined;
    return `${family.name}|${v.weight}|${v.style}|${bytes ? sha1(bytes) : v.fileId ?? ""}`;
  }));
  return { config: stripped, fonts: fonts.sort() };
}

/** Resources as compared: every fileId replaced by the hash of its bytes,
 *  without the times a reader stamps on them. */
function resourcesKey(resources: Resource[], files: Map<string, Uint8Array>): unknown {
  const ids = new Map<string, string>();
  for (const r of resources) for (const id of resourceFiles(r)) {
    const bytes = files.get(id);
    ids.set(id, bytes ? `bytes:${sha1(bytes)}` : `missing:${id}`);
  }
  return renamed(resources.map(({ createdAt: _c, updatedAt: _u, ...r }) => r), ids);
}

/** Where `book`, read in `edition`'s language, differs from the edition's
 *  own bundle; null when it reads back the same. */
function difference(edition: Edition, book: Edition): string | null {
  if (!sameConfig(edition.chapters, book.chapters)) return "the chapters differ";
  const a = configKey(edition.config, edition.files);
  const b = configKey(book.config, book.files);
  if (!sameConfig(a.config, b.config)) return "the configuration differs";
  const missing = a.fonts.filter((f) => !b.fonts.includes(f));
  if (missing.length) return `font files differ (${missing[0]})`;
  if (!sameConfig(resourcesKey(edition.resources, edition.files), resourcesKey(book.resources, book.files))) return "the resources differ";
  if (!sameConfig(edition.start ?? null, book.start ?? null)) return "the start differs";
  if ((edition.coverMarkdown ?? "") !== (book.coverMarkdown ?? "")) return "the cover Markdown differs";
  if (edition.name !== book.name || (edition.description ?? "") !== (book.description ?? "")) return "the title differs";
  if ((edition.canvasScope ?? null) !== (book.canvasScope ?? null)) return "the view differs";
  return null;
}

/** The book of `editions` (the first is the primary, the bundle's own
 *  language), as bytes. */
async function writeBook(editions: Edition[]): Promise<Buffer> {
  const [primary, ...others] = editions;
  const files = new Map<string, Uint8Array>();
  // Each edition's files under their own paths; one the primary (or an
  // edition before) holds with other bytes goes under the edition's tag.
  const own = editions.map((e) => {
    const rename = new Map<string, string>();
    for (const [id, bytes] of e.files) {
      const there = files.get(id);
      if (!there) files.set(id, bytes);
      else if (sha1(there) !== sha1(bytes)) {
        const other = `${e.variant}/${id}`;
        rename.set(id, other);
        files.set(other, bytes);
      }
    }
    const resources = e.resources.map(({ createdAt: _c, updatedAt: _u, ...r }) => r as Resource);
    // Copies: the edition's own stay as read, to compare the book with.
    return { config: structuredClone(renamed(e.config, rename)), resources: structuredClone(renamed(resources, rename)) };
  });
  const withoutLocale = own.map(({ config }) => {
    const copy = { ...config } as Record<string, unknown>;
    delete copy.locale;
    return copy as PostextConfig;
  });
  const sharedConfig = commonConfig(withoutLocale);
  const byId = (list: Resource[]) => new Map(list.map((r) => [r.id, r]));
  const primaryResources = byId(own[0]!.resources);
  const localized = Object.fromEntries(others.map((e, i) => {
    const mine = own[i + 1]!;
    // The wording and artwork that differ, by id.
    const resources = mine.resources.flatMap((r) => {
      const shared = primaryResources.get(r.id) as Record<string, unknown> | undefined;
      if (!shared) return [r];
      const delta: Record<string, unknown> = { id: r.id };
      for (const [key, value] of Object.entries(r)) if (!sameConfig(value, shared[key])) delta[key] = value;
      return Object.keys(delta).length > 1 ? [delta as Pick<Resource, "id"> & Partial<Resource>] : [];
    });
    return [e.tag, {
      ...(e.name !== primary!.name ? { name: e.name } : {}),
      ...(e.description && e.description !== primary!.description ? { description: e.description } : {}),
      chapters: e.chapters,
      config: mine.config,
      ...(resources.length ? { resources } : {}),
      ...(!sameConfig(e.start ?? null, primary!.start ?? null) ? { start: (e.start ?? {}) as never } : {}),
      ...(e.coverMarkdown && e.coverMarkdown !== primary!.coverMarkdown ? { coverMarkdown: e.coverMarkdown } : {}),
    }];
  }));
  const created = await createBundle({
    id: (openBundleZip(new Uint8Array(primary!.bytes)).manifest as { id: string }).id,
    name: primary!.name,
    ...(primary!.description ? { description: primary!.description } : {}),
    locale: primary!.tag,
    chapters: primary!.chapters,
    config: own[0]!.config,
    sharedConfig,
    resources: own[0]!.resources,
    files,
    ...(primary!.start ? { start: primary!.start as never } : {}),
    ...(primary!.coverMarkdown ? { coverMarkdown: primary!.coverMarkdown } : {}),
    ...(primary!.canvasScope ? { canvasScope: primary!.canvasScope } : {}),
    ...(primary!.thumbnail ? { thumbnail: primary!.thumbnail } : {}),
    localized,
    mtime: ZIP_EPOCH,
  });
  return Buffer.from(created.bytes);
}

/**
 * The bundle of each edition of a recipe as a book in several languages
 * (see the module comment). `bundles` holds each edition's own bundle (a
 * fresh run's) or the book an earlier capture wrote into its folder, which
 * opens in that edition first; `order` is `sample.locales`. An edition
 * that cannot be read is left as it is.
 */
export async function editionBooks(bundles: Map<SampleLocale, Buffer>, order: readonly SampleLocale[]): Promise<EditionBooks> {
  const notes = new Map<SampleLocale, string[]>();
  const books = new Map<SampleLocale, Buffer>();
  const say = (variant: SampleLocale, note: string) => notes.set(variant, [...(notes.get(variant) ?? []), note]);
  const editions: Edition[] = [];
  for (const variant of order) {
    const bytes = bundles.get(variant);
    if (!bytes) continue;
    try {
      // A book written before opens in its own folder's language: that
      // edition alone, as the pen wrote it.
      const zip = openBundleZip(new Uint8Array(bytes));
      const tag = (zip.manifest as { locale?: string }).locale;
      editions.push(await readEdition(variant, bytes, tag));
    } catch (error) {
      say(variant, `book in several languages: the bundle does not open (${(error as Error).message})`);
      books.set(variant, bytes);
    }
  }
  if (editions.length < 2) {
    for (const e of editions) books.set(e.variant, e.bytes);
    return { books, notes };
  }
  for (const first of editions) {
    // This edition first, then the others in sample order, one per
    // language: of two editions in one language, the one whose page is in
    // it (the English page of a manga beside the Japanese page that shows
    // the English lettering).
    const others = editions.filter((e) => e !== first);
    const ownLanguage = (e: Edition) => primaryTag(e.tag) === e.variant;
    let members = [first];
    for (const e of [...others.filter(ownLanguage), ...others.filter((o) => !ownLanguage(o))]) {
      if (members.some((m) => primaryTag(m.tag) === primaryTag(e.tag))) {
        say(first.variant, `book in several languages: ${e.variant} left out (its bundle is in ${e.tag}, as another edition's)`);
      } else members.push(e);
    }
    members = editions.filter((e) => members.includes(e)).sort((a, b) => (a === first ? -1 : b === first ? 1 : 0));
    let bytes: Buffer | null = null;
    while (members.length > 1) {
      bytes = await writeBook(members);
      const wrong: Edition[] = [];
      for (const e of members) {
        const back = await readEdition(e.variant, bytes, e.tag);
        const why = difference(e, { ...back, files: back.files });
        if (why) {
          wrong.push(e);
          say(first.variant, `book in several languages: ${e.variant} left out (${why} when read back)`);
        }
      }
      if (wrong.length === 0) break;
      if (wrong.includes(first)) {
        members = [first];
        break;
      }
      members = members.filter((e) => !wrong.includes(e));
      bytes = null;
    }
    if (members.length < 2 || !bytes) {
      books.set(first.variant, first.bytes);
      continue;
    }
    books.set(first.variant, bytes);
    say(first.variant, `book in several languages: ${members.map((e) => e.variant).join(", ")}`);
  }
  return { books, notes };
}
