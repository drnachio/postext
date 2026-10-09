import { describe, it, expect } from 'vitest';
import { buildDocument } from '../index';
import { parseMarkdown } from '../parse';
import { computeOutlineFor } from '../pipeline/outline';
import { migrateConfig, pinLegacyHeadingMarks, CONFIG_VERSION } from '../bundle';
import { resolveHeadingsConfig, stripHeadingsDefaults } from '../defaults/headings';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTDocument } from '../vdt';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });

const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
});

const headings = (doc: VDTDocument): VDTBlock[] => doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks)).filter((b) => b.type === 'heading');
const segmentsOf = (b: VDTBlock) => b.lines.flatMap((l) => l.segments ?? []).filter((s) => s.kind === 'text');

describe('inline marks in headings (EF-122)', () => {
  it('parses bold and italic runs in a heading, the text as before', () => {
    const [h] = parseMarkdown('###### *Rock bar* and **more**');
    expect(h!.text).toBe('Rock bar and more');
    expect(h!.spans.map((s) => [s.text, s.bold, s.italic])).toEqual([
      ['Rock bar', false, true],
      [' and ', false, false],
      ['more', true, false],
    ]);
  });

  it('keeps the heading text trimmed before its attributes', () => {
    const [h] = parseMarkdown('# The *Titanic* disaster {style="x"}');
    expect(h!.text).toBe('The Titanic disaster');
    expect(h!.spans.map((s) => s.text).join('')).toBe('The Titanic disaster');
  });

  it('sets the marked words of a heading in italic and bold', () => {
    const doc = buildDocument({ markdown: '## The *Titanic* and **Lusitania**\n\nText.' }, config());
    const [h] = headings(doc);
    const segs = segmentsOf(h!);
    expect(segs.find((s) => s.text === 'Titanic')?.italic).toBe(true);
    expect(segs.find((s) => s.text === 'Lusitania')?.bold).toBe(true);
    expect(segs.find((s) => s.text === 'The')?.italic).toBeFalsy();
    // A bold run takes a bold face even in a heading set at a lighter weight.
    const light = buildDocument(
      { markdown: '## The **Lusitania**\n\nText.' },
      config({ headings: { levels: [{ level: 2, fontWeight: 400 }] } }),
    );
    expect(headings(light)[0]!.boldFontString).toMatch(/^700 /);
  });

  it('leaves the number prefix in the heading\'s own style', () => {
    const doc = buildDocument(
      { markdown: '## *Rock bar*\n\nText.' },
      config({ headings: { levels: [{ level: 2, numberingTemplate: '{2}.' }] } }),
    );
    const segs = segmentsOf(headings(doc)[0]!);
    expect(segs[0]!.text).toBe('1.');
    expect(segs[0]!.italic).toBeFalsy();
    expect(segs.find((s) => s.text === 'Rock')?.italic).toBe(true);
  });

  it('carries the marks into the contents outline', () => {
    const outline = computeOutlineFor(parseMarkdown('## The *Titanic*'), config());
    expect(outline[0]!.spans).toEqual([
      { text: 'The ', bold: false, italic: false },
      { text: 'Titanic', bold: false, italic: true },
    ]);
  });

  it('prints the marks as plain text with headings.inlineMarks: false, as up to postext 1.4', () => {
    const cfg = config({ headings: { inlineMarks: false } });
    const doc = buildDocument({ markdown: '## The *Titanic* and **Lusitania**\n\nText.' }, cfg);
    const [h] = headings(doc);
    expect(segmentsOf(h!).every((s) => !s.italic && !s.bold)).toBe(true);
    expect(h!.lines.map((l) => l.text).join(' ')).toBe('The Titanic and Lusitania');
    const outline = computeOutlineFor(parseMarkdown('## The *Titanic*'), cfg);
    expect(outline[0]!.spans).toEqual([{ text: 'The Titanic', bold: false, italic: false }]);
  });

  it('resolves and strips the option like the other heading settings', () => {
    expect(resolveHeadingsConfig(undefined).inlineMarks).toBe(true);
    expect(resolveHeadingsConfig({ inlineMarks: false }).inlineMarks).toBe(false);
    expect(stripHeadingsDefaults({ inlineMarks: true })).toBeUndefined();
    expect(stripHeadingsDefaults({ inlineMarks: false })).toEqual({ inlineMarks: false });
  });
});

describe('heading marks in configurations stored before they printed (EF-122 pin)', () => {
  const MARKED = '# One\n\n##### *Abordaje compensatorio*\n\nText.';
  const PLAIN = '# One\n\n## Plain heading\n\nText with *italic* in the body.';

  it('pins marks off for an older configuration whose headings carry marks', () => {
    const old: PostextConfig = { headings: { fontFamily: 'Georgia' } };
    // (with the version-8 split pin: the text has headings)
    expect(migrateConfig(old, 5, { content: MARKED }).headings).toEqual({ fontFamily: 'Georgia', inlineMarks: false, keepWithNextSplit: 'fill' });
    expect(migrateConfig(old, undefined, { content: [PLAIN, MARKED] }).headings?.inlineMarks).toBe(false);
    // Unknown content may carry marks.
    expect(migrateConfig(old, 5).headings?.inlineMarks).toBe(false);
  });

  it('sees a marked heading indented as the parser reads it', () => {
    // The block parser trims a line before it reads a heading, so four
    // spaces or a tab before the `#` still make one.
    const old: PostextConfig = { headings: { fontFamily: 'Georgia' } };
    for (const lead of ['    ', '\t', '      ']) {
      expect(migrateConfig(old, 5, { content: `# One\n\n${lead}##### *Indented*\n\nText.` }).headings?.inlineMarks).toBe(false);
    }
    // `#` alone on its line is no heading, whatever follows on the next line.
    expect(migrateConfig(old, 5, { content: '#\n*not a title*' }).headings).toBe(old.headings);
  });

  it('leaves a configuration whose headings carry none as it was', () => {
    const old: PostextConfig = { headings: { fontFamily: 'Georgia' } };
    // Only the version-8 split pin applies: the text has headings.
    expect(migrateConfig(old, 5, { content: PLAIN }).headings).toEqual({ ...old.headings, keepWithNextSplit: 'fill' });
    expect(migrateConfig(old, 7, { content: PLAIN }).headings?.inlineMarks).toBeUndefined();
  });

  it('keeps a value the configuration already names, and today\'s configurations', () => {
    const named: PostextConfig = { headings: { inlineMarks: true } };
    expect(pinLegacyHeadingMarks(named)).toBe(named);
    const today: PostextConfig = { headings: { fontFamily: 'Georgia' } };
    expect(migrateConfig(today, CONFIG_VERSION, { content: MARKED })).toBe(today);
    expect(CONFIG_VERSION).toBe(9);
  });

  it('lays an unversioned document out as postext 1.4 did', () => {
    const migrated = migrateConfig(config(), undefined, { content: MARKED });
    const doc = buildDocument({ markdown: MARKED }, migrated);
    const h5 = headings(doc).find((b) => b.headingLevel === 5)!;
    expect(segmentsOf(h5).every((s) => !s.italic)).toBe(true);
  });
});
