import path from "node:path";

/** File extensions a private preset bundle may expose. Anything else is refused. */
export const PRIVATE_PRESET_EXTENSIONS = [
  "json",
  "md",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "otf",
  "ttf",
  "woff2",
] as const;

const EXTENSION_SET: ReadonlySet<string> = new Set(PRIVATE_PRESET_EXTENSIONS);

const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]*$/;

const CONTENT_TYPES: Record<string, string> = {
  json: "application/json",
  md: "text/markdown",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  otf: "font/otf",
  ttf: "font/ttf",
  woff2: "font/woff2",
};

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function isSafeSegment(segment: string): boolean {
  if (segment.length === 0) return false;
  if (segment === "." || segment === "..") return false;
  if (segment.startsWith(".")) return false;
  if (segment.includes("/") || segment.includes("\\") || segment.includes("\0")) return false;
  return SEGMENT_PATTERN.test(segment);
}

/** Lower-cased extension of a file name (without the dot), or "" when there is none. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

/**
 * Resolve a request path (already split into segments) against the private
 * presets root. Returns the absolute file path, or `null` when any segment is
 * unsafe, the extension is not allowed, or the result would escape the root.
 */
export function resolvePresetFile(root: string, segments: string[]): string | null {
  if (!root || segments.length === 0) return null;

  const decoded: string[] = [];
  for (const raw of segments) {
    const segment = decodeSegment(raw);
    if (segment === null || !isSafeSegment(segment)) return null;
    decoded.push(segment);
  }

  const last = decoded[decoded.length - 1];
  if (!EXTENSION_SET.has(extensionOf(last))) return null;

  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, ...decoded);
  if (!resolved.startsWith(absoluteRoot + path.sep)) return null;

  return resolved;
}

/** MIME type for an allow-listed extension; falls back to a generic binary type. */
export function contentTypeFor(ext: string): string {
  return CONTENT_TYPES[ext.toLowerCase()] ?? "application/octet-stream";
}
