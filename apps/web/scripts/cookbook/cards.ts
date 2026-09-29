/**
 * What the capture publishes of a document: which pages (and how they pair
 * into spreads), which page the card shows, and the generated alt text.
 * The card itself is composed in the page (lib/probe.js `composeCard`):
 *
 *   spread      the hero pair at 80 % of the stage, optical centre at 46 %,
 *               a spine shade at the gutter, the shadow baked into the alpha
 *   page        the hero page at 86 %
 *   loupe       the hero page in the left 42 %, `focus` magnified in a
 *               0.52-wide frame with gilt crop marks and a leader
 *   crop        `focus` filling 90 %, with crop marks
 *   screenshot  the DOM (`capture.selector`) at DPR 2, a top-centred 4:3 crop
 *
 * Focus rectangles are fractions of the trim box, so a recipe with cut
 * lines (page images include bleed and marks, H8) frames the same area.
 *
 * Run by Node's type stripping: erasable TypeScript, relative `.ts` imports.
 */
import type { Locale, RecipeMeta } from "../../src/lib/cookbook/types.ts";
import type { ProbePage } from "./checks.ts";

/** At most this many page images per edition (C20). */
export const MAX_PUBLISHED = 12;

export function heroPages(meta: RecipeMeta): number[] {
  const hero = meta.capture.hero;
  return Array.isArray(hero) ? [...hero] : [hero];
}

/** The pages the light table shows: `capture.pages`, else every page up
 *  to 8, else the hero pages and the first six. */
export function publishedPages(meta: RecipeMeta, all: number[]): { list: number[]; error: string | null } {
  const exists = new Set(all);
  const wanted = meta.capture.pages;
  let list: number[];
  if (wanted === "all") list = [...all];
  else if (Array.isArray(wanted)) list = [...new Set(wanted)].sort((a, b) => a - b);
  else if (all.length <= 8) list = [...all];
  else list = [...new Set([...all.slice(0, 6), ...heroPages(meta)])].filter((n) => exists.has(n)).sort((a, b) => a - b);
  const missing = list.filter((n) => !exists.has(n));
  if (missing.length) return { list: list.filter((n) => exists.has(n)), error: `capture.pages names missing page(s) ${missing.join(", ")} (${all.length} pages)` };
  if (list.length > MAX_PUBLISHED) {
    return { list: list.slice(0, MAX_PUBLISHED), error: `${list.length} pages published, more than ${MAX_PUBLISHED}: set capture.pages` };
  }
  return { list, error: null };
}

/** Problems that keep the card from being composed. `bookOf` maps a page
 *  (`n`) to its book page number, whose parity decides versos and rectos. */
export function cardProblems(meta: RecipeMeta, all: number[], bookOf: Map<number, number> = new Map()): string[] {
  const exists = new Set(all);
  const problems: string[] = [];
  const hero = heroPages(meta);
  for (const n of hero) {
    if (!exists.has(n)) problems.push(`capture.hero names page ${n}, but the document has ${all.length} pages`);
  }
  if (hero.length === 2) {
    const book = bookOf.get(hero[0]) ?? hero[0];
    if (book % 2 !== 0) {
      problems.push(`capture.hero [${hero.join(", ")}] is not a spread: page ${hero[0]} is book page ${book}, a recto (a spread starts on an even book page)`);
    }
  }
  const { card, focus } = meta.capture;
  if (card === "loupe" || card === "crop") {
    if (!focus) problems.push(`capture.card "${card}" needs capture.focus`);
    else {
      if (!exists.has(focus.page)) problems.push(`capture.focus names page ${focus.page}, which does not exist`);
      const inside = (v: number) => v >= 0 && v <= 1;
      if (![focus.x, focus.y, focus.w, focus.h].every(inside) || focus.w <= 0 || focus.h <= 0
        || focus.x + focus.w > 1.0001 || focus.y + focus.h > 1.0001) {
        problems.push("capture.focus must be fractions of the page (x + w ≤ 1, y + h ≤ 1)");
      }
    }
  }
  return problems;
}

/** Facing pairs as indexes into `list` (page numbers counted from 1 at the
 *  build's first page, whose book page number is `first`). The recto rule:
 *  an even book page is a verso and pairs with the next page when both are
 *  published; book page 1 stands alone. Pairs are [verso, recto] whichever
 *  edge the book is bound on: {@link sidesOf} lays them out. */
export function spreadsOf(list: number[], first = 1): [number | null, number | null][] {
  const spreads: [number | null, number | null][] = [];
  let verso: number | null = null;
  list.forEach((n, i) => {
    if ((n + first - 1) % 2 === 0) {
      if (verso !== null) spreads.push([verso, null]);
      verso = i;
    } else {
      const pairs = verso !== null && list[verso] === n - 1;
      if (verso !== null && !pairs) spreads.push([verso, null]);
      spreads.push([pairs ? verso : null, i]);
      verso = null;
    }
  });
  if (verso !== null) spreads.push([verso, null]);
  return spreads;
}

/** A [verso, recto] pair as it lies open, left page first: a right-bound
 *  book (vertical Chinese, `page.binding: 'right'`) has its recto on the
 *  left of the spine, so page 1 stands on the left and pairs read [3 | 2]. */
export function sidesOf<T>(pair: readonly [T, T], binding: "left" | "right" | undefined): [T, T] {
  return binding === "right" ? [pair[1], pair[0]] : [pair[0], pair[1]];
}

const ROLE_WORDS: Record<Locale, Record<ProbePage["role"], string>> = {
  en: { body: "Page", opener: "Opening page", part: "Part title page", blank: "Blank page" },
  es: { body: "Página", opener: "Página de apertura", part: "Portadilla de parte", blank: "Página en blanco" },
};

/** Role and folio, the page's first heading, then its figure captions, in
 *  the sample's language. */
export function altText(page: ProbePage, lang: Locale): string {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  let text = `${ROLE_WORDS[lang][page.role] ?? ROLE_WORDS[lang].body} ${page.label || page.n}`;
  const heading = clean(page.heading ?? "");
  if (heading) text += `: ${heading}`;
  const captions = (page.captions ?? []).map(clean).filter(Boolean);
  if (captions.length) text += `. ${captions.join(" · ")}`;
  text = text.replace(/[.:]$/, "");
  return text.length > 280 ? `${text.slice(0, 277).trimEnd()}…` : `${text}.`;
}
