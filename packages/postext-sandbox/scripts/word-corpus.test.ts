// Every chapter of the showcase presets and the cookbook recipes, sent to
// Word (the semantic export, #1390) and read back untouched (#1395): no
// edit may be found and the text must come back as it was. Slow, so it
// runs on request: `WORD_CORPUS=1 pnpm vitest run scripts/word-corpus`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { applyDocxEdits, semanticDocx } from 'postext/word';

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

describe.runIf(run)('Word round trip over the repository corpus', () => {
  const files = [
    ...chapterFiles(join(ROOT, 'apps/web/public/presets')),
    ...chapterFiles(join(ROOT, 'cookbook')),
  ];
  const config = {} as PostextConfig;
  for (const file of files) {
    it(relative(ROOT, file), async () => {
      const markdown = readFileSync(file, 'utf8');
      const chapters = [{ id: 'x', title: 'x', markdown }];
      const bytes = await semanticDocx({ chapters, config, date: '2026-01-01T00:00:00Z' });
      const back = applyDocxEdits(bytes, { chapters });
      expect(back.edits).toEqual([]);
      expect(back.chapters[0]!.markdown).toBe(markdown);
    });
  }
});
