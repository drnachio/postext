import { DEFAULT_TEXT_ELEMENT } from 'postext';
import type { Dimension, DesignTextElement } from 'postext';

/** The size of the fore-edge heads: 80 % of the body size, in its unit
 *  (rounded to a hundredth). */
export function foreEdgeFontSize(bodySize: Dimension): Dimension {
  return { value: Math.round(bodySize.value * 80) / 100, unit: bodySize.unit };
}

/** The fore-edge heads of a vertical book: the chapter title down the
 *  outer margin four characters below the head of the type area, the
 *  folio five above its foot, at 80 % of the body size (JLREQ §2.6; the
 *  Taiwan and mainland rules for vertical books). Ids are the first
 *  `textN` free in `used`. */
export function foreEdgeElements(used: ReadonlySet<string>, bodySize: Dimension): [DesignTextElement, DesignTextElement] {
  const ids = new Set(used);
  const nextId = (): string => {
    let i = 1;
    while (ids.has(`text${i}`)) i++;
    ids.add(`text${i}`);
    return `text${i}`;
  };
  const fontSize = foreEdgeFontSize(bodySize);
  const head: DesignTextElement = {
    ...DEFAULT_TEXT_ELEMENT,
    id: nextId(),
    content: '{chapterTitle}',
    writingMode: 'vertical-rl',
    fontSize,
    overflow: 'clip',
    align: 'left',
    placement: { anchor: { to: 'outer', edge: 'top' }, offset: { x: { value: 0, unit: 'pt' }, y: { value: 4, unit: 'em' } }, size: { width: 'auto', height: 'auto' } },
  };
  const folio: DesignTextElement = {
    ...DEFAULT_TEXT_ELEMENT,
    id: nextId(),
    content: '{pageNumber}',
    writingMode: 'vertical-rl',
    fontSize,
    overflow: 'clip',
    align: 'left',
    placement: { anchor: { to: 'outer', edge: 'bottom' }, offset: { x: { value: 0, unit: 'pt' }, y: { value: -5, unit: 'em' } }, size: { width: 'auto', height: 'auto' } },
  };
  return [head, folio];
}
