// No-edit round trip over real books (#1395): the built-in guide and every
// Cookbook recipe text exported by the semantic writer and read straight
// back give no edit at all, equations included, also after the run
// properties and rsid attributes Word adds to the equations it saves.

import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { semanticDocx } from '../semantic/index.js';
import { applyDocxEdits } from './index.js';

const ROOT = new URL('../../../../../', import.meta.url).pathname;
const join = (...parts: string[]): string => parts.join('/').replace(/\/+/g, '/');
const DATE = '2026-11-04T00:00:00Z';

/** Word's rewrite of the equations of a file it saves. */
function wordRewrite(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes);
  for (const part of ['word/document.xml', 'word/footnotes.xml']) {
    if (!files[part]) continue;
    const xml = strFromU8(files[part]!).replaceAll('<m:r>', '<m:r w:rsidR="00C0FFEE"><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>');
    files[part] = strToU8(xml);
  }
  return zipSync(files);
}

async function problems(name: string, markdown: string): Promise<string[]> {
  const chapters = [{ id: 'c', markdown }];
  const bytes = await semanticDocx({ chapters, config: {}, date: DATE });
  const out: string[] = [];
  for (const [how, file] of [['plain', bytes], ['word', wordRewrite(bytes)]] as const) {
    const r = applyDocxEdits(file, { chapters });
    for (const e of r.edits) out.push(`${name} (${how}): ${e.status} ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}`);
    if (r.chapters[0]!.markdown !== markdown) out.push(`${name} (${how}): Markdown changed`);
  }
  return out;
}

describe('no-edit round trip over real books', () => {
  it('the built-in guide', async () => {
    const path = join(ROOT, 'packages/postext-sandbox/src/defaultMarkdown/en.ts');
    const { DEFAULT_MARKDOWN_EN: md } = (await import(/* @vite-ignore */ path)) as { DEFAULT_MARKDOWN_EN: string };
    expect(await problems('guide', md)).toEqual([]);
  }, 60_000);

  it('every Cookbook recipe text', async () => {
    const dir = join(ROOT, 'cookbook');
    const recipes = readdirSync(dir).filter((d: string) => existsSync(join(dir, d, 'content.en.md')));
    expect(recipes.length).toBeGreaterThan(100);
    const out: string[] = [];
    for (const r of recipes) out.push(...(await problems(r, readFileSync(join(dir, r, 'content.en.md'), 'utf8'))));
    expect(out).toEqual([]);
  }, 240_000);
});
