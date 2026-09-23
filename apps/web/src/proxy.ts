import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/** Pages with a Markdown rendition (app/md/[locale]/[[...path]]/route.ts). */
const MARKDOWN_PAGE = /^\/(en|es)(\/(docs(\/[a-z0-9-]+)?|license|privacy-policy|cookie-policy))?\/?$/;

/** Agents that ask for `text/markdown` get the page's Markdown rendition. */
function wantsMarkdown(req: NextRequest): boolean {
  const accept = req.headers.get("accept") ?? "";
  return /\btext\/markdown\b/i.test(accept);
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (wantsMarkdown(req) && MARKDOWN_PAGE.test(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = `/md${pathname.replace(/\/$/, "")}`;
    return NextResponse.rewrite(url);
  }
  return intl(req);
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|md/|icon|apple-icon|.*\\..*).*)",
};
