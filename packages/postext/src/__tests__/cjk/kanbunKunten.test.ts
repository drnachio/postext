import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index';
import { parseMarkdown } from '../../parse';
import { stripAnnotations } from '../../parse/annotations';
import { plainSpans } from '../../parse/inlineFormatting';
import { resolveCjkConfig, stripCjkDefaults } from '../../defaults/cjk';
import { createMeasurementCache } from '../../measure';
import type { InlineSpan } from '../../parse';
import type { PostextConfig } from '../../types';
import type { VDTDocument, VDTLine, VDTLineSegment } from '../../vdt';
import { installSizedStub } from '../vertical/stub';

// Kanbun reading marks (訓点, `:kunten[字]{kaeri okuri tate}`, #430): the
// 返り点 after their character in the foot half of the line (JIS X 4051
// §5.5), the 送り仮名 beside it from half-way along it (§5.6), the 竪点 in
// the gap after it (§5.7). The stub measures kana and kanji 1 em.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const EM = 20;
/** The marks' em (half the text's). */
const K = EM / 2;
/** The central axis of the stub's text, px from the baseline. */
const AXIS = -0.38 * EM;
/** Baselines of the marks (a run's `dy`): the 送り仮名 over the em box,
 *  the 返り点 inside its foot half, or under it in the line gap. */
const OKURI_DY = AXIS - EM / 2 - K / 2 + 0.38 * K;
const KAERI_DY = AXIS + EM / 2 - K / 2 + 0.38 * K;
const KAERI_GAP_DY = AXIS + EM / 2 + K / 2 + 0.38 * K;

/** 72 dpi, 20 px text on a 36 px line (a gap of 0.8 em), a measure of 20
 *  characters. */
const config = (cjk: PostextConfig['cjk'] = {}, extra: Partial<PostextConfig> = {}, locale = 'ja'): PostextConfig => ({
  locale,
  page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(EM), lineHeight: pt(36), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk,
  ...extra,
});
const vertical = { layout: { layoutType: 'single' as const, writingMode: 'vertical-rl' as const } };

const lines = (doc: VDTDocument): VDTLine[] => doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);
const segs = (doc: VDTDocument): VDTLineSegment[] => lines(doc).flatMap((l) => l.segments ?? []);
const seg = (doc: VDTDocument, text: string): VDTLineSegment => segs(doc).find((s) => s.text === text)!;
/** What follows a segment on its line. */
const after = (doc: VDTDocument, text: string): VDTLineSegment | undefined => {
  for (const l of lines(doc)) {
    const i = (l.segments ?? []).findIndex((s) => s.text === text);
    if (i >= 0) return l.segments![i + 1];
  }
  return undefined;
};
const runs = (s: VDTLineSegment) => s.kunten!.runs.map((r) => [r.role, r.text, r.dx, r.dy]);

/** 論語 學而: 子曰ハク、學ビテ而時ニ習フ(レ)之ヲ、不(二)亦タ説バシカラ(一)乎。 */
const GAKUJI = '子曰、:kunten[學]{okuri="ビテ"}而:kunten[時]{okuri="ニ"}:kunten[習]{kaeri="レ" okuri="フ"}:kunten[之]{okuri="ヲ"}、'
  + ':kunten[不]{kaeri="二"}:kunten[亦]{okuri="タ"}:kunten[説]{kaeri="一" okuri="バシカラ"}乎。';

describe(':kunten parsing', () => {
  const spansOf = (md: string): InlineSpan[] => parseMarkdown(md)[0]!.spans;

  it('keeps the text and puts the marks on its spans', () => {
    const spans = spansOf(':kunten[學]{okuri="ビテ"}而:kunten[習]{kaeri="レ" okuri="フ"}之');
    expect(spans.map((s) => s.text).join('')).toBe('學而習之');
    expect(spans.find((s) => s.text === '學')!.kunten).toEqual({ id: 1, okuri: 'ビテ' });
    expect(spans.find((s) => s.text === '習')!.kunten).toEqual({ id: 2, kaeri: 'レ', okuri: 'フ' });
    expect(spans.find((s) => s.text === '而')!.kunten).toBeUndefined();
    expect(stripAnnotations(':kunten[學]{okuri="ビテ"}而')).toBe('學而');
  });

  it('reads the kanbun code points, Aozora parentheses, the 竪点 flag and empty values', () => {
    expect(spansOf(':kunten[所]{kaeri="㆒㆑"}')[0]!.kunten).toEqual({ id: 1, kaeri: '一レ' });
    expect(spansOf(':kunten[之]{okuri="（ヲ）"}')[0]!.kunten).toEqual({ id: 1, okuri: 'ヲ' });
    expect(spansOf(':kunten[敬]{tate kaeri="二"}祭')[0]!.kunten).toEqual({ id: 1, kaeri: '二', tate: true });
    expect(spansOf(':kunten[敬]{tate=false}')[0]!.kunten).toEqual({ id: 1 });
    expect(spansOf(':kunten[字]{kaeri="" okuri=""}')[0]!.kunten).toEqual({ id: 1 });
  });

  it('maps the source around its markup', () => {
    const md = '子 :kunten[學 s]{okuri="ビテ s"} s而';
    const [p] = parseMarkdown(md);
    expect(p!.text).toBe('子 學 s s而');
    for (let i = 0; i < p!.text.length; i++) expect(md[p!.sourceMap[i]!]).toBe(p!.text[i]);
    expect(p!.sourceMap[p!.text.lastIndexOf(' s')]).toBe(md.lastIndexOf(' s'));
  });

  it('a heading set plain keeps the marks, as it keeps ruby', () => {
    const spans = spansOf(':kunten[學]{okuri="ビテ"}而');
    expect(plainSpans(spans).find((s) => s.text === '學')!.kunten).toBeDefined();
  });

  it('a ruby inside the marks keeps both', () => {
    const [span] = spansOf(':kunten[:ruby[未]{rt="ザル" pos=under}]{kaeri="レ" okuri="ダ"}');
    expect(span!.ruby).toMatchObject({ text: 'ザル', position: 'under' });
    expect(span!.kunten).toMatchObject({ kaeri: 'レ', okuri: 'ダ' });
  });
});

describe('cjk.kunten', () => {
  it('defaults: half-size marks, the 返り点 inline, in every locale', () => {
    for (const locale of ['ja', 'zh-Hant', 'en']) {
      expect(resolveCjkConfig(undefined, locale).kunten).toEqual({ fontSize: { value: 0.5, unit: 'em' }, placement: 'inline' });
    }
    expect(resolveCjkConfig({ kunten: { placement: 'interlinear', fontSize: { value: 0.4, unit: 'em' }, color: { hex: '#c00000', model: 'hex' } } }, 'ja').kunten)
      .toEqual({ fontSize: { value: 0.4, unit: 'em' }, placement: 'interlinear', color: { hex: '#c00000', model: 'hex' } });
    expect(resolveCjkConfig({ kunten: { placement: 'side' as never, fontSize: { value: -1, unit: 'em' } } }, 'ja').kunten)
      .toEqual({ fontSize: { value: 0.5, unit: 'em' }, placement: 'inline' });
  });

  it('strips the fields at their default', () => {
    expect(stripCjkDefaults({ kunten: { placement: 'inline', fontSize: { value: 0.5, unit: 'em' } } })).toBeUndefined();
    expect(stripCjkDefaults({ kunten: { placement: 'interlinear' } })).toEqual({ kunten: { placement: 'interlinear' } });
  });
});

describe('kanbun marks in a line (論語 學而)', () => {
  for (const [mode, extra] of [['horizontal', {}], ['vertical', vertical]] as const) {
    it(`${mode}: 送り仮名 from half-way along the character, 返り点 after it, and the room they take`, () => {
      const doc = buildDocument({ markdown: GAKUJI }, config({}, extra));
      const [line] = lines(doc);
      // The text reads as written: the marks take no character of it.
      expect(line!.text).toBe('子曰、學而時習之、不亦説乎。');
      expect(lines(doc)).toHaveLength(1);
      expect(runs(seg(doc, '學'))).toEqual([['okuri', 'ビテ', EM / 2, OKURI_DY]]);
      // ビテ run a character past 學: the next one moves on by their reach.
      expect(after(doc, '學')).toMatchObject({ kind: 'space', text: '', width: K, autospace: true });
      expect(runs(seg(doc, '習'))).toEqual([['kaeri', 'レ', EM, KAERI_DY], ['okuri', 'フ', EM / 2, OKURI_DY]]);
      expect(after(doc, '習')).toMatchObject({ kind: 'space', width: K });
      expect(runs(seg(doc, '不'))).toEqual([['kaeri', '二', EM, KAERI_DY]]);
      expect(after(doc, '不')).toMatchObject({ kind: 'space', width: K });
      // タ fits beside 亦: nothing after it.
      expect(after(doc, '亦')!.text).toBe('説');
      // バシカラ reach 2.5 em from 説's start, 一 1.5 em.
      expect(runs(seg(doc, '説'))).toEqual([['kaeri', '一', EM, KAERI_DY], ['okuri', 'バシカラ', EM / 2, OKURI_DY]]);
      expect(after(doc, '説')).toMatchObject({ kind: 'space', width: 1.5 * EM });
      for (const s of segs(doc).filter((x) => x.kunten)) {
        expect(s.width).toBe(EM);
        expect(s.kunten!.fontString).toMatch(/(^| )10px /);
      }
      expect(seg(doc, '習').kunten).toMatchObject({ kaeri: 'レ', okuri: 'フ' });
      expect(doc.contentWarnings?.some((w) => w.kind === 'kuntenExceedsLeading') ?? false).toBe(false);
    });
  }

  it('the marks go with the last character of their base', () => {
    const doc = buildDocument({ markdown: ':kunten[讀*書*]{kaeri="レ"}之' }, config());
    expect(segs(doc).filter((s) => s.kunten).map((s) => s.text)).toEqual(['書']);
  });

  it('a character never leaves its marks: one whose 返り点 pass the measure goes to the next line', () => {
    const nineteen = '一二三四五六七八九十甲乙丙丁戊己庚辛壬';
    const fits = buildDocument({ markdown: `${nineteen}:kunten[説]{okuri="ニ"}乎也矣焉` }, config());
    expect(lines(fits)[0]!.text).toBe(`${nineteen}説`);
    const over = buildDocument({ markdown: `${nineteen}:kunten[説]{kaeri="一"}乎也矣焉` }, config());
    expect(lines(over)[1]!.text.startsWith('説')).toBe(true);
    expect(lines(over)[1]!.segments![0]!.kunten!.kaeri).toBe('一');
  });

  it('interlinear: the 返り点 in the line gap beside the character, nothing takes advance', () => {
    const doc = buildDocument({ markdown: GAKUJI }, config({ kunten: { placement: 'interlinear' } }));
    expect(segs(doc).some((s) => s.kind === 'space')).toBe(false);
    expect(runs(seg(doc, '不'))).toEqual([['kaeri', '二', EM / 2, KAERI_GAP_DY]]);
    expect(runs(seg(doc, '説'))).toEqual([['kaeri', '一', EM / 2, KAERI_GAP_DY], ['okuri', 'バシカラ', EM / 2, OKURI_DY]]);
  });

  it('a combined form is the mark and its レ, one after the other', () => {
    const doc = buildDocument({ markdown: ':kunten[所]{kaeri="一レ"}敬' }, config());
    expect(runs(seg(doc, '所'))).toEqual([['kaeri', '一', EM, KAERI_DY], ['kaeri', 'レ', EM + K, KAERI_DY]]);
    expect(after(doc, '所')).toMatchObject({ kind: 'space', width: EM });
  });

  it('a 竪点: half an em of its own on the line\'s axis, with the 返り点 beside it', () => {
    const tate = (md: string, cjk: PostextConfig['cjk'] = {}) => {
      const doc = buildDocument({ markdown: md }, config(cjk));
      return { t: seg(doc, '敬').kunten!.tate!, space: after(doc, '敬') };
    };
    const solo = tate(':kunten[敬]{tate}祭');
    expect(solo.t).toEqual({ dx: EM, dy: AXIS, length: EM / 2, thickness: 0.06 * EM });
    expect(solo.space).toMatchObject({ kind: 'space', width: EM / 2 });
    expect(tate(':kunten[敬]{tate kaeri="二"}祭').t.dx).toBe(EM);
    // A combined 返り点 takes a whole em: the rule is centred in it.
    const wide = tate(':kunten[敬]{tate kaeri="一レ"}祭');
    expect(wide.t.dx).toBe(EM + EM / 4);
    expect(wide.space).toMatchObject({ width: EM });
    // Interlinear: a short rule across the meeting point.
    const gap = tate(':kunten[敬]{tate}祭', { kunten: { placement: 'interlinear' } });
    expect(gap.t).toMatchObject({ dx: EM - EM / 8, length: EM / 4 });
    expect(gap.space?.kind).not.toBe('space');
  });

  it('送り仮名 follow a reading on their side; a left reading (再読文字) leaves them where they are', () => {
    const over = buildDocument({ markdown: ':kunten[:ruby[未]{rt="いま"}]{kaeri="レ" okuri="ダ"}嘗' }, config());
    const s = seg(over, '未');
    expect(s.ruby!.runs[0]!.dx).toBe(0);
    // いま end at 1 em: ダ start there, not at half an em.
    expect(runs(s)).toEqual([['kaeri', 'レ', EM, KAERI_DY], ['okuri', 'ダ', EM, OKURI_DY]]);
    expect(s.width).toBe(EM);
    expect(after(over, '未')).toMatchObject({ kind: 'space', width: K });
    const left = buildDocument({ markdown: ':kunten[:ruby[未]{rt="ザル" pos=under}]{kaeri="レ" okuri="ダ"}嘗' }, config());
    expect(runs(seg(left, '未'))).toEqual([['kaeri', 'レ', EM, KAERI_DY], ['okuri', 'ダ', EM / 2, OKURI_DY]]);
    // Interlinear 返り点 go after a reading under the character.
    const gap = buildDocument({ markdown: ':kunten[:ruby[未]{rt="ザル" pos=under}]{kaeri="レ"}嘗' }, config({ kunten: { placement: 'interlinear' } }));
    expect(runs(seg(gap, '未'))).toEqual([['kaeri', 'レ', EM, KAERI_GAP_DY]]);
  });

  it('size and colour from cjk.kunten, the colour from cjk.annotationColor otherwise', () => {
    const doc = buildDocument({ markdown: ':kunten[學]{okuri="ビテ"}而' }, config({ kunten: { fontSize: { value: 0.4, unit: 'em' }, color: { hex: '#c00000', model: 'hex' } } }));
    const k = seg(doc, '學').kunten!;
    expect(k.fontString).toMatch(/(^| )8px /);
    expect(k.color).toBe('#c00000');
    const marked = buildDocument({ markdown: ':kunten[學]{okuri="ビテ"}而' }, config({ annotationColor: { hex: '#0000c0', model: 'hex' } }));
    expect(seg(marked, '學').kunten!.color).toBe('#0000c0');
  });

  it('works in a Chinese document too (the markup is the switch)', () => {
    const doc = buildDocument({ markdown: GAKUJI }, config({}, {}, 'zh-Hant'));
    expect(runs(seg(doc, '習'))[0]).toEqual(['kaeri', 'レ', EM, KAERI_DY]);
  });

  it('text without marks carries no kunten field', () => {
    const doc = buildDocument({ markdown: '子曰學而時習之不亦説乎' }, config());
    expect(segs(doc).some((s) => 'kunten' in s)).toBe(false);
  });

  it('is measured again when the marks change (cache key)', () => {
    const cache = createMeasurementCache();
    const a = buildDocument({ markdown: ':kunten[學]{okuri="ビ"}而' }, config(), cache);
    expect(after(a, '學')?.text).toBe('而');
    const b = buildDocument({ markdown: ':kunten[學]{okuri="ビテ"}而' }, config(), cache);
    expect(after(b, '學')).toMatchObject({ kind: 'space', width: K });
    const c = buildDocument({ markdown: ':kunten[學]{okuri="ビテ"}而' }, config({ kunten: { placement: 'interlinear' } }), cache);
    expect(after(c, '學')?.text).toBe('而');
  });
});

describe('kanbun marks and the leading', () => {
  it('送り仮名 need half an em of line gap', () => {
    const tight = config({}, { bodyText: { fontSize: pt(EM), lineHeight: pt(26), hyphenation: { enabled: false } } });
    const doc = buildDocument({ markdown: GAKUJI }, tight);
    expect(doc.contentWarnings!.find((w) => w.kind === 'kuntenExceedsLeading')).toMatchObject({ gapEm: 0.3, neededEm: 0.5 });
    // 返り点 set inline need none.
    const kaeri = buildDocument({ markdown: ':kunten[不]{kaeri="二"}亦説乎' }, tight);
    expect(kaeri.contentWarnings?.some((w) => w.kind === 'kuntenExceedsLeading') ?? false).toBe(false);
  });

  it('interlinear 返り点 under one line and 送り仮名 over the next share their gap', () => {
    const twenty = '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸';
    const md = `:kunten[不]{kaeri="二"}${twenty.slice(1)}:kunten[説]{okuri="ニ"}乎`;
    const doc = buildDocument({ markdown: md }, config({ kunten: { placement: 'interlinear' } }));
    expect(lines(doc)).toHaveLength(2);
    expect(doc.contentWarnings!.find((w) => w.kind === 'kuntenExceedsLeading')).toMatchObject({ gapEm: 0.8, neededEm: 1 });
  });
});
