import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { metadataText, normalizeMetadata } from '../frontmatter';
import { resolvePlaceholders, type PlaceholderContext } from '../pipeline/placeholders';
import { resolveDesignPlaceholders } from '../design/placeholders';
import type { VDTPage } from '../vdt';
import type { DocumentMetadata, PostextConfig } from '../types';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

/** A header that prints every metadata placeholder, pipe-separated. */
const cfg = (over: PostextConfig = {}): PostextConfig => ({
  page: { width: pt(420), height: pt(240), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  header: {
    elements: [{
      kind: 'text', id: 'meta', content: '{title}|{subtitle}|{author}|{publishDate}', fontSize: pt(8), overflow: 'ellipsis-end',
      placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'auto', height: 'auto' } },
    }],
  },
  ...over,
});

const headerText = (markdown: string, over?: PostextConfig): string => {
  const doc = buildDocument({ markdown }, cfg(over));
  const block = doc.pages[0]!.header?.blocks[0] as { lines?: Array<{ text: string }> } | undefined;
  return (block?.lines ?? []).map((l) => l.text).join(' ');
};

// gray-matter parses YAML natively: `1984` is a number, `2026-09-24` a Date,
// `[A, B]` an array. Every one of them used to resolve to ''.
const TYPED = `---
title: 1984
subtitle: true
author: [Ana, Luis]
publishDate: 2026-09-24
---

# One

Body.`;

describe('non-string frontmatter values', () => {
  it('print in the metadata placeholders (dates in the document language)', () => {
    expect(headerText(TYPED)).toBe('1984|true|Ana, Luis|September 24, 2026');
    expect(headerText(TYPED, { locale: 'es' })).toBe('1984|true|Ana, Luis|24 de septiembre de 2026');
    // The hyphenation locale stands in when `locale` is unset.
    expect(headerText(TYPED, { bodyText: { hyphenation: { locale: 'de' } } })).toBe('1984|true|Ana, Luis|24. September 2026');
  });

  it('reach the VDT as strings; other keys are left as parsed', () => {
    const doc = buildDocument({ markdown: `${TYPED.replace('---\n\n', 'edition: 2\n---\n\n')}` }, cfg());
    expect(doc.metadata).toMatchObject({ title: '1984', subtitle: 'true', author: 'Ana, Luis', publishDate: 'September 24, 2026' });
    expect(doc.metadata.edition).toBe(2);
  });

  it('host metadata is coerced the same way', () => {
    const doc = buildDocument({ markdown: '# One\n\nBody.', metadata: { title: 1984 as unknown as string } }, cfg());
    expect(doc.metadata.title).toBe('1984');
  });

  it('quoted values print verbatim, as before', () => {
    const md = `---\ntitle: "1984"\npublishDate: "24/09/2026"\n---\n\n# One\n\nBody.`;
    expect(headerText(md)).toBe('1984|||24/09/2026');
  });

  // The Document Format notes: YAML reads a number as a value (1.50, octal
  // 017, base-60 1:30) and a timestamp as an instant, printed by its UTC day.
  it('numbers print as YAML read them; a timestamp prints its UTC day', () => {
    const md = `---\ntitle: 1.50\nsubtitle: 017\nauthor: 1:30\npublishDate: 2026-09-24T23:30:00-05:00\n---\n\n# One\n\nBody.`;
    expect(headerText(md)).toBe('1.5|15|90|September 25, 2026');
    expect(headerText(md, { locale: 'es' })).toBe('1.5|15|90|25 de septiembre de 2026');
  });

  it('a printed field with no text form is left out of doc.metadata', () => {
    const doc = buildDocument({ markdown: `---\ntitle:\nauthor: {name: Ana}\nedition: {n: 2}\n---\n\n# One\n\nBody.` }, cfg());
    expect('title' in doc.metadata).toBe(false);
    expect('author' in doc.metadata).toBe(false);
    // Keys Postext does not print are kept as parsed.
    expect(doc.metadata.edition).toEqual({ n: 2 });
  });
});

describe('metadataText', () => {
  it('coerces scalars, dates and lists; drops the rest', () => {
    expect(metadataText('x')).toBe('x');
    expect(metadataText(1984)).toBe('1984');
    expect(metadataText(false)).toBe('false');
    expect(metadataText(['A', 2, 'B'])).toBe('A, 2, B');
    expect(metadataText(new Date(Date.UTC(2026, 8, 24)), 'en-us')).toBe('September 24, 2026');
    expect(metadataText(new Date(Date.UTC(2026, 8, 24)), 'fr')).toBe('24 septembre 2026');
    // A date prints the calendar day YAML wrote, whatever the time zone.
    expect(metadataText(new Date(Date.UTC(2026, 0, 1, 0, 0)), 'en-us')).toBe('January 1, 2026');
    // The Document Format page examples; a time of day is dropped.
    const docsDate = new Date(Date.UTC(2026, 3, 15, 10, 30));
    expect(metadataText(docsDate, 'en-us')).toBe('April 15, 2026');
    expect(metadataText(docsDate, 'es')).toBe('15 de abril de 2026');
    expect(metadataText(docsDate, 'de')).toBe('15. April 2026');
    // Without a locale a date is ISO.
    expect(metadataText(new Date(Date.UTC(2026, 8, 24)))).toBe('2026-09-24');
    expect(metadataText(new Date(Number.NaN))).toBeUndefined();
    expect(metadataText(null)).toBeUndefined();
    expect(metadataText(undefined)).toBeUndefined();
    expect(metadataText({ a: 1 })).toBeUndefined();
    expect(metadataText(Number.NaN)).toBeUndefined();
  });

  it('normalizeMetadata touches only the four documented fields', () => {
    const meta = { title: 7, author: ['A'], extra: 3, publishDate: { nested: true } } as unknown as DocumentMetadata;
    expect(normalizeMetadata(meta, 'en-us')).toEqual({ title: '7', author: 'A', extra: 3 });
  });
});

describe('placeholder resolvers', () => {
  const page = { index: 0, pageLabel: '1' } as unknown as VDTPage;
  const metadata = { title: 1984, publishDate: new Date(Date.UTC(2026, 8, 24)) } as unknown as PlaceholderContext['metadata'];

  it('coerce raw metadata they are handed directly', () => {
    const ctx: PlaceholderContext = { page, allPages: [page], metadata, chapterTitleByPageIndex: [''] };
    expect(resolvePlaceholders('{title}|{publishDate}', ctx)).toMatchObject({ text: '1984|2026-09-24', missingMetadata: [] });
    expect(resolveDesignPlaceholders('{title}|{publishDate}', { ...ctx, kind: 'heading' }).text).toBe('1984|2026-09-24');
  });
});
