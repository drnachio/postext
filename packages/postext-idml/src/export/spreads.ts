// Spreads: one page per spread, its items in the display list's order, the
// text of each composed frame (or chain of frames) in one text frame per
// frame and one story per chain. Vertical text goes into vertical stories
// (`vertical.ts`), each item in its own orientation.

import type { DisplayPage, DisplayRect } from 'postext';
import type { VDTFrame } from 'postext/writer';
import { boxGeometry, union } from './geometry.js';
import { imageXml } from './images.js';
import { alignedItem, asPainted, textScale } from './paragraphs.js';
import { attr, DOM_VERSION, num, PKG_NS, XML_HEAD } from './parts.js';
import { chipFields, chipRects, pathXml, rectXml, ruleXml } from './shapes.js';
import { storyXml } from './story.js';
import { asHorizontal, asLines, frameBox, frameIsVertical, hasEmphasisDots, isVertical, sheetRect } from './vertical.js';
import { tableXml } from './tables.js';
import { frameName, keepsLines, type StoryItem, type TextItem, type Writer } from './writer.js';

/** A frame of a chain: its own id, its neighbours', the chain's story
 *  (written with the chain's first frame on the page) and its items. */
interface ChainLink {
  self: string;
  story: string;
  prev?: string;
  next?: string;
  write: boolean;
  storyItems: StoryItem[];
}

/** One text frame: a composed frame's text, or a single text item outside
 *  frames, with its own story or its chain's. The box is the frame's (or
 *  the item's), the left and right insets put the text where Postext set
 *  it, and a fixed first-baseline offset puts the first baseline exactly.
 *
 *  Vertical text comes in the frame of lines (`asLines`), where all of
 *  that is read as for horizontal text; its box goes back on the sheet
 *  (`sheetRect`) and the insets turn with it: the first line stands at the
 *  right, its baseline the fixed offset from the right inset, and the
 *  lines start at the top inset. */
function textFrameXml(w: Writer, items: TextItem[], frame: VDTFrame | undefined, link?: ChainLink): string {
  const withLines = items.filter((i) => i.lines.length);
  if (!withLines.length && !(link && frame)) return '';
  // A frame of a chain that holds no text of its own on this page.
  const vertical = withLines.length ? withLines.some(isVertical) : frameIsVertical(w, frame!);
  // A frame of vertical text, or of a vertical page: where it stands.
  const placed = frame ? frameBox(w, frame, vertical) : undefined;
  const own = placed?.box ?? frame?.rect;
  const measured: { bbox: DisplayRect; lines: { baseline: number; lineHeight: number }[]; rotate?: number }[] = withLines.length ? withLines : [{ bbox: { ...own! }, lines: [{ baseline: own!.y, lineHeight: 0 }], rotate: 0 }];
  const text = union(measured.map((i) => i.bbox));
  const box = own ? { ...own } : { ...text };
  const rotate = placed ? placed.rotate : (frame?.rotate ?? measured[0]!.rotate ?? 0);
  if (keepsLines(w) && !rotate && withLines.length) {
    // The text frame is not painted (a frame's box is a rectangle of its
    // own), so it may be larger than the text: room under the last
    // baseline for the line's descent as InDesign counts it, and, for text
    // set ragged from the left, room at the right for a line InDesign
    // measures a hair wider than Postext did. A line that did not fit
    // would go to the next line and push the rest out of the frame.
    const lastItem = withLines[withLines.length - 1]!;
    const tail = lastItem.lines[lastItem.lines.length - 1]!;
    const need = tail.baseline + tail.lineHeight * 0.75;
    if (need > box.y + box.height) box.height = need - box.y;
    // (A vertical line may end in a stop Postext hung past the measure or
    // set on half a cell: room for a whole cell.)
    if (withLines.every((i) => i.lines.every((l) => l.align === 'left' && !l.rtl))) box.width += vertical ? Math.max(6 / w.k, ...withLines.flatMap((i) => i.lines.map((l) => l.lineHeight))) : 6 / w.k;
  } else if (!frame) {
    // Room below for InDesign's own composer.
    box.height += (measured[0]!.lines[0]?.lineHeight ?? 0) * 0.5;
  }
  const g = boxGeometry(w, vertical ? sheetRect(box) : box, rotate);
  const left = Math.max(0, (text.x - box.x) * w.k);
  const right = Math.max(0, (box.x + box.width - (text.x + text.width)) * w.k);
  const firstBaseline = measured[0]!.lines[0]!.baseline;
  const top = Math.max(0, (text.y - box.y) * w.k);
  const baselineOffset = Math.max(0, (firstBaseline - text.y) * w.k);
  const storyId = link?.story ?? w.next();
  if (!link || link.write) w.stories.push({ id: storyId, xml: storyXml(w, storyId, link?.storyItems ?? withLines, frame) });
  return (
    `<TextFrame${attr('Self', link?.self ?? w.next())}${attr('ParentStory', storyId)}${attr('PreviousTextFrame', link?.prev ?? 'n')}${attr('NextTextFrame', link?.next ?? 'n')} ContentType="TextType" ItemLayer="ulayer"` +
    `${attr('ItemTransform', g.transform)} AppliedObjectStyle="ObjectStyle/$ID/[None]" FillColor="Swatch/None" StrokeColor="Swatch/None" StrokeWeight="0"${attr('Name', frame ? frameName(frame.name) : undefined)}>` +
    g.geometry +
    `<TextFramePreference TextColumnCount="1" FirstBaselineOffset="FixedHeight"${attr('MinimumFirstBaselineOffset', baselineOffset)} VerticalJustification="TopAlign"${attr('InsetSpacing', vertical ? `${num(left)} 0 ${num(right)} ${num(top)}` : `${num(top)} ${num(left)} 0 ${num(right)}`)} AutoSizingType="Off" IgnoreWrap="false"/>` +
    '</TextFrame>'
  );
}

/** The frames of the chain `f` belongs to on this page, in order. */
function chainOf(f: VDTFrame, frames: Map<string, VDTFrame>): VDTFrame[] {
  let head = f;
  const seen = new Set([head.id]);
  while (head.continuedFrom && frames.has(head.continuedFrom) && !seen.has(head.continuedFrom)) {
    head = frames.get(head.continuedFrom)!;
    seen.add(head.id);
  }
  const chain = [head];
  for (let c = head; c.continuesTo && frames.has(c.continuesTo) && !chain.some((x) => x.id === c.continuesTo); ) {
    c = frames.get(c.continuesTo)!;
    chain.push(c);
  }
  return chain;
}

/** The items of one page, in its spread's frame (`w.px`, `w.ox`, `w.oy`). */
export function pageItemsXml(w: Writer, page: DisplayPage, frames: Map<string, VDTFrame>): string {
  const out: string[] = [];
  // Left to InDesign's composer, stories are written left to right
  // (`storyXml`), once said for the whole package.
  const lines = page.items.flatMap((it) => (it.kind === 'text' ? it.lines : []));
  if (!keepsLines(w) && (page.rtl || lines.some((l) => l.rtl))) w.warn('text.rtl', 'Right-to-left text is written left to right, in horizontal stories: set the stories\' direction in InDesign');
  // Vertical text is written in vertical stories (`vertical.ts`); what
  // the display list does not carry of it is said.
  if (lines.some((l) => l.vertical)) {
    if (w.page && hasEmphasisDots(w.page)) w.warn('text.vertical.emphasisDots', 'Emphasis dots (:dots) are left out of vertical text: set them as kenten in InDesign');
    if (w.opts.inlineObjects !== false && lines.some((l) => l.vertical && l.runs.some((r) => r.inline && r.inline.kind !== 'chip'))) w.warn('text.vertical.inline', 'Inline maths, music and swatches in vertical text are written as inline objects: check how they stand in their line');
  }
  // A vertical item in the frame of lines, with the item it was.
  const origin = new Map<TextItem, TextItem>();
  const lined = (it: TextItem): TextItem => {
    if (!isVertical(it)) return it;
    const out = asLines(it);
    origin.set(out, it);
    return out;
  };
  // A horizontal frame of a vertical page sets its lines horizontally,
  // whatever the page's own setting says of them.
  const framed = (it: TextItem, frame: VDTFrame): TextItem => (isVertical(it) && !frameIsVertical(w, frame) ? asHorizontal(it) : it);
  // A vertical item's chips, told in the frame of lines, on the sheet (an
  // item with a turn of its own beside the quarter turn keeps its old place).
  const chipMap = (t: TextItem) => (origin.has(t) && !t.rotate ? sheetRect : undefined);
  const chipItem = (t: TextItem) => (origin.has(t) && t.rotate ? origin.get(t)! : t);
  // The text of one frame (of one chain of frames) goes into one story,
  // written where its first item paints; the rest of the items keep the
  // display list's order.
  const byFrame = new Map<string, TextItem[]>();
  // A frame's items as painted, at its text scale.
  // (A heading's or a design's lines are told aligned in their box,
  // `alignedItem`.)
  for (const it of page.items) if (it.kind === 'text' && it.frame && frames.has(it.frame)) byFrame.set(it.frame, [...(byFrame.get(it.frame) ?? []), lined(alignedItem(framed(asPainted(it, textScale(frames.get(it.frame))), frames.get(it.frame)!)))]);
  const done = new Set<string>();
  // Outside frames a list item's marker shares its item's text frame.
  const markerFor = new Map<TextItem, TextItem>();
  const held = new Set<TextItem>();
  page.items.forEach((it, i) => {
    if (it.kind !== 'text' || it.role !== 'marker' || (it.frame && byFrame.has(it.frame))) return;
    const item = page.items.slice(i + 1).find((x): x is TextItem => x.kind === 'text');
    if (item && item.role !== 'marker' && !(item.frame && byFrame.has(item.frame)) && item.source?.blockKey === it.source?.blockKey) {
      markerFor.set(item, it);
      held.add(it);
    }
  });
  // The paper's own colour, to the edge of the sheet (the bleed with it).
  if (page.background && !/^#f{3}(f{3})?$/i.test(page.background.trim())) out.push(rectXml(w, { rect: { x: 0, y: 0, width: page.width, height: page.height }, fill: page.background }, 'Paper'));
  for (const it of page.items) {
    switch (it.kind) {
      case 'rect':
        out.push(rectXml(w, it));
        break;
      case 'rule':
        out.push(ruleXml(w, it));
        break;
      case 'path':
        out.push(pathXml(w, it));
        break;
      case 'image':
        out.push(imageXml(w, it, page.index));
        break;
      case 'text': {
        if (!it.frame || !byFrame.has(it.frame)) {
          if (held.has(it)) break;
          const marker = markerFor.get(it);
          const t = lined(alignedItem(it));
          if (it.halo && it.halo.widthPx > 0) {
            // A halo: the same text under it, in the halo's ink, stroked
            // twice its width (half of a stroke lies inside the glyph).
            w.halo = { color: it.halo.color, weight: it.halo.widthPx * 2 * w.k };
            out.push(textFrameXml(w, [t], undefined));
            delete w.halo;
          }
          out.push(...chipRects(w, chipItem(t), chipMap(t)), textFrameXml(w, marker ? [lined(marker), t] : [t], undefined), ...chipFields(w, chipItem(t), chipMap(t)));
          break;
        }
        if (done.has(it.frame)) break;
        const chain = chainOf(frames.get(it.frame)!, frames);
        const own = chain.map((c) => byFrame.get(c.id) ?? []);
        for (const c of chain) done.add(c.id);
        // Chip boxes go behind all the chain's text.
        for (const items of own) for (const t of items) out.push(...chipRects(w, chipItem(t), chipMap(t)));
        // Form fields go over it.
        const fields = () => own.flatMap((items) => items.flatMap((t) => chipFields(w, chipItem(t), chipMap(t))));
        if (chain.length < 2) {
          out.push(textFrameXml(w, own[0]!, chain[0]), ...fields());
          break;
        }
        const story = w.next();
        const selfs = chain.map(() => w.next());
        const storyItems: StoryItem[] = [];
        for (const items of own) {
          items.forEach((x, k) => {
            const before = storyItems[storyItems.length - 1];
            storyItems.push(k === 0 && before?.source?.blockKey && before.source.blockKey === x.source?.blockKey ? { ...x, joinsPrevious: true } : x);
          });
        }
        chain.forEach((c, k) => {
          out.push(textFrameXml(w, own[k]!, c, { story, self: selfs[k]!, prev: selfs[k - 1], next: selfs[k + 1], write: k === 0, storyItems }));
        });
        out.push(...fields());
        break;
      }
      case 'table':
        out.push(tableXml(w, it, page.index));
        break;
    }
  }
  return out.join('');
}

/** A page of a spread: its id, its folio, its box (pt) and the margins
 *  its content area leaves (`inside` is the spine side). */
export interface SpreadPage {
  self: string;
  name: string;
  width: number;
  height: number;
  /** Left of the spine. */
  left: boolean;
  margins?: { top: number; bottom: number; inside: number; outside: number };
  items: string;
}

/** A spread: its pages about the spine (x = 0), then their items. */
export function spreadXml(id: string, pages: SpreadPage[], index: number, gap: number): string {
  const height = Math.max(...pages.map((p) => p.height));
  const binding = pages.filter((p) => p.left).length;
  const pageXml = (p: SpreadPage) => {
    const m = p.margins ?? { top: 0, bottom: 0, inside: 0, outside: 0 };
    // `Left` is the inside margin of a page of a facing-pages document.
    const text = Math.max(0, p.width - m.inside - m.outside);
    return (
      `<Page${attr('Self', p.self)}${attr('Name', p.name)} AppliedMaster="n"${attr('GeometricBounds', `0 0 ${num(p.height)} ${num(p.width)}`)}${attr('ItemTransform', `1 0 0 1 ${num(p.left ? -p.width : 0)} ${num(-p.height / 2)}`)} OverrideList="" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true">` +
      `<MarginPreference ColumnCount="1" ColumnGutter="12"${attr('Top', m.top)}${attr('Bottom', m.bottom)}${attr('Left', m.inside)}${attr('Right', m.outside)} ColumnDirection="Horizontal"${attr('ColumnsPositions', `0 ${num(text)}`)}/>` +
      '</Page>'
    );
  };
  return (
    `${XML_HEAD}<idPkg:Spread xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">` +
    `<Spread${attr('Self', id)} PageTransitionType="None" ShowMasterItems="true"${attr('PageCount', pages.length)}${attr('BindingLocation', binding)} AllowPageShuffle="false"${attr('ItemTransform', `1 0 0 1 0 ${num(index * (height + gap))}`)} FlattenerOverride="Default">` +
    pages.map(pageXml).join('') +
    pages.map((p) => p.items).join('') +
    '</Spread></idPkg:Spread>'
  );
}
