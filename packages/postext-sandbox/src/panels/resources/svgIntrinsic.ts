// Shared SVG parsing helpers used by the upload paths (single-file uploader and
// the multi-file drop handler). Both validate the SVG source and extract its
// intrinsic size so the layout engine can preserve the figure's aspect ratio
// instead of falling back to a generic box.

/** Parse a length like `140`, `140px`, or `12pt` into pixels; null if unusable
 *  (percentages and other relative units carry no intrinsic size). */
function parseLength(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) return null;
  const num = parseFloat(trimmed);
  if (!Number.isFinite(num) || num <= 0) return null;
  // Approximate CSS absolute units to px (96dpi); good enough for aspect ratio.
  const unit = trimmed.replace(/^[\d.+-]+/, '').toLowerCase();
  const factor = unit === 'pt' ? 96 / 72 : unit === 'pc' ? 16 : unit === 'in' ? 96 : unit === 'cm' ? 96 / 2.54 : unit === 'mm' ? 96 / 25.4 : 1;
  return num * factor;
}

/** Extract an SVG's intrinsic pixel size, preferring explicit `width`/`height`
 *  attributes and falling back to the `viewBox` extent. Returns `undefined`
 *  when no usable size is present (e.g. only percentage sizing) so callers can
 *  omit the dimensions rather than store a misleading aspect ratio. */
export function svgIntrinsicSize(text: string): { width: number; height: number } | undefined {
  const root = parseSvgRoot(text);
  if (!root) return undefined;

  const w = parseLength(root.getAttribute('width'));
  const h = parseLength(root.getAttribute('height'));
  if (w && h) return { width: w, height: h };

  const viewBox = root.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [, , vbW, vbH] = parts;
      if (vbW > 0 && vbH > 0) return { width: vbW, height: vbH };
    }
  }
  return undefined;
}

/** Return the root `<svg>` element of `text`, or null when it does not parse to
 *  a well-formed SVG document. Falls back to a substring check when `DOMParser`
 *  is unavailable (non-browser environments). */
function parseSvgRoot(text: string): Element | null {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return null;
    const root = doc.documentElement;
    return root?.tagName.toLowerCase() === 'svg' ? root : null;
  } catch {
    return null;
  }
}

/** Validate that `text` parses as SVG XML with a root `<svg>` element. */
export function isValidSvg(text: string): boolean {
  if (typeof DOMParser === 'undefined') return text.includes('<svg');
  return parseSvgRoot(text) !== null;
}
