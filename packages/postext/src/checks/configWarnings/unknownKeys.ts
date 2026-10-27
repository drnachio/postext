// The keys each settings object has, checked against its type, and the
// warning for a key it does not have (#1276: split out of configWarnings.ts).
import type { HeadingsConfig, ColumnBalancingConfig, HeadingLevelConfig, HeadingStyleConfig, ParagraphStyleConfig, ParagraphDropCap, DropCapLeadIn, TabStop, CanvasViewerConfig, ChecksConfig, ContentInConfigCheckConfig, LineNumbersConfig, CodeStyleConfig, CodeTokenStyle, InlineCodeStyleConfig, ComicsConfig, PanelStyleConfig, NamedPanelStyleConfig, LetteringConfig, BalloonStyleConfig, ComicCastMember, PostextConfig } from '../../types.js';
import type { ConfigWarning } from '../../vdt.js';
import { type UnknownKey, unknownKeysOf, CONFIG_KEYS, DOTTED_PATH } from '../../design/elementKeys.js';
import { CODE_TOKEN_KINDS } from '../../defaults/text/codeStyle.js';
import { closestKey } from '../../util/closestKey.js';
import { tabStopLists, dropCapSettings } from './choices.js';

// The keys of the heading settings, checked against their types: a key
// added to (or removed from) a type fails to compile until it is listed
// here, so the check never flags a setting the engine reads.
const HEADINGS_KEYS = {
  fontFamily: true, figureStyle: true, lineHeight: true, color: true, textAlign: true, fontWeight: true,
  marginTop: true, marginBottom: true, keepWithNext: true, keepWithNextSpread: true, keepWithNextSplit: true, snapToGrid: true, columnHeadSpace: true, inlineMarks: true, balancing: true, levels: true,
} satisfies Record<keyof HeadingsConfig, true>;
const BALANCING_KEYS = {
  enabled: true, maxLinesPerHeading: true, maxLinesBeforeLoose: true, stretchAfterLists: true, maxLinesAfterList: true, stretchAfterDisplays: true,
  stretchAfterFloats: true, maxLinesAfterFloat: true, stretchAfterWideFloats: true, looseParagraphs: true, maxLooseParagraphs: true,
  trackParagraphs: true, maxTracking: true, fillShortColumns: true, trailing: true, trailingStep: true, beforeSpan: true, closingBox: true, gridLines: true,
} satisfies Record<keyof ColumnBalancingConfig, true>;
const HEADING_LEVEL_KEYS = {
  level: true, fontSize: true, lineHeight: true, fontFamily: true, figureStyle: true, color: true, fontWeight: true,
  marginTop: true, marginBottom: true, numberingTemplate: true, numberSeparator: true, numberPosition: true, italic: true, letterSpacing: true,
  breakBefore: true, span: true, spanBreak: true, advancedDesign: true, textTransform: true, hidden: true, snapToGrid: true,
  lineSpan: true, indent: true, firstLineIndent: true, jidori: true, dropCap: true,
} satisfies Record<keyof HeadingLevelConfig, true>;
const HEADING_STYLE_KEYS = {
  id: true, name: true, numberingTemplate: true, numbered: true, toc: true, runningChapter: true, sectionEnd: true, header: true, footer: true,
  margins: true, layout: true, bodyStyle: true, palette: true,
  fontSize: true, lineHeight: true, fontFamily: true, figureStyle: true, color: true, fontWeight: true, marginTop: true,
  marginBottom: true, numberSeparator: true, numberPosition: true, italic: true, letterSpacing: true, breakBefore: true, span: true, spanBreak: true,
  advancedDesign: true, textTransform: true, hidden: true, snapToGrid: true, lineSpan: true, indent: true, firstLineIndent: true, jidori: true,
  dropCap: true,
} satisfies Record<keyof HeadingStyleConfig, true>;
const PARAGRAPH_STYLE_KEYS = {
  id: true, name: true, fontFamily: true, figureStyle: true, fontSize: true, lineHeight: true, color: true, textAlign: true,
  boldColor: true, italicColor: true, fontWeight: true, boldFontWeight: true, italic: true, smallCaps: true,
  hyphenation: true, indent: true, endIndent: true, firstLineIndent: true, hangingIndent: true, spaceBetween: true,
  marginTop: true, marginBottom: true, snapToGrid: true, containerSpacing: true, textTransform: true, letterSpacing: true, wordBreak: true, lineNumbers: true,
  tabStops: true, tabInterval: true, dropCap: true,
} satisfies Record<keyof ParagraphStyleConfig, true>;
// A body paragraph's drop cap (#623) and its lead-in.
const DROP_CAP_KEYS = {
  lines: true, sink: true, characters: true, fontFamily: true, fontWeight: true, italic: true, fontSize: true,
  color: true, gap: true, punctuation: true, leadIn: true, shortParagraph: true, each: true,
} satisfies Record<keyof ParagraphDropCap, true>;
const DROP_CAP_LEAD_IN_KEYS = { words: true, smallCaps: true, uppercase: true } satisfies Record<keyof DropCapLeadIn, true>;
// A tab stop (#622).
const TAB_STOP_KEYS = {
  position: true, align: true, leader: true, leaderGap: true, decimalChar: true,
} satisfies Record<keyof TabStop, true>;

// The Canvas's gaps (#1002).
const CANVAS_VIEWER_KEYS = { pageGap: true, rowGap: true } satisfies Record<keyof CanvasViewerConfig, true>;

// The checks of the configuration (#849).
const CHECKS_KEYS = { contentInConfig: true } satisfies Record<keyof ChecksConfig, true>;
const CONTENT_IN_CONFIG_KEYS = { enabled: true, allow: true, maxWords: true, maxChars: true } satisfies Record<keyof ContentInConfigCheckConfig, true>;

// Line numbers (#621).
const LINE_NUMBERS_KEYS = {
  enabled: true, count: true, interval: true, numberFirst: true, restart: true, startAt: true, position: true,
  multiColumn: true, gap: true, align: true, fontFamily: true, fontSize: true, fontWeight: true, italic: true,
  color: true, format: true,
} satisfies Record<keyof LineNumbersConfig, true>;

// Code listings and inline code (#624).
const CODE_STYLE_KEYS = {
  blocks: true, indentedCode: true, fontFamily: true, fontSize: true, fontWeight: true, boldFontWeight: true,
  lineHeight: true, snapToGrid: true, color: true, backgroundEnabled: true, background: true, padding: true,
  border: true, borderRadius: true, marginTop: true, marginBottom: true, span: true, tabSize: true, overflow: true,
  wrapIndent: true, wrapMarker: true, minFontScale: true, lineNumbers: true, lineNumberColor: true,
  lineNumberGap: true, highlightBackground: true, keepTogether: true, splitMinLines: true, repeatTitle: true,
  continuesMarkerEnabled: true, continuesMarker: true, titleStyle: true, label: true, highlight: true, tokens: true,
  inline: true,
} satisfies Record<keyof CodeStyleConfig, true>;
const CODE_TOKEN_STYLE_KEYS = { color: true, bold: true, italic: true } satisfies Record<keyof CodeTokenStyle, true>;
const INLINE_CODE_KEYS = {
  fontFamily: true, fontSize: true, color: true, bold: true, italic: true, background: true, borderColor: true,
  borderWidth: true, borderRadius: true, paddingX: true, paddingY: true, otherScripts: true,
} satisfies Record<keyof InlineCodeStyleConfig, true>;
const CODE_TOKEN_KIND_KEYS: Record<string, true> = Object.fromEntries(CODE_TOKEN_KINDS.map((k) => [k, true]));

// The comics tables (#562).
const COMICS_KEYS = {
  readingDirection: true, artDirection: true, mirrorArt: true, frame: true, gutter: true, panel: true,
  panelStyles: true, lettering: true, balloonStyles: true, cast: true, runningHeads: true, viewerLeaf: true,
} satisfies Record<keyof ComicsConfig, true>;
const COMICS_FRAME_KEYS = { margins: true } satisfies Record<keyof NonNullable<ComicsConfig['frame']>, true>;
const COMICS_GUTTER_KEYS = { horizontal: true, vertical: true } satisfies Record<keyof NonNullable<ComicsConfig['gutter']>, true>;
const PANEL_STYLE_KEYS = {
  borderWidth: true, borderColor: true, borderRadius: true, borderStyle: true, background: true, fit: true, bleed: true,
} satisfies Record<keyof PanelStyleConfig, true>;
const NAMED_PANEL_STYLE_KEYS = { ...PANEL_STYLE_KEYS, id: true, name: true } satisfies Record<keyof NamedPanelStyleConfig, true>;
const LETTERING_KEYS = {
  fontFamily: true, fontSize: true, lineHeight: true, color: true, bold: true, italic: true, letterSpacing: true,
  writingMode: true, textTransform: true, dropFinalStop: true, doubleDash: true, inset: true, joinSameSpeaker: true,
  maxColumnChars: true, strictPlacement: true,
} satisfies Record<keyof LetteringConfig, true>;
const BALLOON_STYLE_KEYS = {
  id: true, name: true, shape: true, fill: true, stroke: true, strokeWidth: true, dash: true, double: true, wobble: true,
  roundness: true, burstPoints: true, burstDepth: true, padding: true, aspect: true, tail: true, tailWidth: true,
  tailReach: true, target: true, position: true, butt: true, fontFamily: true, fontScale: true, bold: true, italic: true,
  color: true, textTransform: true, letterSpacing: true, align: true, halo: true, haloColor: true, rotate: true, skew: true,
} satisfies Record<keyof BalloonStyleConfig, true>;
const CAST_KEYS = {
  id: true, name: true, balloonStyle: true, color: true, fill: true, fontFamily: true,
} satisfies Record<keyof ComicCastMember, true>;

/**
 * Keys the heading settings do not have (EF-83), or a paragraph style
 * (EF-173): the engine reads the settings it knows and drops the rest, so
 * a misspelt or invented one (`letterSpacng`, `tracking`, a paragraph
 * style's `fontStyle`) used to change nothing without a word. The
 * `headings` section, its `balancing` and `levels`, every heading style
 * and every paragraph style are checked, in the document config and in
 * `htmlViewer.overrides`.
 */
export function collectUnknownKeyWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const check = (node: unknown, known: Record<string, true>, path: string): void => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const names = Object.keys(known);
    for (const [key, value] of Object.entries(node)) {
      // A key set to `undefined` sets nothing either way.
      if (value === undefined || Object.prototype.hasOwnProperty.call(known, key)) continue;
      const suggestion = closestKey(key, names);
      out.push({ kind: 'unknownConfigKey', path: `${path}.${key}`, value: key, used: '', ...(suggestion ? { suggestion } : {}) });
    }
  };
  const checkConfig = (c: Pick<PostextConfig, 'headings' | 'headingStyles' | 'paragraphStyles'> | undefined, prefix: string): void => {
    if (!c) return;
    const headings = c.headings as unknown;
    if (headings && typeof headings === 'object' && !Array.isArray(headings)) {
      const h = headings as HeadingsConfig;
      check(h, HEADINGS_KEYS, `${prefix}headings`);
      check(h.balancing, BALANCING_KEYS, `${prefix}headings.balancing`);
      if (Array.isArray(h.levels)) h.levels.forEach((l, i) => check(l, HEADING_LEVEL_KEYS, `${prefix}headings.levels[${i}]`));
    }
    if (Array.isArray(c.headingStyles)) c.headingStyles.forEach((s, i) => check(s, HEADING_STYLE_KEYS, `${prefix}headingStyles[${i}]`));
    if (Array.isArray(c.paragraphStyles)) c.paragraphStyles.forEach((s, i) => check(s, PARAGRAPH_STYLE_KEYS, `${prefix}paragraphStyles[${i}]`));
  };
  checkConfig(config, '');
  checkConfig(config.htmlViewer?.overrides, 'htmlViewer.overrides.');
  // The config's own keys (#1122), and those of the HTML viewer's
  // overrides (a config without `htmlViewer`).
  const top: UnknownKey[] = [];
  unknownKeysOf(config, CONFIG_KEYS, '', DOTTED_PATH, top);
  const overrideKeys: Record<string, true> = Object.fromEntries(Object.keys(CONFIG_KEYS).filter((k) => k !== 'htmlViewer').map((k) => [k, true as const]));
  unknownKeysOf(config.htmlViewer?.overrides, overrideKeys, 'htmlViewer.overrides', DOTTED_PATH, top);
  for (const k of top) out.push({ kind: 'unknownConfigKey', path: k.path, value: k.value, used: '', ...(k.suggestion ? { suggestion: k.suggestion } : {}) });
  for (const { stops, path } of tabStopLists(config)) stops.forEach((st, i) => check(st, TAB_STOP_KEYS, `${path}[${i}]`));
  for (const { cap, path } of dropCapSettings(config)) {
    check(cap, DROP_CAP_KEYS, path);
    check(cap.leadIn, DROP_CAP_LEAD_IN_KEYS, `${path}.leadIn`);
  }
  check(config.lineNumbers, LINE_NUMBERS_KEYS, 'lineNumbers');
  check(config.canvasViewer, CANVAS_VIEWER_KEYS, 'canvasViewer');
  // The checks of the configuration (#849).
  check(config.checks, CHECKS_KEYS, 'checks');
  check(config.checks?.contentInConfig, CONTENT_IN_CONFIG_KEYS, 'checks.contentInConfig');
  // Code listings (#624): the section, its token kinds and inline code.
  const codeStyle = config.codeStyle as unknown;
  if (codeStyle && typeof codeStyle === 'object' && !Array.isArray(codeStyle)) {
    const c = codeStyle as CodeStyleConfig;
    check(c, CODE_STYLE_KEYS, 'codeStyle');
    check(c.tokens, CODE_TOKEN_KIND_KEYS, 'codeStyle.tokens');
    if (c.tokens && typeof c.tokens === 'object') {
      for (const [kind, look] of Object.entries(c.tokens)) {
        if (CODE_TOKEN_KIND_KEYS[kind]) check(look, CODE_TOKEN_STYLE_KEYS, `codeStyle.tokens.${kind}`);
      }
    }
    check(c.inline, INLINE_CODE_KEYS, 'codeStyle.inline');
  }
  // Comics: the section, its frame, gutters, panel styles, lettering,
  // balloon styles and cast.
  const comics = config.comics as unknown;
  if (comics && typeof comics === 'object' && !Array.isArray(comics)) {
    const c = comics as ComicsConfig;
    check(c, COMICS_KEYS, 'comics');
    check(c.frame, COMICS_FRAME_KEYS, 'comics.frame');
    check(c.gutter, COMICS_GUTTER_KEYS, 'comics.gutter');
    check(c.panel, PANEL_STYLE_KEYS, 'comics.panel');
    if (Array.isArray(c.panelStyles)) c.panelStyles.forEach((s, i) => check(s, NAMED_PANEL_STYLE_KEYS, `comics.panelStyles[${i}]`));
    check(c.lettering, LETTERING_KEYS, 'comics.lettering');
    if (Array.isArray(c.balloonStyles)) c.balloonStyles.forEach((s, i) => check(s, BALLOON_STYLE_KEYS, `comics.balloonStyles[${i}]`));
    if (Array.isArray(c.cast)) c.cast.forEach((s, i) => check(s, CAST_KEYS, `comics.cast[${i}]`));
  }
  return out;
}
