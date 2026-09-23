import { routing } from "@/i18n/routing";
import { llmsFullTxt } from "@/lib/markdown";
import { textResponse } from "@/lib/textResponse";

export const dynamic = "force-static";

export function GET() {
  return textResponse(llmsFullTxt(routing.defaultLocale), "text/plain");
}
