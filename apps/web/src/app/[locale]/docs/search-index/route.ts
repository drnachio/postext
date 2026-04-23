import { NextResponse } from "next/server";
import { buildSearchIndex } from "@/lib/docs";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ locale: string }> }) {
  const { locale } = await ctx.params;
  const sections = buildSearchIndex(locale);
  return NextResponse.json({ locale, sections });
}
