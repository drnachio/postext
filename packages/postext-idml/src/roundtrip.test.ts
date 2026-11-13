// What the exporter writes, the reader reads back: the package of a
// laid-out book holds its pages, its text in order and its styles, with
// nothing the reader has to warn about.

import { describe, expect, it } from 'vitest';
import { pageDisplayList } from 'postext';
import type { PostextConfig } from 'postext';
import { build, config, mm, LOREM } from './testing/kit.test-helper.js';
import { idmlDocument, idmlToPostext, inspectIdml, plainText, readIdml, readingOrder } from './index.js';

const MD = `# First chapter\n\n${LOREM}\n\nA second paragraph with *italic* and **bold** words, and a [link](https://postext.dev/).\n\n- one\n- two\n\n## A section\n\n${Array(12).fill(LOREM).join('\n\n')}\n`;

describe('export → read', () => {
  const cfg = config({ page: { dpi: 72, width: mm(140), height: mm(200), margins: { top: mm(15), bottom: mm(20), left: mm(18), right: mm(12), mirror: true } } } as unknown as Partial<PostextConfig>);
  const doc = build(MD, cfg);
  const { bytes } = idmlDocument({ docs: [doc], title: 'Round trip', text: 'frames' });
  const idml = readIdml(bytes);

  it('reads the package without a warning', () => {
    expect(idml.warnings).toEqual([]);
    expect(idml.name).toBe('Round trip');
  });

  it('holds every page, two to a spread about the spine after the first', () => {
    const pages = idml.spreads.flatMap((s) => s.pages);
    expect(pages).toHaveLength(doc.pages.length);
    expect(doc.pages.length).toBeGreaterThan(2);
    expect(idml.preferences.facingPages).toBe(true);
    expect(idml.spreads[0]!.pages).toHaveLength(1);
    expect(idml.spreads[1]!.pages).toHaveLength(2);
    expect(idml.spreads[1]!.pages.map((p) => p.side)).toEqual(['left', 'right']);
    // Mirrored margins: the inside one is the wider (18 mm) on both sides.
    for (const p of pages) expect(p.margins.left).toBeCloseTo((18 * 72) / 25.4, 1);
    expect(pages[0]!.bounds.right - pages[0]!.bounds.left).toBeCloseTo((140 * 72) / 25.4, 2);
  });

  it('keeps the words of every text item, in page order', () => {
    const order = readingOrder(idml);
    const read = order.map((o) => plainText(o.story.paragraphs)).join('\n').replace(/[\u2028\n\t]+/g, ' ').replace(/\s+/g, ' ');
    const painted = doc.pages
      .flatMap((_, p) => pageDisplayList(doc, p).items)
      .flatMap((i) => (i.kind === 'text' ? i.lines.map((l) => l.text) : []))
      .join(' ')
      .replace(/\s+/g, ' ');
    // Every painted word is in the package (the order of frames on a page
    // is the reader's; the words are the same).
    const words = (s: string) => s.split(' ').filter(Boolean).sort();
    const count = (list: string[]) => list.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
    const a = count(words(read));
    const b = count(words(painted));
    const off = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).map((k) => `${k}: ${a.get(k) ?? 0}/${b.get(k) ?? 0}`);
    expect(off).toEqual([]);
  });

  it('carries the link, the faces and the styles', () => {
    expect(idml.hyperlinks).toHaveLength(1);
    const dest = idml.destinations.get(idml.hyperlinks[0]!.destination ?? '');
    expect(dest?.url).toBe('https://postext.dev/');
    const summary = inspectIdml(idml);
    expect(summary.pages).toBe(doc.pages.length);
    const styles = [...idml.styles.paragraph.values()].map((s) => s.name);
    expect(styles).toEqual(expect.arrayContaining(['Body', 'Heading 1', 'Heading 2', 'List']));
  });
});

// Postext → IDML → Postext: the lines the export kept come back as the
// lines of the imported book, justified as they were (postext 1.74,
// `bodyText.justifyHardBreaks`).
describe('export → import', () => {
  const cfg = config({ page: { dpi: 72, width: mm(140), height: mm(200), margins: { top: mm(15), bottom: mm(20), left: mm(18), right: mm(12) } } } as unknown as Partial<PostextConfig>);
  const source = build(`${Array(3).fill(LOREM).join('\n\n')}\n`, cfg);
  const { bytes } = idmlDocument({ docs: [source], title: 'Kept lines', text: 'frames' });
  const result = idmlToPostext(bytes, { layout: 'pages' });

  it('turns justified forced breaks on and reports nothing about them', () => {
    expect(result.config.bodyText?.justifyHardBreaks).toBe(true);
    expect(result.report.findings.map((f) => f.id)).not.toContain('forcedBreakInJustified');
  });

  it('writes kept lines with ordinary spaces', () => {
    const markdown = result.chapters.map((c) => c.markdown).join('\n');
    expect(markdown).toContain('\\\n');
    expect(markdown).not.toContain('\u00a0');
  });

  it('sets the same lines, justified, when the imported book is laid out', () => {
    const painted = (doc: ReturnType<typeof build>) => doc.pages
      .flatMap((_, p) => pageDisplayList(doc, p).items)
      .flatMap((i) => (i.kind === 'text' ? i.lines : []));
    const before = painted(source).filter((l) => l.text.trim().split(' ').length > 3);
    const again = build(result.chapters.map((c) => c.markdown).join('\n\n'), result.config as PostextConfig);
    const after = painted(again).filter((l) => l.text.trim().split(' ').length > 3);
    expect(after.map((l) => l.text.trim())).toEqual(before.map((l) => l.text.trim()));
    // Every line but a paragraph's last fills the measure, as in the source.
    const full = (lines: typeof before) => lines.filter((l) => !l.last).length;
    expect(full(after)).toBe(full(before));
    expect(full(after)).toBeGreaterThan(10);
  });
});
