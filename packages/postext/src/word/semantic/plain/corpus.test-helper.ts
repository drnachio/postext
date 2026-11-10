// What the plain design is held to over real books (#1458): every
// Cookbook recipe as the site ships it (a `.postext` with its config,
// pictures and tables) and the showcase presets. Each plain export must be
// a sound package with none of the book's design left in it, map the same
// text of the Markdown and the resources as the book design does, its
// running text in the same order, and read back with no edit. The tests
// are cut in parts (corpus.partN.test.ts) so that none runs long.

// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { openBundle } from '../../../bundle/api.js';
import type { PostextConfig, Resource } from '../../../types.js';
import type { MapFragment } from '../../anchors/types.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import type { BookStart } from '../context.js';
import { exportDocx, exportProblems, looseMarkup, sectionsOf, type Exported } from '../fixtures/harness.js';

const ROOT = new URL('../../../../../../', import.meta.url).pathname;
const join = (...parts: string[]): string => parts.join('/').replace(/\/+/g, '/');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATE = '2026-11-04T00:00:00Z';

export interface Book {
  chapters: { id: string; title?: string; markdown: string }[];
  config: PostextConfig;
  resources: Resource[];
  bytes: (fileId: string) => Uint8Array | undefined;
  start?: BookStart;
}

/** The faces, inks, fills and rules a plain file may hold: Arial and
 *  Courier New, black, and the writer's own greys (source kept as it is,
 *  a highlight, a placeholder, the lines of an answer). */
const FACES = new Set(['Arial', 'Courier New']);
const INKS = new Set(['auto', '000000', '595959']);
const FILLS = new Set(['auto', 'EDEDED', 'D9D9D9', 'F2F2F2']);
const RULES = new Set(['auto', '000000', '808080', 'A6A6A6', '9A9A9A']);

/** What is left of a design in a plain export. */
function designLeft(e: Exported): string[] {
  const out: string[] = [];
  const xml = Object.keys(e.files).filter((f) => /^word\/[^/]+\.xml$/.test(f)).map((f) => e.part(f)).join('\n');
  const stray = (what: string, values: Iterable<string>, allowed: ReadonlySet<string>): void => {
    const found = new Set([...values].filter((v) => !allowed.has(v)));
    if (found.size) out.push(`${what}: ${[...found].join(', ')}`);
  };
  const all = (re: RegExp): string[] => [...xml.matchAll(re)].map((m) => m[1]!);
  stray('face', all(/<w:rFonts ([^>]*)\/>/g).flatMap((attrs) => [...attrs.matchAll(/="([^"]+)"/g)].map((m) => m[1]!)), FACES);
  stray('ink', all(/<w:color w:val="([^"]+)"/g), INKS);
  stray('fill', all(/w:fill="([^"]+)"/g), FILLS);
  stray('rule', all(/w:val="single"[^>]*w:color="([^"]+)"/g), RULES);
  for (const mark of ['<wp:anchor', '<w:framePr', '<w:background', '<w:caps/>', '<w:titlePg/>', 'w:headerReference', '<w:textDirection']) if (xml.includes(mark)) out.push(`has ${mark}`);
  if (Object.keys(e.files).some((f) => f.startsWith('word/fonts/'))) out.push('embeds fonts');
  for (const s of sectionsOf(e.doc, true)) {
    if (!s.includes('<w:pgSz w:w="11906" w:h="16838"/>')) out.push('a page that is not A4 upright');
    if (s.includes('w:num=')) out.push('a section in columns');
  }
  return [...new Set(out)];
}

/** The text an export maps to the Markdown and the resources. `flow`:
 *  without headings and the words a heading's or part's design prints,
 *  which the two designs order in their own way (a table of columns in
 *  the book, one after the other here; a title the book's design leaves
 *  out, hidden after its pieces there and shown before them here). */
function mapped(e: Exported, flow = false): string[] {
  const own = /^(?:heading:|attr:heading:|attr:part:)/;
  return e.map.fragments.filter((f) => f.target.kind !== 'generated' && !(flow && own.test(f.role ?? ''))).map((f) => `${JSON.stringify(f.target)}|${f.range.join('-')}|${f.text}`);
}

/** The items of `b` that `a` lacks, counting repeats. */
function missing(a: readonly string[], b: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const x of a) left.set(x, (left.get(x) ?? 0) + 1);
  return b.filter((x) => {
    const n = left.get(x) ?? 0;
    left.set(x, n - 1);
    return n <= 0;
  });
}

export async function problemsOf(name: string, book: Book): Promise<string[]> {
  const md = book.chapters.map((c) => c.markdown);
  const fields = (f: MapFragment): string | undefined => {
    if (f.target.kind !== 'resource') return undefined;
    const t = f.target;
    const res = book.resources.find((x) => x.id === t.resourceId);
    return t.field === 'cell' ? res?.table?.model.rows[t.row!]?.[t.col!]?.content : (res as unknown as Record<string, string> | undefined)?.[t.field];
  };
  const options = { chapters: book.chapters, config: book.config, resources: book.resources, resourceBytes: book.bytes, rasterizeSvg: async () => PNG, date: DATE, ...(book.start ? { start: book.start } : {}) };
  const plain = await exportDocx(md, { ...options, design: 'plain' });
  const designed = await exportDocx(md, options);
  const out = [...exportProblems(plain, md, fields), ...looseMarkup(plain.doc).map((p) => `loose ${p}`), ...designLeft(plain)];
  // Everything the book design maps is here too, and nothing else but a
  // part's number that the book prints inside a line of its design.
  for (const x of missing(mapped(plain), mapped(designed))) out.push(`lacks ${x.slice(0, 140)}`);
  const number = new Set(plain.map.fragments.filter((f) => f.role === 'attr:part:number').map((f) => `${JSON.stringify(f.target)}|${f.range.join('-')}|${f.text}`));
  for (const x of missing(mapped(designed), mapped(plain))) if (!number.has(x)) out.push(`adds ${x.slice(0, 140)}`);
  // The running text comes in the same order.
  const a = mapped(plain, true);
  const b = mapped(designed, true);
  const at = a.findIndex((x, i) => x !== b[i]);
  if (at >= 0) out.push(`fragment ${at} of the text is ${a[at]!.slice(0, 120)}, in the book design ${(b[at] ?? '').slice(0, 120)}`);
  const r = applyDocxEdits(plain.bytes, { chapters: book.chapters, resources: book.resources });
  for (const e of r.edits) out.push(`read back: ${e.status} ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}`);
  if (r.chapters.some((c, i) => c.markdown !== md[i])) out.push('read back: Markdown changed');
  return out.map((p) => `${name}: ${p}`);
}

const COOKBOOK = join(ROOT, 'apps/web/public/cookbook');

/** The recipes the site ships, by id, with the bundle to read. */
export function recipes(): { id: string; file: string }[] {
  const out: { id: string; file: string }[] = [];
  for (const id of readdirSync(COOKBOOK).sort()) {
    const file = ['en', 'es', 'ja', 'zh', 'ar'].map((l) => join(COOKBOOK, id, l, `${id}.postext`)).find((f) => existsSync(f));
    if (file) out.push({ id, file });
  }
  return out;
}

/** The problems of the recipes of part `part` of `parts` (every
 *  `parts`-th recipe from the `part`-th), and how many it read. */
export async function recipeProblems(part: number, parts: number): Promise<{ count: number; problems: string[] }> {
  const problems: string[] = [];
  const mine = recipes().filter((_, i) => i % parts === part);
  for (const { id, file } of mine) {
    const b = await openBundle(new Uint8Array(readFileSync(file)));
    const chapters = b.chapters.map((c, i) => ({ id: `c${i}`, title: c.title, markdown: c.markdown }));
    problems.push(...(await problemsOf(id, { chapters, config: b.config, resources: b.resources, bytes: (f) => b.files.get(f), ...(b.start ? { start: b.start as BookStart } : {}) })));
  }
  return { count: mine.length, problems };
}

/** The chapters read of each showcase book: its first ones, front matter
 *  and openers included, so that a long novel does not run long here. */
const PRESET_CHAPTERS = 12;

/** The showcase presets (a folder with a `preset.json` each), read as
 *  the semantic corpus test reads them. */
export function presets(): { id: string; book: Book }[] {
  const dir = join(ROOT, 'apps/web/public/presets');
  const out: { id: string; book: Book }[] = [];
  for (const id of readdirSync(dir).sort()) {
    const base = join(dir, id);
    if (!existsSync(join(base, 'preset.json'))) continue;
    const preset: { chapters: Record<string, unknown> | unknown[]; locale: string; config: PostextConfig; resources?: unknown[] } = JSON.parse(readFileSync(join(base, 'preset.json'), 'utf8'));
    const list = Array.isArray(preset.chapters) ? preset.chapters : (preset.chapters.en ?? preset.chapters[preset.locale] ?? Object.values(preset.chapters)[0]);
    const chapters = (list as { title: string; file: string }[]).slice(0, PRESET_CHAPTERS).map((c, i) => ({ id: `c${i}`, title: c.title, markdown: readFileSync(join(base, c.file), 'utf8') as string }));
    const resources = ((preset.resources ?? []) as Record<string, unknown>[]).map((r) => {
      const common = { id: r.id, typeId: r.typeId, kind: r.kind, caption: r.caption, note: r.note, altText: r.altText, createdAt: 0, updatedAt: 0 };
      if (r.kind === 'bitmap') return { ...common, bitmap: { fileId: r.file, format: String(r.file).split('.').pop(), width: r.width, height: r.height } };
      if (r.kind === 'svg') return { ...common, svg: { fileId: r.file, width: r.width, height: r.height } };
      return { ...r, ...common };
    }) as Resource[];
    out.push({ id, book: { chapters, config: preset.config, resources, bytes: (f) => (existsSync(join(base, f)) ? new Uint8Array(readFileSync(join(base, f))) : undefined) } });
  }
  return out;
}
