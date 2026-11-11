// `Spread` and `MasterSpread` parts.
//
// A spread has a frame of its own whose origin stands on the spine, at
// mid height: a page at the left of the spine has negative x. Each page
// gives its box in a frame of its own (`GeometricBounds`, written top,
// left, bottom, right) and the transform from that frame to the spread's
// (`ItemTransform`). Page items follow the pages, back to front, in the
// spread's frame through their own `ItemTransform`.

import { bool, child, isElement, localName, num, nums, type XmlElement } from '../xml/read.js';
import type { IdmlGuide, IdmlPage, IdmlPageItem, IdmlSpread } from '../model/document.js';
import { apply, matrixOf } from '../model/geometry.js';
import { isPageItem, pageItemOf } from './items.js';
import { marginsOf } from './preferences.js';
import { plainName, refOf } from './props.js';

function pageOf(el: XmlElement): IdmlPage {
  const b = nums(el, 'GeometricBounds');
  const bounds = b && b.length === 4 ? { top: b[0]!, left: b[1]!, bottom: b[2]!, right: b[3]! } : { top: 0, left: 0, bottom: 0, right: 0 };
  const master = refOf(el.attrs.AppliedMaster);
  const page: IdmlPage = {
    self: el.attrs.Self ?? '',
    name: el.attrs.Name ?? '',
    bounds,
    transform: matrixOf(nums(el, 'ItemTransform')),
    masterPageTransform: matrixOf(nums(el, 'MasterPageTransform')),
    margins: marginsOf(child(el, 'MarginPreference')),
    overrideList: (el.attrs.OverrideList ?? '').split(/\s+/).filter(Boolean),
    index: -1,
    side: 'single',
  };
  if (master) page.appliedMaster = master;
  return page;
}

export interface SpreadOptions {
  master: boolean;
  /** The document has facing pages: a page has a side. */
  facing: boolean;
  part?: string;
}

/** The spread of a part (`root` is the part's root element); undefined
 *  when the part holds none. */
export function spreadOf(root: XmlElement, options: SpreadOptions): IdmlSpread | undefined {
  const wanted = options.master ? 'MasterSpread' : 'Spread';
  const el = localName(root.name) === wanted && root.attrs.Self !== undefined ? root : root.children.filter(isElement).find((c) => localName(c.name) === wanted && c.attrs.Self !== undefined);
  if (!el) return undefined;
  const pages: IdmlPage[] = [];
  const items: IdmlPageItem[] = [];
  const guides: IdmlGuide[] = [];
  for (const c of el.children) {
    if (!isElement(c)) continue;
    const name = localName(c.name);
    if (name === 'Page') pages.push(pageOf(c));
    else if (name === 'Guide') guides.push({ orientation: c.attrs.Orientation === 'Vertical' ? 'Vertical' : 'Horizontal', location: num(c, 'Location') ?? 0 });
    else if (isPageItem(c)) items.push(pageItemOf(c));
  }
  const binding = Math.max(0, Math.round(num(el, 'BindingLocation') ?? (options.master ? 1 : 0)));
  if (options.facing) {
    pages.forEach((page, i) => {
      // The spine is x = 0 of the spread; the count of pages before the
      // binding says the same when a page has no readable place.
      const centre = apply(page.transform, { x: (page.bounds.left + page.bounds.right) / 2, y: 0 }).x;
      const width = page.bounds.right - page.bounds.left;
      if (width > 0 && Math.abs(centre) > width / 4) page.side = centre < 0 ? 'left' : 'right';
      else page.side = i < binding ? 'left' : 'right';
    });
  }
  const spread: IdmlSpread = {
    self: el.attrs.Self ?? '',
    master: options.master,
    transform: matrixOf(nums(el, 'ItemTransform')),
    pages,
    items,
    guides,
    hidden: bool(el, 'SpreadHidden') ?? false,
    showMasterItems: bool(el, 'ShowMasterItems') ?? true,
    bindingLocation: binding,
  };
  if (options.master) {
    if (el.attrs.Name) spread.name = el.attrs.Name;
    if (el.attrs.NamePrefix) spread.namePrefix = el.attrs.NamePrefix;
    if (el.attrs.BaseName) spread.baseName = plainName(el.attrs.BaseName);
    // A master based on another says so on its pages.
    const based = pages.map((p) => p.appliedMaster).find((m) => m !== undefined && m !== spread.self);
    if (based) spread.basedOn = based;
  }
  if (options.part) spread.part = options.part;
  return spread;
}
