import { routing } from "@/i18n/routing";
import { llmsTxt } from "@/lib/markdown";
import { textResponse } from "@/lib/textResponse";

export const dynamic = "force-static";

export function GET() {
  return textResponse(llmsTxt(routing.defaultLocale), "text/plain");
}
