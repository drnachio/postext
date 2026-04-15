export const SVG_NS = 'http://www.w3.org/2000/svg';

export function createPageCanvas(displayWidth: number, displayHeight: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  canvas.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)';
  canvas.style.borderRadius = '2px';
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
