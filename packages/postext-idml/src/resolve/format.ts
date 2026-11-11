// Typed readers over computed properties: what an importer asks of a
// paragraph or a run, with InDesign's defaults where nothing is written.
// Lengths in points, percentages as InDesign writes them (100 = normal).

import type { Props } from '../model/document.js';
import { languageTag } from '../read/languages.js';
import { listRecords, plainName, propNumber, propText, refOf } from '../read/props.js';

const number = (p: Props, name: string): number | undefined => {
  const v = p.attrs[name];
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const flag = (p: Props, name: string): boolean => p.attrs[name] === 'true';

/** A reference written as an attribute or as a property
 *  (`FillColor="Color/Black"`, `<AppliedFont type="string">`). */
const reference = (p: Props, name: string): string | undefined => refOf(p.attrs[name]) ?? refOf(propText(p, name)?.trim());

export interface CharacterFormat {
  fontFamily?: string;
  /** `Regular`, `Bold`, `Italic`, `Bold Italic`, or the face's own name. */
  fontStyle: string;
  pointSize: number;
  /** In points; an automatic leading is already worked out. */
  leading: number;
  autoLeading: boolean;
  fillColor?: string;
  /** 0–100, or undefined when the swatch is used at full strength. */
  fillTint?: number;
  strokeColor?: string;
  strokeWeight?: number;
  /** Thousandths of an em. */
  tracking: number;
  kerning?: string;
  capitalization: 'Normal' | 'SmallCaps' | 'AllCaps' | 'CapToSmallCap';
  position: 'Normal' | 'Superscript' | 'Subscript' | 'OTSuperscript' | 'OTSubscript' | 'OTNumerator' | 'OTDenominator';
  underline: boolean;
  strikeThru: boolean;
  baselineShift: number;
  horizontalScale: number;
  verticalScale: number;
  skew: number;
  /** InDesign's name of the language (`Spanish: Castilian`). */
  language?: string;
  /** Its IETF tag, when the reader knows the name. */
  languageTag?: string;
  noBreak: boolean;
  ligatures: boolean;
  /** `direction` of the characters when one is forced. */
  characterDirection?: 'ltr' | 'rtl';
  ruby?: { text: string; type: string; position: string; alignment: string };
  tatechuyoko: boolean;
  /** Emphasis marks (`KentenSesameDot`…), with the character of a custom one. */
  kenten?: { kind: string; character?: string; position: string };
  /** OpenType features switched on, by InDesign's attribute name. */
  openType: string[];
}

const CAPS = new Set(['Normal', 'SmallCaps', 'AllCaps', 'CapToSmallCap']);
const POSITIONS = new Set(['Normal', 'Superscript', 'Subscript', 'OTSuperscript', 'OTSubscript', 'OTNumerator', 'OTDenominator']);

/** The leading in points: a number when written, or the automatic one
 *  (`AutoLeading` percent of the size, 120 unless set). */
export function leadingOf(p: Props, pointSize = number(p, 'PointSize') ?? 12): { leading: number; auto: boolean } {
  const fixed = propNumber(p, 'Leading') ?? number(p, 'Leading');
  if (fixed !== undefined) return { leading: fixed, auto: false };
  return { leading: (pointSize * (number(p, 'AutoLeading') ?? 120)) / 100, auto: true };
}

const OPEN_TYPE = /^OTF[A-Z]/;

export function characterFormat(p: Props): CharacterFormat {
  const pointSize = number(p, 'PointSize') ?? 12;
  const { leading, auto } = leadingOf(p, pointSize);
  const family = propText(p, 'AppliedFont')?.trim() || p.attrs.AppliedFont;
  const language = reference(p, 'AppliedLanguage');
  const tint = number(p, 'FillTint');
  const caps = p.attrs.Capitalization ?? 'Normal';
  const position = p.attrs.Position ?? 'Normal';
  const out: CharacterFormat = {
    fontStyle: plainName(p.attrs.FontStyle) || 'Regular',
    pointSize,
    leading,
    autoLeading: auto,
    tracking: number(p, 'Tracking') ?? 0,
    capitalization: (CAPS.has(caps) ? caps : 'Normal') as CharacterFormat['capitalization'],
    position: (POSITIONS.has(position) ? position : 'Normal') as CharacterFormat['position'],
    underline: flag(p, 'Underline'),
    strikeThru: flag(p, 'StrikeThru'),
    baselineShift: number(p, 'BaselineShift') ?? 0,
    horizontalScale: number(p, 'HorizontalScale') ?? 100,
    verticalScale: number(p, 'VerticalScale') ?? 100,
    skew: number(p, 'Skew') ?? 0,
    noBreak: flag(p, 'NoBreak'),
    ligatures: p.attrs.Ligatures !== 'false',
    tatechuyoko: flag(p, 'Tatechuyoko'),
    openType: Object.keys(p.attrs).filter((k) => OPEN_TYPE.test(k) && p.attrs[k] === 'true'),
  };
  if (family) out.fontFamily = plainName(family);
  const fill = reference(p, 'FillColor');
  if (fill) out.fillColor = fill;
  // -1 is InDesign's "no tint of its own".
  if (tint !== undefined && tint >= 0) out.fillTint = tint;
  const stroke = reference(p, 'StrokeColor');
  if (stroke) out.strokeColor = stroke;
  const weight = number(p, 'StrokeWeight');
  if (weight !== undefined) out.strokeWeight = weight;
  if (p.attrs.KerningMethod) out.kerning = plainName(p.attrs.KerningMethod);
  if (language) {
    out.language = plainName(language.replace(/^Language\//, ''));
    const tag = languageTag(language);
    if (tag) out.languageTag = tag;
  }
  if (p.attrs.CharacterDirection === 'RightToLeftDirection') out.characterDirection = 'rtl';
  else if (p.attrs.CharacterDirection === 'LeftToRightDirection') out.characterDirection = 'ltr';
  // `RubyFlag` is written as a number by current versions and as a
  // boolean by older ones.
  const ruby = p.attrs.RubyFlag;
  if (ruby !== undefined && ruby !== 'false' && ruby !== '0' && p.attrs.RubyString) {
    out.ruby = { text: p.attrs.RubyString, type: p.attrs.RubyType ?? 'PerCharacterRuby', position: p.attrs.RubyPosition ?? 'AboveRight', alignment: p.attrs.RubyAlignment ?? 'RubyJIS' };
  }
  const kenten = p.attrs.KentenKind;
  if (kenten && kenten !== 'None') {
    out.kenten = { kind: kenten, ...(p.attrs.KentenCustomCharacter ? { character: p.attrs.KentenCustomCharacter } : {}), position: p.attrs.KentenPosition ?? 'AboveRight' };
  }
  return out;
}

export interface TabStop {
  position: number;
  alignment: 'LeftAlign' | 'CenterAlign' | 'RightAlign' | 'CharacterAlign';
  alignmentCharacter: string;
  leader: string;
}

export interface ParagraphRule {
  weight: number;
  /** A swatch, or undefined for the colour of the text. */
  color?: string;
  tint?: number;
  offset: number;
  leftIndent: number;
  rightIndent: number;
  width: 'ColumnWidth' | 'TextWidth';
  type?: string;
}

export interface ListFormat {
  type: 'bullet' | 'numbered';
  /** 1-based. */
  level: number;
  /** Bullet lists: the bullet, and the font it is taken from when the
   *  list names one. */
  bullet?: string;
  bulletFont?: string;
  /** The bullet is a glyph of its font by number, not a character. */
  bulletGlyph?: number;
  /** Numbered lists: `^#.^t` (the number, a full stop, a tab). */
  expression?: string;
  /** `1, 2, 3, 4...`, `a, b, c, d...`, `I, II, III, IV...`… */
  numberFormat?: string;
  startAt: number;
  continues: boolean;
  /** The text between the bullet and the paragraph (`^t`). */
  textAfter?: string;
  numberingList?: string;
  characterStyle?: string;
}

export interface ParagraphFormat {
  justification: 'LeftAlign' | 'CenterAlign' | 'RightAlign' | 'LeftJustified' | 'CenterJustified' | 'RightJustified' | 'FullyJustified' | 'ToBindingSide' | 'AwayFromBindingSide';
  /** The alignment as a reader of the page sees it. */
  align: 'left' | 'center' | 'right' | 'justify';
  leftIndent: number;
  rightIndent: number;
  firstLineIndent: number;
  lastLineIndent: number;
  spaceBefore: number;
  spaceAfter: number;
  direction: 'ltr' | 'rtl';
  hyphenation: boolean;
  tabs: TabStop[];
  dropCap?: { characters: number; lines: number; characterStyle?: string };
  keep: { withNext: number; linesTogether: boolean; allLinesTogether: boolean; firstLines: number; lastLines: number; withPrevious: boolean };
  /** Where the paragraph must start (`NextColumn`, `NextPage`…). */
  startParagraph?: string;
  list?: ListFormat;
  ruleAbove?: ParagraphRule;
  ruleBelow?: ParagraphRule;
  /** The paragraph spans the columns of its frame (`All` or a count). */
  spanColumns?: string;
  shading?: { color?: string; tint?: number };
  border?: { color?: string; weight: number };
  composer?: string;
}

const JUSTIFICATIONS = new Set(['LeftAlign', 'CenterAlign', 'RightAlign', 'LeftJustified', 'CenterJustified', 'RightJustified', 'FullyJustified', 'ToBindingSide', 'AwayFromBindingSide']);
const TAB_ALIGNMENTS = new Set(['LeftAlign', 'CenterAlign', 'RightAlign', 'CharacterAlign']);

const text = (el: Props['properties'][string] | undefined): string => {
  let out = '';
  if (el) for (const c of el.children) if (typeof c === 'string') out += c;
  return out;
};

export function tabStops(p: Props): TabStop[] {
  const out: TabStop[] = [];
  for (const r of listRecords(p.properties.TabList)) {
    const position = Number(text(r.Position));
    if (!Number.isFinite(position)) continue;
    const alignment = text(r.Alignment);
    out.push({ position, alignment: (TAB_ALIGNMENTS.has(alignment) ? alignment : 'LeftAlign') as TabStop['alignment'], alignmentCharacter: text(r.AlignmentCharacter), leader: text(r.Leader) });
  }
  return out.sort((a, b) => a.position - b.position);
}

function ruleOf(p: Props, which: 'RuleAbove' | 'RuleBelow'): ParagraphRule | undefined {
  if (!flag(p, which)) return undefined;
  // A rule's colour is a swatch, or the words `Text Color`.
  const colour = refOf(propText(p, `${which}Color`)?.trim());
  const tint = number(p, `${which}Tint`);
  const type = refOf(propText(p, `${which}Type`)?.trim());
  return {
    weight: number(p, `${which}LineWeight`) ?? 1,
    ...(colour && colour !== 'Text Color' ? { color: colour } : {}),
    ...(tint !== undefined && tint >= 0 ? { tint } : {}),
    offset: number(p, `${which}Offset`) ?? 0,
    leftIndent: number(p, `${which}LeftIndent`) ?? 0,
    rightIndent: number(p, `${which}RightIndent`) ?? 0,
    width: p.attrs[`${which}Width`] === 'TextWidth' ? 'TextWidth' : 'ColumnWidth',
    ...(type ? { type } : {}),
  };
}

function listOf(p: Props): ListFormat | undefined {
  const type = p.attrs.BulletsAndNumberingListType;
  if (type !== 'BulletList' && type !== 'NumberedList') return undefined;
  const level = Math.max(1, Math.round(number(p, 'NumberingLevel') ?? 1));
  if (type === 'BulletList') {
    const char = p.properties.BulletChar;
    const code = Number(char?.attrs.BulletCharacterValue);
    const kind = char?.attrs.BulletCharacterType ?? 'UnicodeOnly';
    const font = plainName(propText(p, 'BulletsFont')?.trim());
    const style = refOf(propText(p, 'BulletsCharacterStyle')?.trim());
    const after = p.attrs.BulletsTextAfter;
    const out: ListFormat = { type: 'bullet', level, startAt: 1, continues: true };
    // A bullet taken from a font by glyph number has no character to give.
    if (kind === 'GlyphWithFont') {
      if (Number.isFinite(code)) out.bulletGlyph = code;
    } else out.bullet = Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '•';
    if (font) out.bulletFont = font;
    if (after !== undefined) out.textAfter = after;
    if (style) out.characterStyle = style;
    return out;
  }
  const format = propText(p, 'NumberingFormat')?.trim();
  const list = refOf(propText(p, 'AppliedNumberingList')?.trim());
  const style = refOf(propText(p, 'NumberingCharacterStyle')?.trim());
  return {
    type: 'numbered',
    level,
    expression: p.attrs.NumberingExpression ?? '^#.^t',
    ...(format ? { numberFormat: format } : {}),
    startAt: number(p, 'NumberingStartAt') ?? 1,
    continues: p.attrs.NumberingContinue !== 'false',
    ...(list ? { numberingList: list } : {}),
    ...(style ? { characterStyle: style } : {}),
  };
}

export function paragraphFormat(p: Props): ParagraphFormat {
  const justification = (JUSTIFICATIONS.has(p.attrs.Justification ?? '') ? p.attrs.Justification : 'LeftAlign') as ParagraphFormat['justification'];
  const direction = p.attrs.ParagraphDirection === 'RightToLeftDirection' ? 'rtl' : 'ltr';
  // `LeftJustified` is justified text whose last line stands at the left.
  const align: ParagraphFormat['align'] = /Justified$/.test(justification) ? 'justify' : justification === 'CenterAlign' ? 'center' : justification === 'RightAlign' ? 'right' : 'left';
  const out: ParagraphFormat = {
    justification,
    align,
    leftIndent: number(p, 'LeftIndent') ?? 0,
    rightIndent: number(p, 'RightIndent') ?? 0,
    firstLineIndent: number(p, 'FirstLineIndent') ?? 0,
    lastLineIndent: number(p, 'LastLineIndent') ?? 0,
    spaceBefore: number(p, 'SpaceBefore') ?? 0,
    spaceAfter: number(p, 'SpaceAfter') ?? 0,
    direction,
    hyphenation: p.attrs.Hyphenation !== 'false',
    tabs: tabStops(p),
    keep: {
      withNext: number(p, 'KeepWithNext') ?? 0,
      linesTogether: flag(p, 'KeepLinesTogether'),
      allLinesTogether: flag(p, 'KeepAllLinesTogether'),
      firstLines: number(p, 'KeepFirstLines') ?? 2,
      lastLines: number(p, 'KeepLastLines') ?? 2,
      withPrevious: flag(p, 'KeepWithPrevious'),
    },
  };
  const characters = number(p, 'DropCapCharacters') ?? 0;
  const lines = number(p, 'DropCapLines') ?? 0;
  if (characters > 0 && lines > 1) {
    const style = refOf(propText(p, 'DropCapStyle')?.trim());
    out.dropCap = { characters, lines, ...(style ? { characterStyle: style } : {}) };
  }
  if (p.attrs.StartParagraph && p.attrs.StartParagraph !== 'Anywhere') out.startParagraph = p.attrs.StartParagraph;
  const list = listOf(p);
  if (list) out.list = list;
  const above = ruleOf(p, 'RuleAbove');
  if (above) out.ruleAbove = above;
  const below = ruleOf(p, 'RuleBelow');
  if (below) out.ruleBelow = below;
  if (p.attrs.SpanColumnType === 'SpanColumns') out.spanColumns = propText(p, 'SpanSplitColumnCount')?.trim() || 'All';
  if (flag(p, 'ParagraphShadingOn')) {
    const colour = refOf(propText(p, 'ParagraphShadingColor')?.trim());
    const tint = number(p, 'ParagraphShadingTint');
    out.shading = { ...(colour ? { color: colour } : {}), ...(tint !== undefined && tint >= 0 ? { tint } : {}) };
  }
  if (flag(p, 'ParagraphBorderOn')) {
    const colour = refOf(propText(p, 'ParagraphBorderColor')?.trim());
    out.border = { ...(colour ? { color: colour } : {}), weight: number(p, 'ParagraphBorderTopLineWeight') ?? 1 };
  }
  if (p.attrs.Composer) out.composer = plainName(p.attrs.Composer);
  return out;
}
