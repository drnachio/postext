/**
 * Content warnings of a comic page read from its source (#555–#558): a
 * `split` the grammar cannot read whole, sizes past 100 %, more or fewer
 * panels than cells, stray text, a balloon style no style defines, a panel
 * picture that names no picture, and anchors outside a picture's safe
 * area. The layout adds `comicPanelLetterbox` (see `layoutComicPage`).
 */

import type { Resource, ResolvedComicsConfig } from '../types';
import type { ContentWarning } from '../vdt';
import { anchorsOutsideSafeArea } from './art';
import { comicSplitLeaves } from './split';
import type { ComicPageSource } from './types';

/** The warnings of one comic page; offsets as in `source` (the caller
 *  makes them absolute). */
export function comicSourceWarnings(
  source: ComicPageSource,
  comics: ResolvedComicsConfig,
  resources: ReadonlyMap<string, Resource>,
): ContentWarning[] {
  const out: ContentWarning[] = [];
  const fence = { sourceStart: source.sourceStart, sourceEnd: source.attrsEnd + 1 };
  for (const issue of source.splitParse.issues) {
    const at = { sourceStart: issue.sourceStart, sourceEnd: issue.sourceEnd };
    if (issue.kind === 'overflow') out.push({ kind: 'comicSplitOverflow', total: issue.total ?? 0, ...at });
    else out.push({ kind: 'comicSplitSyntax', message: issue.message, ...at });
  }
  const cells = comicSplitLeaves(source.splitParse.tree).length;
  const flowPanels = source.panels.filter((p) => !p.attrs.inset).length;
  if (source.split !== undefined && flowPanels !== cells && flowPanels > 0) {
    out.push({ kind: 'comicPanelCount', panels: flowPanels, cells, ...fence });
  }
  const styles = new Set(comics.balloonStyles.map((s) => s.id));
  const seenAnchors = new Set<string>();
  for (const panel of source.panels) {
    for (const item of panel.items) {
      if (item.stray) {
        out.push({ kind: 'comicStrayText', text: item.text, sourceStart: item.sourceStart, sourceEnd: item.sourceEnd });
      }
      for (const flag of item.style !== undefined ? [item.style, ...item.styleFlags.filter((f) => f !== item.style)] : item.styleFlags) {
        if (styles.has(flag)) continue;
        out.push({ kind: 'comicUnknownBalloonStyle', style: flag, sourceStart: item.keyStart, sourceEnd: item.attrsEnd ?? item.keyEnd });
      }
    }
    for (const key of ['art', 'pop'] as const) {
      const id = panel.attrs[key]?.trim();
      if (!id) continue;
      const r = resources.get(id);
      const range = panel.attrSources[key] ?? { start: panel.lineStart, end: panel.lineEnd };
      if (!r || !((r.kind === 'bitmap' && r.bitmap) || (r.kind === 'svg' && r.svg))) {
        out.push({ kind: 'comicUnknownArt', resourceId: id, sourceStart: range.start, sourceEnd: range.end });
        continue;
      }
      if (key !== 'art') continue;
      for (const a of anchorsOutsideSafeArea(r.anchors, r.safeArea)) {
        const k = `${id}\u0000${a.id}`;
        if (seenAnchors.has(k)) continue;
        seenAnchors.add(k);
        out.push({ kind: 'comicAnchorOutsideSafeArea', resourceId: id, anchorId: a.id, sourceStart: range.start, sourceEnd: range.end });
      }
    }
  }
  out.push(...unknownSpeakers(source, comics, resources));
  return out;
}

/** Speakers no picture of the page marks and no cast entry names
 *  (`comicUnknownSpeaker`), once per speaker at its first line. Off-panel
 *  speech is legitimate, so a speaker only counts as unknown when it has
 *  an anchor in no picture of the whole page; and pages whose pictures
 *  mark no anchors at all (an author who does not use them) raise none. */
function unknownSpeakers(source: ComicPageSource, comics: ResolvedComicsConfig, resources: ReadonlyMap<string, Resource>): ContentWarning[] {
  const marked = new Set<string>();
  for (const panel of source.panels) {
    for (const key of ['art', 'pop'] as const) {
      const id = panel.attrs[key]?.trim();
      for (const a of (id ? resources.get(id)?.anchors : undefined) ?? []) marked.add(a.id);
    }
  }
  if (marked.size === 0) return [];
  const cast = new Set(comics.cast.map((c) => c.id));
  const seen = new Set<string>();
  const out: ContentWarning[] = [];
  for (const panel of source.panels) {
    for (const item of panel.items) {
      const who = item.role === 'speech' ? item.speaker : undefined;
      if (!who || marked.has(who) || cast.has(who) || seen.has(who)) continue;
      seen.add(who);
      out.push({ kind: 'comicUnknownSpeaker', speaker: who, sourceStart: item.keyStart, sourceEnd: item.keyEnd });
    }
  }
  return out;
}
