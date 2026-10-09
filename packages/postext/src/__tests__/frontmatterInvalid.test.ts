import { describe, it, expect } from 'vitest';
import { extractFrontmatter } from '../frontmatter';
import { buildDocument } from '../pipeline';
import { collectContentWarnings, formatWarning } from '../pipeline/contentWarnings';
import { contentOutline, continuationAfter } from '../pipeline/continuation';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

// Front matter a reader is in the middle of typing (#645).
const TEXT_AFTER_QUOTE = '---\ntitle: "Cielo profundo" EDITADO\nauthor: Ana\n---\n\n# Heading\n\nBody text.';
const UNCLOSED_QUOTE = '---\ntitle: "Cielo\n---\n# Heading\n\nBody text.';
const UNCLOSED_LIST = '---\ntitle: [unclosed\n---\n# Heading\n\nBody text.';

describe('extractFrontmatter — front matter that does not parse', () => {
  it('returns no metadata and the text after the block instead of throwing', () => {
    for (const md of [TEXT_AFTER_QUOTE, UNCLOSED_QUOTE, UNCLOSED_LIST]) {
      const fm = extractFrontmatter(md);
      expect(fm.metadata).toEqual({});
      expect(fm.content.trimStart().startsWith('# Heading')).toBe(true);
      expect(md.slice(fm.contentOffset)).toBe(fm.content);
      expect(fm.fieldSources).toBeUndefined();
      expect(fm.error).toBeDefined();
    }
  });

  it('splits the block where a block that parses would be split', () => {
    const good = extractFrontmatter('---\ntitle: Fine\n---\n\n# Heading\n\nBody text.');
    const bad = extractFrontmatter(TEXT_AFTER_QUOTE);
    expect(bad.content).toBe(good.content);
  });

  it('names the reason with its line and column, and spans the whole block', () => {
    const { error } = extractFrontmatter(TEXT_AFTER_QUOTE);
    expect(error!.message).toMatch(/^can not read a block mapping entry.*\(\d+:\d+\)$/);
    expect(error!.sourceStart).toBe(0);
    expect(TEXT_AFTER_QUOTE.slice(error!.sourceStart, error!.sourceEnd)).toBe('---\ntitle: "Cielo profundo" EDITADO\nauthor: Ana\n---\n');
  });

  it('keeps reporting the error on the same text (gray-matter caches a failed parse)', () => {
    const md = '---\ntitle: "again\n---\nBody.';
    const first = extractFrontmatter(md);
    const second = extractFrontmatter(md);
    expect(second).toEqual(first);
    expect(second.content).toBe('Body.');
    expect(second.error).toBeDefined();
  });

  it('takes a block that is never closed as the whole text', () => {
    const md = '---\ntitle: "open\nno closing line';
    const fm = extractFrontmatter(md);
    expect(fm.content).toBe('');
    expect(fm.error!.sourceEnd).toBe(md.length);
  });

  it('skips a byte order mark before the block', () => {
    const md = `﻿${UNCLOSED_QUOTE}`;
    const fm = extractFrontmatter(md);
    expect(fm.error!.sourceStart).toBe(1);
    expect(fm.content.startsWith('# Heading')).toBe(true);
    expect(md.slice(fm.contentOffset)).toBe(fm.content);
  });

  it('reads YAML that is not a mapping as no metadata', () => {
    const fm = extractFrontmatter('---\n- a\n- b\n---\nBody.');
    expect(fm.metadata).toEqual({});
    expect(fm.error).toBeUndefined();
  });

  it('leaves valid front matter alone', () => {
    const fm = extractFrontmatter('---\ntitle: "Cielo profundo"\n---\nBody.');
    expect(fm.metadata.title).toBe('Cielo profundo');
    expect(fm.error).toBeUndefined();
  });
});

describe('invalidFrontmatter content warning', () => {
  it('is collected at the block, before the warnings of the body', () => {
    const warnings = collectContentWarnings(`${UNCLOSED_QUOTE}\n\n:::nonsense\n`);
    expect(warnings.map((w) => w.kind)).toEqual(['invalidFrontmatter', 'unknownDirective']);
    const [w] = warnings;
    expect(w!.sourceStart).toBe(0);
    // The body's offsets still point into the original text.
    const directive = warnings[1]!;
    expect(`${UNCLOSED_QUOTE}\n\n:::nonsense\n`.slice(directive.sourceStart, directive.sourceEnd)).toContain(':::nonsense');
    expect(formatWarning(w!)).toMatch(/^The front matter cannot be read: .* — the document is set without its metadata \(offset 0\)$/);
  });

  it('is listed by the build, which lays out the body', () => {
    const doc = buildDocument({ markdown: TEXT_AFTER_QUOTE }, {});
    expect(doc.contentWarnings?.map((w) => w.kind)).toContain('invalidFrontmatter');
    expect(doc.metadata.title).toBeUndefined();
    const heading = doc.blocks.find((b) => b.type === 'heading');
    expect(heading?.lines[0]?.text).toContain('Heading');
    expect(TEXT_AFTER_QUOTE.slice(heading!.sourceStart, heading!.sourceEnd)).toContain('Heading');
  });

  it('does not stop the chapter planners', () => {
    expect(() => continuationAfter({ markdown: TEXT_AFTER_QUOTE })).not.toThrow();
    expect(continuationAfter({ markdown: TEXT_AFTER_QUOTE }).headings?.h1).toBe(1);
    expect(() => contentOutline({ markdown: TEXT_AFTER_QUOTE }, {})).not.toThrow();
  });
});
