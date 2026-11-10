// Test kit: small laid-out documents with a deterministic measurer, built
// with the engine's public API only.

import { buildDocument } from 'postext';
import type { PostextConfig, Resource, VDTDocument } from 'postext';

// Deterministic stub: every character is 7 px wide, bold ones 8 px.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * (/bold|700/.test(this.font) ? 8 : 7) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

export const mm = (value: number) => ({ value, unit: 'mm' as const });

export const LOREM = 'Typesetting is the composition of text by means of arranging physical type or its digital equivalents. Stored letters and other symbols are retrieved and ordered according to the language orthography for visual display. Characteristically a justified column of text is set with even spaces between words, and long compound words such as internationalization and representativeness get hyphenated at the end of lines.';

export function config(over: Partial<PostextConfig> = {}): PostextConfig {
  return {
    page: { dpi: 72, width: mm(140), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
    layout: { layoutType: 'single' },
    bodyText: { textAlign: 'justify', firstLineIndent: mm(0), hyphenation: { enabled: true } },
    headings: { balancing: { enabled: false } },
    header: { elements: [] },
    footer: { elements: [] },
    ...over,
  } as PostextConfig;
}

export function build(markdown: string, cfg: PostextConfig, resources?: Resource[]): VDTDocument {
  return buildDocument({ markdown, ...(resources ? { resources } : {}) }, cfg);
}
