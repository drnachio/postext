// Pages a flowing book sets as one unit (#1556): a cover whose frames
// read together, and an opener whose band and title stand above the
// running text.

import { describe, expect, it } from 'vitest';
import { frameXml, mini, spreadXml, storyXml } from '../../read/fixture.test-helper.js';
import { idmlToPostext } from '../index.js';
import type { IdmlImportResult } from '../types.js';
import { finding, markdownOf, para, plain, run } from './kit.test-helper.js';

const TEXT = 'Running text that ends in a full stop, long enough to be the body of the book and to fill its pages. ';
const rect = (self: string, box: [number, number, number, number], attrs: string): string => frameXml(self, '', box, attrs).replace(/TextFrame/g, 'Rectangle').replace(' ParentStory=""', '');
/** A frame on page `n` (from 0) of the three-page spread, in page coordinates. */
const on = (n: number, box: [number, number, number, number]): [number, number, number, number] => [box[0] + n * 612, box[1], box[2] + n * 612, box[3]];
const big = (text: string, size: number): string => para(run(text, `PointSize="${size}"`));

/** Page 1: a cover on a black ground, a title and a subtitle, and a key
 *  of three numbered entries whose numerals stand two points above their
 *  words. Page 2: an opener, a black band holding a kicker and the title,
 *  over the main story, which runs on to page 3. The stories are made
 *  in an order that is not the page's. */
function book(options: { band?: boolean } = {}): IdmlImportResult {
  const band = options.band ?? true;
  const key: [string, string, number][] = [['1', 'North', 72], ['2', 'South', 232], ['3', 'East', 392]];
  const stories: Record<string, string> = {
    main: storyXml('main', plain('Facts: 2 km, one hour, flat.') + plain(TEXT.repeat(8)) + plain(TEXT.repeat(8)) + plain(TEXT.repeat(8))),
    kicker: storyXml('kicker', big('Part one', 10)),
    wtitle: storyXml('wtitle', big('The North Walk', 30)),
  };
  let items = rect('ground', on(0, [0, 0, 612, 792]), 'FillColor="Color/Black"');
  // The words of the key first, then the numerals, then the titles.
  for (const [, word, x] of key) {
    stories[`w${word}`] = storyXml(`w${word}`, plain(word));
    items += frameXml(`fw${word}`, `w${word}`, on(0, [x + 30, 602, x + 140, 620]));
  }
  for (const [n, , x] of key) {
    stories[`n${n}`] = storyXml(`n${n}`, plain(n));
    items += frameXml(`fn${n}`, `n${n}`, on(0, [x, 600, x + 24, 620]));
  }
  stories.title = storyXml('title', big('The Book', 40));
  stories.sub = storyXml('sub', plain('Three walks through the old town'));
  items += frameXml('ftitle', 'title', on(0, [72, 200, 540, 260])) + frameXml('fsub', 'sub', on(0, [72, 270, 540, 300]));
  if (band) items += rect('band', on(1, [0, 0, 612, 200]), 'FillColor="Color/Black"');
  items += frameXml('fkicker', 'kicker', on(1, [72, 60, 540, 80])) + frameXml('fwtitle', 'wtitle', on(1, [72, 90, 540, 140]));
  items += frameXml('f1', 'main', on(1, [36, 240, 576, 756]), 'NextTextFrame="f2"') + frameXml('f2', 'main', on(2, [36, 36, 576, 756]), 'PreviousTextFrame="f1"');
  const bytes = mini({ stories, files: { 'Spreads/Spread_us.xml': spreadXml('us', items, 3) } });
  return idmlToPostext(bytes, { layout: 'flow' });
}

describe('a cover in a flowing book', () => {
  it('keeps the frames of a page with no running text together, as a composed page, in reading order', () => {
    const r = book();
    const md = markdownOf(r);
    const page = /::::page\{template="([^"]+)"\}\n([\s\S]*?)\n::::/.exec(md);
    expect(page).not.toBeNull();
    // Every word of the cover is in its fence, read row by row: the title,
    // the subtitle, then the key with each numeral before its word.
    const cover = page![2]!;
    const words = ['The Book', 'Three walks', '1', 'North', '2', 'South', '3', 'East'];
    const at = words.map((w) => cover.search(new RegExp(`^(#+ )?${w}`, 'm')));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // Nothing of it is left in the flow.
    const rest = md.replace(page![0], '');
    for (const w of ['North', 'South', 'East', 'The Book']) expect(rest).not.toMatch(new RegExp(`^(#+ )?${w}$`, 'm'));
    // The template: a frame for each text frame, the ground as decoration.
    const template = r.config.pageTemplates!.find((t) => t.id === page![1])!;
    expect(template.frames).toHaveLength(8);
    expect(template.decoration?.elements.map((e) => ('kind' in e ? e.kind : ''))).toEqual(['box']);
    expect(finding(r, 'composedPagesInFlow')).toMatchObject({ count: 1, examples: ['page 1'] });
  });
});

describe('an opener in a flowing book', () => {
  it('sets the title frame above the running text as the heading before that page\'s text, its band and kicker drawn by the heading\'s design', () => {
    const r = book();
    const md = markdownOf(r);
    const heading = /^(#+) The North Walk \{([^}]*)\}$/m.exec(md);
    expect(heading).not.toBeNull();
    // Before the first words of the page, after the cover.
    expect(md.indexOf(heading![0])).toBeLessThan(md.indexOf('Facts: 2 km'));
    expect(md.indexOf(heading![0])).toBeGreaterThan(md.indexOf('::::page'));
    // The kicker's words travel on the heading, not as a paragraph.
    const attrs = heading![2]!;
    const style = /style="([^"]+)"/.exec(attrs)![1];
    const kicker = /(\w+)="Part one"/.exec(attrs);
    expect(kicker).not.toBeNull();
    expect(md).not.toMatch(/^Part one$/m);
    // The style: a page-opening heading whose design draws the band, the
    // kicker from its attribute and the title, and keeps the room down to
    // where the running text starts (240 pt, under a 36 pt margin).
    const s = r.config.headingStyles!.find((h) => h.id === style)!;
    expect(s.span).toBe('page');
    expect(s.breakBefore?.enabled).toBe(true);
    const elements = s.advancedDesign!.slot.elements as { kind: string; content?: string }[];
    expect(elements.map((e) => (e.kind === 'text' ? e.content : e.kind))).toEqual(['box', `{attr.${kicker![1]}}`, '{titleText}']);
    expect(s.advancedDesign!.minHeight).toEqual({ value: 204, unit: 'pt' });
    expect(JSON.stringify(r.config)).not.toContain('Part one');
    expect(finding(r, 'openerDesigns')).toMatchObject({ count: 1, examples: ['page 2'] });
    // The band and the cover's ground are drawn: no shape is dropped.
    expect(finding(r, 'pageArtInFlow')).toBeUndefined();
  });

  it('leaves plain title frames over the text, with no artwork, to the running text', () => {
    const r = book({ band: false });
    const md = markdownOf(r);
    expect(r.config.headingStyles?.some((h) => h.advancedDesign) ?? false).toBe(false);
    expect(finding(r, 'openerDesigns')).toBeUndefined();
    // Still in reading order: the kicker, the title, then the text.
    expect(md.indexOf('Part one')).toBeLessThan(md.indexOf('The North Walk'));
    expect(md.indexOf('The North Walk')).toBeLessThan(md.indexOf('Facts: 2 km'));
  });
});
