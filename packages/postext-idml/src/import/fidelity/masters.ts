// Running heads and folios of a flowing book: what the masters draw.
//
// A flowing book has no page of its own to hang a master on: its running
// heads are design elements told apart by the side of the page (parity)
// and by the page's role. So the main master (the one most pages apply)
// gives the heads and feet of the body pages, by side; and when the
// pages where chapters open apply another master (an opener master, or
// none), that one gives the elements of the opener pages and the main
// master's are kept off them. Pages of any other master that draws
// something else cannot be told apart, and are named in the report.
//
// (Composed pages need none of this: each page template carries the
// items of its own page's masters.)

import type { DesignElement, PostextConfig } from 'postext';
import type { IdmlPage } from '../../model/document.js';
import { boxHeight, boxWidth } from '../../model/geometry.js';
import { pageSize } from '../../resolve/geometry.js';
import { masterItems } from '../../resolve/masters.js';
import type { OrderedStory } from '../../resolve/order.js';
import type { Context } from '../context.js';
import { masterElements, type MasterWords } from '../design.js';
import { ownText } from '../looks.js';
import { allPages, mainMaster, parityOf } from '../pagesetup.js';
import { threadCodes } from './keptThread.js';

/** The pages a level-1 heading stands on: where chapters open. A story's
 *  frames are taken to hold shares of its text proportional to their
 *  area. */
export function openerPages(ctx: Context, stories: readonly OrderedStory[]): Set<number> {
  const out = new Set<number>();
  for (const e of stories) {
    const frames = e.frames.filter((f) => f.box && f.pageIndex >= 0);
    if (!frames.length) continue;
    const heads: number[] = [];
    let total = 0;
    for (const p of e.story.paragraphs) {
      const look = ctx.looks.of(p);
      if (look.role === 'heading' && (look.level ?? 1) === 1 && ownText(p).trim()) heads.push(total);
      total += ownText(p).length + 1;
    }
    if (!heads.length) continue;
    const area = frames.reduce((a, f) => a + boxWidth(f.box!) * boxHeight(f.box!), 0);
    for (const at of heads) {
      let acc = 0;
      let page = frames[frames.length - 1]!.pageIndex;
      for (const f of frames) {
        acc += area > 0 ? ((boxWidth(f.box!) * boxHeight(f.box!)) / area) * total : total;
        if (at < acc) {
          page = f.pageIndex;
          break;
        }
      }
      out.add(page);
    }
  }
  return out;
}

const side = (page: IdmlPage): string => (page.side === 'left' ? 'l' : page.side === 'right' ? 'r' : '');

export function runningHeads(ctx: Context, words: MasterWords, stories: readonly OrderedStory[]): Pick<PostextConfig, 'header' | 'footer'> {
  const main = mainMaster(ctx);
  const header: DesignElement[] = [];
  const footer: DesignElement[] = [];
  const out = { header: { elements: header }, footer: { elements: footer } };
  if (!main || !ctx.opt.masterItems) return out;
  const pages = allPages(ctx);
  const shown = (page: IdmlPage): string => masterItems(ctx.doc, page).map((mi) => mi.item.self).join(' ');
  const nameOf = (key: string): string => (key ? (ctx.doc.masterSpreads.find((m) => m.self === key)?.name ?? key) : 'no master');

  // What the main master shows on each side.
  const mainShows = new Map<string, string>();
  const mainPages: IdmlPage[] = [];
  for (const p of pages) {
    if (p.appliedMaster !== main.self || mainShows.has(p.side)) continue;
    mainShows.set(p.side, shown(p));
    mainPages.push(p);
  }
  // The other masters whose pages show something else.
  const others = new Map<string, IdmlPage[]>();
  for (const p of pages) {
    const key = p.appliedMaster ?? '';
    if (key === main.self || shown(p) === (mainShows.get(p.side) ?? '')) continue;
    others.set(key, [...(others.get(key) ?? []), p]);
  }
  // The one the chapter openers apply.
  const openers = openerPages(ctx, stories);
  let opener: string | undefined;
  let most = 0;
  for (const [key, list] of others) {
    const on = list.filter((p) => openers.has(p.index)).length;
    if (on > most && on >= list.length * 0.6) {
      most = on;
      opener = key;
    }
  }
  // Else, in a book Postext exported (its thread says so), the master it
  // named for chapter openers (#1585): its pages are the openers,
  // whatever their headings read as.
  const postext = opener === undefined && stories.some((e) => e.frames.some((f) => threadCodes(f.item) !== undefined));
  const named = postext ? [...others.keys()].filter((k) => k && ctx.doc.masterSpreads.find((m) => m.self === k)?.baseName === 'Opener') : [];
  if (named.length === 1) {
    opener = named[0]!;
    for (const p of others.get(opener)!) openers.add(p.index);
  }

  const draw = (page: IdmlPage, prefix: string, role: 'body' | 'opener' | undefined): void => {
    const parity = parityOf(ctx, page);
    const height = pageSize(page).height;
    masterItems(ctx.doc, page).forEach((mi, n) => {
      const els = masterElements(ctx, mi.item, { toPage: mi.toPage, id: `${prefix}${side(page)}${n + 1}`, ...(parity ? { parity } : {}), words, where: `master ${mi.master.name ?? ''}` });
      if (role) for (const el of els) (el as { pages?: string }).pages = role;
      const mid = mi.box ? (mi.box.top + mi.box.bottom) / 2 : 0;
      (mid > height / 2 ? footer : header).push(...els);
    });
  };
  for (const p of mainPages) draw(p, 'm', opener !== undefined ? 'body' : undefined);
  if (opener !== undefined) {
    const seen = new Set<string>();
    for (const p of others.get(opener)!) {
      if (seen.has(p.side) || !openers.has(p.index)) continue;
      seen.add(p.side);
      draw(p, 'o', 'opener');
    }
    ctx.rep.add('openerMaster', 'info', 'The pages where chapters open apply a master of their own: what it draws is set on the book\'s chapter openers, and the main master\'s running heads are kept off them', `${nameOf(opener)}: ${others.get(opener)!.map((p) => p.name).slice(0, 6).join(', ')}`);
  }
  for (const [key, list] of others) {
    if (key === opener) continue;
    ctx.rep.add('otherMasters', 'warning', 'In a flowing book the body pages take the running heads and artwork of the main master: pages that apply another master, or none, and show something else in InDesign are not told apart and print the main master\'s (layout: "pages" keeps each page\'s own)', `${nameOf(key)}: page ${list.map((p) => p.name).slice(0, 6).join(', ')}`, list.length);
  }
  return out;
}
