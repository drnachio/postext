// Small packages for the importer's tests: one page, stories set in
// frames, text formatted with local overrides (no style part needed).

import { parseMarkdown } from 'postext';
import { frameXml, mini, storyXml, type MiniOptions } from '../../read/fixture.test-helper.js';
import { readIdml } from '../../read/index.js';
import { idmlToPostext } from '../index.js';
import type { IdmlImportOptions, IdmlImportResult } from '../types.js';

export const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A character range with attributes. */
export const run = (text: string, attrs = ''): string => `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]" ${attrs}><Content>${xml(text)}</Content></CharacterStyleRange>`;

/** A paragraph: ranges, then its end. */
export const para = (inner: string, attrs = ''): string => `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle" ${attrs}>${inner}<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Br/></CharacterStyleRange></ParagraphStyleRange>`;

export const plain = (text: string, attrs = ''): string => para(run(text), attrs);

/** A document of one story in one frame that fills the page. */
export function oneStory(body: string, options: MiniOptions = {}): Uint8Array {
  return mini({ ...options, stories: { s1: storyXml('s1', body), ...(options.stories ?? {}) }, items: frameXml('f1', 's1', [36, 36, 576, 756]) + (options.items ?? '') });
}

export function importOne(body: string, options: IdmlImportOptions = {}, more: MiniOptions = {}): IdmlImportResult {
  return idmlToPostext(readIdml(oneStory(body, more)), { layout: 'flow', ...options });
}

export const markdownOf = (r: IdmlImportResult): string => r.chapters.map((c) => c.markdown).join('\n\n');

/** The Markdown without the front matter and page or frame fences. */
export const bodyOf = (r: IdmlImportResult): string => markdownOf(r).replace(/^---\n[\s\S]*?\n---\n/, '').trim();

export const finding = (r: IdmlImportResult, id: string) => r.report.findings.find((f) => f.id === id);

interface Span { text: string; bold?: boolean; italic?: boolean; [k: string]: unknown }
interface Block { type: string; text: string; spans: Span[]; [k: string]: unknown }

export const parse = (markdown: string): Block[] => parseMarkdown(markdown) as unknown as Block[];

/** What a span carries beside its text: marks, links, references. */
export function marksOf(blocks: readonly Block[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    for (const s of b.spans) {
      for (const k of Object.keys(s)) {
        if (k === 'text') continue;
        if ((k === 'bold' || k === 'italic') && s[k] === false) continue;
        out.push(`${k}:${JSON.stringify(s[k])}`);
      }
    }
  }
  return out;
}
