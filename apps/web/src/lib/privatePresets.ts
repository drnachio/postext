import { createHash } from "node:crypto";
import fs from "node:fs";
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

/** Virtual file name whose GET returns a fingerprint of its preset directory
 *  instead of a file (see the `/api/private-presets` route). */
export const FINGERPRINT_FILE = "fingerprint.json";

/** Maximum directory depth walked by `fingerprintDirectory` (the preset
 *  directory itself is depth 0). */
export const FINGERPRINT_MAX_DEPTH = 4;

export interface DirectoryFingerprint {
  /** sha1 (hex) over the sorted `"<relpath>:<mtimeMs>:<size>\n"` lines. */
  fingerprint: string;
  /** Number of files that contributed to the hash. */
  files: number;
}

async function collectFiles(
  dir: string,
  rel: string,
  depth: number,
  out: { rel: string; mtimeMs: number; size: number }[],
): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith(".") || name === "node_modules") continue;
    const abs = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (entry.isDirectory()) {
      if (depth < FINGERPRINT_MAX_DEPTH) await collectFiles(abs, relPath, depth + 1, out);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const stat = await fs.promises.stat(abs);
      out.push({ rel: relPath, mtimeMs: stat.mtimeMs, size: stat.size });
    } catch {
      // Vanished between readdir and stat — the next poll will notice.
    }
  }
}

/**
 * Fingerprint a preset directory from file metadata only: walk it
 * recursively (depth <= `FINGERPRINT_MAX_DEPTH`, skipping dotfiles and
 * `node_modules`), sort the relative paths and sha1 one
 * `"<relpath>:<mtimeMs>:<size>"` line per file. Any change to a file's
 * modification time or size, or a file added/removed/renamed, changes the
 * result; nothing is read from the files themselves.
 */
export async function fingerprintDirectory(dir: string): Promise<DirectoryFingerprint> {
  const files: { rel: string; mtimeMs: number; size: number }[] = [];
  await collectFiles(dir, "", 0, files);
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const hash = createHash("sha1");
  for (const f of files) hash.update(`${f.rel}:${f.mtimeMs}:${f.size}\n`);
  return { fingerprint: hash.digest("hex"), files: files.length };
}
