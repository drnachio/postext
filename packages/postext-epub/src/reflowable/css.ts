// The stylesheet of a reflowable book, derived from the resolved
// configuration: the print typography as defaults a reading system may
// override. Sizes are in ems of the body text (the reader's chosen size),
// line heights are ratios, colours come from the resolved palette, and no
// rule sets a width the screen would have to honour.

import type { ColorValue, Dimension, ResolvedConfig } from 'postext';
import { dimensionToPx, primaryFontFamily } from 'postext';
import { idOf, round } from './inline';

/** What the walk found that decides the writing mode of the book. */
export interface StylesheetOptions {
  /** Vertical Chinese / Japanese (`layout.writingMode: 'vertical-rl'`). */
  vertical: boolean;
  /** The book sets a `:::verse` poem (its rules are written only then). */
  verse?: boolean;
  /** The book sets a poem line by line (#620): the stanza rules. */
  stanzas?: boolean;
  /** Lines of verse carry their numbers (#621): the margin they stand in. */
  lineNumbers?: boolean;
  /** Classes of emphasis marks the text uses beyond `pt-dots` (the
   *  filled dot on the default side): their rules are written only then
   *  (`inline.ts` `dotsClasses`, #428). */
  dots?: readonly string[];
}

/** CSS `line-break` for a Japanese kinsoku level (`cjk.lineBreak`, #417):
 *  JLReq's strictest rules are CSS `strict` (no small kana, ー or 々 at a
 *  line start), the general books' rules CSS `normal` (they may), the
 *  newspapers' CSS `loose`. Chinese levels write none, as before. */
const LINE_BREAK: Record<string, string> = { 'ja-very-strict': 'strict', 'ja-strict': 'normal', 'ja-loose': 'loose' };

/** The declarations of the Japanese text of a book (#428): kinsoku and,
 *  with burasagari (`cjk.hangingPunctuation`, on by default in Japan),
 *  、。，． hanging past the line end; and, in any book that asks for it,
 *  lines broken only between phrases (`cjk.wordBreak: 'keep-all'`, #463).
 *  None for other books. */
function japaneseDecls(cjk: ResolvedConfig['cjk']): string[] {
  const out: string[] = [];
  if (cjk.wordBreak === 'keep-all') out.push('word-break: keep-all');
  const lineBreak = LINE_BREAK[cjk.lineBreak];
  if (lineBreak) out.push(`line-break: ${lineBreak}`, `-epub-line-break: ${lineBreak}`, `-webkit-line-break: ${lineBreak}`);
  if (cjk.region === 'japan' && cjk.hangingPunctuation !== 'none') {
    out.push(`hanging-punctuation: ${cjk.hangingPunctuation === 'force' ? 'force-end' : 'allow-end'}`);
  }
  return out;
}

/** The emphasis-mark rule of a class `dotsClasses` gives: a shape and fill
 *  (`pt-dots-filled-sesame`), or a side (`pt-dots-over`: over horizontal
 *  text and right of vertical text; `pt-dots-under`: under and left). */
function dotsRule(cls: string): CssRule | '' {
  const side = /^pt-dots-(over|under)$/.exec(cls);
  if (side) {
    const pos = side[1] === 'over' ? 'over right' : 'under left';
    return rule(`.pt-dots.${cls}`, [`text-emphasis-position: ${pos}`, `-webkit-text-emphasis-position: ${pos}`]);
  }
  const shape = /^pt-dots-(filled|open)-(dot|circle|sesame)$/.exec(cls);
  if (!shape) return '';
  const style = `${shape[1]} ${shape[2]}`;
  return rule(`.pt-dots.${cls}`, [`text-emphasis-style: ${style}`, `-epub-text-emphasis-style: ${style}`, `-webkit-text-emphasis-style: ${style}`]);
}

const SANS = /\b(sans|grotesk|grotesque|gothic|helvetica|arial|inter|roboto|lato|montserrat|open sans|source sans|fira sans|heiti|hei\b|黑)/i;
const MONO = /\b(mono|code|courier|consol)/i;

/** A family as a CSS value: the family quoted, then a generic fallback. */
export function familyStack(family: string): string {
  const name = primaryFontFamily(family).trim().replace(/^['"]|['"]$/g, '');
  const generic = MONO.test(name) ? 'monospace' : SANS.test(name) ? 'sans-serif' : 'serif';
  return `"${name.replace(/"/g, '\\"')}", ${generic}`;
}

/** The family names the stylesheet asks for (to warn about missing
 *  faces). */
export function familyName(family: string): string {
  return primaryFontFamily(family).trim().replace(/^['"]|['"]$/g, '');
}

const ALIGN: Record<string, string> = { left: 'start', right: 'end', center: 'center', justify: 'justify' };

/** A rule of the stylesheet: its selector and declarations
 *  (`property: value`). */
export interface CssRule {
  selector: string;
  decls: string[];
}

/** A rule from its declarations (the falsy ones left out); none when it
 *  declares nothing. */
function rule(selector: string, decls: (string | false | undefined | null)[]): CssRule | '' {
  const body = decls.filter((d): d is string => typeof d === 'string' && d.length > 0);
  return body.length > 0 ? { selector, decls: body } : '';
}

function ruleText(r: CssRule): string {
  return `${r.selector} {\n${r.decls.map((d) => `  ${d};`).join('\n')}\n}\n`;
}

/** The book's stylesheet: its text, the families it names, and its rules
 *  (at-rules aside), which {@link stylesheetOverrides} compares. */
export interface Stylesheet {
  css: string;
  families: Set<string>;
  rules: CssRule[];
}

export function bookStylesheet(config: ResolvedConfig, fontFaces: string, options: StylesheetOptions): Stylesheet {
  const dpi = config.page.dpi;
  const body = config.bodyText;
  const bodyPx = dimensionToPx(body.fontSize, dpi);
  const families = new Set<string>();
  const fam = (f: string) => {
    families.add(familyName(f));
    return `font-family: ${familyStack(f)}`;
  };
  /** A length in ems of `basePx` (the body size unless given). */
  const em = (d: Dimension, basePx = bodyPx) => `${round(dimensionToPx(d, dpi, basePx) / basePx)}em`;
  /** A line height as a ratio of the font size. */
  const lh = (d: Dimension, fontPx: number) => {
    const px = d.unit === 'em' || d.unit === 'rem' ? d.value * fontPx : dimensionToPx(d, dpi, fontPx);
    return `line-height: ${round(px / fontPx)}`;
  };
  const color = (c: ColorValue | undefined, prop = 'color') => (c?.hex && c.hex !== 'transparent' ? `${prop}: ${c.hex}` : undefined);
  const px = (d: Dimension, basePx = bodyPx) => dimensionToPx(d, dpi, basePx);
  // Right to left (#402): the content documents declare it (`dir` on the
  // root, as EPUB asks, rather than the CSS `direction`); the rules use
  // logical sides (`margin-inline-start`, `text-align: start`), so they
  // hold in both directions.
  const rtl = config.direction === 'rtl';
  const out: (string | CssRule)[] = [];

  out.push('@charset "UTF-8";\n');
  if (fontFaces) out.push(fontFaces);

  // --- body text -----------------------------------------------------------
  const hyphens = body.hyphenation.enabled;
  if (options.vertical) {
    out.push(rule('html', ['writing-mode: vertical-rl', '-epub-writing-mode: vertical-rl', '-webkit-writing-mode: vertical-rl']));
  }
  out.push(rule('body', [
    fam(body.fontFamily),
    lh(body.lineHeight, bodyPx),
    color(body.color),
    `text-align: ${ALIGN[body.textAlign] ?? 'start'}`,
    hyphens && 'hyphens: auto',
    hyphens && '-epub-hyphens: auto',
    hyphens && '-webkit-hyphens: auto',
    body.fontWeight !== 400 && `font-weight: ${body.fontWeight}`,
    body.avoidOrphans && `orphans: ${Math.max(1, body.orphanMinLines)}`,
    body.avoidWidows && `widows: ${Math.max(1, body.widowMinLines)}`,
    'margin: 0',
    'padding: 0 1em',
    ...japaneseDecls(config.cjk),
  ]));
  const indent = px(body.firstLineIndent);
  const ratio = round(dimensionToPx(body.lineHeight, dpi, bodyPx) / bodyPx);
  out.push(rule('p', [
    'margin: 0',
    !body.paragraphSpacing && indent > 0 && `text-indent: ${round(indent / bodyPx)}em`,
    body.paragraphSpacing && `margin-block-end: ${ratio}em`,
  ]));
  if (!body.paragraphSpacing && indent > 0) {
    // The first paragraph after a heading, a list, a figure… is not
    // indented (unless the book indents after headings).
    const after = ['ul', 'ol', 'blockquote', 'figure', 'div', 'aside', 'nav', 'section > p:first-child'];
    if (!body.indentAfterHeading) after.unshift('h1', 'h2', 'h3', 'h4', 'h5', 'h6');
    out.push(rule(after.map((s) => (s.includes(' ') ? s : `${s} + p`)).join(', '), ['text-indent: 0']));
  }
  out.push(rule('strong, b', [`font-weight: ${body.boldFontWeight}`, color(body.boldColor)]));
  out.push(rule('em, i', [color(body.italicColor)]));
  out.push(rule('a', ['color: inherit', 'text-decoration: underline']));
  out.push(rule('a.pt-ref', [
    color(body.referenceColor),
    'text-decoration: none',
    body.referenceBold && `font-weight: ${body.boldFontWeight}`,
    body.referenceItalic && 'font-style: italic',
  ]));
  out.push(rule('a.pt-pageref', ['text-decoration: none']));
  out.push(rule('sup, sub', ['line-height: 0', 'font-size: 0.7em']));

  // --- headings ------------------------------------------------------------
  const headings = config.headings;
  /** The body's line pitch, px: a 行取り heading (`lineSpan`, #424) takes
   *  whole numbers of it. */
  const bodyLinePx = body.lineHeight.unit === 'em' || body.lineHeight.unit === 'rem'
    ? body.lineHeight.value * bodyPx
    : px(body.lineHeight);
  for (const level of headings.levels) {
    if (level.level < 1 || level.level > 6) continue;
    const hPx = px(level.fontSize);
    // 行取り: the heading's line centred in N body lines, its margins the
    // rest of them (a reflowable book has no grid to keep).
    const lineSpanMargin = level.lineSpan !== undefined
      ? Math.max(0, (level.lineSpan * bodyLinePx - (level.lineHeight.unit === 'em' || level.lineHeight.unit === 'rem' ? level.lineHeight.value * hPx : px(level.lineHeight, hPx))) / 2)
      : undefined;
    out.push(rule(`h${level.level}`, [
      fam(level.fontFamily || headings.fontFamily),
      `font-size: ${round(hPx / bodyPx)}em`,
      lh(level.lineHeight, hPx),
      `font-weight: ${level.fontWeight}`,
      `font-style: ${level.italic ? 'italic' : 'normal'}`,
      color(level.color),
      `text-align: ${ALIGN[headings.textAlign] ?? 'start'}`,
      level.letterSpacing.value !== 0 && `letter-spacing: ${em(level.letterSpacing, hPx)}`,
      level.textTransform === 'uppercase' && 'text-transform: uppercase',
      lineSpanMargin !== undefined
        ? `margin: ${round(lineSpanMargin / hPx)}em 0`
        : `margin: ${round(px(level.marginTop, hPx) / hPx)}em 0 ${round(px(level.marginBottom, hPx) / hPx)}em`,
      // 字下げ: the indent counts body characters.
      level.indent && px(level.indent) > 0 && `margin-inline-start: ${round(px(level.indent) / hPx)}em`,
      'hyphens: manual',
      '-epub-hyphens: manual',
      'page-break-after: avoid',
      'break-after: avoid',
    ]));
  }
  for (const style of config.headingStyles) {
    const o = style.overrides;
    const sPx = o.fontSize ? px(o.fontSize) : undefined;
    out.push(rule(`.${idOf('hs-', style.id)}`, [
      o.fontFamily && fam(o.fontFamily),
      sPx !== undefined && `font-size: ${round(sPx / bodyPx)}em`,
      o.fontWeight !== undefined && `font-weight: ${o.fontWeight}`,
      o.italic !== undefined && `font-style: ${o.italic ? 'italic' : 'normal'}`,
      o.color && color(o.color),
      o.textTransform && `text-transform: ${o.textTransform === 'uppercase' ? 'uppercase' : 'none'}`,
    ]));
  }
  out.push(rule('.pt-part-title', ['text-align: center', 'margin-block-start: 3em']));
  out.push(rule('.pt-part-number', ['display: block', 'font-size: 0.6em', 'margin-block-end: 0.5em']));
  out.push(rule('.pt-hidden', [
    'position: absolute',
    'width: 1px',
    'height: 1px',
    'overflow: hidden',
    'clip: rect(0 0 0 0)',
    'white-space: nowrap',
  ]));

  // --- quotations, lists ---------------------------------------------------
  const bq = body.blockquote;
  out.push(rule('blockquote', [
    `margin: ${ratio / 2}em 0`,
    `margin-inline-start: ${em(bq.indent)}`,
    color(bq.color),
    bq.italic && 'font-style: italic',
  ]));
  if (bq.italic) out.push(rule('blockquote em', ['font-style: normal']));
  const ul = config.unorderedLists;
  const ol = config.orderedLists;
  out.push(rule('ul, ol', [
    'list-style: none',
    `margin: ${em(ol.marginTop)} 0 ${em(ol.marginBottom)}`,
    'padding-inline-start: 1.6em',
    'text-indent: 0',
  ]));
  out.push(rule('li', [ol.itemSpacing.value > 0 && `margin-block-start: ${em(ol.itemSpacing)}`]));
  out.push(rule('li li', ['margin-block-start: 0']));
  out.push(rule('li > .pt-lbl:first-child', [
    'display: inline-block',
    'min-width: 1.6em',
    'margin-inline-start: -1.6em',
    'text-indent: 0',
  ]));
  out.push(rule('ul > li > .pt-lbl:first-child', [color(ul.color), ul.fontWeight !== body.fontWeight && `font-weight: ${ul.fontWeight}`]));
  out.push(rule('ol > li > .pt-lbl:first-child', [color(ol.color), ol.fontWeight !== body.fontWeight && `font-weight: ${ol.fontWeight}`]));
  out.push(rule('.pt-done', ['text-decoration: line-through']));

  // --- figures, tables, captions ------------------------------------------
  const cap = config.captionStyle;
  const capPx = px(cap.fontSize);
  out.push(rule('figure', ['margin: 1em 0', 'text-align: center', 'page-break-inside: avoid', 'break-inside: avoid']));
  out.push(rule('figure img', ['max-width: 100%', 'height: auto']));
  out.push(rule('figure video', ['width: 100%', 'height: auto', 'background-color: #000']));
  // Comic pages (#565): each panel's picture as wide as the text at most,
  // its lettering under it as plain lines.
  out.push(rule('.pt-comic', ['margin: 1em 0']));
  out.push(rule('.pt-comic-panel', ['margin: 1em 0 0.5em']));
  out.push(rule('.pt-comic-panel svg', ['display: block', 'max-width: 100%', 'height: auto', 'margin: 0 auto']));
  out.push(rule('.pt-comic p', ['text-indent: 0', 'margin: 0.25em 0']));
  out.push(rule('a.pt-video-link', ['display: block']));
  out.push(rule('figcaption, caption', [
    fam(cap.fontFamily),
    `font-size: ${round(capPx / bodyPx)}em`,
    color(cap.color),
    `text-align: ${ALIGN[cap.align] ?? 'start'}`,
    cap.descriptionItalic && 'font-style: italic',
    cap.backgroundEnabled && color(cap.background, 'background-color'),
    cap.backgroundEnabled && `padding: ${round(px(cap.padding, capPx) / capPx)}em`,
    `margin: ${round(px(cap.gap, capPx) / capPx)}em 0`,
    'hyphens: manual',
  ]));
  out.push(rule('caption.pt-caption-below', ['caption-side: bottom']));
  out.push(rule('.pt-label', [
    color(cap.labelColor),
    cap.labelBold ? 'font-weight: bold' : undefined,
    `font-style: ${cap.labelItalic ? 'italic' : 'normal'}`,
  ]));
  const note = cap.note;
  out.push(rule('.pt-note', [
    `font-size: ${em(note.fontSize)}`,
    color(note.color),
    `font-style: ${note.italic ? 'italic' : 'normal'}`,
    `text-align: ${ALIGN[note.align] ?? 'start'}`,
    'text-indent: 0',
  ]));
  out.push(rule('figcaption .pt-note', ['display: block', `margin-block-start: ${em(note.gap, px(cap.fontSize))}`]));
  out.push(rule('.pt-missing', ['border: 1px dashed currentColor', 'padding: 1em', 'font-style: italic']));

  const ts = config.tableStyle;
  const bodyCellPx = px(ts.bodyFontSize);
  const border = ts.borders && ts.rules !== 'none' && px(ts.borderWidth) > 0
    ? `${round(Math.max(0.5, px(ts.borderWidth) * (96 / dpi)))}px solid ${ts.borderColor.hex}`
    : undefined;
  out.push(rule('.pt-table', ['margin: 1em 0', 'overflow-x: auto']));
  out.push(rule('table', [
    'border-collapse: collapse',
    'margin: 0 auto',
    'max-width: 100%',
    fam(ts.bodyFontFamily),
    `font-size: ${round(bodyCellPx / bodyPx)}em`,
    color(ts.bodyColor),
    'text-indent: 0',
    'hyphens: manual',
    border && (ts.rules === 'outer' || ts.rules === 'grid') ? `border: ${border}` : undefined,
  ]));
  out.push(rule('th, td', [
    `padding: ${round(px(ts.cellPadding, bodyCellPx) / bodyCellPx)}em`,
    'vertical-align: top',
    'text-align: start',
    border && ts.rules === 'grid' ? `border: ${border}` : undefined,
    border && ts.rules === 'horizontal' ? `border-block: ${border}` : undefined,
  ]));
  out.push(rule('td', [ts.bodyBackgroundEnabled && color(ts.bodyBackground, 'background-color')]));
  if (ts.bodyAlternateBackgroundEnabled) out.push(rule('td.pt-alt', [color(ts.bodyAlternateBackground, 'background-color')]));
  out.push(rule('th', [
    fam(ts.headerFontFamily),
    `font-size: ${round(px(ts.headerFontSize) / bodyCellPx)}em`,
    color(ts.headerColor),
    `font-weight: ${ts.headerBold ? 'bold' : 'normal'}`,
    ts.headerItalic && 'font-style: italic',
    ts.headerTextTransform === 'uppercase' && 'text-transform: uppercase',
    ts.headerLetterSpacing.value !== 0 && `letter-spacing: ${round(px(ts.headerLetterSpacing, bodyCellPx) / bodyCellPx)}em`,
    ts.headerBackgroundEnabled && color(ts.headerBackground, 'background-color'),
  ]));
  out.push(rule('td img, th img', ['max-width: 100%', 'height: auto', 'display: block', 'margin: 0 auto']));

  // --- callouts ------------------------------------------------------------
  out.push(rule('aside.pt-callout', ['margin: 1em 0', 'padding: 0.75em 1em', 'page-break-inside: avoid']));
  out.push(rule('.pt-callout-title', ['font-weight: bold', 'text-indent: 0', 'margin-block-end: 0.4em']));
  for (const s of config.calloutStyles) {
    const sel = `aside.${idOf('pt-callout-', s.id)}`;
    const bPx = px(s.body.fontSize);
    const pad = s.padding;
    const stripe = s.stripe.enabled && px(s.stripe.width) > 0 ? `${round(px(s.stripe.width) * (96 / dpi))}px solid ${s.stripe.color.hex}` : undefined;
    const side = s.stripe.side === 'top' ? 'border-block-start' : s.stripe.side === 'right' ? 'border-inline-end' : 'border-inline-start';
    // A box's sides are the body flow's (#371): in a right-to-left book,
    // whose flow is mirrored, its left padding is on the page's right.
    const [padRight, padLeft] = rtl ? [pad.left, pad.right] : [pad.right, pad.left];
    out.push(rule(sel, [
      s.backgroundEnabled && color(s.background, 'background-color'),
      s.border.enabled && px(s.border.width) > 0 && `border: ${round(px(s.border.width) * (96 / dpi))}px solid ${s.border.color.hex}`,
      stripe && `${side}: ${stripe}`,
      px(s.borderRadius) > 0 && `border-radius: ${em(s.borderRadius)}`,
      `padding: ${em(pad.top)} ${em(padRight)} ${em(pad.bottom)} ${em(padLeft)}`,
      `margin: ${em(s.marginTop)} 0 ${em(s.marginBottom)}`,
      fam(s.body.fontFamily),
      `font-size: ${round(bPx / bodyPx)}em`,
      color(s.body.color),
      s.body.italic && 'font-style: italic',
      s.body.smallCaps && 'font-variant: small-caps',
      `text-align: ${ALIGN[s.body.textAlign] ?? 'start'}`,
    ]));
    out.push(rule(`${sel} p`, [
      `text-indent: ${round(px(s.body.firstLineIndent, bPx) / bPx)}em`,
      s.body.paragraphSpacing && `margin-block-end: ${round(px(s.body.lineHeight, bPx) / bPx)}em`,
      lh(s.body.lineHeight, bPx),
    ]));
    const t = s.titleStyle;
    const tPx = px(t.fontSize);
    out.push(rule(`${sel} > .pt-callout-title`, [
      fam(t.fontFamily),
      `font-size: ${round(tPx / bPx)}em`,
      `font-weight: ${t.fontWeight}`,
      `font-style: ${t.italic ? 'italic' : 'normal'}`,
      color(t.color),
      t.textTransform === 'uppercase' && 'text-transform: uppercase',
      t.letterSpacing.value !== 0 && `letter-spacing: ${round(px(t.letterSpacing, tPx) / tPx)}em`,
      `margin-block-end: ${round(px(t.gap, tPx) / tPx)}em`,
      'text-indent: 0',
    ]));
    out.push(rule(`${sel} li > .pt-lbl:first-child`, [color(s.lists.color)]));
  }

  // --- paragraph styles ----------------------------------------------------
  for (const s of config.paragraphStyles) {
    const sPx = px(s.fontSize);
    const cls = idOf('ps-', s.id);
    out.push(rule(`p.${cls}, div.pt-verse.${cls}, div.pt-stanza.${cls}`, [
      fam(s.fontFamily),
      `font-size: ${round(sPx / bodyPx)}em`,
      lh(s.lineHeight, sPx),
      color(s.color),
      `text-align: ${ALIGN[s.textAlign] ?? 'start'}`,
      s.fontWeight !== body.fontWeight && `font-weight: ${s.fontWeight}`,
      s.italic && 'font-style: italic',
      s.smallCaps && 'font-variant: small-caps',
      !s.hyphenation && 'hyphens: manual',
      s.textTransform === 'uppercase' && 'text-transform: uppercase',
      // The style's own line breaking between CJK characters (#463).
      s.wordBreak && `word-break: ${s.wordBreak}`,
      px(s.indent, sPx) > 0 && `margin-inline-start: ${round(px(s.indent, sPx) / sPx)}em`,
      // 地からN字上げ (#424).
      s.endIndent && px(s.endIndent, sPx) > 0 && `margin-inline-end: ${round(px(s.endIndent, sPx) / sPx)}em`,
      `text-indent: ${round(px(s.firstLineIndent, sPx) / sPx)}em`,
      px(s.marginTop, sPx) > 0 && `margin-block-start: ${round(px(s.marginTop, sPx) / sPx)}em`,
      px(s.marginBottom, sPx) > 0 && `margin-block-end: ${round(px(s.marginBottom, sPx) / sPx)}em`,
    ]));
    // A hanging indent: the paragraph's turnovers padded in, its first line
    // taken back to its own indent (the style's, when it sets one, #620).
    // A poem's lines hang on their own (`.pt-verse-line`).
    const hang = px(s.hangingIndent, sPx);
    if (hang > 0) {
      const first = s.ownFirstLineIndent ? px(s.firstLineIndent, sPx) : 0;
      out.push(rule(`p.${cls}`, [`padding-inline-start: ${round(hang / sPx)}em`, `text-indent: ${round((first - hang) / sPx)}em`]));
    }
  }

  // --- notes, contents, bibliography, index -------------------------------
  const fn = config.footnotes;
  const fnPx = px(fn.fontSize);
  out.push(rule('.pt-footnotes', ['margin-block-start: 2em', 'border-block-start: 1px solid currentColor', 'padding-block-start: 0.5em']));
  out.push(rule('aside.pt-footnote', [
    `font-size: ${round(fnPx / bodyPx)}em`,
    lh(fn.lineHeight, fnPx),
    color(fn.color),
    fn.textAlign && `text-align: ${ALIGN[fn.textAlign] ?? 'start'}`,
    `margin-block-end: ${round(px(fn.spaceBetween, fnPx) / fnPx)}em`,
  ]));
  out.push(rule('aside.pt-footnote p', ['text-indent: 0']));
  out.push(rule('a.pt-noteref', ['text-decoration: none', color(body.referenceColor)]));
  out.push(rule('a[role="doc-backlink"]', ['text-decoration: none']));
  out.push(rule('nav.pt-toc ol', ['list-style: none', 'padding-inline-start: 0']));
  out.push(rule('nav.pt-toc li', ['margin-block-start: 0.3em']));
  out.push(rule('nav.pt-toc a', ['text-decoration: none', 'color: inherit']));
  out.push(rule('nav.pt-toc li > .pt-lbl:first-child', ['margin-inline-start: 0', 'min-width: 2em']));
  out.push(rule('.pt-toc-part', ['font-weight: bold', 'margin-block-start: 0.8em']));
  out.push(rule('.pt-toc-subtitle', ['font-style: italic', 'font-size: 0.9em']));
  out.push(rule('p.pt-bib', ['padding-inline-start: 2em', 'text-indent: -2em', 'margin-block-end: 0.3em']));
  out.push(rule('p.pt-index-group', ['font-weight: bold', 'text-indent: 0', 'margin-block-start: 1em', 'page-break-after: avoid', 'break-after: avoid']));
  // Index entries hang their turnover lines, and a sub-entry sits one
  // indent in per level, both in the index's own em.
  const ix = config.index;
  const ixPx = px(ix.fontSize);
  const turnover = round(px(ix.turnoverIndent, ixPx) / ixPx);
  const step = round(px(ix.indent, ixPx) / ixPx);
  out.push(rule('p.pt-index-entry', [
    ixPx !== bodyPx && `font-size: ${round(ixPx / bodyPx)}em`,
    `padding-inline-start: ${turnover}em`,
    `text-indent: -${turnover}em`,
    'text-align: start',
    'hyphens: manual',
  ]));
  for (const level of [1, 2, 3]) {
    out.push(rule(`p.pt-index-l${level}`, [`margin-inline-start: ${round(step * level)}em`]));
  }

  // --- maths, chips, swatches, Chinese marks ------------------------------
  out.push(rule('.pt-math-display', ['text-align: center', 'margin: 0.5em 0', 'text-indent: 0', 'overflow-x: auto']));
  out.push(rule('.pt-math svg', ['display: inline']));
  out.push(rule('.pt-swatch', ['display: inline-block', 'width: 0.8em', 'height: 0.8em', 'border: 1px solid currentColor', 'vertical-align: baseline']));
  out.push(rule('.pt-chip', ['display: inline-block', 'padding: 0 0.3em', 'border-radius: 0.2em', 'text-indent: 0', 'line-height: 1.2']));
  for (const c of config.chipStyles) {
    const cPx = c.fontSize ? px(c.fontSize) : bodyPx;
    out.push(rule(`.${idOf('pt-chip-', c.id)}`, [
      c.backgroundEnabled && color(c.background, 'background-color'),
      px(c.borderWidth) > 0 && `border: ${round(px(c.borderWidth) * (96 / dpi))}px solid ${c.borderColor.hex}`,
      px(c.borderRadius) > 0 && `border-radius: ${round(px(c.borderRadius, cPx) / cPx)}em`,
      `padding: ${round(px(c.paddingY, cPx) / cPx)}em ${round(px(c.paddingX, cPx) / cPx)}em`,
      c.fontFamily && fam(c.fontFamily),
      c.fontSize && `font-size: ${round(cPx / bodyPx)}em`,
      c.color && color(c.color),
      c.bold && 'font-weight: bold',
      c.italic && 'font-style: italic',
    ]));
  }
  out.push(rule('.pt-sc', ['font-variant: small-caps']));
  out.push(rule('.pt-dots', ['font-style: normal', 'text-emphasis: filled dot', '-epub-text-emphasis-style: filled dot', '-webkit-text-emphasis-style: filled dot', 'text-emphasis-position: under right', '-webkit-text-emphasis-position: under right']));
  // Other shapes and sides (the Japanese sesame over the text, #428),
  // sorted so the stylesheet is the same whatever order they were read in.
  for (const cls of [...(options.dots ?? [])].sort()) out.push(dotsRule(cls));
  out.push(rule('.pt-proper', ['text-decoration: underline']));
  out.push(rule('.pt-book', ['text-decoration: underline wavy']));
  // Side lines (傍線): under horizontal text and left of vertical text, or
  // over and right of it; one unbroken line, descenders and all.
  const underSide = ['text-underline-position: under left', '-epub-text-underline-position: under left', '-webkit-text-underline-position: under left'];
  out.push(rule('.pt-side', ['text-decoration-line: underline', 'text-decoration-skip-ink: none', ...underSide]));
  out.push(rule('.pt-side.pt-side-over', ['text-decoration-line: overline']));
  for (const style of ['double', 'wavy', 'dotted']) out.push(rule(`.pt-side.pt-side-${style}`, [`text-decoration-style: ${style}`]));
  out.push(rule('.pt-tcy', ['text-combine-upright: all', '-epub-text-combine: horizontal', '-webkit-text-combine: horizontal']));
  out.push(rule('.pt-upright', ['text-orientation: upright', '-epub-text-orientation: upright', '-webkit-text-orientation: upright']));
  out.push(rule('.pt-sideways', ['text-orientation: sideways', '-epub-text-orientation: sideways', '-webkit-text-orientation: sideways']));
  out.push(rule('.pt-warichu', ['font-size: 0.6em']));
  out.push(rule('ruby.pt-ruby-under', ['ruby-position: under', '-epub-ruby-position: under', '-webkit-ruby-position: after']));
  out.push(rule('ruby.pt-ruby-right', ['ruby-position: inter-character']));
  // Kanbun marks (訓点): half size, the 送り仮名 raised (right of vertical
  // text) and the 返り点 lowered (left of it), after their character.
  out.push(rule('.pt-okuri, .pt-kaeri', ['font-size: 0.5em', 'line-height: 0']));
  out.push(rule('.pt-okuri', ['vertical-align: super']));
  out.push(rule('.pt-kaeri', ['vertical-align: sub']));
  out.push(rule('.pt-marker', ['height: 0']));
  // Japanese note markers (JLReq §4.2.3), only in a book that sets them.
  // In the line gap: a box of no advance, its text running back from it
  // (right to left, inline-start being the end), its baseline raised past
  // the text's em box (0.88 em over its baseline) without growing the
  // line. Right of a vertical line: reduced, its box against
  // the line's right side.
  const marker = config.footnotes.markerPosition;
  if (marker === 'side' || marker === 'right') {
    const size = config.footnotes.markerSize;
    const em = size.unit === 'em' || size.unit === 'rem' ? size.value : px(size) / bodyPx;
    if (marker === 'side') {
      out.push(rule('.pt-note-side', ['display: inline-block', 'inline-size: 0', 'direction: rtl', 'white-space: nowrap', 'line-height: 0', `font-size: ${round(em)}em`, `vertical-align: ${round(0.88 / em + 0.12)}em`]));
      out.push(rule('.pt-note-side > span', ['direction: ltr', 'unicode-bidi: isolate']));
    } else {
      out.push(rule('.pt-note-right', [`font-size: ${round(em)}em`, 'vertical-align: text-top', 'line-height: 0']));
    }
  }

  // --- classical verse -----------------------------------------------------
  // A bayt is a row of two equal hemistich columns (and the ornament's,
  // empty without one): the ṣadr from the start side, the ʿajuz flush
  // with the end side, so the rhymes stand in one column as in print. On
  // a narrow screen the two halves stagger, the ʿajuz on its own line
  // flush with the end, as the print does when they do not fit.
  // A stanza set line by line (#620): its lines of verse, a blank line
  // between stanzas, never hyphenated; each line's hang is on its own
  // element.
  if (options.stanzas) {
    out.push(rule('.pt-stanza', ['margin: 0 0 1em', 'text-indent: 0', 'text-align: start', 'hyphens: manual']));
    out.push(rule('.pt-verse-line', ['display: block']));
  }
  // Line numbers (#621): a poem's every Nth line carries its number in a
  // margin on the start side of the stanza, out of the reading order.
  if (options.stanzas && options.lineNumbers) {
    out.push(rule('.pt-stanza', ['padding-left: 3em']));
    out.push(rule('.pt-verse-line', ['position: relative']));
    out.push(rule('.pt-line-number', [
      'position: absolute', 'right: 100%', 'margin-right: 0.8em', 'text-indent: 0', 'font-size: 0.8em',
      'white-space: nowrap', '-webkit-user-select: none', 'user-select: none',
    ]));
    out.push(rule('[dir="rtl"] .pt-stanza, .pt-stanza[dir="rtl"]', ['padding-left: 0', 'padding-right: 3em']));
    out.push(rule('[dir="rtl"] .pt-line-number, .pt-stanza[dir="rtl"] .pt-line-number', ['right: auto', 'left: 100%', 'margin-right: 0', 'margin-left: 0.8em']));
  }
  if (options.verse) {
    // The poem as wide as its widest bayt, centred: its hemistichs share
    // one width, as in print, instead of drifting to the screen's edges.
    out.push(rule('.pt-verse', ['width: fit-content', 'max-width: 100%', 'margin: 0.5em auto', 'text-indent: 0']));
    out.push(rule('.pt-bayt', [
      'display: grid',
      'grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)',
      'column-gap: 1em',
      'margin: 0',
      'text-indent: 0',
      'text-align: start',
      'hyphens: manual',
      'page-break-inside: avoid',
      'break-inside: avoid',
    ]));
    out.push(rule('.pt-sadr', ['grid-column: 1', 'text-align: start']));
    out.push(rule('.pt-verse-ornament', ['grid-column: 2', 'text-align: center']));
    out.push(rule('.pt-ajuz', ['grid-column: 3', 'text-align: end']));
    out.push(rule('.pt-bayt-single .pt-sadr', ['grid-column: 1 / -1', 'text-align: center']));
    out.push('@media (max-width: 30em) {\n' +
      '  .pt-bayt { display: block; }\n' +
      '  .pt-sadr, .pt-ajuz { display: block; }\n' +
      '  .pt-verse-ornament { display: none; }\n' +
      '}\n');
  }
  return {
    css: out.filter(Boolean).map((r) => (typeof r === 'string' ? r : ruleText(r))).join('\n'),
    families,
    rules: out.filter((r): r is CssRule => typeof r !== 'string'),
  };
}

/**
 * What a chapter's stylesheet changes in the book's (`base`): each rule of
 * `variant` whose declarations differ from those of the rule with the same
 * selector (the n-th of that selector, in order), with the declarations it
 * changes or adds, and `unset` for those it drops; a rule the book's
 * stylesheet does not have, whole. Written as a stylesheet linked after
 * the book's: the same selectors come later, so they win, and the
 * cascade between rules stays as in the chapter's own stylesheet (a class
 * on the body would raise their specificity above the book's other rules).
 * Empty when nothing differs.
 */
export function stylesheetOverrides(base: readonly CssRule[], variant: readonly CssRule[]): string {
  const keyed = (rules: readonly CssRule[]): Map<string, CssRule> => {
    const seen = new Map<string, number>();
    const out = new Map<string, CssRule>();
    for (const r of rules) {
      const n = seen.get(r.selector) ?? 0;
      seen.set(r.selector, n + 1);
      out.set(`${r.selector}\u0000${n}`, r);
    }
    return out;
  };
  const prop = (d: string) => d.slice(0, d.indexOf(':')).trim();
  const was = keyed(base);
  const out: string[] = [];
  for (const [key, r] of keyed(variant)) {
    const before = was.get(key);
    if (!before) {
      out.push(ruleText(r));
      continue;
    }
    const old = new Set(before.decls);
    const changed = r.decls.filter((d) => !old.has(d));
    const kept = new Set(r.decls.map(prop));
    const dropped = before.decls.map(prop).filter((p) => !kept.has(p)).map((p) => `${p}: unset`);
    if (changed.length + dropped.length > 0) out.push(ruleText({ selector: r.selector, decls: [...changed, ...dropped] }));
  }
  return out.join('\n');
}

/** `config` under a part's palette (palette id → hex): every colour equal
 *  to the base value of an entry the part changes takes the part's value,
 *  as the engine recolours the printed text (`applyPartPalettesToFlow`;
 *  the resolved configuration keeps values, not palette links). */
export function withPalette(config: ResolvedConfig, overrides: Readonly<Record<string, string>> | undefined): ResolvedConfig {
  if (!overrides || !config.colorPalette) return config;
  const remap = new Map<string, string>();
  for (const e of config.colorPalette) {
    const hex = overrides[e.id];
    if (!hex) continue;
    const next = hex.startsWith('#') ? hex : `#${hex}`;
    if (next.toLowerCase() !== e.value.hex.toLowerCase()) remap.set(e.value.hex.toLowerCase(), next);
  }
  if (remap.size === 0) return config;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    if (typeof o.hex === 'string' && typeof o.model === 'string') {
      const next = remap.get(o.hex.toLowerCase());
      return next ? { ...o, hex: next } : o;
    }
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, k === 'colorPalette' ? x : walk(x)]));
  };
  return walk(config) as ResolvedConfig;
}
