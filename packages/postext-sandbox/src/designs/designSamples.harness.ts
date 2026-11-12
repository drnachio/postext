/**
 * Designs on the sample books (#1523, #1532), shared by the
 * `designSamples.part*.test.ts` files: the four designs the site ships, the
 * sample books (the showcase presets and the guide) and what a layout of
 * their first chapters paints.
 *
 * The check is on solid pages: a design box that covers the page. A book
 * paints some on purpose (a cover, its part dividers, the blank verso
 * facing a divider); a design applied by parts must not make it paint more
 * of them, the way a book's blank-page band paints every blank page the
 * design's own breaks leave. Per page role, the book with the design paints
 * no more solid pages than the book alone; on text pages (body, opener) the
 * share is compared, since a smaller page sets the same text on more of
 * them.
 */
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync, readdirSync } from 'node:fs';
import { buildBundle, type PostextConfig, type Resource, type VDTDocument, type VDTPage } from 'postext';
import { openDesignBundle, readBundle } from 'postext/bundle';
import type { Design } from 'postext';
import { createPostextGuideConfig } from '../context/guideConfig.js';
import { sampleChapterTexts } from '../book/chapterOps.js';
import { DEFAULT_MARKDOWN_EN } from '../defaultMarkdown/index.js';
import { buildDefaultResources } from '../defaultResources/index.js';
import { generalSettingsWithWording } from '../editions/configLayers.js';

const PUBLIC = new URL('../../../../apps/web/public/', import.meta.url);
const at = (...path: string[]): URL => new URL(path.join('/'), PUBLIC);
const readText = (url: URL): string => readFileSync(url, 'utf8') as string;
const readBytes = (url: URL): Uint8Array => readFileSync(url) as Uint8Array;
const list = (url: URL): string[] => readdirSync(url) as string[];

/** Text measured without a canvas: half an em a character, enough for
 *  where pages break. */
export function stubCanvas(): void {
  const em = (font: string): number => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  class StubContext {
    font = '16px serif';
    letterSpacing = '0px';
    measureText(text: string) {
      const e = em(this.font);
      return { width: [...text].length * e * 0.5, actualBoundingBoxAscent: e * 0.8, actualBoundingBoxDescent: e * 0.2, fontBoundingBoxAscent: e * 0.8, fontBoundingBoxDescent: e * 0.2 };
    }
  }
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    getContext(): StubContext {
      return new StubContext();
    }
  };
}

/** The designs the site ships, by file name. */
export async function shippedDesigns({ conventions = false } = {}): Promise<{ id: string; design: Design }[]> {
  // The composition conventions (#1540) hold line-breaking rules alone and
  // paint nothing, so the page checks leave them out unless asked.
  const files = list(at('designs/')).filter((f) => f.endsWith('.postext') && (conventions || !f.startsWith('composition-'))).sort();
  return Promise.all(files.map(async (f) => ({ id: f.replace(/\.postext$/, ''), design: (await openDesignBundle(new Uint8Array(readBytes(at('designs', f))))).design })));
}

/** A sample book: its configuration and its first chapters. */
export interface SampleBook {
  id: string;
  config: PostextConfig;
  chapters: string[];
  resources: Resource[];
}

/** The guide in English: cover, contents, the first part and its chapters. */
export async function guideBook(count = 5): Promise<SampleBook> {
  return {
    id: 'postext-guide',
    config: createPostextGuideConfig('en'),
    chapters: sampleChapterTexts(DEFAULT_MARKDOWN_EN).slice(0, count),
    resources: await buildDefaultResources('en'),
  };
}

/** The showcase presets as the bundle reader opens them, in their first
 *  language: the configuration of that edition (`edition`) and the general
 *  settings a sample design is taken from (`design`), `count` chapters.
 *  Pictures and fonts are left unread. */
export async function presetBooks(count = 3): Promise<(SampleBook & { design: PostextConfig })[]> {
  const ids = list(at('presets/')).filter((d) => !d.includes('.')).sort();
  return Promise.all(ids.map(async (id) => {
    const manifest: unknown = JSON.parse(readText(at('presets', id, 'preset.json')));
    const read = async (path: string): Promise<ArrayBuffer> => {
      if (!/\.(md|json)$/.test(path)) return new ArrayBuffer(0);
      const bytes = readBytes(at('presets', id, path));
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    };
    const book = await readBundle(manifest, read);
    return {
      id,
      config: book.config,
      design: book.sharedConfig ? generalSettingsWithWording(book.sharedConfig, book.config) : book.config,
      chapters: book.chapters.slice(0, count).map((c) => c.markdown),
      resources: book.resources,
    };
  }));
}

/** Lay `book` out in `config`. */
export function layOut(book: SampleBook, config: PostextConfig): VDTDocument[] {
  return buildBundle({ chapters: book.chapters.map((markdown) => ({ markdown })), config, resources: book.resources });
}

/** Whether a design box covers (nine tenths of) the page. */
function solid(page: VDTPage): boolean {
  const area = page.width * page.height * 0.9;
  const slots = [page.header, page.footer, page.openerBand, page.lineNumbers];
  return slots.some((slot) => slot?.blocks.some((b) => b.kind === 'box' && b.box.backgroundColor !== undefined && b.box.backgroundColor !== 'transparent' && b.bbox.width * b.bbox.height >= area));
}

/** Per page role: how many pages, how many of them solid. */
export type SolidCount = Record<string, { pages: number; solid: number }>;

export function solidPages(docs: readonly VDTDocument[]): SolidCount {
  const out: SolidCount = {};
  for (const page of docs.flatMap((d) => d.pages)) {
    const role = page.role ?? 'body';
    const c = (out[role] ??= { pages: 0, solid: 0 });
    c.pages++;
    if (solid(page)) c.solid++;
  }
  return out;
}

const TEXT_ROLES = new Set(['body', 'opener']);

/** The roles on which `withDesign` paints more solid pages than `alone`. */
export function moreSolidPages(alone: SolidCount, withDesign: SolidCount): string[] {
  const out: string[] = [];
  for (const [role, c] of Object.entries(withDesign)) {
    const was = alone[role] ?? { pages: 0, solid: 0 };
    const more = TEXT_ROLES.has(role) ? c.solid / c.pages > (was.pages > 0 ? was.solid / was.pages : 0) + 1e-9 : c.solid > was.solid;
    if (more) out.push(`${role}: ${c.solid}/${c.pages} solid, the book alone ${was.solid}/${was.pages}`);
  }
  return out;
}
