import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/** Pages with a Markdown rendition (app/md/[locale]/[[...path]]/route.ts);
 *  a section's OG image is not one of its pages. */
const MARKDOWN_PAGE =
  /^\/(en|es|ca|zh|ja|ar|pt)(\/(docs(\/(?!opengraph-image\/?$)[a-z0-9-]+)?|cookbook(\/(?!opengraph-image\/?$)[a-z0-9-]+)?|license|privacy-policy|cookie-policy|accessibility|glossary|sandbox))?\/?$/;

/** The weight an Accept header gives a media range: the most specific
 *  matching entry wins, and an entry without `q` weighs 1. */
function weight(accept: string, type: string): number {
  const [major] = type.split("/");
  let best = { specificity: -1, q: 0 };
  for (const entry of accept.split(",")) {
    const [range, ...params] = entry.trim().toLowerCase().split(";");
    const specificity = range === type ? 2 : range === `${major}/*` ? 1 : range === "*/*" ? 0 : -1;
    if (specificity <= best.specificity) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    best = { specificity, q: q ? Number(q.slice(2)) || 0 : 1 };
  }
  return best.q;
}

/** Agents that ask for `text/markdown` get the page's Markdown rendition,
 *  unless they weigh HTML higher. Only an explicit `text/markdown` counts:
 *  a browser's `*\/*` must keep getting HTML. */
function wantsMarkdown(req: NextRequest): boolean {
  const accept = req.headers.get("accept") ?? "";
  if (!/\btext\/markdown\b/i.test(accept)) return false;
  const markdown = weight(accept, "text/markdown");
  return markdown > 0 && markdown >= weight(accept, "text/html");
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!MARKDOWN_PAGE.test(pathname)) return intl(req);
  if (wantsMarkdown(req)) {
    const url = req.nextUrl.clone();
    url.pathname = `/md${pathname.replace(/\/$/, "")}`;
    return NextResponse.rewrite(url);
  }
  // The same URL answers HTML or Markdown by the Accept header: say so to
  // the caches between, as the Markdown response does.
  const res = intl(req);
  res.headers.append("Vary", "Accept");
  return res;
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|md/|icon|apple-icon|.*\\..*).*)",
};
