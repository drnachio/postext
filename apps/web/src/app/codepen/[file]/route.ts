import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { readPenSources } from "@/lib/codepen/codepen";

export const dynamic = "force-static";
export const dynamicParams = false;

const EXAMPLES_DIR = path.join(process.cwd(), "../../docs/examples");

/** One file per docs example, `<name>.json`. */
export function generateStaticParams() {
  return fs
    .readdirSync(EXAMPLES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^[a-z0-9-]+$/.test(d.name))
    .map((d) => ({ file: `${d.name}.json` }));
}

/** A docs example's sources for "Open in CodePen" (`lib/codepen/codepenDefine`),
 *  fetched on demand so a page does not carry them in its payload. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const name = file.replace(/\.json$/, "");
  if (name === file || !/^[a-z0-9-]+$/.test(name)) notFound();
  return Response.json(readPenSources(name));
}
