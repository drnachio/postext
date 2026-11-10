// Spreads: one page per spread, its items in the display list's order, the
// text of each composed frame (or chain of frames) in one text frame per
// frame and one story per chain.

import type { DisplayPage, DisplayRect } from '../paint/displayList/types.js';
import type { VDTFrame } from '../vdt/pages/composed.js';
import { boxGeometry, union } from './geometry.js';
import { imageXml } from './images.js';
import { asPainted, textScale } from './paragraphs.js';
import { attr, DOM_VERSION, num, PKG_NS, XML_HEAD } from './parts.js';
import { chipFields, chipRects, pathXml, rectXml, ruleXml } from './shapes.js';
import { storyXml } from './story.js';
import { frameName, type StoryItem, type TextItem, type Writer } from './writer.js';

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
 *  it, and a fixed first-baseline offset puts the first baseline exactly. */
function textFrameXml(w: Writer, items: TextItem[], frame: VDTFrame | undefined, link?: ChainLink): string {
  const withLines = items.filter((i) => i.lines.length);
  if (!withLines.length && !(link && frame)) return '';
  // A frame of a chain that holds no text of its own on this page.
  const measured: { bbox: DisplayRect; lines: { baseline: number; lineHeight: number }[]; rotate?: number }[] = withLines.length ? withLines : [{ bbox: { ...frame!.rect }, lines: [{ baseline: frame!.rect.y, lineHeight: 0 }], rotate: 0 }];
  const text = union(measured.map((i) => i.bbox));
  const box = frame ? { ...frame.rect } : { ...text };
  const rotate = frame?.rotate ?? measured[0]!.rotate ?? 0;
  // Room below for InDesign's own composer.
  if (!frame) box.height += (measured[0]!.lines[0]?.lineHeight ?? 0) * 0.5;
  const g = boxGeometry(w, box, rotate);
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
    `<TextFramePreference TextColumnCount="1" FirstBaselineOffset="FixedHeight"${attr('MinimumFirstBaselineOffset', baselineOffset)} VerticalJustification="TopAlign"${attr('InsetSpacing', `${num(top)} ${num(left)} 0 ${num(right)}`)} AutoSizingType="Off" IgnoreWrap="false"/>` +
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

export function spreadXml(w: Writer, id: string, page: DisplayPage, frames: Map<string, VDTFrame>, index: number, gap: number): string {
  const out: string[] = [];
  // Stories are written horizontal and left to right (`storyXml`), once
  // said for the whole package.
  const lines = page.items.flatMap((it) => (it.kind === 'text' ? it.lines : []));
  if (page.rtl || lines.some((l) => l.rtl)) w.warn('text.rtl', 'Right-to-left text is written left to right, in horizontal stories: set the stories\' direction in InDesign');
  if (page.vertical || lines.some((l) => l.vertical)) w.warn('text.vertical', 'Vertical text is written horizontal, left to right: set the stories\' orientation in InDesign');
  // The text of one frame (of one chain of frames) goes into one story,
  // written where its first item paints; the rest of the items keep the
  // display list's order.
  const byFrame = new Map<string, TextItem[]>();
  // A frame's items as painted, at its text scale.
  for (const it of page.items) if (it.kind === 'text' && it.frame && frames.has(it.frame)) byFrame.set(it.frame, [...(byFrame.get(it.frame) ?? []), asPainted(it, textScale(frames.get(it.frame)))]);
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
          out.push(...chipRects(w, it), textFrameXml(w, marker ? [marker, it] : [it], undefined), ...chipFields(w, it));
          break;
        }
        if (done.has(it.frame)) break;
        const chain = chainOf(frames.get(it.frame)!, frames);
        const own = chain.map((c) => byFrame.get(c.id) ?? []);
        for (const c of chain) done.add(c.id);
        // Chip boxes go behind all the chain's text.
        for (const items of own) for (const t of items) out.push(...chipRects(w, t));
        // Form fields go over it.
        const fields = () => own.flatMap((items) => items.flatMap((t) => chipFields(w, t)));
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
        w.warn('table', `Page ${page.index + 1}: tables are not written yet`);
        break;
    }
  }
  const pageW = (page.trim?.width ?? page.width) * w.k;
  return (
    `${XML_HEAD}<idPkg:Spread xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">` +
    `<Spread${attr('Self', id)} PageTransitionType="None" ShowMasterItems="true" PageCount="1" BindingLocation="0" AllowPageShuffle="true"${attr('ItemTransform', `1 0 0 1 0 ${num(index * (w.pageH + gap))}`)} FlattenerOverride="Default">` +
    `<Page${attr('Self', `${id}p`)}${attr('Name', page.label ?? String(index + 1))} AppliedMaster="n"${attr('GeometricBounds', `0 0 ${num(w.pageH)} ${num(pageW)}`)}${attr('ItemTransform', `1 0 0 1 0 ${num(-w.pageH / 2)}`)} OverrideList="" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true">` +
    `<MarginPreference ColumnCount="1" ColumnGutter="12" Top="0" Bottom="0" Left="0" Right="0" ColumnDirection="Horizontal"${attr('ColumnsPositions', `0 ${num(pageW)}`)}/>` +
    '</Page>' +
    out.join('') +
    '</Spread></idPkg:Spread>'
  );
}
