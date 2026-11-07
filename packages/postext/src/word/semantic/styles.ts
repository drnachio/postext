// styles.xml of the semantic .docx (#1390): the book's design read from the
// resolved config — body text, heading levels and named heading styles,
// paragraph styles, box styles, quotes, captions, code, footnotes — as
// Word styles, with the real font families of the font plan when the
// export embeds fonts.

import type { ResolvedConfig } from '../../vdt.js';
import type { ResolvedCalloutStyleConfig, ResolvedHeadingLevelConfig, ResolvedParagraphStyleConfig, TextAlign } from '../../types.js';
import { resolvedCodeStyle } from '../../defaults/text/codeStyle.js';
import type { WordFontPlan } from '../fonts/types.js';
import { wordFontFor } from '../fonts/plan.js';
import { escapeAttr } from '../xml.js';
import { paleOnWhite } from './design/ink.js';
import { firstFamily, halfPoints, hex, pPr, px, rPr, twips, type ParaProps, type RunProps, type Units } from './wml.js';

/** Style ids the writer uses by name. */
export const STYLE = {
  normal: 'Normal',
  quote: 'Quote',
  caption: 'Caption',
  list: 'ListParagraph',
  footnoteText: 'FootnoteText',
  footnoteRef: 'FootnoteReference',
  hyperlink: 'Hyperlink',
  header: 'Header',
  footer: 'Footer',
  source: 'PostextSource',
  sourceChar: 'PostextSourceChar',
  reference: 'PostextReference',
  mark: 'PostextMark',
  chip: 'PostextChip',
  code: 'PostextCode',
  codeChar: 'PostextCodeChar',
  math: 'PostextEquation',
  figure: 'PostextFigure',
  verse: 'PostextVerse',
  part: 'PostextPart',
  boxTitle: 'PostextBoxTitle',
} as const;

const JC: Record<TextAlign, ParaProps['jc']> = { left: 'left', justify: 'both', center: 'center', right: 'right' };

const slug = (s: string): string => s.replace(/[^A-Za-z0-9]/g, '') || 'X';

interface StyleDef {
  type: 'paragraph' | 'character';
  name: string;
  basedOn?: string;
  next?: string;
  isDefault?: boolean;
  custom?: boolean;
  semiHidden?: boolean;
  pPr?: ParaProps;
  rPr?: RunProps;
}

export class StyleRegistry {
  private readonly defs = new Map<string, StyleDef>();
  private readonly byKey = new Map<string, string>();
  private readonly chipIds = new Map<string, string>();
  readonly bodyPx: number;

  constructor(
    readonly resolved: ResolvedConfig,
    private readonly units: Units,
    private readonly plan?: WordFontPlan,
  ) {
    this.bodyPx = units.basePx;
    this.builtins();
  }

  /** Font of a family stack at a weight/style, through the font plan. */
  font(stack: string | undefined, weight = 400, italic = false): RunProps {
    const family = firstFamily(stack);
    if (!family) return {};
    if (!this.plan) return { font: family, ...(weight >= 600 ? { b: true } : {}), ...(italic ? { i: true } : {}) };
    const ref = wordFontFor(this.plan, `${italic ? 'italic ' : ''}${weight} 16px "${family}"`);
    return { font: ref.family, ...(ref.bold ? { b: true } : {}), ...(ref.italic ? { i: true } : {}) };
  }

  private add(id: string, def: StyleDef): string {
    if (!this.defs.has(id)) this.defs.set(id, def);
    return id;
  }

  /** A unique style id for a key (config ids may collide once slugged). */
  private idFor(key: string, prefix: string, name: string): { id: string; fresh: boolean } {
    const known = this.byKey.get(key);
    if (known) return { id: known, fresh: false };
    let id = prefix + slug(name);
    for (let n = 2; this.defs.has(id); n++) id = `${prefix}${slug(name)}${n}`;
    this.byKey.set(key, id);
    return { id, fresh: true };
  }

  private builtins(): void {
    const r = this.resolved;
    const u = this.units;
    const body = r.bodyText;
    const bodyPx = px(u, body.fontSize);
    const line = twips(u, body.lineHeight, bodyPx);
    const after = body.paragraphSpacing === false ? 0 : body.paragraphSpacing === true ? line : twips(u, body.paragraphSpacing, bodyPx);
    this.add(STYLE.normal, {
      type: 'paragraph',
      name: 'Normal',
      isDefault: true,
      pPr: {
        before: 0,
        after,
        line: { twips: line, rule: 'atLeast' },
        ind: { firstLine: twips(u, body.firstLineIndent, bodyPx) },
        jc: JC[body.textAlign],
        bidi: r.direction === 'rtl' || undefined,
      },
      rPr: { ...this.font(body.fontFamily, body.fontWeight), color: hex(body.color), sz: halfPoints(u, body.fontSize) },
    });
    for (const level of r.headings.levels) this.headingLevel(level);
    const bq = body.blockquote;
    this.add(STYLE.quote, {
      type: 'paragraph',
      name: 'Quote',
      basedOn: STYLE.normal,
      pPr: { ind: { left: twips(u, bq.indent, bodyPx), right: twips(u, bq.indent, bodyPx), firstLine: bq.firstLineIndent ? twips(u, bq.firstLineIndent, bodyPx) : undefined } },
      rPr: { i: bq.italic, color: hex(bq.color) },
    });
    const cap = r.captionStyle;
    this.add(STYLE.caption, {
      type: 'paragraph',
      name: 'caption',
      basedOn: STYLE.normal,
      next: STYLE.normal,
      // A caption stays whole, and one set above its figure goes with it.
      pPr: { keepNext: cap.position === 'above' || undefined, keepLines: true, before: twips(u, cap.gap, px(u, cap.fontSize)), ind: { firstLine: 0 }, jc: JC[cap.align] },
      rPr: { ...this.font(cap.fontFamily), color: hex(cap.color), sz: halfPoints(u, cap.fontSize) },
    });
    const lists = r.unorderedLists;
    this.add(STYLE.list, {
      type: 'paragraph',
      name: 'List Paragraph',
      basedOn: STYLE.normal,
      pPr: { after: twips(u, lists.itemSpacing, bodyPx), contextualSpacing: true, ind: { firstLine: 0 } },
    });
    const fn = r.footnotes;
    const fnPx = px(u, fn.fontSize);
    this.add(STYLE.footnoteText, {
      type: 'paragraph',
      name: 'footnote text',
      basedOn: STYLE.normal,
      pPr: { after: twips(u, fn.spaceBetween, fnPx), line: { twips: twips(u, fn.lineHeight, fnPx), rule: 'atLeast' }, ind: { firstLine: 0 }, jc: fn.textAlign ? JC[fn.textAlign] : undefined },
      rPr: { color: hex(fn.color), sz: halfPoints(u, fn.fontSize) },
    });
    this.add(STYLE.footnoteRef, { type: 'character', name: 'footnote reference', rPr: { vertAlign: 'superscript' } });
    this.add(STYLE.hyperlink, { type: 'character', name: 'Hyperlink', rPr: { color: hex(body.referenceColor), u: true } });
    const small = { sz: Math.max(2, Math.round(halfPoints(u, body.fontSize) * 0.85)) };
    this.add(STYLE.header, { type: 'paragraph', name: 'header', basedOn: STYLE.normal, pPr: { ind: { firstLine: 0 }, jc: 'center' }, rPr: small });
    this.add(STYLE.footer, { type: 'paragraph', name: 'footer', basedOn: STYLE.normal, pPr: { ind: { firstLine: 0 }, jc: 'center' }, rPr: small });
    // Source the writer could not convert: a monospace face that Word,
    // LibreOffice and Google Docs all have (Consolas is Windows only, and
    // LibreOffice elsewhere falls back to a serif).
    const mono = { font: 'Courier New' };
    this.add(STYLE.source, {
      type: 'paragraph',
      name: 'Postext Source',
      custom: true,
      basedOn: STYLE.normal,
      pPr: { shd: 'EDEDED', suppressAutoHyphens: true, bidi: r.direction === 'rtl' ? false : undefined, before: 0, after: 0, line: { twips: 240, rule: 'auto' }, ind: { firstLine: 0 }, jc: 'left' },
      rPr: { ...mono, color: '595959', sz: Math.max(16, small.sz) },
    });
    this.add(STYLE.sourceChar, { type: 'character', name: 'Postext Source Char', custom: true, rPr: { ...mono, color: '595959', shd: 'EDEDED' } });
    this.add(STYLE.reference, { type: 'character', name: 'Postext Reference', custom: true, rPr: { color: hex(body.referenceColor), b: body.referenceBold || undefined, i: body.referenceItalic || undefined } });
    // The band of a mark as run shading in the mark style's colour:
    // LibreOffice drops a highlight set in a character style.
    const mark = r.markStyles?.[0];
    this.add(STYLE.mark, { type: 'character', name: 'Postext Mark', custom: true, rPr: { color: hex(mark?.color), shd: hex(mark?.background) ?? 'FFF0A0' } });
    this.add(STYLE.chip, { type: 'character', name: 'Postext Chip', custom: true, rPr: { shd: 'E7E6E6' } });
    const code = resolvedCodeStyle(r);
    const codePx = px(u, code.fontSize, bodyPx);
    this.add(STYLE.code, {
      type: 'paragraph',
      name: 'Postext Code',
      custom: true,
      basedOn: STYLE.normal,
      pPr: {
        shd: code.backgroundEnabled ? hex(code.background) : undefined,
        suppressAutoHyphens: true,
        bidi: r.direction === 'rtl' ? false : undefined,
        before: twips(u, code.marginTop, bodyPx),
        after: twips(u, code.marginBottom, bodyPx),
        line: code.lineHeight ? { twips: twips(u, code.lineHeight, codePx), rule: 'atLeast' } : undefined,
        ind: { firstLine: 0 },
        jc: 'left',
      },
      rPr: { ...this.font(code.fontFamily, code.fontWeight), color: hex(code.color), sz: halfPoints(u, code.fontSize, bodyPx) },
    });
    const inline = code.inline;
    this.add(STYLE.codeChar, { type: 'character', name: 'Postext Code Char', custom: true, rPr: { ...this.font(inline ? code.fontFamily : undefined), ...(inline ? {} : { font: firstFamily(code.fontFamily) }) } });
    this.add(STYLE.math, { type: 'paragraph', name: 'Postext Equation', custom: true, basedOn: STYLE.normal, pPr: { ind: { firstLine: 0 }, jc: 'center' } });
    this.add(STYLE.figure, { type: 'paragraph', name: 'Postext Figure', custom: true, basedOn: STYLE.normal, pPr: { keepNext: true, ind: { firstLine: 0 }, jc: 'center' } });
    this.add(STYLE.verse, { type: 'paragraph', name: 'Postext Verse', custom: true, basedOn: STYLE.normal, pPr: { ind: { left: twips(u, bq.indent, bodyPx), firstLine: 0 }, jc: 'left' } });
    this.add(STYLE.part, { type: 'paragraph', name: 'Postext Part', custom: true, basedOn: STYLE.normal, pPr: { pageBreakBefore: true, keepNext: true, ind: { firstLine: 0 }, jc: 'center', outlineLvl: 0 }, rPr: { b: true, sz: halfPoints(u, body.fontSize) * 2 } });
    this.add(STYLE.boxTitle, { type: 'paragraph', name: 'Postext Box Title', custom: true, basedOn: STYLE.normal, pPr: { keepNext: true, ind: { firstLine: 0 } }, rPr: { b: true } });
  }

  /** The alignment a paragraph style ends up with, through its `basedOn`
   *  chain. */
  jcOf(id: string | undefined): ParaProps['jc'] {
    for (let k = 0, d = id ? this.defs.get(id) : undefined; d && k < 16; k++, d = d.basedOn ? this.defs.get(d.basedOn) : undefined) {
      if (d.pPr?.jc) return d.pPr.jc;
    }
    return undefined;
  }

  /** The character style of a chip style: its fill, ink and face. Style
   *  ids never contain a word the importer reads as run formatting
   *  (`bold`, `code`…), so a chip does not come back as an edit. */
  chip(styleId: string | undefined): string {
    const styles = this.resolved.chipStyles ?? [];
    const cs = (styleId ? styles.find((s) => s.id === styleId) : undefined) ?? styles[0];
    if (!cs) return STYLE.chip;
    const known = this.chipIds.get(cs.id);
    if (known) return known;
    let id = `${STYLE.chip}${slug(cs.id)}`;
    if (/strong|bold|emphasis|italic|smallcaps|superscript|subscript|code|verbatim/i.test(id) || this.defs.has(id)) id = `${STYLE.chip}${this.chipIds.size + 1}`;
    this.chipIds.set(cs.id, id);
    const u = this.units;
    this.add(id, {
      type: 'character',
      name: `Postext Chip: ${cs.name || cs.id}`,
      custom: true,
      basedOn: STYLE.chip,
      rPr: {
        ...(cs.fontFamily ? this.font(cs.fontFamily, cs.bold ? 700 : 400, cs.italic) : {}),
        b: cs.bold || undefined,
        i: cs.italic || undefined,
        color: hex(cs.color),
        sz: cs.fontSize ? halfPoints(u, cs.fontSize, this.bodyPx) : undefined,
        shd: cs.backgroundEnabled ? hex(cs.background) : 'auto',
      },
    });
    return id;
  }

  /** A paragraph style for table header cells: their bold and italic go
   *  in a style, not on the runs, so the importer does not read them as
   *  emphasis the user added. */
  tableHeader(bold: boolean, italic: boolean): string {
    const { id, fresh } = this.idFor(`th:${bold ? 'b' : ''}${italic ? 'i' : ''}`, 'PostextTableHeader', `${bold ? 'B' : ''}${italic ? 'I' : ''}`);
    if (fresh) this.add(id, { type: 'paragraph', name: `Postext Table Header${id.slice('PostextTableHeader'.length)}`, custom: true, basedOn: STYLE.normal, rPr: { b: bold || undefined, i: italic || undefined } });
    return id;
  }

  private headingProps(level: ResolvedHeadingLevelConfig, align: TextAlign): { pPr: ParaProps; rPr: RunProps } {
    const u = this.units;
    const size = px(u, level.fontSize, this.bodyPx);
    return {
      pPr: {
        keepNext: true,
        keepLines: true,
        suppressAutoHyphens: true,
        before: twips(u, level.marginTop, size),
        after: twips(u, level.marginBottom, size),
        line: { twips: twips(u, level.lineHeight, size), rule: 'atLeast' },
        ind: { left: level.indent ? twips(u, level.indent, size) : undefined, firstLine: level.firstLineIndent ? twips(u, level.firstLineIndent, size) : 0 },
        jc: JC[align],
        outlineLvl: Math.min(8, Math.max(0, level.level - 1)),
      },
      rPr: {
        ...this.font(level.fontFamily, level.fontWeight, level.italic),
        b: level.fontWeight >= 600,
        i: level.italic,
        caps: level.textTransform === 'uppercase' || undefined,
        // A heading the design sets in white on a band keeps the paper's ink.
        color: paleOnWhite(hex(level.color)) ? undefined : hex(level.color),
        spacing: level.letterSpacing.value ? twips(u, level.letterSpacing, size) : undefined,
        sz: halfPoints(u, level.fontSize, this.bodyPx),
      },
    };
  }

  private headingLevel(level: ResolvedHeadingLevelConfig): void {
    if (level.level < 1 || level.level > 6) return;
    const { pPr: p, rPr: r } = this.headingProps(level, this.resolved.headings.textAlign);
    this.add(`Heading${level.level}`, { type: 'paragraph', name: `heading ${level.level}`, basedOn: STYLE.normal, next: STYLE.normal, pPr: p, rPr: r });
  }

  /** The style of a heading: its level's, or the named heading style's
   *  (a style per name and level, based on the level's). */
  heading(level: number, styleName?: string): string {
    const lv = Math.min(6, Math.max(1, level));
    const base = `Heading${lv}`;
    if (!styleName) return base;
    const hs = this.resolved.headingStyles.find((s) => s.id === styleName || s.name === styleName);
    if (!hs) return base;
    const { id, fresh } = this.idFor(`heading:${hs.id}:${lv}`, 'PostextHeading', `${hs.id}${lv}`);
    if (fresh) {
      const levelConfig = this.resolved.headings.levels.find((l) => l.level === lv);
      if (levelConfig) {
        const merged = { ...levelConfig, ...hs.overrides } as ResolvedHeadingLevelConfig;
        const { pPr: p, rPr: r } = this.headingProps(merged, this.resolved.headings.textAlign);
        // A style that opens a page (a cover, a half-title, a title page)
        // keeps it in Word, so a run of such headings in one chapter does
        // not pile up on one page (#1444). A chapter's first heading is at
        // the top of its section's page already, where the break adds none.
        if (hs.breakBefore?.enabled ?? levelConfig.breakBefore.enabled) p.pageBreakBefore = true;
        this.add(id, { type: 'paragraph', name: `Heading ${lv}: ${hs.name || hs.id}`, custom: true, basedOn: base, next: STYLE.normal, pPr: p, rPr: r });
      } else this.add(id, { type: 'paragraph', name: `Heading ${lv}: ${hs.name || hs.id}`, custom: true, basedOn: base });
    }
    return id;
  }

  /** Word's own style of a contents or index entry at `level` (1–9):
   *  `toc N` / `index N`, the names Word applies when it updates the
   *  field, each level indented one step further. */
  listing(kind: 'toc' | 'index', level: number): string {
    const lv = Math.min(9, Math.max(1, level));
    const id = kind === 'toc' ? `TOC${lv}` : `Index${lv}`;
    const step = 240;
    const ind = kind === 'toc' ? { left: (lv - 1) * step, firstLine: 0 } : { left: lv * step, hanging: step };
    return this.add(id, { type: 'paragraph', name: `${kind} ${lv}`, basedOn: STYLE.normal, next: STYLE.normal, pPr: { before: 0, after: kind === 'toc' && lv === 1 ? 60 : 0, ind, jc: 'left' } });
  }

  /** The Word style of a named paragraph style (`:::paragraphs{style}`). */
  paragraphStyle(name: string): string | undefined {
    const ps = this.resolved.paragraphStyles.find((s) => s.id === name || s.name === name);
    if (!ps) return undefined;
    const { id, fresh } = this.idFor(`para:${ps.id}`, 'PostextPara', ps.id);
    if (fresh) this.add(id, this.paragraphDef(ps));
    return id;
  }

  private paragraphDef(ps: ResolvedParagraphStyleConfig): StyleDef {
    const u = this.units;
    const size = px(u, ps.fontSize, this.bodyPx);
    return {
      type: 'paragraph',
      name: ps.name || ps.id,
      custom: true,
      basedOn: STYLE.normal,
      pPr: {
        suppressAutoHyphens: !ps.hyphenation || undefined,
        before: twips(u, ps.marginTop, size),
        after: twips(u, ps.spaceBetween, size),
        line: { twips: twips(u, ps.lineHeight, size), rule: 'atLeast' },
        ind: { left: twips(u, ps.indent, size), right: ps.endIndent ? twips(u, ps.endIndent, size) : undefined, firstLine: twips(u, ps.firstLineIndent, size), hanging: twips(u, ps.hangingIndent, size) || undefined },
        jc: JC[ps.textAlign],
      },
      rPr: {
        ...this.font(ps.fontFamily, ps.fontWeight, ps.italic),
        i: ps.italic,
        smallCaps: ps.smallCaps || undefined,
        caps: ps.textTransform === 'uppercase' || undefined,
        color: hex(ps.color),
        spacing: ps.letterSpacing ? twips(u, ps.letterSpacing, size) : undefined,
        sz: halfPoints(u, ps.fontSize, this.bodyPx),
      },
    };
  }

  /** A paragraph style of the writer's own, made once per `key` (a heading
   *  design's text, a box's label tab): `make` gives its look. */
  custom(key: string, name: string, make: () => { basedOn?: string; pPr?: ParaProps; rPr?: RunProps }): string {
    const { id, fresh } = this.idFor(`custom:${key}`, 'Postext', name);
    // Two looks of one element (sizes fitted to different titles) get ids
    // …title and …title2; the names differ the same way, since LibreOffice
    // keys styles by name and would merge them.
    const n = id.slice(`Postext${slug(name)}`.length);
    if (fresh) this.add(id, { type: 'paragraph', name: `Postext ${name}${n ? ` ${n}` : ''}`, custom: true, basedOn: STYLE.normal, next: STYLE.normal, ...make() });
    return id;
  }

  /** The box style named by a callout's `type`. */
  callout(type: string | undefined): ResolvedCalloutStyleConfig | undefined {
    const styles = this.resolved.calloutStyles;
    return styles.find((s) => s.id === type) ?? styles.find((s) => s.name === type) ?? (type ? undefined : styles[0]);
  }

  /** Body and title paragraph styles of a box style. */
  calloutStyles(style: ResolvedCalloutStyleConfig | undefined): { body: string; title: string } {
    if (!style) return { body: STYLE.normal, title: STYLE.boxTitle };
    const u = this.units;
    const b = style.body;
    const t = style.titleStyle;
    const body = this.idFor(`box:${style.id}`, 'PostextBox', style.id);
    if (body.fresh) {
      const size = px(u, b.fontSize, this.bodyPx);
      const after = b.paragraphSpacing === false ? 0 : b.paragraphSpacing === true ? twips(u, b.lineHeight, size) : twips(u, b.paragraphSpacing, size);
      this.add(body.id, {
        type: 'paragraph',
        name: `Box: ${style.name || style.id}`,
        custom: true,
        basedOn: STYLE.normal,
        pPr: {
          suppressAutoHyphens: !b.hyphenation || undefined,
          after,
          line: { twips: twips(u, b.lineHeight, size), rule: 'atLeast' },
          ind: { firstLine: twips(u, b.firstLineIndent, size) },
          jc: b.textAlign === 'justify' ? 'both' : 'left',
        },
        rPr: {
          ...this.font(b.fontFamily, b.fontWeight, b.italic),
          i: b.italic,
          smallCaps: b.smallCaps || undefined,
          color: hex(b.color),
          spacing: b.letterSpacing ? twips(u, b.letterSpacing, size) : undefined,
          sz: halfPoints(u, b.fontSize, this.bodyPx),
        },
      });
    }
    const title = this.idFor(`boxTitle:${style.id}`, 'PostextBoxTitle', style.id);
    if (title.fresh) {
      const size = px(u, t.fontSize, this.bodyPx);
      this.add(title.id, {
        type: 'paragraph',
        name: `Box title: ${style.name || style.id}`,
        custom: true,
        basedOn: STYLE.boxTitle,
        pPr: { suppressAutoHyphens: true, after: twips(u, t.gap, size), line: { twips: twips(u, t.lineHeight, size), rule: 'atLeast' }, ind: { left: twips(u, t.indent, size), firstLine: 0 } },
        rPr: {
          ...this.font(t.fontFamily, t.fontWeight, t.italic),
          b: t.fontWeight >= 600,
          i: t.italic,
          caps: t.textTransform === 'uppercase' || undefined,
          color: hex(t.color),
          spacing: t.letterSpacing.value ? twips(u, t.letterSpacing, size) : undefined,
          sz: halfPoints(u, t.fontSize, this.bodyPx),
        },
      });
    }
    return { body: body.id, title: title.id };
  }

  docDefaults(lang: string | undefined): string {
    const l = lang ? `<w:lang w:val="${escapeAttr(lang)}" w:eastAsia="${escapeAttr(lang)}" w:bidi="${escapeAttr(lang)}"/>` : '';
    return `<w:docDefaults><w:rPrDefault><w:rPr>${l}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr/></w:pPrDefault></w:docDefaults>`;
  }

  /** The `w:style` elements (after `w:docDefaults`). */
  xml(): string {
    let out = '';
    for (const [id, d] of this.defs) {
      const attrs = `w:type="${d.type}"${d.isDefault ? ' w:default="1"' : ''} w:styleId="${escapeAttr(id)}"${d.custom ? ' w:customStyle="1"' : ''}`;
      let inner = `<w:name w:val="${escapeAttr(d.name)}"/>`;
      if (d.basedOn) inner += `<w:basedOn w:val="${d.basedOn}"/>`;
      if (d.next) inner += `<w:next w:val="${d.next}"/>`;
      if (d.semiHidden) inner += '<w:semiHidden/>';
      inner += '<w:qFormat/>';
      if (d.type === 'paragraph' && d.pPr) inner += pPr(d.pPr);
      if (d.rPr) inner += rPr(d.rPr);
      out += `<w:style ${attrs}>${inner}</w:style>`;
    }
    return out;
  }
}
