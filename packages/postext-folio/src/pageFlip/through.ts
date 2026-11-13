// Die-cuts in the WebGL book (#1569). A page with holes (or a shaped leaf)
// is painted with them transparent: its own texture's alpha is the cut,
// sharp at full resolution.
// - An open page has nothing under it but the edges of its block, so it
//   draws its holes itself, from a *through* texture (rgb: the stack seen
//   straight down, a: the depth of the layer each texel shows, in leaves).
//   The fragment walks the view ray down the stack a leaf at a time: a
//   layer shows where the ray reaches it, a cut wall where it meets paper
//   first; the key light's ray is walked back up for the shadow the walls
//   throw, and the deep pages darken with depth.
// - A leaf in the air (or the block of a long jump) is real geometry: it
//   discards its holes, in its colour, in its key-light depth and in the
//   height map, so the open page under it shows and shadows fall through.
// - Paper cut away past the leaf's outline (rounded corners, a shaped
//   book) is discarded everywhere.
import { DataTexture, LinearFilter, MeshDepthMaterial, RGBADepthPacking, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Texture } from 'three';

/** A through picture as the document side paints it: RGBA bytes, top row
 *  first; RGB the stack seen through the holes, A the depth code (0 off
 *  the holes, k the k-th layer beneath). `layers`: how many there are. */
export interface FaceThroughData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  layers: number;
}

/** A through picture as a texture: its colour sRGB like the pages' (the
 *  alpha, the depth codes, stays as it is), filtered; the shader reads
 *  the codes texel by texel (`texelFetch`), never blended. */
export function throughTexture(through: FaceThroughData): Texture {
  const texture = new DataTexture(new Uint8Array(through.data.buffer, through.data.byteOffset, through.data.byteLength), through.width, through.height, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** How a page material treats a cut: off (no face is cut), an open page
 *  (draws its holes), a leaf in the air (discards them). */
export const CUT_OFF = 0;
export const CUT_OPEN = 1;
export const CUT_AIR = 2;

/** The uniforms a page material keeps for its faces' cuts. */
export interface CutUniforms {
  uCutMode: { value: number };
  uHasFrontCut: { value: number };
  uHasBackCut: { value: number };
  uFrontThrough: { value: Texture | null };
  uBackThrough: { value: Texture | null };
  uHasFrontThrough: { value: number };
  uHasBackThrough: { value: number };
  /** The layers the faces' through pictures hold (the walk's bound). */
  uThroughLayers: { value: number };
  /** A leaf's thickness, book units. */
  uLeafDepth: { value: number };
}

export const cutUniforms = (mode: number): CutUniforms => ({
  uCutMode: { value: mode },
  uHasFrontCut: { value: 0 },
  uHasBackCut: { value: 0 },
  uFrontThrough: { value: null },
  uBackThrough: { value: null },
  uHasFrontThrough: { value: 0 },
  uHasBackThrough: { value: 0 },
  uThroughLayers: { value: 0 },
  uLeafDepth: { value: 1 },
});

/** Declarations for the page material's fragment shader. */
export const CUT_PARS = /* glsl */ `
  uniform float uCutMode;
  uniform float uHasFrontCut;
  uniform float uHasBackCut;
  uniform sampler2D uFrontThrough;
  uniform sampler2D uBackThrough;
  uniform float uHasFrontThrough;
  uniform float uHasBackThrough;
  uniform float uThroughLayers;
  uniform float uLeafDepth;
  // The direct light a hole's wall keeps from a point deep in it, and the
  // sky its depth leaves it.
  float throughLit = 1.0;
  float throughAo = 1.0;
  vec4 throughAt(bool front, ivec2 t) {
    return front ? texelFetch(uFrontThrough, t, 0) : texelFetch(uBackThrough, t, 0);
  }
  // The depth code at a point of the face (y down), 0 off the holes.
  float throughDepth(bool front, vec2 p, vec2 size) {
    ivec2 t = ivec2(clamp(p, vec2(0.0), vec2(0.999999)) * size);
    return floor(throughAt(front, t).a * 255.0 + 0.5);
  }
  vec3 throughColour(bool front, vec2 p) {
    return front ? texture2D(uFrontThrough, p).rgb : texture2D(uBackThrough, p).rgb;
  }
`;

/**
 * In `map_fragment`, once the face's page texel `page` (RGBA, alpha the
 * cut) and its print `ink` are known. A leaf in the air drops its holes;
 * an open page draws them: the view ray walked down the stack.
 */
export const CUT_FRAGMENT = /* glsl */ `
  if (uCutMode > 0.5 && (front ? uHasFrontCut : uHasBackCut) > 0.5 && cutA < 0.999) {
    if (uCutMode > 1.5) {
      if (cutA < 0.5) discard;
    } else {
      vec2 p0 = vec2(tuv.x, 1.0 - tuv.y);
      bool hasThrough = (front ? uHasFrontThrough : uHasBackThrough) > 0.5;
      vec2 size = hasThrough ? vec2(front ? textureSize(uFrontThrough, 0) : textureSize(uBackThrough, 0)) : vec2(1.0);
      float d0 = hasThrough ? throughDepth(front, p0, size) : 0.0;
      // The picture is coarser than the page: at the hole's rim it may
      // still say paper where the page's alpha says hole.
      if (hasThrough && d0 < 0.5) {
        for (int i = 0; i < 4; i++) {
          vec2 o = vec2(i == 0 ? 1.0 : i == 1 ? -1.0 : 0.0, i == 2 ? 1.0 : i == 3 ? -1.0 : 0.0) / size;
          d0 = max(d0, throughDepth(front, p0 + o, size));
        }
      }
      // Off the holes (past the leaf's outline): nothing of this page.
      if (d0 < 0.5 && cutA < 0.5) discard;
      vec3 hole = uPaper;
      if (hasThrough && d0 > 0.5) {
        // The face's frame on screen: the gradients of its uv, so a step
        // on the page in view space is a step in the picture.
        vec3 pos = -vViewPosition;
        vec3 dp1 = dFdx(pos);
        vec3 dp2 = dFdy(pos);
        vec3 n = normalize(cross(dp1, dp2));
        vec3 eye = normalize(vViewPosition);
        if (dot(n, eye) < 0.0) n = -n;
        vec2 duv1 = dFdx(p0);
        vec2 duv2 = dFdy(p0);
        vec3 dp2perp = cross(dp2, n);
        vec3 dp1perp = cross(n, dp1);
        float det = dot(dp2perp, dp1);
        vec3 gu = (dp2perp * duv1.x + dp1perp * duv2.x) / det;
        vec3 gv = (dp2perp * duv1.y + dp1perp * duv2.y) / det;
        // A leaf down along the view ray, and a leaf up towards the key.
        float h = uLeafDepth;
        vec3 down = -eye * (h / max(dot(eye, n), 0.05)) + n * h;
        vec2 stepDown = vec2(dot(down, gu), dot(down, gv));
        vec2 stepUp = vec2(0.0);
        #if NUM_DIR_LIGHTS > 0
        vec3 l = directionalLights[0].direction;
        vec3 up = l * (h / max(dot(l, n), 0.05)) - n * h;
        stepUp = vec2(dot(up, gu), dot(up, gv));
        #endif
        float k = 1.0;
        float wall = 0.0;
        vec2 hit = p0;
        for (int i = 1; i <= 33; i++) {
          k = float(i);
          if (k > uThroughLayers) break;
          hit = p0 + stepDown * k;
          float d = throughDepth(front, hit, size);
          if (d < k) { wall = 1.0; break; }
          if (d < k + 0.5) break;
        }
        // The key's ray from there back up: paper on its way is a wall's
        // shadow.
        float lit = 1.0;
        float top = wall > 0.5 ? k - 0.5 : k;
        for (int j = 1; j <= 33; j++) {
          float z = top - float(j);
          if (z < 0.0) break;
          if (throughDepth(front, hit + stepUp * float(j), size) <= z) { lit = 0.0; break; }
        }
        throughLit = wall > 0.5 ? 0.45 * lit : lit;
        // Deeper is darker: less of the sky reaches down a narrow shaft.
        throughAo = mix(0.35, 1.0, exp(-0.12 * (k - 1.0))) * (wall > 0.5 ? 0.7 : 1.0);
        hole = wall > 0.5 ? uPaper * 0.8 : throughColour(front, hit);
      }
      ink = mix(hole, ink, cutA);
    }
  }
`;

/**
 * The key light's depth material for a cut leaf: three.js's, with the
 * page texture's alpha discarding the holes (the leaf's front, or its back
 * read through the paper), so the key's shadow falls through them.
 */
export function cutDepthMaterial(): MeshDepthMaterial & { userData: { cut: { uCut: { value: Texture | null }; uCutBack: { value: number }; uMirror: { value: number } } } } {
  const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking }) as ReturnType<typeof cutDepthMaterial>;
  const cut = { uCut: { value: null as Texture | null }, uCutBack: { value: 0 }, uMirror: { value: 0 } };
  m.userData.cut = cut;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, cut);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCutUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCutUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${CUT_UV_PARS}`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\n${CUT_DISCARD}`);
  };
  return m;
}

/** The leaf's cut at a point, from either face's texture. */
const CUT_UV_PARS = /* glsl */ `
  uniform sampler2D uCut;
  uniform float uCutBack;
  uniform float uMirror;
  varying vec2 vCutUv;
`;
const CUT_DISCARD = /* glsl */ `
  {
    float u = uMirror > 0.5 ? 1.0 - vCutUv.x : vCutUv.x;
    vec2 st = uCutBack > 0.5 ? vec2(1.0 - u, vCutUv.y) : vec2(u, vCutUv.y);
    if (texture2D(uCut, st).a < 0.5) discard;
  }
`;

/** The same discard for the height-map caster of a cut leaf. */
export const CASTER_CUT = { pars: CUT_UV_PARS, discard: CUT_DISCARD };

type CutMesh = {
  material: { userData: { uniforms: CutUniforms & { uFront: { value: Texture | null }; uBack: { value: Texture | null }; uMirror: { value: number } } } };
  customDepthMaterial?: unknown;
  userData: Record<string, unknown>;
};

/** What a page mesh's two faces carry, from the book's finishes. */
export interface CutSources {
  cutOf(src: unknown): boolean;
  throughOf(src: unknown): { texture: Texture; layers: number } | null;
}

/**
 * Sets a page mesh's cut uniforms from the pages on its faces: which face
 * is cut, what its holes show (open pages), a leaf's thickness, and for a
 * leaf in the air its key-light depth material and its caster, which
 * discard the holes (the shared caster again once it is not cut).
 */
export function dressCut(mesh: CutMesh, sources: CutSources, leafDepth: number, caster: { shared: unknown; cut: () => unknown }) {
  const u = mesh.material.userData.uniforms;
  const front = mesh.userData.Front;
  const back = mesh.userData.Back;
  const fc = sources.cutOf(front);
  const bc = sources.cutOf(back);
  u.uHasFrontCut.value = fc ? 1 : 0;
  u.uHasBackCut.value = bc ? 1 : 0;
  u.uLeafDepth.value = leafDepth;
  const open = u.uCutMode.value === CUT_OPEN;
  const ft = open && fc ? sources.throughOf(front) : null;
  const bt = open && bc ? sources.throughOf(back) : null;
  u.uFrontThrough.value = ft?.texture ?? null;
  u.uHasFrontThrough.value = ft ? 1 : 0;
  u.uBackThrough.value = bt?.texture ?? null;
  u.uHasBackThrough.value = bt ? 1 : 0;
  u.uThroughLayers.value = Math.max(ft?.layers ?? 0, bt?.layers ?? 0);
  if (u.uCutMode.value !== CUT_AIR) return;
  // A leaf: its holes from whichever face is painted and cut.
  const tex = fc && u.uFront.value ? u.uFront.value : bc && u.uBack.value ? u.uBack.value : null;
  const casterMesh = mesh.userData.caster as { material: unknown } | undefined;
  if (!tex) {
    mesh.customDepthMaterial = undefined;
    if (casterMesh) casterMesh.material = caster.shared;
    return;
  }
  const depth = (mesh.userData.cutDepth ??= cutDepthMaterial()) as ReturnType<typeof cutDepthMaterial>;
  const cutCaster = (mesh.userData.cutCaster ??= caster.cut()) as { uniforms: Record<string, { value: unknown }> };
  for (const c of [depth.userData.cut, cutCaster.uniforms]) {
    c.uCut!.value = tex;
    c.uCutBack!.value = tex === u.uFront.value ? 0 : 1;
    c.uMirror!.value = u.uMirror.value;
  }
  mesh.customDepthMaterial = depth;
  if (casterMesh) casterMesh.material = cutCaster;
}

/** The caster discard's uniforms, fresh for each cut leaf. */
export const casterCut = () => ({ ...CASTER_CUT, uniforms: { uCut: { value: null }, uCutBack: { value: 0 }, uMirror: { value: 0 } } });
