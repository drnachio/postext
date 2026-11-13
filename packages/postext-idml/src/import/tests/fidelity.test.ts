// The findings of the reference document and of a round trip, pinned:
// what the importer reads differently, how gravely and how often. A
// change of this list is a change of fidelity: a finding that goes is an
// improvement to note here, one that comes (or grows graver) a regression
// to explain.

import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { idmlDocument } from '../../export/index.js';
import { reference } from '../../read/fixture.test-helper.js';
import { build, config, LOREM, mm } from '../../testing/kit.test-helper.js';
import { idmlToPostext } from '../index.js';
import type { IdmlImportResult } from '../types.js';

type Pin = [id: string, severity: 'loss' | 'warning' | 'info', count: number];
const pins = (r: IdmlImportResult): Pin[] => r.report.findings.map((f) => [f.id, f.severity, f.count]);

describe('the reference document InDesign wrote', () => {
  // Losses common to both layouts: what Postext has no means for.
  const LOSSES: Pin[] = [['diagonalCellLines', 'loss', 1], ['grepStyles', 'loss', 4], ['missingPicture', 'loss', 4], ['paragraphRules', 'loss', 1], ['rotatedCell', 'loss', 1], ['textOnPath', 'loss', 1]];
  const INFO: Pin[] = [
    ['baselineGrid', 'info', 1], ['bleed', 'info', 1], ['bookmarks', 'info', 1], ['conditionalText', 'info', 1], ['crossReferenceLive', 'info', 1], ['editorialNotes', 'info', 1],
    ['hiddenConditionalText', 'info', 1], ['hiddenLayers', 'info', 1], ['hiddenObjects', 'info', 1], ['indexNotPrinted', 'info', 1], ['localOverrides', 'info', 2], ['nestedStyleApplied', 'info', 4],
    ['nonPrinting', 'info', 1], ['openTypeFeatures', 'info', 9], ['pasteboard', 'info', 1],
  ];
  const sorted = (list: Pin[]): Pin[] => {
    const rank = { loss: 0, warning: 1, info: 2 };
    return [...list].sort((a, b) => rank[a[1]] - rank[b[1]] || a[0].localeCompare(b[0]));
  };

  it('as composed pages', () => {
    const r = idmlToPostext(reference(), { layout: 'pages' });
    expect(pins(r)).toEqual(sorted([
      ...LOSSES, ['effects', 'loss', 1], ['opacity', 'loss', 1],
      ['acrossSpine', 'warning', 1], ['anchoredObjectFrameEstimated', 'warning', 1], ['gradient', 'warning', 1], ['inlineTracking', 'warning', 1],
      ['pageLinkTarget', 'warning', 1], ['shapeOverFrame', 'warning', 2], ['tableFooterRows', 'warning', 1],
      // Its cropped picture fills the frame across and is scaled evenly:
      // the template's cover fit shows what the frame showed (#1555).
      ...INFO, ['croppedPictureCover', 'info', 1], ['firstBaselineEstimated', 'info', 14], ['spotColour', 'info', 2],
    ]));
    expect(r.report.verdict).toBe('lossy');
  });

  it('as a flowing book', () => {
    const r = idmlToPostext(reference(), { layout: 'flow' });
    expect(pins(r)).toEqual(sorted([
      ...LOSSES, ['pageArtInFlow', 'loss', 4],
      ['anchoredObjectBeside', 'warning', 1], ['inlineTracking', 'warning', 1], ['otherMasters', 'warning', 1], ['pageLinkTarget', 'warning', 1], ['tableFooterRows', 'warning', 1],
      ...INFO, ['firstBaselineEstimated', 'info', 3], ['sideStories', 'info', 1], ['spotColour', 'info', 1],
    ]));
    // The page with no master is the one a flowing book cannot tell apart.
    expect(r.report.findings.find((f) => f.id === 'otherMasters')!.examples).toEqual(['no master: page 2']);
  });

  it('says of every loss what the book shows instead', () => {
    for (const layout of ['pages', 'flow'] as const) {
      for (const f of idmlToPostext(reference(), { layout }).report.findings.filter((x) => x.severity === 'loss')) {
        expect(f.message, f.id).toMatch(/keeps|is set|are set|is drawn|placeholder|left out|without/);
        expect(f.examples.length, f.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('a book exported and imported back', () => {
  const MD = `# First chapter\n\n${LOREM}\n\nA second paragraph with *italic* and **bold** words, and a [link](https://postext.dev/).\n\n- one\n- two\n\n## A section\n\n${Array(12).fill(LOREM).join('\n\n')}\n`;
  const cfg = config({ page: { dpi: 72, width: mm(140), height: mm(200), margins: { top: mm(15), bottom: mm(20), left: mm(18), right: mm(12), mirror: true } } } as unknown as Partial<PostextConfig>);
  // A block a frame, as #1555 exported every book (`text: 'frames'`).
  const { bytes } = idmlDocument({ docs: [build(MD, cfg)], title: 'Round trip', text: 'frames' });
  // No localOverrides: every paragraph of the export carries only its
  // style, which takes the format most of its paragraphs share (#1555).
  const COMMON: Pin[] = [['baselineGrid', 'info', 1], ['colouredText', 'info', 4], ['continuedParagraphs', 'info', 2], ['fontStatus', 'info', 4]];

  it('comes back as composed pages with nothing lost and nothing approximated', () => {
    const r = idmlToPostext(bytes, { layout: 'pages' });
    expect(pins(r)).toEqual(COMMON);
    expect(r.report.verdict).toBe('faithful');
  });

  it('comes back as a flowing book in reading order', () => {
    const r = idmlToPostext(bytes, { layout: 'flow' });
    expect(pins(r)).toEqual([...COMMON, ['storiesInSequence', 'info', 7]]);
    expect(r.report.verdict).toBe('faithful');
    const md = r.chapters.map((c) => c.markdown).join('\n');
    // The chapter opens with its heading; nothing is boxed.
    expect(r.chapters.map((c) => c.title)).toEqual(['First chapter']);
    expect(md).toMatch(/^# First chapter\n\nTypesetting is/);
    expect(md).not.toContain(':::callout');
    expect(md.indexOf('## A section')).toBeGreaterThan(md.indexOf('A second paragraph'));
  });

  it('comes back as the flowing book it was when its text is threaded (#1559)', () => {
    const threaded = idmlDocument({ docs: [build(MD, cfg)], title: 'Round trip' }).bytes;
    const r = idmlToPostext(threaded, { layout: 'auto' });
    expect(r.layout).toBe('flow');
    expect(r.report.verdict).toBe('faithful');
    const md = r.chapters.map((c) => c.markdown).join('\n');
    expect(md).toMatch(/^# First chapter\n\nTypesetting is/);
    expect(md.match(/Typesetting is the composition/g)).toHaveLength(13);
    expect(md).not.toMatch(/\\\n/);
  });
});
