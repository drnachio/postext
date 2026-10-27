// Export settings and the style registry (the import template in reverse).
import type { PostextConfig, Dimension, TabStop, ColorValue } from '../../types.js';
import { type WordTemplate, type ParagraphTarget, type CharacterTarget, MARKUP_STYLE, MARKUP_CHAR_STYLE, CHAPTER_STYLE, calloutStylesOf, chipStylesOf } from '../template.js';
import { escapeAttr } from '../xml.js';

export interface ExportChapter {
  title: string;
  markdown: string;
}

export interface WordStyleNames {
  /** `Callout: __name__` */
  callout: string;
  /** `Callout: __name__: title` */
  calloutTitle: string;
  /** `Chip: __name__` */
  chip: string;
}

export const DEFAULT_STYLE_NAMES: WordStyleNames = {
  callout: 'Callout: __name__',
  calloutTitle: 'Callout: __name__: title',
  chip: 'Chip: __name__',
};

export interface ExportSettings {
  template: WordTemplate;
  config: PostextConfig;
  /** Several chapters: each opens with a `Postext Chapter` paragraph so the
   *  re-import rebuilds the book. */
  book: boolean;
  title?: string;
  author?: string;
  names?: WordStyleNames;
}

// ---------------------------------------------------------------------------
// Style registry (the template in reverse)
// ---------------------------------------------------------------------------

type StyleKind = 'paragraph' | 'character';

interface StyleDef {
  id: string;
  name: string;
  kind: StyleKind;
  basedOn?: string;
  pPr?: string;
  rPr?: string;
  builtin?: boolean;
}

const sameTarget = (a: ParagraphTarget | CharacterTarget, b: ParagraphTarget | CharacterTarget): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const BUILTIN_HEADING = (level: number): string => `heading ${level}`;

function halfPoints(d: Dimension | undefined, base = 10): number | undefined {
  if (!d) return undefined;
  const pt = d.unit === 'pt' ? d.value : d.unit === 'px' ? d.value * 0.75 : d.unit === 'mm' ? d.value * 2.8346 : d.unit === 'cm' ? d.value * 28.346 : d.unit === 'in' ? d.value * 72 : d.value * base;
  return pt > 4 && pt < 200 ? Math.round(pt * 2) : undefined;
}

/** A tracking as Word's character spacing (`w:spacing`, twentieths of a
 *  point); `em` counts `basePt`, the size of the text the style sets.
 *  Undefined for an unset or non-finite tracking; 0 stays 0. */
function trackingTwips(d: Dimension | undefined, basePt: number): number | undefined {
  if (!d || !Number.isFinite(d.value)) return undefined;
  const pt = d.unit === 'pt' ? d.value : d.unit === 'px' ? d.value * 0.75 : d.unit === 'mm' ? d.value * 2.8346 : d.unit === 'cm' ? d.value * 28.346 : d.unit === 'in' ? d.value * 72 : d.value * basePt;
  return Math.round(pt * 20);
}

/** The sizes the export gives Word's heading styles, half-points. */
const HEADING_HALF_POINTS = [40, 32, 28, 26, 24, 22];
/** The size a heading level is set at in Word, pt. */
const headingPt = (level: number): number => (HEADING_HALF_POINTS[level - 1] ?? 22) / 2;

/** The `w:spacing` run property for a tracking (nothing for none). */
const spacingXml = (tw: number | undefined): string => (tw !== undefined ? `<w:spacing w:val="${tw}"/>` : '');

function twips(d: Dimension | undefined, base = 10): number | undefined {
  const hp = halfPoints(d, base);
  return hp !== undefined ? hp * 10 : undefined;
}

/** A paragraph style's tab stops as Word's `w:tabs` (#622): the stops at a
 *  length (`'end'` and percentages need the page Word sets the text on, and
 *  are left out), their leaders as Word's nearest. */
function tabsXml(stops: readonly TabStop[] | undefined, fontSize: Dimension | undefined): string {
  if (!stops || stops.length === 0) return '';
  const base = fontSize?.unit === 'pt' ? fontSize.value : 10;
  const val: Record<string, string> = { start: 'left', end: 'right', center: 'center', decimal: 'decimal' };
  const leaders: Record<string, string> = { '.': 'dot', '. ': 'dot', '…': 'dot', '-': 'hyphen', '_': 'underscore', rule: 'underscore', '·': 'middleDot' };
  const tabs: string[] = [];
  for (const st of stops) {
    const p = st.position;
    if (typeof p !== 'object' || !p) continue;
    const pt = p.unit === 'pt' ? p.value : p.unit === 'px' ? p.value * 0.75 : p.unit === 'mm' ? p.value * 2.8346 : p.unit === 'cm' ? p.value * 28.346 : p.unit === 'in' ? p.value * 72 : p.value * base;
    if (!(pt > 0) || pt > 1584) continue;
    const leader = st.leader ? leaders[st.leader] : undefined;
    tabs.push(`<w:tab w:val="${val[st.align ?? 'start'] ?? 'left'}"${leader ? ` w:leader="${leader}"` : ''} w:pos="${Math.round(pt * 20)}"/>`);
  }
  return tabs.length > 0 ? `<w:tabs>${tabs.join('')}</w:tabs>` : '';
}

const hex = (c: ColorValue | undefined): string | undefined => (c?.hex && /^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex.slice(1).toUpperCase() : undefined);

export class Styles {
  readonly defs = new Map<string, StyleDef>();
  private byName = new Map<string, StyleDef>();
  readonly paragraphs: Record<string, ParagraphTarget> = {};
  readonly characters: Record<string, CharacterTarget> = {};
  /** The size of the body text, pt: what an `em` tracking counts where a style sets no size. */
  private readonly bodyPt: number;

  constructor(private template: WordTemplate, private config: PostextConfig, private names: WordStyleNames) {
    const body = config.bodyText;
    const bodySize = halfPoints(body?.fontSize) ?? 22;
    this.bodyPt = bodySize / 2;
    this.define({ id: 'Normal', name: 'Normal', kind: 'paragraph', builtin: true, pPr: '<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>', rPr: `<w:sz w:val="${bodySize}"/>` });
    const sizes = HEADING_HALF_POINTS;
    for (let l = 1; l <= 6; l++) {
      // The level's tracking (#932), before the size as Word orders them.
      const tracking = trackingTwips(config.headings?.levels?.find((x) => x.level === l)?.letterSpacing, sizes[l - 1]! / 2);
      this.define({ id: `Heading${l}`, name: BUILTIN_HEADING(l), kind: 'paragraph', builtin: true, basedOn: 'Normal', pPr: `<w:keepNext/><w:spacing w:before="${l === 1 ? 480 : 240}" w:after="120"/><w:outlineLvl w:val="${l - 1}"/>`, rPr: `<w:b/>${tracking ? spacingXml(tracking) : ''}<w:sz w:val="${sizes[l - 1]}"/>` });
    }
    this.define({ id: 'Quote', name: 'Quote', kind: 'paragraph', builtin: true, basedOn: 'Normal', pPr: '<w:ind w:left="720" w:right="720"/>', rPr: '<w:i/><w:color w:val="595959"/>' });
    this.define({ id: 'ListParagraph', name: 'List Paragraph', kind: 'paragraph', builtin: true, basedOn: 'Normal', pPr: '<w:ind w:left="720"/><w:contextualSpacing/>' });
    this.define({ id: 'FootnoteText', name: 'footnote text', kind: 'paragraph', builtin: true, basedOn: 'Normal', pPr: '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', rPr: '<w:sz w:val="18"/>' });
    this.define({ id: 'FootnoteReference', name: 'footnote reference', kind: 'character', builtin: true, rPr: '<w:vertAlign w:val="superscript"/>' });
    this.define({ id: 'Hyperlink', name: 'Hyperlink', kind: 'character', builtin: true, rPr: '<w:color w:val="0563C1"/><w:u w:val="single"/>' });
    const mono = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:color w:val="7F7F7F"/><w:sz w:val="18"/>';
    this.define({ id: 'PostextMarkup', name: MARKUP_STYLE, kind: 'paragraph', basedOn: 'Normal', pPr: '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0"/>', rPr: mono });
    this.define({ id: 'PostextMarkupInline', name: MARKUP_CHAR_STYLE, kind: 'character', rPr: `${mono}<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>` });
    this.define({ id: 'PostextChapter', name: CHAPTER_STYLE, kind: 'paragraph', basedOn: 'Normal', pPr: '<w:pageBreakBefore/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="A6A6A6"/></w:pBdr><w:spacing w:after="240"/>', rPr: '<w:caps/><w:color w:val="7F7F7F"/><w:sz w:val="20"/>' });
    this.paragraphs[MARKUP_STYLE] = { kind: 'markup' };
    this.paragraphs[CHAPTER_STYLE] = { kind: 'chapter' };
    this.characters[MARKUP_CHAR_STYLE] = { kind: 'markup' };
  }

  private define(def: StyleDef): StyleDef {
    const existing = this.byName.get(def.name.toLowerCase());
    if (existing) return existing;
    let id = def.id.replace(/[^A-Za-z0-9]/g, '') || 'Style';
    for (let n = 2; this.defs.has(id); n++) id = `${def.id.replace(/[^A-Za-z0-9]/g, '') || 'Style'}${n}`;
    const d = { ...def, id };
    this.defs.set(id, d);
    this.byName.set(d.name.toLowerCase(), d);
    return d;
  }

  /** The template's own name for a target, when it has one. */
  private templateName<T extends ParagraphTarget | CharacterTarget>(map: Record<string, T>, target: T): string | undefined {
    for (const [name, t] of Object.entries(map)) if (sameTarget(t, target)) return name;
    return undefined;
  }

  private freeName<T extends ParagraphTarget | CharacterTarget>(base: string, kind: StyleKind, target: T, map: Record<string, T>): string {
    let name = base;
    for (let n = 2; ; n++) {
      const taken = this.byName.get(name.toLowerCase());
      if (!taken) return name;
      const meaning = map[taken.name];
      if (taken.kind === kind && (!meaning || sameTarget(meaning, target)) && !(taken.builtin && !meaning)) return name;
      name = `${base} (${n})`;
    }
  }

  /** A paragraph style for a target, defined on first use. */
  paragraph(target: ParagraphTarget, fallbackName: () => string, look: () => Pick<StyleDef, 'basedOn' | 'pPr' | 'rPr'>): string {
    // A name that already means something else (a Postext style called
    // `Quote`, one heading style used at two levels) gets a number.
    const name = this.freeName(this.templateName(this.template.paragraphs, target) ?? fallbackName(), 'paragraph', target, this.paragraphs);
    const def = this.define({ id: name, name, kind: 'paragraph', ...look() });
    this.paragraphs[def.name] = target;
    return def.id;
  }

  character(target: CharacterTarget, fallbackName: () => string, look: () => Pick<StyleDef, 'rPr'>): string {
    const name = this.freeName(this.templateName(this.template.characters, target) ?? fallbackName(), 'character', target, this.characters);
    const def = this.define({ id: name, name, kind: 'character', ...look() });
    this.characters[def.name] = target;
    return def.id;
  }

  heading(level: number, style?: string): string {
    if (!style) {
      const custom = this.templateName(this.template.paragraphs, { kind: 'heading', level });
      if (!custom || custom.toLowerCase() === BUILTIN_HEADING(level)) {
        this.paragraphs[BUILTIN_HEADING(level)] = { kind: 'heading', level };
        return `Heading${level}`;
      }
    }
    const hs = style ? this.config.headingStyles?.find((s) => s.id === style) : undefined;
    return this.paragraph(
      { kind: 'heading', level, ...(style ? { style } : {}) },
      () => (hs ? hs.name ?? hs.id : style ?? BUILTIN_HEADING(level)),
      () => {
        // A heading style's own tracking (#932): written even at 0, which
        // takes the level's off.
        const own = trackingTwips(hs?.letterSpacing, headingPt(level));
        return { basedOn: `Heading${level}`, ...(own !== undefined ? { rPr: spacingXml(own) } : {}) };
      },
    );
  }

  paragraphsStyle(style: string): string {
    const ps = this.config.paragraphStyles?.find((s) => s.id === style);
    return this.paragraph({ kind: 'paragraphs', style }, () => ps?.name ?? style, () => {
      let rPr = '';
      let pPr = '';
      if (ps?.fontFamily) rPr += `<w:rFonts w:ascii="${escapeAttr(ps.fontFamily)}" w:hAnsi="${escapeAttr(ps.fontFamily)}"/>`;
      if (ps?.italic) rPr += '<w:i/>';
      if (ps?.smallCaps) rPr += '<w:smallCaps/>';
      const c = hex(ps?.color);
      if (c) rPr += `<w:color w:val="${c}"/>`;
      // Tracking (#907) in twentieths of a point, after the colour.
      const sz = halfPoints(ps?.fontSize);
      const spacing = trackingTwips(ps?.letterSpacing, (sz ?? this.bodyPt * 2) / 2);
      if (spacing) rPr += spacingXml(spacing);
      if (sz) rPr += `<w:sz w:val="${sz}"/>`;
      const jc = ps?.textAlign === 'center' ? 'center' : ps?.textAlign === 'right' || ps?.textAlign === 'end' ? 'right' : ps?.textAlign === 'justify' ? 'both' : ps?.textAlign ? 'left' : undefined;
      // Schema order: tabs, then ind before jc.
      pPr += tabsXml(ps?.tabStops, ps?.fontSize);
      const ind = twips(ps?.indent);
      if (ind) pPr += `<w:ind w:left="${ind}"/>`;
      if (jc) pPr += `<w:jc w:val="${jc}"/>`;
      return { basedOn: 'Normal', pPr, rPr };
    });
  }

  callout(type: string, title = false): string {
    const cs = calloutStylesOf(this.config).find((s) => s.id === type);
    const label = cs?.name ?? type;
    const fill = (cs?.backgroundEnabled !== false ? hex(cs?.background) : undefined) ?? 'EEF3F8';
    return this.paragraph(
      title ? { kind: 'calloutTitle', type } : { kind: 'callout', type },
      () => (title ? this.names.calloutTitle : this.names.callout).replace('__name__', label),
      () => ({
        basedOn: 'Normal',
        pPr: `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="8EA9C1"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:ind w:left="284" w:right="284"/>`,
        rPr: title ? '<w:b/>' : '',
      }),
    );
  }

  quote(): string {
    const custom = this.templateName(this.template.paragraphs, { kind: 'quote' });
    if (!custom || custom.toLowerCase() === 'quote') {
      this.paragraphs.Quote = { kind: 'quote' };
      return 'Quote';
    }
    return this.paragraph({ kind: 'quote' }, () => custom, () => ({ basedOn: 'Quote' }));
  }

  body(): string {
    this.paragraphs.Normal = { kind: 'body' };
    return 'Normal';
  }

  chip(style: string): string {
    const cs = chipStylesOf(this.config).find((s) => s.id === style);
    const fill = hex(cs?.background) ?? 'E8EEF7';
    return this.character({ kind: 'chip', style }, () => this.names.chip.replace('__name__', cs?.name ?? style), () => ({
      rPr: `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`,
    }));
  }

  xml(): string {
    let out = '';
    for (const d of this.defs.values()) {
      const type = d.kind;
      const isDefault = d.id === 'Normal' ? ' w:default="1"' : '';
      out += `<w:style w:type="${type}" w:styleId="${d.id}"${isDefault}${d.builtin ? '' : ' w:customStyle="1"'}>`;
      out += `<w:name w:val="${escapeAttr(d.name)}"/>`;
      if (d.basedOn) out += `<w:basedOn w:val="${d.basedOn}"/>`;
      if (type === 'paragraph') out += '<w:next w:val="Normal"/>';
      out += '<w:qFormat/>';
      if (d.pPr && type === 'paragraph') out += `<w:pPr>${d.pPr}</w:pPr>`;
      if (d.rPr) out += `<w:rPr>${d.rPr}</w:rPr>`;
      out += '</w:style>';
    }
    return out;
  }
}
