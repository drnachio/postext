import { routing } from "@/i18n/routing";
import { markdownPaths, pageMarkdown } from "@/lib/markdown";
import { textResponse } from "@/lib/textResponse";

/**
 * Markdown rendition of a page. Reached through the `<page>.md` rewrites in
 * next.config.ts and the `Accept: text/markdown` negotiation in proxy.ts.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    markdownPaths(locale).map((path) => ({
      locale,
      path: path ? path.slice(1).split("/") : [],
    }))
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ locale: string; path?: string[] }> }
) {
  const { locale, path } = await ctx.params;
  return textResponse(pageMarkdown(locale, (path ?? []).join("/")), "text/markdown");
}
