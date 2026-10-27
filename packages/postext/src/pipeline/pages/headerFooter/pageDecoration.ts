// A composed page's decoration: the template's design elements, rules and
// facing-page variants.
// Part of layoutHeadersAndFooters (layoutHeadersAndFooters.ts), split out of
// its loop in #1276.
import type { PageFurnitureTurn } from './pageFurnitureTurn.js';
import { type VDTDocument, type VDTPage, type VDTDesignRuleBlock, type VDTBlock, flowRectToPage } from '../../../vdt.js';
import type { PageMarks } from '../placeholders.js';
import { withDigits } from '../../../numerals/arabicNumerals.js';
import { framePageRect } from '../../../composed/paint.js';
import type { DesignPlaceholderContext } from '../../../design/placeholders.js';
import { repeatInstance } from '../../../composed/templates.js';
import { resolveDesignSlot } from '../../../defaults/structure/headerFooter.js';
import { moduleDecoration, type SlotLayoutExtras, layoutSlotToVdt } from './slotLayout.js';
import { figureAnchorPointOnPage } from '../../../composed/labels.js';
import { withMeasureWritingMode } from '../../../measure/vertical.js';
import { withoutAnchoredTo, connectorAnchorWarnings } from './pass.js';
import { splitSpreadDecoration } from '../../../composed/spread.js';

/** What createPageDecoration takes from around the loop. */
export interface PageDecorationDeps {
  doc: VDTDocument;
  dpi: number;
  chapterTitleByPageIndex: string[];
  numerals: "arab" | "arabext" | undefined;
  chapterNumberByPageIndex: string[];
  chapterTitleAtTopByPageIndex: string[];
  chapterNumberAtTopByPageIndex: string[];
  pageIndexOffset: number;
  chapterAttrsByPageIndex: Record<string, string>[];
  bookTotalPages: number;
  marksFor: (key: string) => PageMarks;
  partTitleByPageIndex: string[];
  partNumberByPageIndex: string[];
  partPaletteByPageIndex: Record<string, string>[];
  spreadDecorated: Set<number>;
}

export function createPageDecoration(deps: PageDecorationDeps) {
  const {
    doc, dpi, chapterTitleByPageIndex, numerals, chapterNumberByPageIndex,
    chapterTitleAtTopByPageIndex, chapterNumberAtTopByPageIndex, pageIndexOffset,
    chapterAttrsByPageIndex, bookTotalPages, marksFor, partTitleByPageIndex, partNumberByPageIndex,
    partPaletteByPageIndex, spreadDecorated
  } = deps;
  /** Sets a composed page's template decoration. */
  const setPageDecoration = (pageTurn: PageFurnitureTurn): void => {
    const {
      pageMetrics, physicalFrames, sheetArea, sheetExtras, template, pageAttrs
    } = pageTurn;
    // The template's decoration, laid with the frames' final boxes (its
    // elements may anchor to `'#frame'`), on the sheet like the running
    // heads; painted under the frames of layer 1 and up. A spread's (#861)
    // is laid once, on the sheet of its two pages, when its first page
    // comes, and cut for each page.
    const facing = pageTurn.page.composed?.facingPage !== undefined ? doc.pages[pageTurn.page.composed.facingPage] : undefined;
    // Empty frames' ruled lines (#914) are painted with the decoration.
    const ruled = (p: VDTPage | undefined): boolean => (p?.composed?.frames ?? []).some((f) => f.rules && !f.facingBlocks);
    if (pageTurn.page.composed && template && (template.decoration.elements.length > 0 || ruled(pageTurn.page) || ruled(facing)) && !(facing && spreadDecorated.has(pageTurn.page.index))) {
      const pair = facing?.composed?.spread && pageTurn.page.composed.spread ? { left: pageTurn.page.composed.spread === 'left' ? pageTurn.page : facing, right: pageTurn.page.composed.spread === 'left' ? facing : pageTurn.page } : undefined;
      const trimBox = pageMetrics.physical.trimBox;
      const bleedBox = pageMetrics.physical.bleedBox;
      const shift = trimBox.width;
      /** A frame's box on the sheet (of the spread, the right page's set
       *  `shift` along). */
      const named: Record<string, { x: number; y: number; width: number; height: number }> = {};
      /** And the box its template gave it, before groups moved it
       *  (`declaredRect`: what a `pin`ned element keeps to). */
      const declared: Record<string, { x: number; y: number; width: number; height: number }> = {};
      /** Frames that take no room on the page (#912): what anchors to
       *  them is not drawn. */
      const collapsed = new Set<string>();
      /** Frames a connector does not reach (#1056): collapsed, or empty and
       *  optional. */
      const absent = new Set<string>();
      const optional = new Set(template.frames.filter((f) => f.optional).map((f) => f.name));
      /** Empty frames' ruled lines (#914), on the sheet. */
      const rules: VDTDesignRuleBlock[] = [];
      /** The counter of the first numbered heading each frame holds
       *  (#984), in the document's digits, and the first of the page. */
      const headingNumberByFrame: Record<string, string> = {};
      let headingNumber: string | undefined;
      const floatById = new Map<string, VDTBlock>();
      /** The page and the blocks of each frame, for a connector's end at
       *  an anchor of the picture it holds (#1057). */
      const frameBlocks = new Map<string, { page: VDTPage; dx: number; blocks: VDTBlock[] }>();
      const nameFrames = (p: VDTPage, dx: number) => {
        for (const b of p.floats ?? []) floatById.set(b.id, b);
        for (const f of p.composed?.frames ?? []) {
          if (f.collapsed) collapsed.add(f.name);
          if (f.collapsed || (optional.has(f.repeat?.frame ?? f.name) && f.sourceStart === undefined && f.continuedFrom === undefined)) absent.add(f.name);
          if (!f.facingBlocks) {
            for (const id of f.blockIds) {
              const n = floatById.get(id)?.headingNumber;
              if (n === undefined) continue;
              const text = withDigits(String(n), numerals);
              headingNumberByFrame[f.name] ??= text;
              headingNumber ??= text;
            }
          }
          if (f.facingBlocks) continue;
          // A frame in its own writing mode (#944) is anchored to by the box
          // the page gives it, not the turned box its content is laid in.
          const r = flowRectToPage(p, framePageRect(f));
          const d = flowRectToPage(p, framePageRect({ rect: f.declaredRect ?? f.rect, writingMode: f.writingMode }));
          named[f.name] = { ...r, x: r.x + dx };
          declared[f.name] = { ...d, x: d.x + dx };
          frameBlocks.set(f.name, { page: p, dx, blocks: f.blockIds.map((id) => floatById.get(id)).filter((b): b is VDTBlock => b !== undefined) });
          for (const rule of f.rules ?? []) {
            // A vertical page's flow turns a rule across its lines.
            const b = flowRectToPage(p, rule.bbox);
            rules.push({ ...rule, bbox: { ...b, x: b.x + dx }, direction: b.height > b.width ? 'vertical' : 'horizontal' });
          }
        }
        // A module's box (#1062): what its decoration anchored to its
        // `'container'` reads (`#<name>`). A module laid elsewhere has none
        // here, and its decoration is not drawn.
        for (const m of p.composed?.modules ?? []) {
          if (!m.rect || named[m.name] !== undefined) continue;
          const r = flowRectToPage(p, m.rect);
          named[m.name] = { ...r, x: r.x + dx };
          declared[m.name] = { ...r, x: r.x + dx };
        }
      };
      let container: { x: number; y: number; width: number; height: number };
      let slotFrames: { page: typeof trimBox; bleed: typeof trimBox } = physicalFrames;
      if (pair) {
        nameFrames(pair.left, 0);
        nameFrames(pair.right, shift);
        const spreadTrim = { ...trimBox, width: shift + trimBox.width };
        const spreadBleed = { ...bleedBox, width: shift + bleedBox.width };
        const l = flowRectToPage(pair.left, pair.left.contentArea);
        const r = flowRectToPage(pair.right, pair.right.contentArea);
        const cx = Math.min(l.x, r.x + shift);
        const cy = Math.min(l.y, r.y);
        const content = { x: cx, y: cy, width: Math.max(l.x + l.width, r.x + shift + r.width) - cx, height: Math.max(l.y + l.height, r.y + r.height) - cy };
        container = template.area === 'trim' ? spreadTrim : template.area === 'bleed' ? spreadBleed : content;
        slotFrames = { page: spreadTrim, bleed: spreadBleed };
      } else {
        nameFrames(pageTurn.page, 0);
        container = template.area === 'trim' ? trimBox : template.area === 'bleed' ? bleedBox : sheetArea;
      }
      const attrSources: Record<string, { start: number; end: number }> = {};
      for (const [k, v] of Object.entries(pageTurn.page.composed.attrSources)) attrSources[k] = { start: v.sourceStart, end: v.sourceEnd };
      const placeholders: DesignPlaceholderContext = {
        kind: 'composed',
        ...(pageAttrs ? { pageAttrs } : {}),
        page: pageTurn.page,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
        chapterTitleAtTopByPageIndex,
        chapterNumberAtTopByPageIndex,
        chapterNumberByPageIndex,
        chapterAttrsByPageIndex,
        bookTotalPages,
        numerals,
        marksFor,
        partTitleByPageIndex,
        partNumberByPageIndex,
        partPaletteByPageIndex,
        ...(headingNumber !== undefined ? { headingNumber } : {}),
        ...(Object.keys(headingNumberByFrame).length > 0 ? { headingNumberByFrame } : {}),
      };
      // An element anchored to an instance of a repeated frame (#1061) the
      // page does not have (`#card[5]` on a page of three cards) is not
      // drawn, as one anchored to a frame that takes no room. So is one
      // anchored to a module (#1062), or a frame of it, that went on whole.
      const ofModule = new Set((template.modules ?? []).flatMap((m) => [m.name, ...m.frames, ...m.groups]));
      for (const el of template.decoration.elements) {
        const to = (el as { placement?: { anchor?: { to?: unknown } } }).placement?.anchor?.to;
        const t = typeof to === 'string' && to.startsWith('#') ? to.slice(1) : undefined;
        if (t !== undefined && named[t] === undefined && (repeatInstance(t) !== undefined || ofModule.has(t))) collapsed.add(t);
      }
      const slot = resolveDesignSlot(template.decoration, 'header');
      // A module's elements (#1189): their `{attr.x}` and `when` read the
      // module's fence first, and its texts are painted over the frames
      // unless they say `over: false` (a page template's texts only when
      // they say `over: true`).
      const { elementAttrs, inModule } = moduleDecoration(template, slot.elements, pair ? [pair.left, pair.right] : [pageTurn.page]);
      const overTexts = new Set<string>();
      template.decoration.elements.forEach((el, i) => {
        if (el.kind !== 'text') return;
        const over = typeof el.over === 'boolean' ? el.over : inModule.has(i);
        const id = slot.elements[i]?.id;
        if (over && id !== undefined) overTexts.add(id);
      });
      const connectorDropped: { elementId: string; targetId: string }[] = [];
      const connectorAnchorUnknown: NonNullable<SlotLayoutExtras['connectorAnchorUnknown']> = [];
      // A connector's end at an anchor of the picture its frame holds
      // (#1057): the first figure of the frame whose resource has it.
      const anchorPoint = (frame: string, anchor: string): { x: number; y: number } | { hidden: true } | { resourceId?: string; known: string[] } => {
        const held = frameBlocks.get(frame);
        let first: VDTBlock | undefined;
        for (const b of held?.blocks ?? []) {
          const rb = b.resourceBlock;
          if (!rb || (rb.kind !== 'bitmap' && rb.kind !== 'svg')) continue;
          first ??= b;
          const at = figureAnchorPointOnPage(held!.page, b, anchor);
          if (!at) continue;
          const p = { x: at.x + held!.dx, y: at.y };
          // A point the frame cuts off (its picture runs past the frame's
          // foot) is not shown on the page.
          const box = named[frame];
          if (box && (p.x < box.x - 0.5 || p.x > box.x + box.width + 0.5 || p.y < box.y - 0.5 || p.y > box.y + box.height + 0.5)) return { hidden: true };
          return p;
        }
        const res = first?.resourceBlock?.resource;
        return res ? { resourceId: res.id, known: (res.anchors ?? []).map((a) => a.id) } : { known: [] };
      };
      const laidDecoration = template.decoration.elements.length === 0 ? undefined : withMeasureWritingMode('horizontal-tb', () => layoutSlotToVdt(
        collapsed.size > 0 ? withoutAnchoredTo(slot, collapsed) : slot,
        container,
        pageTurn.page.index + pageIndexOffset,
        placeholders,
        dpi,
        {
          ...sheetExtras, frames: { ...slotFrames, named, declared, ...(absent.size > 0 ? { absent } : {}), anchorPoint }, attrs: pageTurn.page.composed!.attrs, attrSources, connectorDropped, connectorAnchorUnknown,
          ...(elementAttrs.size > 0 ? { elementAttrs } : {}),
          ...(overTexts.size > 0 ? { overTexts } : {}),
          // Each element's pointer, from the template that sets it (#857).
          elementPaths: new Map(resolveDesignSlot(template.decoration, 'header').elements.map((el, i) => [el.id, template.decorationPaths[i]!] as const)),
        },
      ));
      // The ends connectors left out, in the reflow log of the page laid
      // (of a spread, its first page); a pass that lays the decoration
      // again replaces them.
      for (const p of pair ? [pair.left, pair.right] : [pageTurn.page]) {
        if (p.composed?.log.some((e) => e.kind === 'connectorDropped')) p.composed.log = p.composed.log.filter((e) => e.kind !== 'connectorDropped');
      }
      for (const d of connectorDropped) pageTurn.page.composed.log.push({ frame: d.targetId, kind: 'connectorDropped', cause: d.elementId });
      // Ends at an anchor the frame's picture lacks (#1057): a content
      // warning on the page laid, once per pass.
      const unknown = connectorAnchorWarnings.get(doc) ?? [];
      const kept = unknown.filter((w) => !(pair ? [pair.left.index, pair.right.index] : [pageTurn.page.index]).includes(w.pageIndex ?? -1));
      for (const d of connectorAnchorUnknown) {
        kept.push({
          kind: 'labelAnchorUnknown',
          resourceId: d.resourceId ?? '',
          anchor: d.anchor,
          known: d.known,
          connector: d.elementId,
          frame: d.targetId,
          ...(doc.config?.locale ? { locale: doc.config.locale } : {}),
          pageIndex: pageTurn.page.index,
        });
      }
      if (kept.length > 0 || unknown.length > 0) connectorAnchorWarnings.set(doc, kept);
      const decoration = rules.length === 0 ? laidDecoration
        : laidDecoration ? { ...laidDecoration, blocks: [...laidDecoration.blocks, ...rules] } : { bbox: { ...container }, blocks: rules };
      if (decoration && pair) {
        const halves = splitSpreadDecoration(decoration, shift, { left: bleedBox, right: { ...bleedBox, x: bleedBox.x + shift } });
        pair.left.composed!.decoration = halves.left;
        pair.right.composed!.decoration = halves.right;
        spreadDecorated.add(pair.left.index);
        spreadDecorated.add(pair.right.index);
      } else if (decoration) pageTurn.page.composed.decoration = decoration;
    }
  };
  return { setPageDecoration };
}
