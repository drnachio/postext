import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from "three";
import type { DeskKind } from "./procedural";

export type { DeskKind };

// Photographed desk surfaces (CC0 sets from ambientCG and Poly Haven) served
// as image files next to a manifest. Each kind has colour, normal (OpenGL
// convention), roughness and sometimes ambient occlusion maps, and the width
// of one tile in millimetres. A failure anywhere resolves null, so the caller
// keeps the procedural maps of procedural.ts.

/** A desk surface's image maps and the width of one tile (mm). The colour
 *  map is sRGB, the others linear; all repeat and carry mipmaps. `tint`
 *  is the manifest's suggested base colour (to multiply), when it has one. */
export interface DeskMaps {
  color: Texture;
  normal: Texture;
  roughness: Texture;
  ao?: Texture;
  tileMm: number;
  tint?: string;
}

interface ManifestEntry {
  files: { color: string; normal: string; roughness: string; ao?: string };
  tileMm: number;
  tint?: string | null;
}

interface Manifest {
  kinds: Partial<Record<DeskKind, ManifestEntry>>;
}

const manifests = new Map<string, Promise<Manifest | null>>();
const deskMaps = new Map<string, Promise<DeskMaps | null>>();

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** Remember a promise, but forget it if it settles on null so a later call
 *  tries again (a dropped connection should not cost the session its desk). */
function cached<T>(cache: Map<string, Promise<T | null>>, key: string, make: () => Promise<T | null>) {
  let p = cache.get(key);
  if (!p) {
    p = make().catch(() => null);
    cache.set(key, p);
    p.then((v) => {
      if (v === null && cache.get(key) === p) cache.delete(key);
    });
  }
  return p;
}

function isManifest(json: unknown): json is Manifest {
  return typeof json === "object" && json !== null && typeof (json as Manifest).kinds === "object" && (json as Manifest).kinds !== null;
}

function loadManifest(base: string) {
  return cached(manifests, base, async () => {
    const res = await fetch(`${base}/manifest.json`);
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return isManifest(json) ? json : null;
  });
}

function loadTexture(loader: TextureLoader, url: string, srgb: boolean) {
  return new Promise<Texture>((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
        tex.wrapS = tex.wrapT = RepeatWrapping;
        tex.generateMipmaps = true;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.magFilter = LinearFilter;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

function validEntry(entry: ManifestEntry | undefined): entry is ManifestEntry {
  return (
    !!entry &&
    typeof entry.files === "object" &&
    entry.files !== null &&
    typeof entry.files.color === "string" &&
    typeof entry.files.normal === "string" &&
    typeof entry.files.roughness === "string" &&
    typeof entry.tileMm === "number" &&
    entry.tileMm > 0
  );
}

/**
 * The image maps of a desk surface, from `${baseUrl}/manifest.json` and the
 * files it lists (paths relative to `baseUrl`). The manifest is fetched once
 * per `baseUrl` and the maps once per `baseUrl` + kind; every caller of the
 * same pair shares the same textures, so do not dispose them per mesh.
 * Anisotropy is left to the caller (it needs the renderer). Resolves null on
 * any failure, after disposing whatever maps had loaded.
 */
export function loadDeskMaps(kind: DeskKind, baseUrl: string): Promise<DeskMaps | null> {
  const base = trimSlash(baseUrl);
  return cached(deskMaps, `${base}\n${kind}`, async () => {
    const manifest = await loadManifest(base);
    const entry = manifest?.kinds[kind];
    if (!validEntry(entry)) return null;
    const loader = new TextureLoader();
    const { files } = entry;
    const urls = [files.color, files.normal, files.roughness, ...(typeof files.ao === "string" ? [files.ao] : [])];
    const settled = await Promise.allSettled(urls.map((f, i) => loadTexture(loader, `${base}/${f}`, i === 0)));
    const loaded = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
    if (loaded.length !== urls.length) {
      for (const t of loaded) t.dispose();
      return null;
    }
    const [color, normal, roughness, ao] = loaded;
    const maps: DeskMaps = { color, normal, roughness, tileMm: entry.tileMm };
    if (ao) maps.ao = ao;
    if (typeof entry.tint === "string") maps.tint = entry.tint;
    return maps;
  });
}
