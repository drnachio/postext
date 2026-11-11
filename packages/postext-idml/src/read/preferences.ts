// `Resources/Preferences.xml`: the document's set-up (page size, facing
// pages, binding, bleed and slug, the default margins, the baseline grid)
// and, kept as written, every other preference the part holds.

import { bool, isElement, localName, num, nums, type XmlElement } from '../xml/read.js';
import type { IdmlDocumentPreferences, IdmlMargins, Props } from '../model/document.js';
import { propsOf } from './props.js';

/** A `<MarginPreference>`: of the document's defaults or of one page. */
export function marginsOf(el: XmlElement | undefined): IdmlMargins {
  return {
    top: num(el, 'Top') ?? 0,
    bottom: num(el, 'Bottom') ?? 0,
    left: num(el, 'Left') ?? 0,
    right: num(el, 'Right') ?? 0,
    columnCount: Math.max(1, Math.round(num(el, 'ColumnCount') ?? 1)),
    columnGutter: num(el, 'ColumnGutter') ?? 0,
    columnsPositions: nums(el, 'ColumnsPositions') ?? [],
    columnDirection: el?.attrs.ColumnDirection === 'Vertical' ? 'Vertical' : 'Horizontal',
  };
}

/** What the reader assumes of a package without a preferences part: US
 *  Letter, single pages. */
export function defaultPreferences(): IdmlDocumentPreferences {
  return {
    pageWidth: 612,
    pageHeight: 792,
    facingPages: false,
    rightToLeft: false,
    bleed: { top: 0, bottom: 0, inside: 0, outside: 0 },
    slug: { top: 0, bottom: 0, inside: 0, outside: 0 },
    startPageNumber: 1,
    columnDirection: 'Horizontal',
    baselineGrid: { start: 0, division: 12, relativeTo: 'TopOfPageOfBaselineGridRelativeOption', shown: false },
  };
}

export function preferencesOf(root: XmlElement): IdmlDocumentPreferences {
  const all: Record<string, Props> = {};
  const first: Record<string, XmlElement> = {};
  for (const c of root.children) {
    if (!isElement(c)) continue;
    const name = localName(c.name);
    if (name in first) continue;
    first[name] = c;
    all[name] = propsOf(c);
  }
  const d = first.DocumentPreference;
  const g = first.GridPreference;
  const out = defaultPreferences();
  if (d) {
    out.pageWidth = num(d, 'PageWidth') ?? out.pageWidth;
    out.pageHeight = num(d, 'PageHeight') ?? out.pageHeight;
    out.facingPages = bool(d, 'FacingPages') ?? false;
    out.rightToLeft = d.attrs.PageBinding === 'RightToLeft';
    out.bleed = { top: num(d, 'DocumentBleedTopOffset') ?? 0, bottom: num(d, 'DocumentBleedBottomOffset') ?? 0, inside: num(d, 'DocumentBleedInsideOrLeftOffset') ?? 0, outside: num(d, 'DocumentBleedOutsideOrRightOffset') ?? 0 };
    out.slug = { top: num(d, 'SlugTopOffset') ?? 0, bottom: num(d, 'SlugBottomOffset') ?? 0, inside: num(d, 'SlugInsideOrLeftOffset') ?? 0, outside: num(d, 'SlugRightOrOutsideOffset') ?? 0 };
    if (d.attrs.Intent) out.intent = d.attrs.Intent;
    out.startPageNumber = num(d, 'StartPageNumber') ?? 1;
    out.columnDirection = d.attrs.ColumnDirection === 'Vertical' ? 'Vertical' : 'Horizontal';
  }
  if (g) {
    out.baselineGrid = {
      start: num(g, 'BaselineStart') ?? 0,
      division: num(g, 'BaselineDivision') ?? 12,
      relativeTo: g.attrs.BaselineGridRelativeOption ?? out.baselineGrid.relativeTo,
      shown: bool(g, 'BaselineGridShown') ?? false,
    };
  }
  if (first.MarginPreference) out.margins = marginsOf(first.MarginPreference);
  out.all = all;
  return out;
}
