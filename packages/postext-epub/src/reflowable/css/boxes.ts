// The book stylesheet's rules for callouts, composed pages' frames, exercise
// boxes and paragraph styles (#1276: split out of css.ts).
import { rule, ALIGN, TRACKED_LIGATURES } from './helpers.js';
import { idOf, round } from '../inline.js';
import { isCornerRadii, type CornerRadius, type Dimension, uniformRadius, type ResolvedConfig, type ColorValue, type ResolvedBodyTextConfig } from 'postext';
import type { StylesheetOptions, CssRule } from './types.js';

/** What createBoxRules takes from bookStylesheet. */
export interface BoxRulesDeps {
  config: ResolvedConfig;
  options: StylesheetOptions;
  dpi: number;
  body: ResolvedBodyTextConfig;
  bodyPx: number;
  fam: (f: string) => string;
  em: (d: Dimension, basePx?: number) => string;
  lh: (d: Dimension, fontPx: number) => string;
  color: (c: ColorValue | undefined, prop?: string) => string | undefined;
  px: (d: Dimension, basePx?: number) => number;
  spacingEm: (spacing: boolean | Dimension | undefined, lineHeight: Dimension, basePx?: number) => number;
  rtl: boolean;
  out: (string | CssRule)[];
}

export function createBoxRules(deps: BoxRulesDeps) {
  const {
    config, options, dpi, body, bodyPx, fam, em, lh, color, px, spacingEm, rtl, out
  } = deps;
  // --- callouts ------------------------------------------------------------
  out.push(rule('aside.pt-callout', ['margin: 1em 0', 'padding: 0.75em 1em', 'page-break-inside: avoid']));
  out.push(rule('.pt-callout-title', ['font-weight: bold', 'text-indent: 0', 'margin-block-end: 0.4em']));
  // A composed page's frames (#862): blocks of its section, in Markdown
  // order; a frame set in a callout style is drawn as its box.
  if (options.composed) {
    out.push(rule('section.pt-composed', ['margin-block: 1em']));
    out.push(rule('div.pt-frame', ['margin: 0 0 1em']));
    // A frame set in a writing mode of its own (#960): its lines run along
    // the length written on the box (`height` for a vertical frame).
    out.push(rule('div.pt-frame-vertical', ['writing-mode: vertical-rl', '-epub-writing-mode: vertical-rl', '-webkit-writing-mode: vertical-rl']));
    out.push(rule('div.pt-frame-horizontal', ['writing-mode: horizontal-tb', '-epub-writing-mode: horizontal-tb', '-webkit-writing-mode: horizontal-tb']));
    out.push(rule('div.pt-frame.pt-callout', ['padding: 0.75em 1em', 'page-break-inside: avoid']));
  }
  const frameStyles = new Set(options.composed?.frameStyles ?? []);
  // The boxes an exercise is set in (#1244): its own frameless one, or the
  // box style its exercise style names. An exercise is a `div` group.
  const exerciseFrames = new Set((config.exerciseSettings?.styles ?? []).flatMap((st) => (st.box ? [st.box] : [])));
  for (const s of config.calloutStyles) {
    const cls = idOf('pt-callout-', s.id);
    // The box's selector, and the frames' set in its style (#862).
    const sels = frameStyles.has(s.id) ? [`aside.${cls}`, `div.pt-frame.${cls}`] : [`aside.${cls}`];
    if (exerciseFrames.has(s.id) || s.id.startsWith('__postext-ex')) sels.push(`div.pt-exercise.${cls}`);
    const sel = sels.join(', ');
    const under = (rest: string) => sels.map((x) => `${x} ${rest}`).join(', ');
    const bPx = px(s.body.fontSize);
    const pad = s.padding;
    const stripe = s.stripe.enabled && px(s.stripe.width) > 0 ? `${round(px(s.stripe.width) * (96 / dpi))}px solid ${s.stripe.color.hex}` : undefined;
    const side = s.stripe.side === 'top' ? 'border-block-start' : s.stripe.side === 'right' ? 'border-inline-end' : 'border-inline-start';
    // A box's sides are the body flow's (#371): in a right-to-left book,
    // whose flow is mirrored, its left padding is on the page's right.
    const [padRight, padLeft] = rtl ? [pad.left, pad.right] : [pad.right, pad.left];
    // Corners of their own and a border per side (#1059); a joined tab
    // reflows as a plain tab.
    const radius = isCornerRadii(s.borderRadius)
      ? (() => {
          const r = s.borderRadius as Exclude<CornerRadius, Dimension>;
          const one = (d: Dimension | undefined) => (d ? em(d) : '0');
          // The corners of the body flow's sides, as the padding's.
          const [tl, tr, br, bl] = rtl ? [r.topRight, r.topLeft, r.bottomLeft, r.bottomRight] : [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft];
          return [tl, tr, br, bl].some((d) => d && px(d) > 0)
            ? `border-radius: ${one(tl)} ${one(tr)} ${one(br)} ${one(bl)}`
            : undefined;
        })()
      : px(uniformRadius(s.borderRadius)!) > 0 && `border-radius: ${em(uniformRadius(s.borderRadius)!)}`;
    const sideBorders = s.border.sides
      ? (['top', 'right', 'bottom', 'left'] as const).map((k) => {
          const b = s.border.sides![rtl && k === 'left' ? 'right' : rtl && k === 'right' ? 'left' : k];
          return b.enabled && px(b.width) > 0 ? `border-${k}: ${round(px(b.width) * (96 / dpi))}px solid ${b.color.hex}` : `border-${k}: none`;
        })
      : [];
    out.push(rule(sel, [
      s.backgroundEnabled && color(s.background, 'background-color'),
      !s.border.sides && s.border.enabled && px(s.border.width) > 0 && `border: ${round(px(s.border.width) * (96 / dpi))}px solid ${s.border.color.hex}`,
      ...sideBorders,
      stripe && `${side}: ${stripe}`,
      radius,
      `padding: ${em(pad.top)} ${em(padRight)} ${em(pad.bottom)} ${em(padLeft)}`,
      `margin: ${em(s.marginTop)} 0 ${em(s.marginBottom)}`,
      fam(s.body.fontFamily),
      `font-size: ${round(bPx / bodyPx)}em`,
      color(s.body.color),
      s.body.italic && 'font-style: italic',
      s.body.smallCaps && 'font-variant: small-caps',
      `text-align: ${ALIGN[s.body.textAlign] ?? 'start'}`,
    ]));
    // A hanging box (#1451): its paragraphs' turnovers padded in, the first
    // line taken back to the edge (or to the style's own first-line indent
    // beside a length); `true` hangs by the first-line indent.
    const hang = s.body.hangingIndent === true
      ? px(s.body.firstLineIndent, bPx)
      : typeof s.body.hangingIndent === 'object' ? px(s.body.hangingIndent, bPx) : 0;
    const first = hang > 0
      ? (typeof s.body.hangingIndent === 'object' && s.body.ownFirstLineIndent ? px(s.body.firstLineIndent, bPx) : 0) - hang
      : px(s.body.firstLineIndent, bPx);
    out.push(rule(under('p'), [
      hang > 0 && `padding-inline-start: ${round(hang / bPx)}em`,
      `text-indent: ${round(first / bPx)}em`,
      spacingEm(s.body.paragraphSpacing, s.body.lineHeight, bPx) > 0 && `margin-block-end: ${spacingEm(s.body.paragraphSpacing, s.body.lineHeight, bPx)}em`,
      lh(s.body.lineHeight, bPx),
    ]));
    const t = s.titleStyle;
    const tPx = px(t.fontSize);
    out.push(rule(under('> .pt-callout-title'), [
      fam(t.fontFamily),
      `font-size: ${round(tPx / bPx)}em`,
      `font-weight: ${t.fontWeight}`,
      `font-style: ${t.italic ? 'italic' : 'normal'}`,
      color(t.color),
      t.textTransform === 'uppercase' && 'text-transform: uppercase',
      t.letterSpacing.value !== 0 && `letter-spacing: ${round(px(t.letterSpacing, tPx) / tPx)}em`,
      t.letterSpacing.value !== 0 && TRACKED_LIGATURES,
      `margin-block-end: ${round(px(t.gap, tPx) / tPx)}em`,
      'text-indent: 0',
    ]));
    out.push(rule(under('li > .pt-lbl:first-child'), [color(s.lists.color)]));
    iconRules(s, sel, under, bPx, tPx);
  }

  /** The rules of a box style's icon (`.pt-callout-icon`, first in the
   *  box), placed as the composed page places it: centred over a side
   *  stripe, in a column of its own before the content (the box padded by
   *  the column), or as a badge hanging on a top corner (`position:
   *  'corner'`). A float whose margin box is zero wide, so the text keeps
   *  its measure; the box a formatting context of its own, so it holds an
   *  icon taller than its text. */
  function iconRules(s: ResolvedConfig['calloutStyles'][number], sel: string, under: (rest: string) => string, bPx: number, tPx: number): void {
    const ic = s.icon;
    const on = ic.kind === 'glyph' ? ic.glyph.length > 0 : ic.kind === 'resource' ? ic.resourceId.length > 0 : ic.kind === 'shape';
    if (!on) return;
    const size = px(ic.size, bPx);
    const w = ic.width ? Math.max(size, px(ic.width, bPx)) : size;
    // Sides in the box's flow: a stripe or corner on the `'right'` /
    // `'end'` / `'outer'` side is at the end.
    const atEnd = (side: string) => side === 'right' || side === 'end' || side === 'outer';
    const physical = (end: boolean) => ((end !== rtl) ? 'right' : 'left');
    const stripeW = s.stripe.enabled ? px(s.stripe.width) : 0;
    const sideStripe = stripeW > 0 && s.stripe.side !== 'top';
    const borderW = (side: 'top' | 'left' | 'right') => {
      const b = s.border.sides?.[side] ?? s.border;
      return b.enabled ? px(b.width) : 0;
    };
    // The padding and the icon scale with the text (ems); the stripe and
    // the border are written in CSS px, so the icon is moved past them by
    // a relative offset in px (`shift`, `rise`) that leaves the layout as
    // it is.
    let end: boolean;
    let lead: number;
    let top = 0;
    let shift = 0;
    let rise = 0;
    const decls: (string | false | undefined)[] = [];
    if (ic.position === 'corner') {
      // Centred on the corner's border, flush with the box's top edge.
      end = atEnd(ic.cornerSide);
      const flowSide = end ? 'right' : 'left';
      const stripeHere = sideStripe && atEnd(s.stripe.side) === end ? stripeW : 0;
      lead = -(px(s.padding[flowSide], bPx) + w / 2);
      shift = stripeHere + borderW(physical(end));
      top = -px(s.padding.top, bPx);
      rise = (s.stripe.enabled && s.stripe.side === 'top' ? stripeW : 0) + borderW('top');
    } else if (sideStripe) {
      // Centred over the stripe.
      end = atEnd(s.stripe.side);
      lead = -(px(s.padding[end ? 'right' : 'left'], bPx) + w / 2);
      shift = stripeW / 2;
    } else {
      // A column of its own: the box's padding grows by it.
      end = false;
      const gap = px(s.titleStyle.gap, tPx);
      lead = -(w + gap);
      decls.push(`padding-${physical(false)}: ${round((px(s.padding.left, bPx) + w + gap) / bPx)}em`);
    }
    out.push(rule(sel, [...decls, 'display: flow-root']));
    // A glyph's lengths are in ems of its own size.
    const glyph = ic.kind === 'glyph';
    const base = glyph ? size : bPx;
    const e = (v: number) => `${round(v / base)}em`;
    const side = physical(end);
    const other = physical(!end);
    out.push(rule(under('> .pt-callout-icon'), [
      'display: block',
      `float: ${side}`,
      glyph && `font-size: ${round(size / bPx)}em`,
      `width: ${e(w)}`,
      `height: ${e(size)}`,
      `margin-${side}: ${e(lead)}`,
      `margin-${other}: ${e(-w - lead)}`,
      top !== 0 && `margin-top: ${e(top)}`,
      (shift > 0 || rise > 0) && 'position: relative',
      shift > 0 && `${side}: ${round(-(shift * 96) / dpi)}px`,
      rise > 0 && `top: ${round(-(rise * 96) / dpi)}px`,
      'text-indent: 0',
      ...(glyph
        ? [fam(ic.fontFamily), `font-weight: ${ic.fontWeight}`, 'font-style: normal', 'line-height: 1', 'text-align: center', color(ic.color)]
        : []),
      ...(ic.kind === 'shape'
        ? ic.shape === 'dot'
          ? ['border-radius: 50%', color(ic.color, 'background-color')]
          : ['border-radius: 50%', 'box-sizing: border-box', `border: ${round(((ic.strokeWidth ? px(ic.strokeWidth, bPx) : size / 8) * 96) / dpi)}px solid ${ic.color.hex}`]
        : []),
    ]));
    if (ic.kind === 'resource') {
      out.push(rule(under('> .pt-callout-icon > img'), ['display: block', 'width: 100%', 'height: 100%', 'object-fit: contain']));
    }
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
      // The style's own tracking (#907), in its own ems.
      s.letterSpacing && s.letterSpacing.value !== 0 && `letter-spacing: ${round(px(s.letterSpacing, sPx) / sPx)}em`,
      s.letterSpacing && s.letterSpacing.value !== 0 && TRACKED_LIGATURES,
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
  return {
  };
}
