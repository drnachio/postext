import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace } from "three";

// TextureLoader needs a DOM image; stand in a loader that hands back a plain
// Texture (or fails for any URL containing "broken").
const loads: string[] = [];
vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  class TextureLoader {
    load(url: string, onLoad: (t: InstanceType<typeof three.Texture>) => void, _onProgress?: unknown, onError?: (e: unknown) => void) {
      loads.push(url);
      queueMicrotask(() => {
        if (url.includes("broken")) onError?.(new Error(`404 ${url}`));
        else onLoad(new three.Texture());
      });
    }
  }
  return { ...three, TextureLoader };
});

const { loadDeskMaps } = await import("./deskTextures");

const manifest = {
  version: 1,
  kinds: {
    oak: {
      files: { color: "oak/color.jpg", normal: "oak/normal.jpg", roughness: "oak/roughness.jpg", ao: "oak/ao.jpg" },
      tileMm: 1830,
      tint: null,
    },
    felt: {
      files: { color: "felt/color.jpg", normal: "felt/normal.jpg", roughness: "felt/roughness.jpg" },
      tileMm: 300,
      tint: "#4d8a5c",
    },
    leather: {
      files: { color: "leather/color.jpg", normal: "leather/broken.jpg", roughness: "leather/roughness.jpg" },
      tileMm: 400,
    },
  },
};

let fetchMock: ReturnType<typeof vi.fn>;
let base = 0;
/** A fresh base URL per test, since the module caches per base URL. */
const nextBase = () => `https://example.test/t${++base}/textures`;

beforeEach(() => {
  loads.length = 0;
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => manifest }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadDeskMaps", () => {
  it("loads colour, normal, roughness and AO with their colour spaces", async () => {
    const url = nextBase();
    const maps = await loadDeskMaps("oak", url);
    expect(maps).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(`${url}/manifest.json`);
    expect(loads).toEqual([`${url}/oak/color.jpg`, `${url}/oak/normal.jpg`, `${url}/oak/roughness.jpg`, `${url}/oak/ao.jpg`]);
    expect(maps!.tileMm).toBe(1830);
    expect(maps!.tint).toBeUndefined();
    expect(maps!.color.colorSpace).toBe(SRGBColorSpace);
    for (const t of [maps!.normal, maps!.roughness, maps!.ao!]) expect(t.colorSpace).toBe(NoColorSpace);
    for (const t of [maps!.color, maps!.normal, maps!.roughness, maps!.ao!]) {
      expect(t.wrapS).toBe(RepeatWrapping);
      expect(t.wrapT).toBe(RepeatWrapping);
      expect(t.generateMipmaps).toBe(true);
      expect(t.minFilter).toBe(LinearMipmapLinearFilter);
    }
  });

  it("leaves AO out when the set has none and passes the tint on", async () => {
    const maps = await loadDeskMaps("felt", nextBase());
    expect(maps!.ao).toBeUndefined();
    expect(maps!.tint).toBe("#4d8a5c");
    expect(maps!.tileMm).toBe(300);
    expect(loads).toHaveLength(3);
  });

  it("fetches the manifest once per base URL and loads each kind once", async () => {
    const url = nextBase();
    const [a, b] = await Promise.all([loadDeskMaps("oak", url), loadDeskMaps("oak", `${url}/`)]);
    const c = await loadDeskMaps("felt", url);
    expect(a).toBe(b);
    expect(c).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loads).toHaveLength(4 + 3);
    await loadDeskMaps("oak", nextBase());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves null when the manifest cannot be fetched, and tries again later", async () => {
    const url = nextBase();
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await loadDeskMaps("oak", url)).toBeNull();
    expect(await loadDeskMaps("oak", url)).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves null on an HTTP error or a malformed manifest", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    expect(await loadDeskMaps("oak", nextBase())).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ nothing: true }) });
    expect(await loadDeskMaps("oak", nextBase())).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => Promise.reject(new SyntaxError("bad json")) });
    expect(await loadDeskMaps("oak", nextBase())).toBeNull();
  });

  it("resolves null for a kind the manifest lacks", async () => {
    expect(await loadDeskMaps("marble", nextBase())).toBeNull();
    expect(loads).toHaveLength(0);
  });

  it("resolves null and disposes the loaded maps when one map fails", async () => {
    const disposed: unknown[] = [];
    const three = await import("three");
    const spy = vi.spyOn(three.Texture.prototype, "dispose").mockImplementation(function (this: unknown) {
      disposed.push(this);
    });
    expect(await loadDeskMaps("leather", nextBase())).toBeNull();
    expect(disposed).toHaveLength(2);
    spy.mockRestore();
  });
});
