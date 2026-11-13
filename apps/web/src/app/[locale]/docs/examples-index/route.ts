import { NextResponse } from "next/server";
import { buildDocExamples } from "@/lib/cookbook/docExamplesIndex";
import { routing } from "@/i18n/routing";
import { siteLocale } from "@/i18n/locales";

/** The docs ↔ Cookbook index of a locale (#1589), as the docs pages use it:
 *  per page, the recipes of each section and the closing list. Static,
 *  like the docs search index. */
export const dynamic = "force-static";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ locale: string }> }) {
  const { locale } = await ctx.params;
  return NextResponse.json(buildDocExamples(siteLocale(locale)));
}
