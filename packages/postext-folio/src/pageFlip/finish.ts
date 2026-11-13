// Special inks under the lights (#1568): each page face may carry a finish
// mask (postext's `renderFinishMask`, #1564) that says where a metallic ink,
// a foil, a fluorescent ink, an opaque white or a varnish lies on it. The
// page material reads it per texel: metal and roughness, a clear coat, an
// emissive lift, and white standing over the paper's shade. A page without
// one costs nothing: no texture, and every branch of the shader is off.
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, UnsignedByteType, type Texture } from 'three';
import { throughTexture, type FaceThroughData } from './through.js';

/** A finish mask as postext paints it: RGBA bytes, not premultiplied, the
 *  top row first. R metalness, G sheen, B fluorescence, A opaque white. */
export interface FaceMaskData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** What a page face carries besides its painting. */
export interface FaceFinish {
  /** Where its special inks lie (see {@link FaceMaskData}). */
  mask?: FaceMaskData;
  /** The painting is cut (#1569): transparent in its holes and past its
   *  leaf's outline. */
  cut?: boolean;
  /** What its holes show (see {@link FaceThroughData}). */
  through?: FaceThroughData;
}

/** A mask's texture and whether it asks for a clear coat (a varnish, or the
 *  sheen of a foil or a metallic ink somewhere on it). */
export interface MaskTexture {
  texture: Texture;
  coat: boolean;
}

/** Whether any texel of a mask has a sheen (the G channel). */
export function maskHasSheen(mask: FaceMaskData): boolean {
  const d = mask.data;
  for (let i = 1; i < d.length; i += 4) if (d[i]! > 0) return true;
  return false;
}

/** A mask as a texture: linear data (not sRGB), mipmapped so a page seen
 *  small does not shimmer where foil meets paper. */
export function maskTexture(mask: FaceMaskData): MaskTexture {
  const texture = new DataTexture(new Uint8Array(mask.data.buffer, mask.data.byteOffset, mask.data.byteLength), mask.width, mask.height, RGBAFormat, UnsignedByteType);
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return { texture, coat: maskHasSheen(mask) };
}

/**
 * The finishes of the pages, by page source, and the textures made for
 * them: a texture is made the first time a face shows its mask and freed
 * once no page carries that mask any more.
 */
export class FinishTextures {
  private bySrc = new Map<unknown, FaceFinish>();
  private textures = new Map<FaceMaskData, MaskTexture>();
  private throughs = new Map<FaceThroughData, Texture>();

  /** The pages' finishes now; textures of masks no page carries are
   *  freed. True when anything changed. */
  set(finishes: ReadonlyMap<unknown, FaceFinish>): boolean {
    let changed = finishes.size !== this.bySrc.size;
    for (const [src, f] of finishes) {
      const was = this.bySrc.get(src);
      if (was?.mask !== f.mask || was?.through !== f.through || !!was?.cut !== !!f.cut) changed = true;
    }
    this.bySrc = new Map(finishes);
    const kept = new Set<unknown>();
    for (const f of finishes.values()) {
      if (f.mask) kept.add(f.mask);
      if (f.through) kept.add(f.through);
    }
    for (const [mask, t] of this.textures) {
      if (kept.has(mask)) continue;
      t.texture.dispose();
      this.textures.delete(mask);
    }
    for (const [through, t] of this.throughs) {
      if (kept.has(through)) continue;
      t.dispose();
      this.throughs.delete(through);
    }
    return changed;
  }

  /** The mask texture of the page whose source is `src`, if it has one. */
  maskOf(src: unknown): MaskTexture | null {
    const mask = src ? this.bySrc.get(src)?.mask : undefined;
    if (!mask) return null;
    let t = this.textures.get(mask);
    if (!t) this.textures.set(mask, (t = maskTexture(mask)));
    return t;
  }

  /** Whether the page whose source is `src` is painted cut. */
  cutOf(src: unknown): boolean {
    return !!src && !!this.bySrc.get(src)?.cut;
  }

  /** The through texture of the page whose source is `src` and how many
   *  layers it holds, if its holes show any. */
  throughOf(src: unknown): { texture: Texture; layers: number; end?: boolean } | null {
    const through = src ? this.bySrc.get(src)?.through : undefined;
    if (!through) return null;
    let t = this.throughs.get(through);
    if (!t) this.throughs.set(through, (t = throughTexture(through)));
    return { texture: t, layers: through.layers, ...(through.end ? { end: true } : {}) };
  }

  /** The textures alive (for tests and for the frame budget). */
  get size(): number {
    return this.textures.size + this.throughs.size;
  }

  dispose() {
    for (const t of this.textures.values()) t.texture.dispose();
    for (const t of this.throughs.values()) t.dispose();
    this.textures.clear();
    this.throughs.clear();
    this.bySrc.clear();
  }
}

/** The uniforms a page material keeps for its faces' masks. */
export interface FinishUniforms {
  uFrontMask: { value: Texture | null };
  uBackMask: { value: Texture | null };
  uHasFrontMask: { value: number };
  uHasBackMask: { value: number };
}

export const finishUniforms = (): FinishUniforms => ({
  uFrontMask: { value: null },
  uBackMask: { value: null },
  uHasFrontMask: { value: 0 },
  uHasBackMask: { value: 0 },
});

/** A clear coat so thin it shows nothing: enough for three.js to compile
 *  the coat, which a varnish then lays on where it lies. */
export const HAIRLINE_COAT = 1e-3;

/**
 * Sets a page material's mask uniforms from the finishes of the pages on
 * its two faces, and keeps a clear coat on it while one of them has a
 * varnish or a foil (three.js compiles the coat only for a material whose
 * `clearcoat` is above 0). `paperCoat` is the stock's own coat.
 */
export function dressFinish(
  m: { clearcoat: number; userData: { uniforms: FinishUniforms } },
  front: MaskTexture | null,
  back: MaskTexture | null,
  paperCoat: number,
) {
  const u = m.userData.uniforms;
  u.uFrontMask.value = front?.texture ?? null;
  u.uHasFrontMask.value = front ? 1 : 0;
  u.uBackMask.value = back?.texture ?? null;
  u.uHasBackMask.value = back ? 1 : 0;
  const coat = (front?.coat || back?.coat) && paperCoat <= 0 ? HAIRLINE_COAT : paperCoat;
  if (m.clearcoat !== coat) m.clearcoat = coat;
}

/** Declarations: the mask read at this point, shared by the chunks below. */
export const FINISH_PARS = /* glsl */ `
  uniform sampler2D uFrontMask;
  uniform sampler2D uBackMask;
  uniform float uHasFrontMask;
  uniform float uHasBackMask;
  // R metal, G sheen, B fluorescence, A opaque white; zero off the inks.
  vec4 finishMask = vec4(0.0);
  // The ink's own colour (linear), not darkened by the paper's shade.
  vec3 finishInk = vec3(0.0);
  // G holds a sheen times how much of the texel the ink covers: the sheen
  // is the largest G round the point, the cover what this one has of it
  // (the edge of a gloss varnish is gloss over part of a texel, not satin).
  float finishSheen = 0.0;
  float finishCover = 0.0;
  vec4 finishAt(bool front, vec2 uv) {
    return front ? texture2D(uFrontMask, uv) : texture2D(uBackMask, uv);
  }
`;

/** In `map_fragment`, once the face's print `ink` is known and before the
 *  paper's shade multiplies it: reads the mask (the page image's rows run
 *  bottom up, the mask's top down). */
export const FINISH_READ = /* glsl */ `
  if ((front ? uHasFrontMask : uHasBackMask) > 0.5) {
    vec2 muv = front ? uvF : uvB;
    muv.y = 1.0 - muv.y;
    finishMask = finishAt(front, muv);
    finishInk = ink;
    if (finishMask.g > 0.0) {
      // A texel and a half of the mask, or of the mipmap level a page
      // seen small reads.
      vec2 t = max(1.5 / vec2(front ? textureSize(uFrontMask, 0) : textureSize(uBackMask, 0)), 1.5 * fwidth(muv));
      float near = max(
        max(finishAt(front, muv + vec2(t.x, 0.0)).g, finishAt(front, muv - vec2(t.x, 0.0)).g),
        max(finishAt(front, muv + vec2(0.0, t.y)).g, finishAt(front, muv - vec2(0.0, t.y)).g));
      finishSheen = max(finishMask.g, near);
      finishCover = finishMask.g / finishSheen;
    }
  }
`;

/** After the paper's shade has multiplied the print: an opaque white and a
 *  metal lie over the paper, so they keep their own colour. A metal's
 *  colour is its reflectance: the screen hex shows it as a flat swatch, so
 *  it is lifted towards a bright metal of the same hue (at most twice: a
 *  dark ink knocking the metal out at its edge stays dark), and a little
 *  towards white, as a real gold reflects some of every colour. */
export const FINISH_DIFFUSE = /* glsl */ `
  if (finishMask.a > 0.0 || finishMask.r > 0.0) {
    float top = max(max(finishInk.r, finishInk.g), max(finishInk.b, 1e-3));
    vec3 metal = mix(finishInk, finishInk * min(0.95 / top, 2.0), 0.8);
    metal = mix(metal, vec3(max(max(metal.r, metal.g), metal.b)), 0.25);
    diffuseColor.rgb = mix(diffuseColor.rgb, finishInk, finishMask.a);
    diffuseColor.rgb = mix(diffuseColor.rgb, metal, finishMask.r);
  }
`;

/** Roughness: a foil (gloss) bright and sharp, a metallic ink (satin) a
 *  soft lustre. A varnish fills the stock's own roughness: a gloss one
 *  leaves the print under it smooth (deeper, its highlight sharp), a matte
 *  or soft-touch one chalky. */
export const FINISH_ROUGHNESS = /* glsl */ `
  if (finishMask.g > 0.0 || finishMask.r > 0.0) {
    float metalRough = mix(0.5, 0.17, smoothstep(0.2, 1.0, finishSheen));
    float varnish = mix(0.95, 0.12, smoothstep(0.3, 1.0, finishSheen));
    roughnessFactor = mix(roughnessFactor, varnish, finishCover * (1.0 - finishMask.r));
    roughnessFactor = mix(roughnessFactor, metalRough, finishMask.r);
  }
`;

/** Metalness: a foil all metal, a metallic ink (its flakes in a binder)
 *  mostly. */
export const FINISH_METALNESS = /* glsl */ `
  metalnessFactor = mix(metalnessFactor, mix(0.75, 1.0, smoothstep(0.75, 0.95, finishSheen)), finishMask.r);
`;

/** A foil is pressed flat: the paper's grain hardly shows through it. */
export const FINISH_NORMAL = /* glsl */ `
  if (finishMask.r > 0.0) normal = normalize(mix(normal, nonPerturbedNormal, 0.85 * finishMask.r));
`;

/** A fluorescent ink turns light the eye hardly sees into its own colour:
 *  it reads brighter than the paper round it, a little even in dim light. */
export const FINISH_EMISSIVE = /* glsl */ `
  totalEmissiveRadiance += finishMask.b * finishInk * 0.45;
`;

/** The clear coat a varnish lays (after three.js has set the stock's): a
 *  gloss varnish a hard, sharp coat, a satin one softer, a matte or soft-
 *  touch one next to none. A bare metal takes none. */
export const FINISH_COAT = /* glsl */ `
  #ifdef USE_CLEARCOAT
  if (finishMask.g > 0.0) {
    float s = smoothstep(0.3, 1.0, finishSheen);
    float w = finishCover * (1.0 - finishMask.r);
    material.clearcoat = mix(material.clearcoat, s, w);
    material.clearcoatRoughness = mix(material.clearcoatRoughness, min(1.0, max(mix(0.6, 0.03, s), 0.0525) + geometryRoughness), w);
  }
  #endif
`;
