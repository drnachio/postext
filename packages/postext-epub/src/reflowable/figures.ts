// A figure's picture in the reflowable book: its alternative text, the
// author's crop of it (`Resource.crop`), and a music example's systems.
import { type ResolvedCaptionStyleConfig, type ResolvedConfig, type Resource, type VDTResourceTableCell, type VDTResourceTableCellImage, resourceCrop, sameConfig } from 'postext';
import type { FigureNode, TableCellNode } from './model.js';
import { idOf, xmlAttr } from './inline.js';

/** The caption style of a resource type that sets its own (#1550), when
 *  it looks other than the document's. The side its captions stand on
 *  is left out of the comparison (the markup says it, `pt-caption-below`),
 *  and so are the label's words (the engine wrote them into the caption). */
export function ownCaptionStyle(config: ResolvedConfig, typeId: string): ResolvedCaptionStyleConfig | undefined {
  const own = config.resourceTypeCaptionStyles?.[typeId];
  const look = (c: ResolvedCaptionStyleConfig) => ({ ...c, position: '', labelNumberGap: '', labelSeparator: '' });
  return own && !sameConfig(look(own), look(config.captionStyle)) ? own : undefined;
}

/** Where a resource's caption stands and the class of its figure or
 *  table's box, `pt-type-<id>`, when its type sets its caption apart
 *  (#1550): the stylesheet's rules for that type hang on it. */
export function typeCaption(config: ResolvedConfig, typeId: string): { above: boolean; cls?: string } {
  const above = (config.resourceTypeCaptionStyles?.[typeId] ?? config.captionStyle).position === 'above';
  return ownCaptionStyle(config, typeId) ? { above, cls: idOf('pt-type-', typeId) } : { above };
}

/** A resource caption as plain text (its Markdown marks dropped). */
export function plainCaption(caption: string | undefined): string {
  return dropDirectives(dropDirectives((caption ?? '').replace(/[*_`~^]/g, ''), true), false).trim();
}

/** `text` with every inline directive `:name[label]{attrs}` set as its
 *  label (`labelled`), or every `:name{attrs}` dropped: what a global
 *  replace of `/:\w+\[([^\]]*)\]\{[^}]*\}/` by `$1` (or of `/:\w+\{[^}]*\}/` by
 *  nothing) gives, in one scan. The regex reads from every colon to the
 *  next `]` or `}`, quadratic on a long caption with none; here the next
 *  `]` and `}` are found once and shared by the colons before them. */
function dropDirectives(text: string, labelled: boolean): string {
  const memo = new Map<string, { from: number; at: number }>();
  // The first `ch` at or after `from` (-1: none).
  const next = (ch: string, from: number): number => {
    const m = memo.get(ch);
    if (m && m.from <= from && (m.at < 0 || m.at >= from)) return m.at;
    const at = text.indexOf(ch, from);
    memo.set(ch, { from, at });
    return at;
  };
  const isWord = (c: number): boolean => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
  let out = '';
  let last = 0;
  for (let p = text.indexOf(':'); p >= 0; ) {
    let j = p + 1;
    while (j < text.length && isWord(text.charCodeAt(j))) j++;
    let end = -1;
    let keep = '';
    if (j > p + 1 && labelled && text[j] === '[') {
      const r = next(']', j + 1);
      // No `]` (or `}`) left: no later colon opens a directive either.
      if (r < 0) break;
      if (text[r + 1] === '{') {
        const b = next('}', r + 2);
        if (b < 0) break;
        end = b + 1;
        keep = text.slice(j + 1, r);
      }
    } else if (j > p + 1 && !labelled && text[j] === '{') {
      const b = next('}', j + 1);
      if (b < 0) break;
      end = b + 1;
    }
    if (end < 0) {
      p = text.indexOf(':', p + 1);
      continue;
    }
    out += text.slice(last, p) + keep;
    last = end;
    p = text.indexOf(':', end);
  }
  return out + text.slice(last);
}

/** A picture's crop for its figure node (see `FigureNode.crop`), when it
 *  has one and its size is known. */
export function cropOf(res: Resource): { crop?: FigureNode['crop'] } {
  const crop = resourceCrop(res);
  const size = res.bitmap ?? res.svg ?? res.video?.poster;
  if (!crop || !size?.width || !size.height) return {};
  return { crop: { ...crop, ratio: size.height / size.width } };
}

/** A table cell's picture for its cell node: its share of the cell's
 *  width and the author's crop of it (`VDTResourceTableCellImage.crop`),
 *  the whole picture's ratio read back from the rect the crop fills. */
export function cellImageOf(cell: VDTResourceTableCell, image: VDTResourceTableCellImage, alt: string): NonNullable<TableCellNode['image']> {
  const c = image.crop;
  const crop = c && c.width > 0 && c.height > 0 && image.rect.width > 0
    ? { ...c, ratio: (image.rect.height / c.height) / (image.rect.width / c.width) }
    : undefined;
  return {
    fileId: image.fileId,
    alt,
    ...(cell.rect.width > 0 ? { width: Math.min(1, image.rect.width / cell.rect.width) } : {}),
    ...(crop ? { crop } : {}),
  };
}

/** A table cell's picture (`TableCellNode.image`) at `src` (none: a
 *  missing file): at its share of the cell's width, cropped as the author
 *  cropped it (`Resource.crop`). */
export function cellImageXhtml(src: string | undefined, image: NonNullable<TableCellNode['image']>): string {
  if (!src) return `<span class="pt-missing" role="img" aria-label="${xmlAttr(image.alt || '?')}"></span>`;
  const share = image.width !== undefined && image.width < 1 ? image.width : undefined;
  const attrs = `src="${xmlAttr(src)}" alt="${xmlAttr(image.alt)}"`;
  if (image.crop) return croppedImg(attrs, image.crop, share ?? 1);
  return `<img ${attrs}${share !== undefined ? ` style="width:${Math.round(share * 100)}%"` : ''}/>`;
}

/** Number for a style declaration: four decimals at most. */
const pct = (n: number): string => `${Number(n.toFixed(4))}%`;

/**
 * An `<img>` with `attrs`, showing only the author's crop of the picture
 * (`FigureNode.crop`): a box at the crop's ratio (its height set as a
 * share of its width, which every reading system lays out), and the
 * picture inside it at the size and offset that bring the crop into it.
 * Without a crop, the plain image. `share`: the box's width, a share of
 * its container's (a cell image narrower than its cell).
 */
export function croppedImg(attrs: string, crop: FigureNode['crop'], share = 1): string {
  if (!crop) return `<img ${attrs}/>`;
  return `<span class="pt-crop" style="${cropBoxStyle(crop, share)}"><img ${attrs} style="${cropInnerStyle(crop)}"/></span>`;
}

/** A `<video>` (its attributes and fallback content) cropped as
 *  {@link croppedImg} crops a picture: a video's crop is its poster's, and
 *  the film plays in the same frame. */
export function croppedVideo(attrs: string, content: string, crop: FigureNode['crop']): string {
  if (!crop) return `<video ${attrs}>${content}</video>`;
  return `<span class="pt-crop" style="${cropBoxStyle(crop, 1)}"><video ${attrs} style="${cropInnerStyle(crop)}">${content}</video></span>`;
}

function cropBoxStyle(crop: NonNullable<FigureNode['crop']>, share: number): string {
  return `display:block;position:relative;overflow:hidden;width:${pct(share * 100)};height:0;padding-top:${pct((crop.height * crop.ratio / crop.width) * share * 100)}`;
}

function cropInnerStyle(crop: NonNullable<FigureNode['crop']>): string {
  return `position:absolute;max-width:none;height:auto;width:${pct(100 / crop.width)};left:${pct(-crop.x / crop.width * 100)};top:${pct(-crop.y / crop.height * 100)}`;
}

/** A score system's SVG as the column's width (#1172): its own size goes,
 *  its view box keeps the proportions; hidden from assistive technology,
 *  the score's box being named. */
export function scoreSystemSvg(svg: string): string {
  return svg.replace(/<svg\b([^>]*?) width="[^"]*" height="[^"]*"/, '<svg$1 width="100%" aria-hidden="true" class="pt-score-system"');
}
