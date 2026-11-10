// The head of a composed page in the semantic .docx (#1444): what its
// template draws round the heading its title frame takes. The template's
// pictures (a unit cover's painting) and texts filled from the page's
// attributes (`::::page{unidad="Unit 4 · Social science"}`, the kicker over
// the title) come first, in reading order, then the heading. A heading the
// template sets on a band (the title frame drawn as a filled box, or a
// filled box the decoration lays over it) is set on that band: a shaded
// one-cell table, as the design writer sets a chapter opener's
// (design/bands.ts), in the heading's own ink, its number (the template's
// badge) before it, on a plate of the badge's fill in its ink: Word has
// no disc, and a shaded run is what Word, LibreOffice and Google Docs all
// draw. The kicker is the page's attribute, printed: generated
// text, since the value stays in the fence, where an edit belongs.

import type { ResolvedPageTemplate } from '../../../composed/types/resolved.js';
import { resolveDesignSlot } from '../../../defaults/structure/headerFooter/resolve.js';
import { resolveDesignText } from '../../../design/placeholders.js';
import { parsePartPalette } from '../../../pipeline/sections/parts.js';
import type { ContentBlock } from '../../../parse/types.js';
import type { Resource, ResolvedDesignElement, ResolvedDesignTextElement } from '../../../types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import type { HeadingLook } from '../design/heading.js';
import { withBands } from '../design/bands.js';
import { designImageId, fromMarkdown } from '../design/pictures.js';
import { designTextStyle } from '../design/text.js';
import { designPlaceholders, headingLevelOf } from '../design/values.js';
import { blockId, type WriterContext } from '../context.js';
import { generatedRuns } from '../generated.js';
import { pageGeometry } from '../sections.js';
import { STYLE } from '../styles.js';
import { FragmentBuilder } from '../fragments.js';
import { blockSdt, hex, paragraph, px, rPr, textRuns } from '../wml.js';
import { pictureRun } from './figures.js';
import { frameBoxStyle, templateOf } from './frames.js';

/** `elements` with each palette-linked colour the template's palette
 *  names set to the palette's value. */
function paletted(elements: readonly ResolvedDesignElement[], palette: string | undefined): ResolvedDesignElement[] {
  const map = parsePartPalette(palette);
  if (!Object.keys(map).length) return [...elements];
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    if (typeof o.hex === 'string' && typeof o.paletteId === 'string' && map[o.paletteId]) return { ...o, hex: map[o.paletteId] };
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
  };
  return elements.map((e) => walk(e) as ResolvedDesignElement);
}

/** A template's decoration, resolved, in its palette. */
function decoration(t: ResolvedPageTemplate): ResolvedDesignElement[] {
  return paletted(resolveDesignSlot(t.decoration, 'header').elements, t.palette);
}

/** Where an element stands against the title frame `title`: above it
 *  (anchored to the page's head, or to the frame with an offset upwards),
 *  on it, or neither (the page's foot, another frame). */
function side(el: ResolvedDesignElement, title: string): 'above' | 'on' | undefined {
  if (el.kind === 'connector') return undefined;
  const p = el.placement;
  const to = p.anchor.to;
  const dy = p.offset?.y && 'value' in p.offset.y ? p.offset.y.value : 0;
  if (to === `#${title}`) return dy < 0 || String(p.anchor.edge) === 'above' ? 'above' : 'on';
  if ((to === 'page' || to === 'bleed' || to === 'container') && String(p.anchor.edge).startsWith('top')) return 'above';
  return undefined;
}

/** The pictures composed-page templates draw (their files go into the
 *  package with the figures'). */
export function composedMediaIds(chapters: readonly { blocks: readonly ContentBlock[] }[], resolved: ResolvedConfig, resources: ReadonlyMap<string, Resource>, namedOnly = false): Set<string> {
  const out = new Set<string>();
  for (const ch of chapters) {
    for (const b of ch.blocks) {
      if (b.type !== 'containerStart' || b.containerName !== 'composedPage') continue;
      const id = b.composedPage?.template ?? b.containerAttrs?.template;
      const t = id ? templateOfConfig(resolved, id) : undefined;
      if (!t) continue;
      for (const el of decoration(t)) {
        if (el.kind !== 'image' || (namedOnly && !fromMarkdown(el.resourceId))) continue;
        const res = resources.get(designImageId(el.resourceId, b.containerAttrs) ?? '');
        if (res && (res.kind === 'bitmap' || res.kind === 'svg')) out.add(res.id);
      }
    }
  }
  return out;
}

/** `templateOf` without a writer context. */
function templateOfConfig(resolved: ResolvedConfig, id: string): ResolvedPageTemplate | undefined {
  return templateOf({ resolved } as WriterContext, id);
}

/** A template's picture: as wide as the text area at most and no taller
 *  than about half the page's text. */
function picture(ctx: WriterContext, id: string): string {
  const pic = ctx.media.get(id);
  if (!pic) return '';
  ctx.usedResources.add(id);
  const geo = pageGeometry(ctx.resolved, ctx.units);
  const maxH = (((geo.heightTw - geo.margins.top - geo.margins.bottom) * ctx.units.dpi) / 1440) * 0.45;
  const w = Math.min(ctx.textAreaPx, pic.widthPx * Math.min(1, maxH / pic.heightPx), (maxH * pic.widthPx) / pic.heightPx);
  const alt = ctx.resources.get(id)?.altText ?? '';
  return blockSdt(ctx.nextSdtId(), `ptx:design:${id}`, undefined, paragraph({ style: STYLE.figure, keepNext: true, before: 0, after: 120 }, pictureRun(ctx, pic, id, alt, w)));
}

/** A text element's words with the page's attributes (`{attr.key}`) and
 *  the heading's placeholders filled in. */
function textOf(ctx: WriterContext, el: ResolvedDesignTextElement, heading: ContentBlock, attrs: Record<string, string>): string {
  const content = el.content ?? '';
  const sole = /^\s*\{attr\.([A-Za-z_][A-Za-z0-9_.-]*)\}\s*$/.exec(content)?.[1];
  if (sole) return (attrs[sole] ?? '').trim();
  return resolveDesignText(content, { ...designPlaceholders(ctx, heading), pageAttrs: attrs }).trim();
}

/** The fill of the band the template sets its title on, if any. */
function titleBand(ctx: WriterContext, t: ResolvedPageTemplate, title: string, elements: readonly ResolvedDesignElement[]): string | undefined {
  const box = frameBoxStyle(ctx, [t], title);
  if (box?.backgroundEnabled && hex(box.background)) return hex(box.background);
  let fill: string | undefined;
  for (const el of elements) if (el.kind === 'box' && side(el, title) === 'on' && hex(el.style.backgroundColor)) fill = hex(el.style.backgroundColor);
  return fill;
}

/** The paragraph style of a title set on a band: its heading style in the
 *  heading's own ink (a white title on a coloured band). */
function bandTitleStyle(ctx: WriterContext, heading: ContentBlock, fill: string): string {
  const level = heading.level ?? 1;
  const base = ctx.styles.heading(level, heading.attrs?.style);
  const ink = hex(headingLevelOf(ctx.resolved, heading)?.color) ?? 'FFFFFF';
  return ctx.styles.custom(`pageTitle:${base}:${ink}:${fill}`, `${base} on band`, () => ({ basedOn: base, pPr: { before: 0, after: 0, keepNext: true }, rPr: { color: ink } }));
}

/** The number badge a template draws on its title frame (a text element
 *  printing `{headingNumber}`), if any. */
function badgeOf(elements: readonly ResolvedDesignElement[], title: string): ResolvedDesignTextElement | undefined {
  return elements.find((el): el is ResolvedDesignTextElement => el.kind === 'text' && side(el, title) === 'on' && (el.content ?? '').includes('{headingNumber'));
}

/** The heading's number as the badge prints it: in the badge's face and
 *  ink on a plate of its fill, padded with a space each side, then a
 *  space. Generated text, as the heading's number always is. */
function badgeRuns(ctx: WriterContext, el: ResolvedDesignTextElement, number: string): string {
  const u = ctx.units;
  const fill = hex(el.box?.backgroundColor);
  const size = Math.min(px(u, el.fontSize) || u.basePx, (40 * u.dpi) / 72);
  const bold = (el.fontWeight ?? 400) >= 600;
  const look = rPr({
    ...ctx.styles.font(el.fontFamily, el.fontWeight ?? 400),
    b: bold,
    color: hex(el.color),
    sz: Math.max(2, Math.round((size * 144) / u.dpi)),
    ...(fill ? { shd: fill, bdr: { color: fill, sz: 4, space: 1 } } : {}),
  });
  const plate = `\u00a0${number}\u00a0`;
  const f = new FragmentBuilder();
  // Marked bold as it is set, so a reading of it finds it unchanged.
  f.push(plate, new Array<number>(plate.length).fill(-1), bold ? 'b' : '');
  f.push(' ', [-1]);
  const xml = textRuns(plate, look) + textRuns(' ', '');
  return ctx.log.wrap(xml, f, { block: blockId(ctx), target: { kind: 'generated' }, range: [0, 0], role: 'number' });
}

/**
 * The head of composed page `page` (template `t`) whose title frame takes
 * `heading`, or undefined when the template draws nothing round it (the
 * heading is then written as usual). `write` writes the heading paragraph
 * with a look.
 */
export function pageOpener(ctx: WriterContext, page: ContentBlock, heading: ContentBlock, write: (look?: HeadingLook) => string): string | undefined {
  const id = page.composedPage?.template ?? page.containerAttrs?.template;
  const t = templateOf(ctx, id);
  const title = t?.frames.find((f) => f.takes === `h${heading.level ?? 1}`)?.name;
  if (!t || !title) return undefined;
  const elements = decoration(t);
  const attrs = page.containerAttrs ?? {};
  let head = '';
  for (const el of elements) {
    if (side(el, title) !== 'above') continue;
    // The plain design keeps what the page's own attributes fill in.
    if (ctx.plain && !fromMarkdown(el.kind === 'image' ? el.resourceId : el.kind === 'text' ? (el.content ?? '') : '')) continue;
    if (el.kind === 'image') {
      const res = designImageId(el.resourceId, attrs);
      if (res) head += picture(ctx, res);
    } else if (el.kind === 'text') {
      const text = textOf(ctx, el, heading, attrs);
      if (!/[\p{L}\p{N}]/u.test(text)) continue;
      const style = ctx.plain ? ctx.styles.custom(`design:page:${t.id}:${el.id}`, `Design page:${t.id} ${el.id}`, () => ({ pPr: { keepNext: true, ind: { firstLine: 0 } } })) : designTextStyle(ctx, `page:${t.id}`, el, undefined, true, text);
      head += paragraph({ style, jc: 'left' }, generatedRuns(ctx, [{ text }], `page:${el.id}`));
    }
  }
  // No band and no badge in the plain design: the heading as usual.
  const fill = ctx.plain ? undefined : titleBand(ctx, t, title, elements);
  if (!head && !fill) return undefined;
  if (!fill) return head + write();
  const badge = badgeOf(elements, title);
  const number = badge ? ctx.chapter.headingNumbers.get(heading) : undefined;
  const look = number && !heading.numberIsTitle ? { noNumber: true, before: () => badgeRuns(ctx, badge!, number) } : {};
  const xml = write({ style: bandTitleStyle(ctx, heading, fill), ...look });
  const u = ctx.units;
  const widthTw = Math.round((ctx.textAreaPx * 1440) / u.dpi);
  const box = { x: 0, y: 0, width: ctx.textAreaPx, height: u.dpi / 2 };
  return head + withBands(ctx, [{ xml, band: { fill, box }, box }], box, widthTw);
}
