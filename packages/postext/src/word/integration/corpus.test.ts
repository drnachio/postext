// Round trip over the repository corpus (#1399): the built-in guide in
// every edition cut into its chapters, every Cookbook recipe text (the
// chapters of one locale form a book) and every showcase preset book, each
// exported by the semantic writer, and the same books laid out (with a
// deterministic measurer) and exported page by page by the formatted
// writer. Read back untouched, a book gives no edit and the same Markdown
// byte for byte; with one word of a chapter retyped in Word (a
// deterministic pick per chapter), exactly that word changes.
// Slow, so it runs on request: `WORD_CORPUS=1 npx vitest run src/word/integration/corpus`
// (`WORD_CORPUS_VARIANT=semantic|formatted` runs one writer only).

import { beforeAll, describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { semanticDocx } from '../semantic/index.js';
import { formattedDocx } from '../formatted/index.js';
import { build, config as formattedConfig } from '../formatted/formatted.test-helper.js';
import { ONE_LINE_DIRECTIVES } from '../../parse/blockParser.js';
import type { DirectiveName } from '../../parse/types.js';
import type { PostextConfig } from '../../index.js';
import { initTexToOmml } from '../ommlWrite/index.js';
import { applyDocxEdits } from '../roundtrip/index.js';
import type { WordChapterInput } from '../semantic/types.js';
import { DATE } from './integration.test-helper.js';
import { typeOver, wordText } from './wordEdit.test-helper.js';

// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

// Decoded: a checkout under a folder with spaces or accents is percent-encoded in the URL.
const ROOT = decodeURIComponent(new URL('../../../../../', import.meta.url).pathname).replace(/\/$/, '');
const join = (...parts: string[]): string => parts.join('/').replace(/\/+/g, '/');

interface CorpusBook {
  name: string;
  chapters: WordChapterInput[];
}

const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** Cut a guide edition at its level-1 headings outside code fences, the
 *  fallback when the Sandbox's own `sampleChapterTexts` cannot be loaded. */
function cutAtH1(markdown: string): string[] {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let start = 0;
  let fence = false;
  let front = lines[0] === '---';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (front) {
      if (i > 0 && l === '---') front = false;
      continue;
    }
    if (/^(```|~~~)/.test(l)) fence = !fence;
    if (!fence && /^# /.test(l) && i > start && lines.slice(start, i).some((x) => /^# /.test(x))) {
      out.push(lines.slice(start, i).join('\n'));
      start = i;
    }
  }
  out.push(lines.slice(start).join('\n'));
  return out;
}

async function guideBooks(): Promise<CorpusBook[]> {
  const dir = join(ROOT, 'packages/postext-sandbox/src/defaultMarkdown');
  let split: (md: string) => string[] = cutAtH1;
  try {
    const ops = (await import(/* @vite-ignore */ join(ROOT, 'packages/postext-sandbox/src/book/chapterOps.ts'))) as { sampleChapterTexts: (md: string) => string[] };
    split = ops.sampleChapterTexts;
  } catch {
    // keep the fallback
  }
  const books: CorpusBook[] = [];
  for (const f of (readdirSync(dir) as string[]).filter((f) => /^[a-zA-Z-]+\.ts$/.test(f) && f !== 'index.ts').sort()) {
    const mod = (await import(/* @vite-ignore */ join(dir, f))) as Record<string, unknown>;
    const md = Object.entries(mod).find(([k, v]) => k.startsWith('DEFAULT_MARKDOWN') && typeof v === 'string')?.[1] as string | undefined;
    if (!md) continue;
    const texts = split(md);
    books.push({ name: `guide/${f.replace(/\.ts$/, '')}`, chapters: texts.map((markdown, i) => ({ id: `c${i}`, markdown })) });
  }
  return books;
}

/** One book per recipe and locale: `content.<locale>.md` first, then the
 *  recipe's other `content.<part>.<locale>.md` files by name. */
function cookbookBooks(): CorpusBook[] {
  const dir = join(ROOT, 'cookbook');
  const books: CorpusBook[] = [];
  for (const r of (readdirSync(dir) as string[]).sort()) {
    if (r.startsWith('_') || !isDir(join(dir, r))) continue;
    const byLocale = new Map<string, string[]>();
    for (const f of (readdirSync(join(dir, r)) as string[]).sort()) {
      const m = /^content(?:\.([^.]+))?\.([a-zA-Z-]+)\.md$/.exec(f);
      if (!m) continue;
      const list = byLocale.get(m[2]!) ?? [];
      if (m[1]) list.push(f);
      else list.unshift(f);
      byLocale.set(m[2]!, list);
    }
    for (const [locale, files] of byLocale) {
      books.push({ name: `cookbook/${r}/${locale}`, chapters: files.map((f) => ({ id: f, markdown: readFileSync(join(dir, r, f), 'utf8') as string })) });
    }
  }
  return books;
}

/** One book per chapter directory of the showcase presets (`chapters` or
 *  `chapters/<locale>`). */
function presetBooks(): CorpusBook[] {
  const books: CorpusBook[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = (readdirSync(dir) as string[]).sort();
    } catch {
      return;
    }
    const md = entries.filter((e) => e.endsWith('.md'));
    if (/\/chapters(\/[^/]+)?$/.test(dir) && md.length) {
      books.push({ name: dir.slice(ROOT.length + 1), chapters: md.map((f) => ({ id: f, markdown: readFileSync(join(dir, f), 'utf8') as string })) });
    }
    for (const e of entries) if (e !== 'node_modules' && !e.startsWith('.') && isDir(join(dir, e))) walk(join(dir, e));
  };
  const root = join(ROOT, 'apps/web/public/presets');
  if (existsSync(root)) walk(root);
  return books;
}

/** A small seeded generator (mulberry32) keyed by a string. */
function prng(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plain prose paragraphs of a chapter: single-line blocks outside front
 *  matter and fences, with no Markdown or directive syntax and no
 *  characters the parser rewrites (quotes, dashes, ellipses). */
function plainParagraphs(markdown: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  const lines = markdown.split('\n');
  let pos = 0;
  let fence = false;
  let front = lines[0] === '---';
  // Open containers, each true when its text is kept verbatim (itself or
  // one around it). One-line directives (`:::toc`, `:::space`…) open none.
  const open: boolean[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const at = pos;
    pos += l.length + 1;
    if (front) {
      if (i > 0 && l === '---') front = false;
      continue;
    }
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence) continue;
    // Raw and verbatim containers keep their text as it stands; prose
    // inside boxes is fine.
    const opener = /^:{3,}\s*([a-zA-Z][\w-]*)/.exec(l);
    if (opener) {
      if (!ONE_LINE_DIRECTIVES.has(opener[1] as DirectiveName)) open.push(VERBATIM.test(opener[1]!) || open[open.length - 1] === true);
      continue;
    }
    if (/^:{3,}\s*$/.test(l)) {
      open.pop();
      continue;
    }
    if (open[open.length - 1]) continue;
    const prev = lines[i - 1] ?? '';
    const next = lines[i + 1] ?? '';
    if (prev.trim() !== '' || next.trim() !== '') continue;
    if (l.length < 20 || /^\s/.test(l)) continue;
    if (/[*_[\]{}()<>`$\\|~^=#:!&@"'«»“”‘’\-–—…%/+]/.test(l) || /\.\.\./.test(l) || /^\d+[.)]/.test(l)) continue;
    out.push({ start: at, text: l });
  }
  return out;
}

const VERBATIM = /^(raw|code|verse|poem|html|comic|strip|score|music|exercise|solution|table|grid|composed|page|frame|module)$/;

const SUBSTITUTES = ['amber', 'velvet', 'quartz', 'harbour', 'lantern', 'meadow'];
const CJK_SUBSTITUTES = ['春', '海', '光', '風'];

interface WordEdit {
  /** Offset of the replaced word in the chapter. */
  at: number;
  word: string;
  by: string;
  /** The context typed over in Word (unique in the document text). */
  find: string;
  replace: string;
}

/** The Nth word of a chosen plain paragraph (a two-character slice of a
 *  run with no spaces in scripts that do not space words), widened to a
 *  context that stands once in the document text and once in the whole
 *  book: a context only once in its chapter could be typed over in another
 *  chapter, where the formatted writer did not break it across lines. */
function chooseEdit(markdown: string, bookText: string, docText: string, key: string): WordEdit | undefined {
  const rnd = prng(key);
  const paras = plainParagraphs(markdown);
  for (let attempt = 0; attempt < 12 && paras.length; attempt++) {
    const p = paras[Math.floor(rnd() * paras.length)]!;
    const words = [...p.text.matchAll(/[\p{L}\p{M}]+/gu)].filter((m) => m[0].length >= 2);
    if (!words.length) continue;
    const m = words[Math.floor(rnd() * words.length)]!;
    let start = m.index!;
    let word = m[0];
    const spaced = /\s/.test(p.text);
    if (!spaced || word.length > 16) {
      const k = Math.floor(rnd() * Math.max(1, word.length - 1));
      start += k;
      word = word.slice(k, k + 2);
    }
    const pool = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word) ? CJK_SUBSTITUTES : SUBSTITUTES;
    const by = pool.filter((s) => s !== word)[Math.floor(rnd() * (pool.length - 1))]!;
    for (let pad = 0; pad <= p.text.length; pad += 4) {
      const a = Math.max(0, start - pad);
      const b = Math.min(p.text.length, start + word.length + pad);
      const find = p.text.slice(a, b);
      if (count(docText, find) === 1 && count(bookText, find) === 1) {
        const replace = find.slice(0, start - a) + by + find.slice(start - a + word.length);
        return { at: p.start + start, word, by, find, replace };
      }
      if (a === 0 && b === p.text.length) break;
    }
  }
  return undefined;
}

function count(hay: string, needle: string): number {
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0 && n < 2; i = hay.indexOf(needle, i + 1)) n++;
  return n;
}

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const RUN = env.WORD_CORPUS === '1';
/** Optional substring filter on book names (`WORD_CORPUS_ONLY=guide`). */
const ONLY = env.WORD_CORPUS_ONLY;

const documentText = (bytes: Uint8Array): string => wordText(strFromU8(unzipSync(bytes)['word/document.xml']!));

function withDocument(bytes: Uint8Array, f: (xml: string) => string): Uint8Array {
  const files = unzipSync(bytes);
  files['word/document.xml'] = strToU8(f(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

type Writer = (chapters: WordChapterInput[]) => Promise<Uint8Array>;

const semanticWriter: Writer = (chapters) => semanticDocx({ chapters, config: {} as never, date: DATE, exportId: 'ptx-corpus' });

/** A justified, hyphenated two-column page: line ends, added hyphens and
 *  column breaks fall inside most paragraphs. */
const FORMATTED_CONFIG = formattedConfig({ layout: { layoutType: 'double' } } as Partial<PostextConfig>);

const formattedWriter: Writer = (chapters) => {
  const docs = chapters.map((c) => build(c.markdown, FORMATTED_CONFIG));
  return formattedDocx({ docs, chapters, date: DATE, exportId: 'ptx-corpus' });
};

/** What went wrong with one book, as lines (empty when it squared). */
async function check(book: CorpusBook, tally: Tally, writer: Writer): Promise<string[]> {
  const out: string[] = [];
  const { chapters } = book;
  let bytes: Uint8Array;
  try {
    bytes = await writer(chapters);
  } catch (e) {
    return [`${book.name}: export threw ${String(e)}`];
  }
  const plain = applyDocxEdits(bytes, { chapters });
  for (const e of plain.edits) out.push(`${book.name} (no edit): ${e.status} ${e.kind} ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}${e.chapter ? ` in ${e.chapter}` : ''}`);
  // Chapters the untouched file already fails on, and the edits it already
  // reports, are left out of the word edits' checks.
  const broken = new Set<number>();
  plain.chapters.forEach((c, i) => {
    if (c.markdown === chapters[i]!.markdown) return;
    broken.add(i);
    out.push(`${book.name} (no edit): ${c.id} Markdown changed: ${firstDiff(chapters[i]!.markdown, c.markdown)}`);
  });
  const known = new Set(plain.edits.map((e) => `${e.chapter}\u0000${e.before}\u0000${e.after}`));
  tally.chapters += chapters.length;
  const text = documentText(bytes);
  const bookText = chapters.map((c) => c.markdown).join('\u0000');
  for (const [i, ch] of chapters.entries()) {
    if (broken.has(i)) continue;
    const edit = chooseEdit(ch.markdown, bookText, text, `${book.name}/${ch.id}`);
    if (!edit) {
      tally.skipped++;
      continue;
    }
    tally.edits++;
    let edited: Uint8Array;
    try {
      edited = withDocument(bytes, (xml) => typeOver(xml, edit.find, edit.replace));
    } catch (e) {
      out.push(`${book.name} ${ch.id}: could not type ${JSON.stringify(edit.find)}: ${String(e)}`);
      continue;
    }
    const r = applyDocxEdits(edited, { chapters });
    const want = chapters.map((c, j) => (j === i ? c.markdown.slice(0, edit.at) + edit.by + c.markdown.slice(edit.at + edit.word.length) : c.markdown));
    const got = r.chapters.map((c) => c.markdown);
    const fresh = r.edits.filter((e) => !known.has(`${e.chapter}\u0000${e.before}\u0000${e.after}`));
    const differs = (g: string, k: number): boolean => !broken.has(k) && g !== want[k];
    if (got.some(differs) || fresh.some((e) => e.status !== 'applied') || !fresh.length) {
      const j = got.findIndex(differs);
      const where = j < 0 ? '' : ` first difference in ${chapters[j]!.id}: ${firstDiff(want[j]!, got[j]!)}`;
      out.push(`${book.name} ${ch.id}: ${JSON.stringify(edit.word)} → ${JSON.stringify(edit.by)} gave edits ${JSON.stringify(fresh.map((e) => `${e.status}:${e.before}→${e.after}`))}${where}`);
    }
  }
  return out;
}

function firstDiff(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `want ${JSON.stringify(a.slice(Math.max(0, i - 20), i + 30))} got ${JSON.stringify(b.slice(Math.max(0, i - 20), i + 30))}`;
}

interface Tally {
  books: number;
  chapters: number;
  edits: number;
  skipped: number;
}

const VARIANT = env.WORD_CORPUS_VARIANT;
const WRITERS: [string, Writer][] = ([['semantic', semanticWriter], ['formatted', formattedWriter]] as [string, Writer][]).filter(([v]) => !VARIANT || v === VARIANT);
if (RUN && !WRITERS.length) throw new Error(`WORD_CORPUS_VARIANT: no writer "${VARIANT}" (semantic, formatted)`);

describe.runIf(RUN).each(WRITERS)('Word round trip over the repository corpus (%s)', (variant, writer) => {
  beforeAll(async () => {
    await initTexToOmml();
  });

  const sets: [string, () => CorpusBook[] | Promise<CorpusBook[]>][] = [
    ['the guide in every edition', guideBooks],
    ['every Cookbook recipe text', cookbookBooks],
    ['every showcase preset book', presetBooks],
  ];
  for (const [label, load] of sets) {
    it(label, async () => {
      const books = (await load()).filter((b) => !ONLY || b.name.includes(ONLY));
      const tally: Tally = { books: books.length, chapters: 0, edits: 0, skipped: 0 };
      const out: string[] = [];
      for (const b of books) out.push(...(await check(b, tally, writer)));
      console.log(`[word corpus] ${variant}, ${label}: ${tally.books} books, ${tally.chapters} chapters, ${tally.edits} word edits (${tally.skipped} chapters with no plain paragraph), ${out.length} problems`);
      expect(out).toEqual([]);
    }, 1_800_000);
  }
});
