import { routing } from "@/i18n/routing";
import { llmsFullTxt } from "@/lib/markdown";
import { textResponse } from "@/lib/textResponse";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ locale: string }> }) {
  const { locale } = await ctx.params;
  return textResponse(llmsFullTxt(locale), "text/plain");
}
