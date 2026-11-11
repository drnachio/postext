// Where the first line of a frame stands: InDesign's first baseline
// rules, the insets and the vertical justification of a frame (its own
// or its object style's) against the one rule Postext has.

import { describe, expect, it } from 'vitest';
import { pageDisplayList } from 'postext';
import type { PostextConfig } from 'postext';
import { frameXml, mini, storyXml } from '../../read/fixture.test-helper.js';
import { build, config } from '../../testing/kit.test-helper.js';
import { idmlToPostext } from '../index.js';
import type { IdmlImportResult } from '../types.js';
import { finding, markdownOf, para, plain, run } from './kit.test-helper.js';

const TEXT = 'A line of text that ends in a full stop, and another one after it to fill the frame.';
/** A text frame with text frame options of its own. */
const frame = (self: string, story: string, box: [number, number, number, number], options: string, inset?: number[], attrs = ''): string =>
  frameXml(self, story, box, attrs).replace('</TextFrame>', `<TextFramePreference ${options}>${inset ? `<Properties><InsetSpacing type="list">${inset.map((n) => `<ListItem type="unit">${n}</ListItem>`).join('')}</InsetSpacing></Properties>` : ''}</TextFramePreference></TextFrame>`);

/** The baselines of the first line painted in each frame of page 1, by
 *  the y of the frame's top as the document has it. */
function firstBaselines(r: IdmlImportResult): number[] {
  // At 72 dpi a pixel of the display list is a point.
  const doc = build(markdownOf(r), { ...config(), ...r.config, page: { ...r.config.page, dpi: 72 } } as PostextConfig);
  const items = pageDisplayList(doc, 0).items.filter((i) => i.kind === 'text' && i.lines.length > 0);
  return items.map((i) => (i.kind === 'text' ? Math.round(i.lines[0]!.baseline * 100) / 100 : 0)).sort((a, b) => a - b);
}

// 10 pt text on 12 pt leading; frames 100 pt apart down the page.
const body = plain(TEXT);
const KINDS: [string, number[] | undefined, number][] = [
  // The rule, the insets, the first baseline under the frame's top.
  ['FirstBaselineOffset="AscentOffset"', undefined, 12 * 0.72],
  ['FirstBaselineOffset="CapHeight"', undefined, 12 * 0.68],
  ['FirstBaselineOffset="XHeight"', undefined, 12 * 0.47],
  ['FirstBaselineOffset="LeadingOffset"', undefined, 14.4],
  ['FirstBaselineOffset="FixedHeight" MinimumFirstBaselineOffset="20"', undefined, 20],
  ['FirstBaselineOffset="AscentOffset" MinimumFirstBaselineOffset="30"', [5, 4, 3, 2], 35],
];

describe('the first baseline of a frame', () => {
  const stories: Record<string, string> = {};
  let items = '';
  KINDS.forEach(([options, inset], n) => {
    stories[`s${n}`] = storyXml(`s${n}`, body);
    items += frame(`f${n}`, `s${n}`, [36, 40 + n * 100, 400, 110 + n * 100], options, inset);
  });
  const r = idmlToPostext(mini({ stories, items }), { layout: 'pages' });

  it('lands where each rule of InDesign puts it', () => {
    const painted = firstBaselines(r);
    const expected = KINDS.map(([, , offset], n) => 40 + n * 100 + offset);
    expect(painted).toHaveLength(KINDS.length);
    painted.forEach((y, n) => expect(Math.abs(y - expected[n]!), `${KINDS[n]![0]}: ${y} against ${expected[n]}`).toBeLessThan(0.11));
  });

  it('moves a frame up, or pads it, by the difference', () => {
    const frames = r.config.pageTemplates![0]!.frames!;
    const y = (name: string): number => frames.find((f) => f.name === name)!.placement!.offset!.y!.value;
    const pad = (name: string): number | undefined => frames.find((f) => f.name === name)!.padding?.top?.value;
    // Ascent: 8.64 pt under the top, Postext sets 11.52 (0.8 of 14.4): up 2.9 pt, and as much taller.
    expect(y('t1')).toBeCloseTo(40 - 2.9, 1);
    expect(frames[0]!.placement!.size!.height).toMatchObject({ value: 72.9 });
    expect(pad('t1')).toBeUndefined();
    // Leading: 14.4 under the top against 11.52: the frame stays, 2.9 pt of padding.
    expect(y('t4')).toBeCloseTo(340, 1);
    expect(pad('t4')).toBeCloseTo(2.9, 1);
    // Insets go to the padding with the difference on top.
    expect(frames.find((f) => f.name === 't6')!.padding).toMatchObject({ top: { value: 23.5 }, left: { value: 4 }, bottom: { value: 3 }, right: { value: 2 } });
  });

  it('says which first lines are placed by typical proportions', () => {
    expect(finding(r, 'firstBaselineEstimated')).toMatchObject({ severity: 'info', count: 3 });
    expect(finding(r, 'firstBaselineEstimated')!.examples.join(' ')).toMatch(/Ascent .*CapHeight .*XHeight/);
  });
});

describe('frame options', () => {
  it('counts the empty paragraphs a story opens with', () => {
    const empty = '<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Br/></CharacterStyleRange></ParagraphStyleRange>';
    const r = idmlToPostext(mini({ stories: { s1: storyXml('s1', empty + empty + body) }, items: frame('f1', 's1', [36, 40, 400, 200], 'FirstBaselineOffset="LeadingOffset"') }), { layout: 'pages' });
    // Two empty lines, then the text: its baseline three leadings under the top.
    expect(firstBaselines(r)[0]).toBeCloseTo(40 + 3 * 14.4, 1);
  });

  it('reads insets, baseline rule and vertical justification from the object style', () => {
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<idPkg:Styles xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="21.5"><RootObjectStyleGroup Self="ro">
      <ObjectStyle Self="ObjectStyle/Box" Name="Box" EnableTextFrameGeneralOptions="true" EnableTextFrameBaselineOptions="true"><TextFramePreference FirstBaselineOffset="LeadingOffset" VerticalJustification="CenterAlign"><Properties><InsetSpacing type="list"><ListItem type="unit">8</ListItem><ListItem type="unit">6</ListItem><ListItem type="unit">8</ListItem><ListItem type="unit">6</ListItem></InsetSpacing></Properties></TextFramePreference></ObjectStyle>
      <ObjectStyle Self="ObjectStyle/Off" Name="Off" EnableTextFrameGeneralOptions="false" EnableTextFrameBaselineOptions="true"><TextFramePreference FirstBaselineOffset="LeadingOffset" VerticalJustification="BottomAlign"><Properties><InsetSpacing type="list"><ListItem type="unit">9</ListItem><ListItem type="unit">9</ListItem><ListItem type="unit">9</ListItem><ListItem type="unit">9</ListItem></InsetSpacing></Properties></TextFramePreference></ObjectStyle>
    </RootObjectStyleGroup></idPkg:Styles>`;
    const items =
      frameXml('f1', 's1', [36, 40, 300, 140], 'AppliedObjectStyle="ObjectStyle/Box"') +
      frameXml('f2', 's2', [36, 240, 300, 340], 'AppliedObjectStyle="ObjectStyle/Off"') +
      // The frame's own options stand over its style's.
      frame('f3', 's3', [36, 440, 300, 540], 'VerticalJustification="TopAlign"', [1, 2, 3, 4], 'AppliedObjectStyle="ObjectStyle/Box"');
    const r = idmlToPostext(mini({ stories: { s1: storyXml('s1', body), s2: storyXml('s2', body), s3: storyXml('s3', body) }, items, designmap: '<idPkg:Styles src="Resources/Styles.xml"/>', files: { 'Resources/Styles.xml': styles } }), { layout: 'pages' });
    const [t1, t2, t3] = r.config.pageTemplates![0]!.frames!;
    expect(t1).toMatchObject({ verticalAlign: 'middle', padding: { top: { value: 8 }, left: { value: 6 }, bottom: { value: 8 }, right: { value: 6 } } });
    // General options switched off in the style: no insets, set from the top; its baseline rule holds.
    expect(t2!.verticalAlign).toBeUndefined();
    expect(t2!.padding).toMatchObject({ top: { value: 2.9 }, left: { value: 0 } });
    expect(t3!.verticalAlign).toBeUndefined();
    expect(t3!.padding).toMatchObject({ top: { value: 3.9 }, left: { value: 2 }, bottom: { value: 3 }, right: { value: 4 } });
  });

  it('keeps a filled frame in place and says how far its first line is off', () => {
    const r = idmlToPostext(mini({ stories: { s1: storyXml('s1', para(run(TEXT, 'PointSize="10"'))) }, items: frameXml('f1', 's1', [36, 40, 400, 200], 'FillColor="Color/Black"') }), { layout: 'pages' });
    const f = r.config.pageTemplates![0]!.frames![0]!;
    expect(f.placement!.offset!.y).toMatchObject({ value: 40 });
    expect(finding(r, 'firstBaselineOff')).toMatchObject({ severity: 'warning', count: 1 });
    expect(finding(r, 'firstBaselineOff')!.examples[0]).toMatch(/^2\.4 pt/);
  });
});
