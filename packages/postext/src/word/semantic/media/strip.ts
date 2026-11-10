// A comic strip (`:::strip`) in the semantic .docx (#1444): its panels side
// by side as the bordered cells of a one-row table, in the panel style's
// frame and paper, each with its art (when the book has it) over its
// script, and the strip's caption in a row of its own under them, so the
// caption never leaves its strip for the next page. Word cannot letter a
// picture: the lines stay text in the panel they are spoken in, mapped to
// the Markdown. A split that is more than one tier (`30 / *`) is set as
// one row of panels in reading order.

import type { ContentBlock } from '../../../parse/types.js';
import { resolveComicsConfig } from '../../../defaults/comics.js';
import type { WriterContext } from '../context.js';
import { STYLE } from '../styles.js';
import { blockSdt, eighths, hex, paragraph } from '../wml.js';
import { comicPanels, scriptLine, textPanel } from './comics.js';
import { pictureRun } from './figures.js';

/** The share of the strip's width each of `count` panels takes: the
 *  split's widths when it is one tier of as many (`30 | *`, `* | * | *`),
 *  else equal shares. */
export function panelShares(split: string | undefined, count: number): number[] {
  const equal = Array.from({ length: count }, () => 1 / count);
  if (!split || /[/[\]]/.test(split)) return equal;
  const parts = split.split('|').map((t) => t.trim());
  if (parts.length !== count) return equal;
  const fixed = parts.map((t) => (t === '*' ? undefined : Number.parseFloat(t)));
  if (fixed.some((v) => v !== undefined && !(v > 0 && v < 100))) return equal;
  const taken = fixed.reduce<number>((n, v) => n + (v ?? 0), 0);
  const stars = fixed.filter((v) => v === undefined).length;
  if (taken >= 100 && stars) return equal;
  const rest = stars ? (100 - taken) / stars : 0;
  const shares = fixed.map((v) => (v ?? rest) / 100);
  const sum = shares.reduce((a, b) => a + b, 0);
  return shares.map((v) => v / sum);
}

/** Gap between panels, twips (the cells' spacing is half of it). */
const GUTTER = 113;

/** A strip as a table of panels and its caption row; `caption` writes the
 *  caption paragraph, if any. `widthTwips` is the width it stands in. */
export function renderStrip(ctx: WriterContext, b: ContentBlock, widthTwips: number, caption: () => string): string {
  const panels = comicPanels(b);
  const comics = resolveComicsConfig(ctx.config.comics, ctx.config.locale);
  const frame = comics.panel;
  const ink = hex(frame.borderColor) ?? '000000';
  const paper = hex(frame.background);
  const line = `w:val="single" w:sz="${Math.min(96, Math.max(4, eighths(ctx.units, frame.borderWidth)))}" w:space="0" w:color="${ink}"`;
  const shares = panelShares(b.comic?.attrs.split, Math.max(1, panels.length));
  const widths = shares.map((s) => Math.max(240, Math.floor(widthTwips * s)));
  let cells = '';
  panels.forEach((panel, k) => {
    const w = widths[k]!;
    // The cell's room for a picture: its width less its margins.
    const room = Math.max(1, ((w - 2 * 113) * ctx.units.dpi) / 1440);
    let body = '';
    const pic = panel.art ? ctx.media.get(panel.art) : undefined;
    if (pic && panel.art) {
      ctx.usedResources.add(panel.art);
      body += paragraph({ style: STYLE.figure, keepNext: true }, pictureRun(ctx, pic, panel.art, ctx.resources.get(panel.art)?.altText ?? '', room));
    }
    if (panel.text) body += textPanel(ctx, panel.text);
    const lines = panel.items.filter((i) => i.role !== 'note' && i.text.trim());
    // Every line keeps with what follows: the panels with their caption.
    lines.forEach((item) => (body += scriptLine(ctx, item, true, 200, true)));
    if (!body) body = '<w:p><w:pPr><w:keepNext/></w:pPr></w:p>';
    cells += `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:tcBorders><w:top ${line}/><w:left ${line}/><w:bottom ${line}/><w:right ${line}/></w:tcBorders>${paper ? `<w:shd w:val="clear" w:color="auto" w:fill="${paper}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>${body}</w:tc>`;
  });
  const total = widths.reduce((a, c) => a + c, 0);
  const cap = caption();
  const nil = ['top', 'left', 'bottom', 'right'].map((s) => `<w:${s} w:val="nil"/>`).join('');
  const capRow = cap ? `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${total}" w:type="dxa"/><w:gridSpan w:val="${widths.length}"/><w:tcBorders>${nil}</w:tcBorders></w:tcPr>${cap}</w:tc></w:tr>` : '';
  const tbl =
    `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:jc w:val="center"/><w:tblCellSpacing w:w="${GUTTER / 2}" w:type="dxa"/>` +
    '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/>' +
    '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
    `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr>${capRow}</w:tbl>`;
  return blockSdt(ctx.nextSdtId(), 'ptx:strip', undefined, tbl);
}
