// Every chapter of the showcase presets and the cookbook recipes, sent to
// Word and back: the engine must read the same blocks. Slow, so it runs on
// request: `WORD_CORPUS=1 pnpm vitest run scripts/word-corpus`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMarkdown, type PostextConfig } from 'postext';
import { readDocx } from '../src/word/docxRead';
import { emptyTemplate, parseTemplate } from '../src/word/template';
import { postextToDocx } from '../src/word/toDocx';
import { wordToPostext } from '../src/word/toMarkdown';

const ROOT = resolve(__dirname, '../../..');
const run = process.env.WORD_CORPUS === '1';

function chapterFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) chapterFiles(p, out);
    else if (e.endsWith('.md') && p.includes(`${'/'}chapters${'/'}`)) out.push(p);
  }
  return out;
}

const OFFSET_KEYS = new Set(['sourceStart', 'sourceEnd', 'sourceMap', 'lineStart', 'attrSources']);

function blocksOf(markdown: string): unknown {
  const ids = new Map<string, string>();
  const id = (v: string): string => {
    if (!ids.has(v)) ids.set(v, String(ids.size + 1));
    return ids.get(v)!;
  };
  return JSON.parse(JSON.stringify(parseMarkdown(markdown), (k, v) => {
    if (OFFSET_KEYS.has(k) || /[a-z](Start|End)$/.test(k)) return undefined;
    if (k === 'footnoteDef' && typeof v === 'string') return id(v);
    if (k === 'footnote' && v && typeof v.id === 'string') return { ...v, id: id(v.id) };
    return v;
  }));
}

describe.runIf(run)('Word round trip over the repository corpus', () => {
  const files = [
    ...chapterFiles(join(ROOT, 'apps/web/public/presets')),
    ...chapterFiles(join(ROOT, 'cookbook')),
  ];
  const config = {} as PostextConfig;
  for (const file of files) {
    it(relative(ROOT, file), () => {
      const markdown = readFileSync(file, 'utf8');
      const bytes = postextToDocx([{ title: 'x', markdown }], { template: emptyTemplate(), config, book: false });
      const doc = readDocx(bytes);
      const back = wordToPostext(doc, { template: parseTemplate(doc.embeddedTemplate)!, config, chapters: 'single', existingIds: new Set(), untitledChapter: 'x' });
      expect(blocksOf(back.chapters[0]!.markdown)).toEqual(blocksOf(markdown));
    });
  }
});
