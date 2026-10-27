export const SVG_NS = 'http://www.w3.org/2000/svg';

const PAGE_SHADOW = '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)';
const PAGE_RADIUS = '2px';
/** Room the clip leaves around the shadow on the sides that keep it. */
const SHADOW_ROOM = '24px';

/** Which page of a pair a canvas is: the one on the left of the joint, the
 *  one on the right, or a page on its own. */
export type PairSide = 'left' | 'right' | 'alone';

/** Draw a canvas as one of two pages that touch (`canvasViewer.pageGap` 0):
 *  the edge at the joint keeps no shadow and no rounded corners, so a picture
 *  across the spread shows no seam; the other edges keep both. `'alone'`
 *  gives the page back its shadow and corners all round. */
export function setPairSide(canvas: HTMLCanvasElement, side: PairSide): void {
  if (side === 'alone') {
    canvas.style.borderRadius = PAGE_RADIUS;
    canvas.style.clipPath = '';
    return;
  }
  const room = SHADOW_ROOM;
  // inset(top right bottom left): a negative inset leaves the shadow room.
  canvas.style.clipPath = side === 'left'
    ? `inset(-${room} 0 -${room} -${room})`
    : `inset(-${room} -${room} -${room} 0)`;
  canvas.style.borderRadius = side === 'left' ? `${PAGE_RADIUS} 0 0 ${PAGE_RADIUS}` : `0 ${PAGE_RADIUS} ${PAGE_RADIUS} 0`;
}

export function createPageCanvas(displayWidth: number, displayHeight: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  canvas.style.boxShadow = PAGE_SHADOW;
  canvas.style.borderRadius = PAGE_RADIUS;
  canvas.style.backgroundColor = '#ffffff';
  return canvas;
}

export function createOverlaySvg(
  displayWidth: number,
  displayHeight: number,
  pageWidthPx: number,
  pageHeightPx: number,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${pageWidthPx} ${pageHeightPx}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = `${displayWidth}px`;
  svg.style.height = `${displayHeight}px`;
  svg.style.pointerEvents = 'none';
  svg.style.mixBlendMode = 'multiply';

  // Persistent groups: selection is redrawn each update; cursor is animated
  // via CSS and updated in place so the blink animation stays in sync.
  // Baselines sit below the loose-line highlight so the highlight remains
  // readable when both are visible — HTML viewer only; the canvas backend
  // paints its own baseline grid onto the canvas bitmap.
  const baselineGroup = document.createElementNS(SVG_NS, 'g');
  baselineGroup.dataset.role = 'baselines';
  svg.appendChild(baselineGroup);

  const looseLineGroup = document.createElementNS(SVG_NS, 'g');
  looseLineGroup.dataset.role = 'looseLines';
  svg.appendChild(looseLineGroup);

  const selectionGroup = document.createElementNS(SVG_NS, 'g');
  selectionGroup.dataset.role = 'selection';
  svg.appendChild(selectionGroup);

  const cursorGroup = document.createElementNS(SVG_NS, 'g');
  cursorGroup.dataset.role = 'cursor';
  cursorGroup.setAttribute('class', 'cursor-blink');
  const cursorRect = document.createElementNS(SVG_NS, 'rect');
  cursorRect.style.display = 'none';
  cursorGroup.appendChild(cursorRect);
  svg.appendChild(cursorGroup);

  return svg;
}
