import fs from "node:fs";
import path from "node:path";
import { contentTypeFor, extensionOf, resolvePresetFile } from "@/lib/privatePresets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path: string[] }> };

const NOT_FOUND_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function notFound(withBody: boolean): Response {
  return new Response(withBody ? "Not found" : null, { status: 404, headers: NOT_FOUND_HEADERS });
}

async function isInsideRoot(root: string, file: string): Promise<boolean> {
  try {
    const [realRoot, realFile] = await Promise.all([
      fs.promises.realpath(root),
      fs.promises.realpath(file),
    ]);
    return realFile.startsWith(realRoot + path.sep);
  } catch {
    return false;
  }
}

async function locate(segments: string[] | undefined): Promise<string | null> {
  // Read at request time so production (variable unset) is always a 404.
  const root = process.env.POSTEXT_PRIVATE_PRESETS_DIR?.trim();
  if (!root || !Array.isArray(segments)) return null;

  const resolved = resolvePresetFile(root, segments);
  if (!resolved) return null;
  if (!(await isInsideRoot(root, resolved))) return null;

  try {
    const stat = await fs.promises.stat(resolved);
    if (!stat.isFile()) return null;
  } catch {
    return null;
  }
  return resolved;
}

function headersFor(file: string, size?: number): Headers {
  const headers = new Headers({
    "Content-Type": contentTypeFor(extensionOf(path.basename(file))),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (size !== undefined) headers.set("Content-Length", String(size));
  return headers;
}

export async function GET(_request: Request, ctx: RouteContext): Promise<Response> {
  const { path: segments } = await ctx.params;
  const file = await locate(segments);
  if (!file) return notFound(true);

  let bytes: Buffer;
  try {
    bytes = await fs.promises.readFile(file);
  } catch {
    return notFound(true);
  }
  return new Response(new Uint8Array(bytes), { status: 200, headers: headersFor(file, bytes.byteLength) });
}

export async function HEAD(_request: Request, ctx: RouteContext): Promise<Response> {
  const { path: segments } = await ctx.params;
  const file = await locate(segments);
  if (!file) return notFound(false);

  let size: number | undefined;
  try {
    size = (await fs.promises.stat(file)).size;
  } catch {
    return notFound(false);
  }
  return new Response(null, { status: 200, headers: headersFor(file, size) });
}
