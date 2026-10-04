/**
 * HarfBuzz from its WebAssembly binary, without the Emscripten glue
 * (issue #380).
 *
 * harfbuzzjs ships `harfbuzz.wasm` with a JavaScript module that loads it,
 * and that module works out where it runs from `process`: in Node it
 * imports `module` to read the file. A CDN that compiles packages for the
 * browser (esm.sh) defines a `process` of its own, so in a page that
 * imports postext-pdf from it the glue took the Node path and threw, and
 * every Arabic PDF fell back to fontkit, its marks unplaced.
 *
 * The binary needs very little from its host: five imports (a heap that
 * grows, an abort, a timer and an exit Emscripten never calls for
 * shaping), and the static constructors run once. This module provides
 * them and binds the dozen `hb_*` functions postext-pdf shapes with, so
 * HarfBuzz loads the same way in Node, a page, a Worker and a bundle.
 *
 * The binary is taken from, in order: the source the caller gave
 * (`RenderToPdfOptions.harfbuzzWasm`); `harfbuzz.wasm` beside this module
 * (the build copies it into `dist`; a bundler sees the literal
 * `new URL(…, import.meta.url)` and emits it as an asset; Node reads the
 * file); in the source tree, the harfbuzzjs package itself; and, for a
 * page whose CDN rebuilt the module somewhere else (esm.sh puts it under
 * `/es2022/`, where no `.wasm` sits beside it), the same harfbuzzjs
 * release from jsDelivr, then from esm.sh.
 */

/** The harfbuzzjs release whose `harfbuzz.wasm` this binding is written
 *  for, and fetched from a CDN when no copy sits beside the module. A test
 *  keeps it equal to the installed package. */
export const HARFBUZZ_VERSION = '1.6.2';

/** Where the binary can come from: its URL, or its bytes. */
export type HarfBuzzWasmSource = string | URL | ArrayBuffer | ArrayBufferView;

/** One shaped glyph, as `hb_glyph_info_t` and `hb_glyph_position_t` give it. */
export interface HbGlyph {
  gid: number;
  cluster: number;
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
}

/** A face made from a font file: the `hb_font_t` to shape with and its
 *  units per em. */
export interface HbFontHandle {
  readonly font: number;
  readonly upem: number;
}

export interface HbShapeRequest {
  direction: 'ltr' | 'rtl';
  /** ISO 15924 tag; HarfBuzz guesses it from the text when absent. */
  script?: string;
  /** BCP 47 tag. */
  language?: string;
  /** OpenType features and their values. */
  features?: readonly (readonly [tag: string, value: number])[];
}

interface HbExports {
  memory: WebAssembly.Memory;
  __wasm_call_ctors(): void;
  malloc(size: number): number;
  free(ptr: number): void;
  hb_blob_create(data: number, length: number, mode: number, userData: number, destroy: number): number;
  hb_blob_destroy(blob: number): void;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_get_upem(face: number): number;
  hb_font_create(face: number): number;
  hb_font_destroy(font: number): void;
  hb_buffer_create(): number;
  hb_buffer_reset(buffer: number): void;
  hb_buffer_set_cluster_level(buffer: number, level: number): void;
  hb_buffer_add_utf16(buffer: number, text: number, textLength: number, itemOffset: number, itemLength: number): void;
  hb_buffer_guess_segment_properties(buffer: number): void;
  hb_buffer_set_direction(buffer: number, direction: number): void;
  hb_buffer_set_script(buffer: number, script: number): void;
  hb_buffer_set_language(buffer: number, language: number): void;
  hb_script_from_string(str: number, length: number): number;
  hb_language_from_string(str: number, length: number): number;
  hb_buffer_get_length(buffer: number): number;
  hb_buffer_get_glyph_infos(buffer: number, length: number): number;
  hb_buffer_get_glyph_positions(buffer: number, length: number): number;
  hb_shape(font: number, buffer: number, features: number, numFeatures: number): void;
}

// hb-common.h, hb-buffer.h, hb-blob.h.
const HB_DIRECTION_LTR = 4;
const HB_DIRECTION_RTL = 5;
const HB_BUFFER_CLUSTER_LEVEL_MONOTONE_GRAPHEMES = 0;
const HB_MEMORY_MODE_READONLY = 1;
/** `hb_feature_t`: tag, value, start, end, four `uint32`. */
const FEATURE_BYTES = 16;
const FEATURE_GLOBAL_END = 0xffffffff;
/** `hb_glyph_info_t` and `hb_glyph_position_t` are five 32-bit words each. */
const GLYPH_WORDS = 5;
/** The heap's ceiling, as Emscripten built it (`getHeapMax`). */
const HEAP_MAX = 2 ** 31;
const WASM_PAGE = 65536;

function hbTag(tag: string): number {
  return ((tag.charCodeAt(0) & 0xff) << 24 | (tag.charCodeAt(1) & 0xff) << 16 | (tag.charCodeAt(2) & 0xff) << 8 | (tag.charCodeAt(3) & 0xff)) >>> 0;
}

/** A running HarfBuzz: one WebAssembly instance and one shaping buffer. */
export class HarfBuzz {
  private readonly hb: HbExports;
  private readonly buffer: number;
  /** Frees a face's memory once the font file it was made from is
   *  collected (the caller keys faces by the file's bytes). */
  private readonly faces = new FinalizationRegistry<{ data: number; face: number; font: number }>((f) => {
    this.hb.hb_font_destroy(f.font);
    this.hb.hb_face_destroy(f.face);
    this.hb.free(f.data);
  });

  constructor(hb: HbExports) {
    this.hb = hb;
    this.buffer = hb.hb_buffer_create();
  }

  /** The heap as bytes. A fresh view each time: growing the memory
   *  detaches the old one. */
  private get u8(): Uint8Array {
    return new Uint8Array(this.hb.memory.buffer);
  }

  /** Copy `str` (ASCII: a script or language tag) into the heap, NUL
   *  terminated; the caller frees it. */
  private ascii(str: string): number {
    const ptr = this.hb.malloc(str.length + 1);
    const u8 = this.u8;
    for (let i = 0; i < str.length; i++) u8[ptr + i] = str.charCodeAt(i) & 0x7f;
    u8[ptr + str.length] = 0;
    return ptr;
  }

  /**
   * A face for the font file `bytes` (its first face). The bytes are
   * copied into the heap and freed, with the face, when `owner` (the
   * caller's handle for this face) is collected.
   */
  openFont(bytes: Uint8Array, owner: object): HbFontHandle {
    const hb = this.hb;
    const data = hb.malloc(bytes.byteLength);
    this.u8.set(bytes, data);
    // Read-only: HarfBuzz copies a table it must patch, and never frees
    // the data (no destroy callback); the registry does.
    const blob = hb.hb_blob_create(data, bytes.byteLength, HB_MEMORY_MODE_READONLY, 0, 0);
    const face = hb.hb_face_create(blob, 0);
    hb.hb_blob_destroy(blob);
    const font = hb.hb_font_create(face);
    const handle = { font, upem: hb.hb_face_get_upem(face) };
    this.faces.register(owner, { data, face, font });
    return handle;
  }

  /** Shape `text` (one bidi run) with `font`. Glyphs in visual order;
   *  clusters are UTF-16 offsets, a letter and its marks one cluster. */
  shape(font: HbFontHandle, text: string, request: HbShapeRequest): HbGlyph[] {
    const hb = this.hb;
    const buf = this.buffer;
    hb.hb_buffer_reset(buf);
    hb.hb_buffer_set_cluster_level(buf, HB_BUFFER_CLUSTER_LEVEL_MONOTONE_GRAPHEMES);
    const textPtr = hb.malloc(text.length * 2 || 2);
    const u16 = new Uint16Array(hb.memory.buffer, textPtr, text.length);
    for (let i = 0; i < text.length; i++) u16[i] = text.charCodeAt(i);
    hb.hb_buffer_add_utf16(buf, textPtr, text.length, 0, text.length);
    hb.free(textPtr);
    hb.hb_buffer_guess_segment_properties(buf);
    hb.hb_buffer_set_direction(buf, request.direction === 'rtl' ? HB_DIRECTION_RTL : HB_DIRECTION_LTR);
    if (request.script) {
      const s = this.ascii(request.script);
      hb.hb_buffer_set_script(buf, hb.hb_script_from_string(s, -1));
      hb.free(s);
    }
    if (request.language) {
      const s = this.ascii(request.language);
      hb.hb_buffer_set_language(buf, hb.hb_language_from_string(s, -1));
      hb.free(s);
    }
    const features = request.features ?? [];
    let featuresPtr = 0;
    if (features.length > 0) {
      featuresPtr = hb.malloc(features.length * FEATURE_BYTES);
      const words = new Uint32Array(hb.memory.buffer, featuresPtr, features.length * 4);
      features.forEach(([tag, value], i) => {
        words[i * 4] = hbTag(tag);
        words[i * 4 + 1] = value >>> 0;
        words[i * 4 + 2] = 0;
        words[i * 4 + 3] = FEATURE_GLOBAL_END;
      });
    }
    hb.hb_shape(font.font, buf, featuresPtr, features.length);
    if (featuresPtr) hb.free(featuresPtr);

    const n = hb.hb_buffer_get_length(buf);
    const infos = hb.hb_buffer_get_glyph_infos(buf, 0) >>> 2;
    const positions = hb.hb_buffer_get_glyph_positions(buf, 0) >>> 2;
    const u32 = new Uint32Array(hb.memory.buffer);
    const i32 = new Int32Array(hb.memory.buffer);
    const glyphs: HbGlyph[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const info = infos + i * GLYPH_WORDS;
      const pos = positions + i * GLYPH_WORDS;
      glyphs[i] = {
        gid: u32[info]!,
        cluster: u32[info + 2]!,
        xAdvance: i32[pos]!,
        yAdvance: i32[pos + 1]!,
        xOffset: i32[pos + 2]!,
        yOffset: i32[pos + 3]!,
      };
    }
    return glyphs;
  }
}

/** Instantiate HarfBuzz from its binary. */
export async function instantiateHarfBuzz(wasm: BufferSource): Promise<HarfBuzz> {
  // The heap is the module's own export, known once it is instantiated.
  const heap: { memory?: WebAssembly.Memory } = {};
  const abort = (what: string) => {
    throw new WebAssembly.RuntimeError(`HarfBuzz aborted (${what})`);
  };
  const imports = {
    env: {
      _abort_js: () => abort('abort'),
      // Emscripten's event loop: nothing here keeps it alive or sets a
      // timer (`alarm`, `setitimer`), and shaping never asks for one.
      _emscripten_runtime_keepalive_clear: () => {},
      _setitimer_js: () => 0,
      // Grow the heap to hold `requested` bytes: double it, as Emscripten
      // does, up to its ceiling. 1 on success, 0 when it cannot.
      emscripten_resize_heap: (requested: number) => {
        const mem = heap.memory!;
        const old = mem.buffer.byteLength;
        requested >>>= 0;
        if (requested > HEAP_MAX) return 0;
        const target = Math.min(HEAP_MAX, Math.max(requested, old * 2));
        try {
          mem.grow(Math.ceil((target - old) / WASM_PAGE));
          return 1;
        } catch {
          try {
            mem.grow(Math.ceil((requested - old) / WASM_PAGE));
            return 1;
          } catch {
            return 0;
          }
        }
      },
    },
    wasi_snapshot_preview1: {
      proc_exit: (code: number) => abort(`exit ${code}`),
    },
  };
  const { instance } = await WebAssembly.instantiate(wasm, imports);
  const hb = instance.exports as unknown as HbExports;
  heap.memory = hb.memory;
  hb.__wasm_call_ctors();
  return new HarfBuzz(hb);
}

/** The literal, so a bundler emits the binary beside the chunk. */
function besideThisModule(): URL {
  return new URL('./harfbuzz.wasm', import.meta.url);
}

/** Whether `bytes` start as a WebAssembly module (`\0asm`): a server that
 *  answers a missing file with a page must not reach `instantiate`. */
function isWasm(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
}

/** Read a `file:` URL. `node:fs` is named through a variable, so a
 *  bundler or a CDN leaves it alone, and only a host that runs from files
 *  (Node, Deno, Bun) ever imports it. */
async function readFileUrl(url: URL): Promise<Uint8Array> {
  const fsModule = 'node:fs/promises';
  const fs = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ fsModule)) as {
    readFile(path: URL): Promise<Uint8Array>;
  };
  return new Uint8Array(await fs.readFile(url));
}

async function fetchBytes(url: URL): Promise<Uint8Array> {
  if (url.protocol === 'file:') return readFileUrl(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** What a relative `source` resolves against: the page's (or worker's)
 *  location, as a `fetch` would; this module's URL where there is none. */
export function sourceBase(): string {
  return (globalThis as { location?: { href?: string } }).location?.href ?? import.meta.url;
}

/** The places the binary is looked for when the caller gave none. */
function defaultLocations(): URL[] {
  const beside = besideThisModule();
  if (beside.protocol === 'file:') {
    // From `src` (tests) or a `dist` built without the copy: the package
    // this binding is written against. Resolved against `beside`, not
    // `import.meta.url`, so no bundler takes it for an asset to emit.
    return [beside, new URL('../node_modules/harfbuzzjs/dist/harfbuzz.wasm', beside)];
  }
  return [
    beside,
    new URL(`https://cdn.jsdelivr.net/npm/harfbuzzjs@${HARFBUZZ_VERSION}/dist/harfbuzz.wasm`),
    new URL(`https://esm.sh/harfbuzzjs@${HARFBUZZ_VERSION}/dist/harfbuzz.wasm`),
  ];
}

/**
 * Load HarfBuzz from `source`, or from the default locations in turn.
 * Rejects with every place tried and why it failed.
 */
export async function loadHarfBuzz(source?: HarfBuzzWasmSource): Promise<HarfBuzz> {
  if (source !== undefined && typeof source !== 'string' && !(source instanceof URL)) {
    const bytes = ArrayBuffer.isView(source)
      ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
      : new Uint8Array(source);
    return instantiateHarfBuzz(bytes as Uint8Array<ArrayBuffer>);
  }
  const locations = source !== undefined ? [new URL(source, sourceBase())] : defaultLocations();
  const failures: string[] = [];
  for (const url of locations) {
    let bytes: Uint8Array;
    try {
      bytes = await fetchBytes(url);
    } catch (err) {
      failures.push(`${url.href}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (!isWasm(bytes)) {
      failures.push(`${url.href}: not a WebAssembly file`);
      continue;
    }
    return instantiateHarfBuzz(bytes as Uint8Array<ArrayBuffer>);
  }
  throw new Error(failures.join('; '));
}
