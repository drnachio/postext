import type { CalloutStyleConfig, ChipStyleConfig, MarkStyleConfig, PageTemplate, ParagraphStyleConfig } from 'postext';
import { at, box, col, mm, pt, rule } from './guideKit.js';
import type { GuideLang } from '../defaultResources/lang.js';

// The styles the chapters on boxes and composed pages show at work, shared
// by every edition of the guide: the aside with a marker column, the chips
// set inside the line, and the template of the composed page that closes
// the chapter on composed pages. Each edition passes its faces, the leading
// of its boxes and the names it gives the styles; the words on the page
// come from its Markdown.

/** The faces an edition sets its boxes and labels in. */
export interface FeatureFaces {
  /** The face of the running text. */
  text: string;
  /** The face of labels and boxes. */
  sans: string;
}

/** What differs between editions besides the faces. */
export interface FeatureOptions {
  /** Leading of the sans boxes (13.5 pt in the vertical editions). */
  boxLead: number;
  /** How the boxes set their lines: ragged or justified. */
  bodyAlign: 'left' | 'justify';
  /** Labels in capitals, spaced out (scripts with case only). */
  upperLabels: boolean;
}

/** The names the Design panel shows for the new styles. */
export interface FeatureNames {
  aside: string;
  sheetTitle: string;
  sheetCard: string;
  sheetKey: string;
  key: string;
  state: string;
  sheet: string;
  mark: string;
}

function boxBody(f: FeatureFaces, o: FeatureOptions) {
  return {
    fontFamily: f.sans, fontSize: pt(8.3), lineHeight: pt(o.boxLead), color: col('ink'), boldColor: col('ink'),
    textAlign: o.bodyAlign, hyphenation: false, paragraphSpacing: true, firstLineIndent: mm(0),
  };
}

function labelType(f: FeatureFaces, o: FeatureOptions) {
  return o.upperLabels
    ? { fontFamily: f.sans, fontSize: pt(7.5), fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: pt(1.6) }
    : { fontFamily: f.sans, fontSize: pt(7.5), fontWeight: 700, letterSpacing: pt(0) };
}

/** The aside: an unboxed note beside a gilt marker column, a dot over a
 *  rule as tall as the box. Floated by the boxes chapter to the foot of a
 *  column. */
export function asideCallout(f: FeatureFaces, o: FeatureOptions, name: string): CalloutStyleConfig {
  return {
    id: 'aside', name,
    span: 'column', placement: 'here',
    backgroundEnabled: false, border: { enabled: false }, borderRadius: mm(0),
    padding: { top: mm(0.4), right: mm(0), bottom: mm(0.6), left: mm(0) },
    icon: { kind: 'none' },
    marker: {
      kind: 'shape', shape: 'dot', size: mm(2.2), color: col('gilt'), align: 'top', gap: mm(3),
      rule: { enabled: true, color: col('gilt'), width: pt(0.75) },
    },
    titleStyle: { ...labelType(f, o), color: col('ink'), gap: mm(1.4) },
    body: boxBody(f, o),
    marginTop: pt(6), marginBottom: pt(6), keepTogether: true,
  };
}

/** The colophon at the foot of the contents: no box, set in the edition's
 *  colophon type and floated to the bottom of the page, so the contents
 *  can open on the back of the cover as a spread (#1299). */
export function colophonCallout(type: ParagraphStyleConfig): CalloutStyleConfig {
  return {
    id: 'colophon', name: type.name,
    span: 'column', placement: 'bottom',
    backgroundEnabled: false, border: { enabled: false }, borderRadius: mm(0),
    padding: { top: mm(0), right: mm(0), bottom: mm(0), left: mm(0) },
    icon: { kind: 'none' },
    body: {
      fontFamily: type.fontFamily, fontSize: type.fontSize, lineHeight: type.lineHeight,
      color: col('muted'), boldColor: col('ink'), textAlign: type.textAlign === 'justify' ? 'justify' : 'left',
      hyphenation: false, paragraphSpacing: true, firstLineIndent: mm(0),
    },
    marginTop: pt(12), marginBottom: pt(0), keepTogether: true,
  };
}

/** The boxes of the composed page: a title set plain, three cards with a
 *  tab in the part colour, and a tinted key at the foot. */
export function sheetCallouts(f: FeatureFaces, o: FeatureOptions, names: FeatureNames): CalloutStyleConfig[] {
  const body = boxBody(f, o);
  return [
    {
      id: 'sheet-title', name: names.sheetTitle,
      backgroundEnabled: false, border: { enabled: false }, borderRadius: mm(0),
      padding: { top: mm(0), right: mm(0), bottom: mm(0), left: mm(0) }, icon: { kind: 'none' },
      body: { ...body, fontFamily: f.text, fontSize: pt(13), lineHeight: pt(o.boxLead + 7) },
    },
    {
      id: 'sheet-card', name: names.sheetCard,
      backgroundEnabled: true, background: col('panel'), border: { enabled: false }, borderRadius: mm(1.2),
      padding: { top: mm(9), right: mm(4), bottom: mm(4), left: mm(4) }, icon: { kind: 'none' },
      label: {
        ...labelType(f, o), color: col('white'), background: col('band'),
        position: 'top-left', height: mm(5.6), paddingX: mm(2.6), inset: mm(4),
      },
      body: { ...body, fontFamily: f.text, fontSize: pt(9.4), lineHeight: pt(o.boxLead + 2) },
    },
    {
      id: 'sheet-key', name: names.sheetKey,
      backgroundEnabled: true, background: col('tint'), border: { enabled: false }, borderRadius: mm(1.2),
      padding: { top: mm(3), right: mm(3.5), bottom: mm(2.6), left: mm(4.5) }, icon: { kind: 'none' },
      stripe: { enabled: true, side: 'left', width: pt(3), color: col('band') },
      titleStyle: { ...labelType(f, o), color: col('band'), gap: mm(1.6) },
      label: { ...labelType(f, o), color: col('band'), background: col('tint'), position: 'top-left', height: mm(5), paddingX: mm(0), inset: mm(4.5) },
      body,
    },
  ];
}

/** Chips: a key cap (the first style, which a bare `:chip[…]` takes) and a
 *  state in the part colour. */
export function guideChipStyles(f: FeatureFaces, names: FeatureNames): ChipStyleConfig[] {
  return [
    {
      id: 'key', name: names.key,
      backgroundEnabled: true, background: col('white'), borderColor: col('muted'), borderWidth: pt(0.6),
      borderRadius: { value: 0.25, unit: 'em' }, paddingX: { value: 0.35, unit: 'em' },
      fontFamily: f.sans, fontSize: { value: 0.85, unit: 'em' }, color: col('ink'),
    },
    {
      id: 'state', name: names.state,
      backgroundEnabled: true, background: col('tint'), borderWidth: pt(0),
      borderRadius: { value: 0.5, unit: 'em' }, paddingX: { value: 0.45, unit: 'em' },
      fontFamily: f.sans, fontSize: { value: 0.85, unit: 'em' }, color: col('band'), bold: true,
    },
  ];
}

/** The highlight of \`:mark[…]\`: a band of pale gilt behind the words. */
export function guideMarkStyles(names: FeatureNames): MarkStyleConfig[] {
  return [{ id: 'key', name: names.mark, background: { hex: '#f1e3b4', model: 'hex' }, borderRadius: { value: 0.15, unit: 'em' }, paddingX: { value: 0.1, unit: 'em' } }];
}

/** The quick-reference sheet that closes the chapter on composed pages: a
 *  title (the page's heading, then its first paragraph), cards three to a
 *  row, filled one per `:::frame{slot="card"}`, and a key standing on the
 *  foot of the area. Every size follows the area, so the template stands in a
 *  horizontal page and in a vertical one alike; `cardHeight` (mm) lets the
 *  Latin editions fill their page with taller cards. */
export function sheetTemplate(name: string, cardHeight = 72): PageTemplate {
  return {
    id: 'sheet', name,
    decoration: {
      elements: [
        box('sheetBand', 'band', { anchor: at('bleed', 'top-left'), height: 5 }),
        rule('sheetRule', 'band', { anchor: at('#title', 'below'), offset: [0, 2], width: 34, thickness: 2 }),
      ],
    },
    frames: [
      { name: 'title', takes: 'h2', style: 'sheet-title', width: 'fill', placement: { anchor: at('container', 'top-left') } },
      { name: 'lead', flow: true, style: 'sheet-title', width: 'fill', placement: { anchor: at('#title', 'below'), offset: { y: mm(6) } } },
      { name: 'card', style: 'sheet-card', width: 'fill', minHeight: mm(cardHeight) },
      { name: 'key', style: 'sheet-key', width: 'fill', placement: { anchor: at('container', 'bottom-left') } },
    ],
    groups: [
      {
        name: 'cards', kind: 'grid', columns: 3, columnGap: mm(6), rowGap: mm(6), rowAlign: 'stretch', repeat: { frames: ['card'] },
        placement: { anchor: at('#lead', 'below'), offset: { y: mm(8) }, size: { width: 'fill', height: 'auto' } },
      },
    ],
  };
}

/** The names of the new styles in each edition's language, and the name of
 *  its index heading style. */
export const FEATURE_NAMES: Record<GuideLang, FeatureNames & { index: string }> = {
  en: { aside: 'Aside', sheetTitle: 'Sheet title', sheetCard: 'Sheet card', sheetKey: 'Sheet key', key: 'Key', state: 'State', sheet: 'Quick-reference sheet', mark: 'Highlight', index: 'Index' },
  es: { aside: 'Aparte', sheetTitle: 'Título de ficha', sheetCard: 'Tarjeta de ficha', sheetKey: 'Clave de ficha', key: 'Tecla', state: 'Estado', sheet: 'Ficha de consulta', mark: 'Resaltado', index: 'Índice alfabético' },
  ca: { aside: 'Apart', sheetTitle: 'Títol de fitxa', sheetCard: 'Targeta de fitxa', sheetKey: 'Clau de fitxa', key: 'Tecla', state: 'Estat', sheet: 'Fitxa de consulta', mark: 'Ressaltat', index: 'Índex alfabètic' },
  'pt-BR': { aside: 'Aparte', sheetTitle: 'Título da ficha', sheetCard: 'Cartão da ficha', sheetKey: 'Chave da ficha', key: 'Tecla', state: 'Estado', sheet: 'Ficha de consulta', mark: 'Destaque', index: 'Índice remissivo' },
  fr: { aside: 'Aparté', sheetTitle: 'Titre de fiche', sheetCard: 'Carte de fiche', sheetKey: 'Clé de fiche', key: 'Touche', state: 'État', sheet: 'Fiche mémo', mark: 'Surlignage', index: 'Index' },
  de: { aside: 'Randbemerkung', sheetTitle: 'Blatttitel', sheetCard: 'Blattkarte', sheetKey: 'Blattlegende', key: 'Taste', state: 'Zustand', sheet: 'Übersichtsblatt', mark: 'Hervorhebung', index: 'Register' },
  it: { aside: 'Inciso', sheetTitle: 'Titolo della scheda', sheetCard: 'Riquadro della scheda', sheetKey: 'Legenda della scheda', key: 'Tasto', state: 'Stato', sheet: 'Scheda riassuntiva', mark: 'Evidenziazione', index: 'Indice analitico' },
  ar: { aside: 'حاشية', sheetTitle: 'عنوان البطاقة', sheetCard: 'خانة البطاقة', sheetKey: 'مفتاح البطاقة', key: 'مفتاح', state: 'حالة', sheet: 'بطاقة مرجعية', mark: 'تظليل', index: 'الفهرس' },
  'zh-Hans': { aside: '旁注', sheetTitle: '速查页标题', sheetCard: '速查页卡片', sheetKey: '速查页图例', key: '按键', state: '状态', sheet: '速查页', mark: '高亮', index: '索引' },
  ja: { aside: '傍注', sheetTitle: '早見表の見出し', sheetCard: '早見表のカード', sheetKey: '早見表の凡例', key: 'キー', state: '状態', sheet: '早見表', mark: 'マーカー', index: '索引' },
};

/** The index chapter's heading style: the contents page's design, its
 *  entries in two columns, opening on a verso like every chapter. */
export function indexHeadingStyle<T extends { id: string; name?: string; toc?: boolean; layout?: unknown }>(contents: T, name: string, gutter: number): T {
  return { ...contents, id: 'index', name, toc: true, breakBefore: { enabled: true, parity: 'even' }, layout: { layoutType: 'double', gutterWidth: mm(gutter) } };
}
