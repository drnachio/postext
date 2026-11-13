// A paragraph that goes on in another frame stays one paragraph: in a
// threaded story as it comes, and in a document of separate stories (an
// export of laid-out pages) where the pieces are told by their look.

import { describe, expect, it } from 'vitest';
import { pageDisplayList } from 'postext';
import type { PostextConfig } from 'postext';
import { idmlDocument } from '../../export/index.js';
import { frameXml, mini, storyXml } from '../../read/fixture.test-helper.js';
import { build, config, LOREM, mm } from '../../testing/kit.test-helper.js';
import { idmlToPostext } from '../index.js';
import { finding, markdownOf, para, plain, run } from './kit.test-helper.js';

const lines = (doc: ReturnType<typeof build>) =>
  doc.pages.flatMap((_, p) => pageDisplayList(doc, p).items.flatMap((i) => (i.kind === 'text' ? i.lines.map((l) => ({ page: p, text: l.text.trim(), last: !!l.last })) : [])));

describe('a paragraph cut at a page break by an export', () => {
  const cfg = config({ page: { dpi: 72, width: mm(140), height: mm(200), margins: { top: mm(15), bottom: mm(20), left: mm(18), right: mm(12) } } } as unknown as Partial<PostextConfig>);
  const source = build(`${Array(14).fill(LOREM).join('\n\n')}\n`, cfg);
  const { bytes } = idmlDocument({ docs: [source], title: 'Continued', text: 'frames' });
  const result = idmlToPostext(bytes, { layout: 'pages' });
  const md = markdownOf(result);

  it('is one paragraph again, in frames chained from page to page', () => {
    expect(source.pages.length).toBeGreaterThan(2);
    const joins = finding(result, 'continuedParagraphs');
    expect(joins).toMatchObject({ severity: 'info' });
    expect(joins!.count).toBeGreaterThanOrEqual(2);
    // No piece is left as a paragraph of its own justified to its last line.
    expect(finding(result, 'lastLineAlignment')).toBeUndefined();
    expect(md).not.toContain(':::paragraphs');
    // The frame the paragraph leaves names the frame it goes on in.
    const chained = result.config.pageTemplates!.flatMap((t) => t.frames ?? []).filter((f) => f.overflow?.continueIn);
    expect(chained.length).toBe(joins!.count);
    for (const f of chained) expect(f.overflow).toMatchObject({ continueIn: `page:{attr.to_${f.name}}#t1`, mark: false });
    expect(md).toMatch(/::::page\{template="page-1" id="p1" to_t\d+="p2"\}/);
    // Fourteen paragraphs went in, fourteen come out.
    expect(md.match(/Typesetting is the composition/g)).toHaveLength(14);
    expect(md.match(/^:::frame\{/gm)).toHaveLength(14);
  });

  it('sets every line on the page it was on, justified but the last of each paragraph', () => {
    const again = build(md, result.config as PostextConfig);
    const before = lines(source).filter((l) => l.text.split(' ').length > 3);
    const after = lines(again).filter((l) => l.text.split(' ').length > 3);
    expect(after.map((l) => `${l.page}: ${l.text}`)).toEqual(before.map((l) => `${l.page}: ${l.text}`));
    expect(after.map((l) => l.last)).toEqual(before.map((l) => l.last));
  });

  it('reads as one paragraph in a flowing book too', () => {
    const flow = idmlToPostext(bytes, { layout: 'flow' });
    expect(finding(flow, 'continuedParagraphs')!.count).toBe(finding(result, 'continuedParagraphs')!.count);
    expect(markdownOf(flow).match(/Typesetting is the composition/g)).toHaveLength(14);
    expect(finding(flow, 'lastLineAlignment')).toBeUndefined();
  });
});

describe('what is not a continued paragraph', () => {
  const TEXT = 'A paragraph of running text long enough to fill the lines of its frame, and it ends in a full stop. ';
  const two = (first: string, second: string, frames: string): ReturnType<typeof idmlToPostext> =>
    idmlToPostext(mini({ stories: { s1: storyXml('s1', first), s2: storyXml('s2', second) }, items: frames }), { layout: 'pages' });
  const columns = frameXml('f1', 's1', [36, 36, 296, 400]) + frameXml('f2', 's2', [316, 36, 576, 400]);

  it('joins a fully justified last paragraph to the text that opens the next column in its style', () => {
    const r = two(plain(TEXT) + plain(TEXT.repeat(2), 'Justification="FullyJustified"'), plain(TEXT, 'Justification="LeftJustified"') + plain(TEXT), columns);
    expect(finding(r, 'continuedParagraphs')?.count).toBe(1);
    const md = markdownOf(r);
    expect(md.match(/^:::frame\{/gm)).toHaveLength(1);
    // Three paragraphs: the joined one holds the forced break between its pieces.
    expect(md).toMatch(/full stop\.\\\nA paragraph of running text/);
    const [t1, t2] = r.config.pageTemplates![0]!.frames!;
    expect(t1!.next).toBe(t2!.name);
  });

  it('leaves alone a style justified to its last line, another face, a frame under it, a narrower frame', () => {
    // The style itself, not an override: nothing says the paragraph goes on.
    const none = (r: ReturnType<typeof idmlToPostext>): void => {
      expect(finding(r, 'continuedParagraphs')).toBeUndefined();
      expect(markdownOf(r).match(/^:::frame\{/gm)).toHaveLength(2);
    };
    none(two(plain(TEXT), plain(TEXT), columns));
    none(two(plain(TEXT, 'Justification="FullyJustified"'), para(run(TEXT, 'PointSize="9"')), columns));
    none(two(plain(TEXT, 'Justification="FullyJustified"'), plain(TEXT), frameXml('f1', 's1', [36, 36, 296, 200]) + frameXml('f2', 's2', [36, 220, 296, 400])));
    none(two(plain(TEXT, 'Justification="FullyJustified"'), plain(TEXT), frameXml('f1', 's1', [36, 36, 296, 400]) + frameXml('f2', 's2', [316, 36, 500, 400])));
    // A threaded frame already goes on in its thread.
    none(two(plain(TEXT, 'Justification="FullyJustified"'), plain(TEXT), frameXml('f1', 's1', [36, 36, 296, 400], 'NextTextFrame="f3"') + frameXml('f2', 's2', [316, 36, 576, 400])));
  });

  it('keeps a paragraph of a threaded story whole across its frames', () => {
    const frames = frameXml('f1', 's1', [36, 36, 296, 100], 'NextTextFrame="f2"') + frameXml('f2', 's1', [316, 36, 576, 400], 'PreviousTextFrame="f1"');
    const r = idmlToPostext(mini({ stories: { s1: storyXml('s1', plain(TEXT.repeat(8))) }, items: frames }), { layout: 'pages' });
    const md = markdownOf(r);
    expect(md.match(/^:::frame\{/gm)).toHaveLength(1);
    expect(r.config.pageTemplates![0]!.frames![0]).toMatchObject({ name: 't1', next: 't2' });
    // Laid out, the paragraph runs from the first frame into the second:
    // the line that ends the first frame is not a last line.
    const doc = build(md, { ...config(), ...r.config } as PostextConfig);
    const set = lines(doc);
    expect(set.length).toBeGreaterThan(5);
    expect(set.filter((l) => l.last)).toHaveLength(1);
    expect(set[set.length - 1]!.last).toBe(true);
  });
});
