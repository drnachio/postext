import { routing } from "@/i18n/routing";
import { buildCatalogWire } from "@/lib/cookbook/catalog";
import type { Locale } from "@/lib/cookbook/types";

// The gallery's search and facets, fetched on demand, in the wire form
// (lib/cookbook/wire.ts). Static per locale; the dotted segment skips the
// locale proxy (like llms.txt).
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ locale: string }> }) {
  const { locale } = await ctx.params;
  return Response.json(buildCatalogWire(locale as Locale));
}
