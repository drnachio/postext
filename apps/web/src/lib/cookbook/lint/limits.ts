// The reports a lint returns, the size limits, the allowed imports, hosts
// and kit calls, and byte formatting (#1276: split out of lint.ts).
import { POSTEXT_URL, POSTEXT_BUNDLE_URL, POSTEXT_PDF_URL, POSTEXT_WORKER_URL, POSTEXT_CITEPROC_URL, POSTEXT_FOLIO_URL, POSTEXT_EPUB_URL, POSTEXT_EPUB_WORKER_URL } from '../detect.ts';
import type { KitBlock } from '../types.ts';

export interface LintReport {
  fails: string[];
  warns: string[];
}

export interface RecipeLintReport extends LintReport {
  slug: string;
}

// ─── Rules ──────────────────────────────────────────────────────────────────

export const LIMITS = {
  /** Recipe code outside the content literals, the kit and `art` regions
   *  (generated artwork is not the technique). Advisory per level; one
   *  hard cap for all. */
  ownLines: 300,
  ownLinesWarn: { 1: 120, 2: 180, 3: 250 } as Record<1 | 2 | 3, number>,
  scriptBytes: 72 * 1024,
  contentWords: 2500,
  prefillBytes: 96 * 1024,
  assetBytes: 400 * 1024,
  assetsBytes: 2 * 1024 * 1024,
  imageLongSide: 2400,
  lineLength: 100,
  /** `#region`s besides `answer`. */
  otherRegions: 6,
  answerLines: [10, 40] as [number, number],
} as const;

/** The only module URLs a pen imports (unpinned: the capture pins them). */
export const ALLOWED_IMPORTS: readonly string[] = [POSTEXT_URL, POSTEXT_BUNDLE_URL, POSTEXT_PDF_URL, POSTEXT_WORKER_URL, POSTEXT_CITEPROC_URL, POSTEXT_FOLIO_URL, POSTEXT_EPUB_URL, POSTEXT_EPUB_WORKER_URL];

/** Hosts (and path prefixes) a pen may fetch from. Nothing else: no hotlinking. */
export const NETWORK_ALLOWLIST: readonly { host: string; path?: string }[] = [
  { host: "esm.sh" },
  { host: "cdn.jsdelivr.net", path: "/npm/@fontsource/" },
  { host: "cdn.jsdelivr.net", path: "/gh/drnachio/postext@main/cookbook/" },
  { host: "api.fontsource.org" },
  { host: "postext.dev" },
];

/** The engine symbol each kit block calls (spec §7.3). */
export const KIT_IMPORTS: Record<KitBlock, { module: "postext" | "postext-pdf"; name: string } | null> = {
  core: null,
  // kitFonts and fontsourceResolver feed the engine's buildDocumentWithFonts
  // (fonts v3, #629), which the recipe imports itself.
  fonts: null,
  viewer: { module: "postext", name: "renderPageToCanvas" },
  pdf: { module: "postext-pdf", name: "decompressWoff2" },
  images: { module: "postext", name: "registerResourceImage" },
  // loadCjkFonts needs no engine symbol; cjkPdfProvider uses the pdf block's.
  cjk: null,
  // Likewise loadArabicFonts and arabicPdfProvider.
  arabic: null,
  // showBook calls the viewer block's showPages.
  book: null,
  // loadComicFonts, comicPdfProvider and comicPanel call the fonts, pdf,
  // cjk, arabic and images blocks (KIT_CALLS).
  comics: null,
};

/** Kit functions that call another block's: the recipe that calls one
 *  lists that block too, or the pen throws a ReferenceError at run time. */
export const KIT_CALLS: Readonly<Record<string, readonly KitBlock[]>> = {
  comicPanel: ["images"],
  comicPdfProvider: ["pdf"],
};

/** Namespace URIs in inline SVG, never fetched. */
export const NAMESPACE_URL = /^https?:\/\/www\.w3\.org\//;

export function isAllowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return NETWORK_ALLOWLIST.some(
    (rule) => parsed.hostname === rule.host && (!rule.path || decodeURI(parsed.pathname).startsWith(rule.path)),
  );
}

export function bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export const thousands = (n: number) => n.toLocaleString("en-US");
