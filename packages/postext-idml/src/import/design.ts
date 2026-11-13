// Page items as design elements of the book: shapes, rules and master
// text become the boxes, paths, rules and placeholder texts a page
// template or a running head draws.
//
// Every element is placed from the page's top left corner in points, as
// InDesign has it. Words never go into the configuration: the text of a
// master frame is carried by the Markdown (an attribute of the page
// fence or of the chapter's heading) and the element prints
// `{attr.<key>}`; automatic page numbers and running-header variables
// are Postext's own placeholders.

import type { ColorValue, DesignElement, ElementPlacement } from 'postext';
import type { IdmlPageItem, IdmlParagraph } from '../model/document.js';
import { apply, boxHeight, boxWidth, decompose, isRectangle, multiply, pathExtent, type Box, type Matrix, type Path } from '../model/geometry.js';
import { transformPaths } from '../resolve/geometry.js';
import type { Context } from './context.js';
import { attributeValue, cleanText } from './escape.js';
import { firstLineShift, frameSetup, fromTop, openingLines } from './fidelity/baseline.js';
import { boxLook, itemProps, radiusOf } from './objects.js';
import { pictureResource } from './pictures.js';
import { BLACK, pt } from './values.js';

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** A box of the page as a placement: anchored to the trim's top left. */
export function placeAt(box: Box, to: 'page' | 'container' = 'page'): ElementPlacement {
  return { anchor: { to, edge: 'top-left' }, offset: { x: pt(box.left), y: pt(box.top) }, size: { width: pt(boxWidth(box)), height: pt(boxHeight(box)) } };
}

/** An outline as SVG path data in a box of its own size. */
export function pathData(paths: readonly Path[], box: Box): string {
  const p = (x: number, y: number): string => `${r2(x - box.left)} ${r2(y - box.top)}`;
  let d = '';
  for (const path of paths) {
    const pts = path.points;
    if (!pts.length) continue;
    d += `M${p(pts[0]!.anchor.x, pts[0]!.anchor.y)}`;
    for (let n = 1; n <= pts.length; n++) {
      if (n === pts.length && path.open) break;
      const a = pts[n - 1]!;
      const b = pts[n % pts.length]!;
      const straight = a.right.x === a.anchor.x && a.right.y === a.anchor.y && b.left.x === b.anchor.x && b.left.y === b.anchor.y;
      d += straight ? `L${p(b.anchor.x, b.anchor.y)}` : `C${p(a.right.x, a.right.y)} ${p(b.left.x, b.left.y)} ${p(b.anchor.x, b.anchor.y)}`;
    }
    if (!path.open) d += 'Z';
  }
  return d;
}

export interface MasterWords {
  /** Attribute key → the words it carries. */
  attrs: Map<string, string>;
}

/** The text of a master frame as the content of a design text: page
 *  numbers and running-header variables as placeholders, words as
 *  `{attr.key}` (given to `words`). */
export function placeholderText(ctx: Context, paragraphs: readonly IdmlParagraph[], key: string, words: MasterWords): string {
  const lines: string[] = [];
  let n = 0;
  for (const para of paragraphs) {
    let line = '';
    let pending = '';
    const flush = (): void => {
      // The white space around the words, found by scanning (a regex
      // anchored at the end backtracks over every run of spaces).
      let a = 0;
      while (a < pending.length && /\s/.test(pending[a]!)) a++;
      let b = pending.length;
      while (b > a && /\s/.test(pending[b - 1]!)) b--;
      const lead = pending.slice(0, a);
      const trail = pending.slice(b);
      const core = pending.slice(a, b);
      if (core) {
        const v = attributeValue(core);
        if (v.changed) ctx.rep.add('masterTextRewritten', 'warning', 'Master text holding a quote or a brace is carried with a look-alike character (it travels as an attribute of the Markdown)', core);
        const k = `${key}${n ? String.fromCharCode(97 + (n % 26)) : ''}`;
        n++;
        words.attrs.set(k, v.text);
        line += `${lead}{attr.${k}}${trail}`;
      } else line += pending;
      pending = '';
    };
    for (const run of para.runs) {
      for (const i of run.content) {
        if (i.kind === 'text') pending += cleanText(i.text).replace(/\t/g, ' ');
        else if (i.kind === 'special' && i.char === 'pageNumber') {
          flush();
          line += '{pageNumber}';
        } else if (i.kind === 'special' && i.char === 'sectionMarker') pending += ctx.doc.sections[0]?.marker ?? '';
        else if (i.kind === 'special' && i.char === 'forcedLineBreak') pending += ' ';
        else if (i.kind === 'variable') {
          const type = ctx.doc.textVariables.get(i.variable)?.type ?? '';
          if (/MatchParagraphStyle|MatchCharacterStyle|RunningHeader/i.test(type)) {
            flush();
            line += '{chapterTitle}';
            ctx.rep.add('runningHeaderVariable', 'info', 'A running-header variable prints the chapter title ({chapterTitle})', ctx.doc.textVariables.get(i.variable)?.name);
          } else if (/ChapterNumber/i.test(type)) {
            flush();
            line += '{chapterNumber}';
          } else if (/LastPageNumber/i.test(type)) {
            flush();
            line += '{totalPages}';
          } else pending += i.result;
        } else if (i.kind !== 'special' && i.kind !== 'destination' && i.kind !== 'indexMark') ctx.rep.add('masterTextObjects', 'loss', 'A note, a table or an anchored object in the text of a master frame is left out: the running head prints the words about it only', i.kind);
      }
    }
    flush();
    if (line.trim()) lines.push(line.trim());
  }
  if (lines.length > 1) ctx.rep.add('masterTextLines', 'info', 'Master text of several paragraphs is set on one line', lines.join(' / '));
  return lines.join(' ');
}

export interface ElementOptions {
  /** Item frame → page coordinates. */
  toPage: Matrix;
  /** Prefix of the element ids (unique in their slot). */
  id: string;
  parity?: 'odd' | 'even';
  words: MasterWords;
  /** `to` of the anchors: the page's trim. */
  where: string;
}

/** A shape (no text, no picture) as a design element. Undefined for an
 *  item that draws nothing. */
export function shapeElement(ctx: Context, item: IdmlPageItem, o: ElementOptions): DesignElement | undefined {
  const own = pathExtent(item.paths);
  if (!own) return undefined;
  const look = boxLook(ctx, item, o.where);
  const outline = transformPaths(item.paths, o.toPage);
  const box = pathExtent(outline);
  if (!box || !(boxWidth(box) > 0 || boxHeight(box) > 0)) return undefined;
  const parity = o.parity ? { parity: o.parity } : {};
  const d = decompose(o.toPage);
  const upright = Math.abs(d.rotation % 90) < 0.01 && Math.abs(d.shear) < 0.01;
  // A straight line.
  if (item.kind === 'GraphicLine' || (item.paths.length === 1 && item.paths[0]!.open && item.paths[0]!.points.length === 2)) {
    if (!look.stroke) return undefined;
    const p = itemProps(ctx, item);
    if ((p.attrs.LeftLineEnd && p.attrs.LeftLineEnd !== 'None') || (p.attrs.RightLineEnd && p.attrs.RightLineEnd !== 'None')) ctx.rep.add('lineEnds', 'warning', 'Arrowheads and other line ends are not drawn', o.where);
    const horizontal = boxHeight(box) < 0.01;
    const vertical = boxWidth(box) < 0.01;
    if ((horizontal || vertical) && !look.dashed) {
      const w = look.strokeWeight;
      const at: Box = horizontal ? { left: box.left, top: box.top - w / 2, right: box.right, bottom: box.top + w / 2 } : { left: box.left - w / 2, top: box.top, right: box.left + w / 2, bottom: box.bottom };
      return { kind: 'rule', id: o.id, ...parity, pin: true, reserve: false, placement: placeAt(at), direction: horizontal ? 'horizontal' : 'vertical', color: look.stroke, thickness: pt(w) };
    }
    const grown: Box = { left: box.left, top: box.top, right: Math.max(box.right, box.left + 0.01), bottom: Math.max(box.bottom, box.top + 0.01) };
    return { kind: 'path', id: o.id, ...parity, pin: true, reserve: false, placement: placeAt(grown), d: pathData(outline, grown), viewBox: [r2(boxWidth(grown)), r2(boxHeight(grown))], stroke: look.stroke, width: pt(look.strokeWeight), ...(look.dashed ? { dash: [pt(look.strokeWeight * 3), pt(look.strokeWeight * 2)] } : {}), preserveAspectRatio: 'none' };
  }
  if (!look.fill && !look.stroke) return undefined;
  if (isRectangle(item.paths) && upright) {
    return {
      kind: 'box',
      id: o.id,
      ...parity,
      pin: true,
      reserve: false,
      placement: placeAt(box),
      style: { ...(look.fill ? { backgroundColor: look.fill } : {}), ...(look.stroke ? { borderColor: look.stroke, borderWidth: pt(look.strokeWeight) } : {}), ...(look.radius ? { borderRadius: radiusOf(look) } : {}) },
    };
  }
  return { kind: 'path', id: o.id, ...parity, pin: true, reserve: false, placement: placeAt(box), d: pathData(outline, box), viewBox: [r2(boxWidth(box)), r2(boxHeight(box))], ...(look.fill ? { fill: look.fill } : {}), ...(look.stroke ? { stroke: look.stroke, width: pt(look.strokeWeight) } : {}), preserveAspectRatio: 'none' };
}

/** A master item (and what a group holds) as design elements, back to
 *  front. Text frames print their story with placeholders. */
export function masterElements(ctx: Context, item: IdmlPageItem, o: ElementOptions, out: DesignElement[] = []): DesignElement[] {
  if (!item.visible && !ctx.opt.hiddenObjects) {
    ctx.rep.add('hiddenObjects', 'info', 'Hidden objects are left out (hiddenObjects: "include" keeps them)', o.where);
    return out;
  }
  // A master item on a layer that is switched off, or set not to print,
  // is left out as a page's own would be.
  if (item.layer !== undefined && !ctx.opt.hiddenLayers && ctx.doc.layers.some((l) => l.self === item.layer && !l.visible)) {
    ctx.rep.add('hiddenLayers', 'info', 'Text on hidden layers is left out (hiddenLayers: "include" keeps it)', o.where);
    return out;
  }
  if (item.nonprinting && !ctx.opt.nonPrinting) {
    ctx.rep.add('nonPrinting', 'info', 'Non-printing objects are left out (nonPrinting: "include" keeps them)', o.where);
    return out;
  }
  if (item.children.length) {
    item.children.forEach((c, n) => masterElements(ctx, c, { ...o, toPage: multiply(o.toPage, c.transform), id: `${o.id}-${n + 1}` }, out));
    return out;
  }
  const own = pathExtent(item.paths);
  if (!own) return out;
  const corners = [apply(o.toPage, { x: own.left, y: own.top }), apply(o.toPage, { x: own.right, y: own.bottom })];
  const box: Box = { left: Math.min(corners[0]!.x, corners[1]!.x), top: Math.min(corners[0]!.y, corners[1]!.y), right: Math.max(corners[0]!.x, corners[1]!.x), bottom: Math.max(corners[0]!.y, corners[1]!.y) };
  const parity = o.parity ? { parity: o.parity } : {};
  if (item.graphic) {
    const id = pictureResource(ctx, item);
    if (id) out.push({ kind: 'image', id: o.id, ...parity, pin: true, reserve: false, placement: placeAt(box), resourceId: id, decorative: !item.altText, fit: 'cover' });
    return out;
  }
  const shape = shapeElement(ctx, item, o);
  if (shape) out.push(shape);
  const story = item.textFrame?.story ? ctx.doc.stories.get(item.textFrame.story) : undefined;
  if (story && story.paragraphs.length) {
    const first = story.paragraphs.find((p) => p.runs.length) ?? story.paragraphs[0]!;
    const look = ctx.looks.of(first);
    const content = placeholderText(ctx, story.paragraphs, o.id.replace(/[^A-Za-z0-9]/g, ''), o.words);
    if (content) {
      const setup = frameSetup(ctx, item);
      const [top, left, bottom, right] = setup.inset;
      const inner: Box = { left: box.left + left, top: box.top + top, right: box.right - right, bottom: box.bottom - bottom };
      // The first baseline where the master has it (`fidelity/baseline`).
      if (fromTop(setup)) inner.top += firstLineShift(ctx, setup, openingLines(ctx, story.paragraphs), o.where);
      inner.bottom = Math.max(inner.bottom, inner.top + look.cf.leading);
      const colour: ColorValue = ctx.palette.colour(look.cf.fillColor, look.cf.fillTint, o.where) ?? BLACK;
      const v = setup.verticalJustification;
      out.push({
        kind: 'text',
        id: `${o.id}-text`,
        ...parity,
        pin: true,
        reserve: false,
        placement: placeAt(inner),
        content,
        ...(look.cf.fontFamily ? { fontFamily: look.cf.fontFamily } : {}),
        fontSize: pt(look.cf.pointSize),
        fontWeight: look.weight,
        italic: look.italic,
        color: colour,
        align: look.pf.align,
        verticalAlign: v === 'CenterAlign' ? 'middle' : v === 'BottomAlign' ? 'bottom' : 'top',
        lineHeight: pt(look.cf.leading),
        ...(look.cf.tracking ? { letterSpacing: { value: look.cf.tracking / 1000, unit: 'em' as const } } : {}),
        ...(look.cf.capitalization === 'AllCaps' ? { textTransform: 'uppercase' as const } : {}),
        hyphenate: false,
      });
    }
  }
  if (item.textPaths.length) ctx.rep.add('masterTextOnPath', 'loss', 'Text set on a path of a master item is left out: the page shows the path\'s shape without its words', o.where);
  return out;
}
