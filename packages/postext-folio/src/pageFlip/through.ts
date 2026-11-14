// Die-cuts in the WebGL book (#1569). A page with holes (or a shaped leaf)
// is painted with them transparent: its own texture's alpha is the cut,
// sharp at full resolution.
// - An open page has nothing under it but the edges of its block, so it
//   draws its holes itself, from a *through* texture (rgb: the stack seen
//   straight down, a: the depth of the layer each texel shows, in leaves).
//   The fragment walks the view ray down the stack a leaf at a time: a
//   layer shows where the ray reaches it, a cut wall where it meets paper
//   first; the key light's ray is walked back up for the shadow the walls
//   throw, and the deep pages darken with depth. Where the holes go
//   through to the end of the book and nothing lies past it but the desk
//   (a book whose own printed covers are its case, #1586), the ray leaves
//   the book: the page discards there and the desk shows, in the key
//   light's depth too, so light falls through.
// - A leaf in the air (or the block of a long jump) is real geometry: it
//   discards its holes, in its colour, in its key-light depth and in the
//   height map, so the open page under it shows and shadows fall through.
//   A board in the air is two faces with its edges between them: the edges
//   follow the leaf's outline and leave the holes open, and a face seen
//   from inside the board, through a hole, is the board's core (#1586).
// - Paper cut away past the leaf's outline (rounded corners, a shaped
//   book) is discarded everywhere.
import { BoxGeometry, DataTexture, LinearFilter, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Texture } from 'three';

/** A through picture as the document side paints it: RGBA bytes, top row
 *  first; RGB the stack seen through the holes, A the depth code (0 off
 *  the holes, k the k-th layer beneath). `layers`: how many there are. */
export interface FaceThroughData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  layers: number;
  /** The deepest layer is past the book's end (the board or what the
   *  book lies on), not a page. */
  end?: boolean;
  /** Each layer's own cut, as many texels as `data`: the four bytes of a
   *  texel are a 32-bit word (R the low byte) whose bit k−1 is set where
   *  the k-th layer beneath has a hole. The straight-down picture cannot
   *  tell a leaf under an overhang (a hole that widens below the page, as
   *  the leaves already turned show it) from paper: the walk asks each
   *  layer at its own depth (#1592). */
  cuts?: Uint8ClampedArray;
}

/** A through picture as a texture: its colour sRGB like the pages' (the
 *  alpha, the depth codes, stays as it is), filtered; the shader reads
 *  the codes texel by texel (`texelFetch`), never blended. */
export function throughTexture(through: FaceThroughData): Texture {
  if (through.cuts) {
    // The layers' cuts ride below the picture, in rows of their own (a
    // sampler more would pass the page shader's texture units): bits, so
    // the texture stays raw and the shader decodes the picture's sRGB.
    const both = new Uint8Array(through.data.byteLength * 2);
    both.set(through.data, 0);
    both.set(through.cuts, through.data.byteLength);
    const texture = new DataTexture(both, through.width, through.height * 2, RGBAFormat, UnsignedByteType);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    texture.userData.cuts = true;
    return texture;
  }
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
  /** The face's through texture carries the layers' cuts below its
   *  picture (see {@link FaceThroughData.cuts}). */
  uHasFrontCuts: { value: number };
  uHasBackCuts: { value: number };
  uHasFrontThrough: { value: number };
  uHasBackThrough: { value: number };
  /** The layers the faces' through pictures hold (the walk's bound). */
  uThroughLayers: { value: number };
  /** A leaf's thickness, book units. */
  uLeafDepth: { value: number };
  /** The depth code of the layer past the book's end, per face (0: the
   *  holes stop at a page). */
  uFrontEnd: { value: number };
  uBackEnd: { value: number };
  /** Nothing lies past the book's end but the desk (no case): the ray
   *  that gets there leaves the book. */
  uSeeDesk: { value: number };
}

export const cutUniforms = (mode: number): CutUniforms => ({
  uCutMode: { value: mode },
  uHasFrontCut: { value: 0 },
  uHasBackCut: { value: 0 },
  uFrontThrough: { value: null },
  uBackThrough: { value: null },
  uHasFrontCuts: { value: 0 },
  uHasBackCuts: { value: 0 },
  uHasFrontThrough: { value: 0 },
  uHasBackThrough: { value: 0 },
  uThroughLayers: { value: 0 },
  uLeafDepth: { value: 1 },
  uFrontEnd: { value: 0 },
  uBackEnd: { value: 0 },
  uSeeDesk: { value: 0 },
});

/** Declarations for the page material's fragment shader. */
export const CUT_PARS = /* glsl */ `
  uniform float uCutMode;
  uniform float uHasFrontCut;
  uniform float uHasBackCut;
  uniform sampler2D uFrontThrough;
  uniform sampler2D uBackThrough;
  uniform float uHasFrontCuts;
  uniform float uHasBackCuts;
  uniform float uHasFrontThrough;
  uniform float uHasBackThrough;
  uniform float uThroughLayers;
  uniform float uLeafDepth;
  uniform float uFrontEnd;
  uniform float uBackEnd;
  uniform float uSeeDesk;
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
  // Whether the k-th layer beneath (k ≥ 1) has a hole at a point of the
  // face, from its own cut; without the cuts, from the straight-down
  // picture (right while every hole lies within the one above it).
  bool layerCut(bool front, vec2 p, vec2 size, float k) {
    if ((front ? uHasFrontCuts : uHasBackCuts) < 0.5) return throughDepth(front, p, size) > k + 0.5;
    ivec2 t = ivec2(clamp(p, vec2(0.0), vec2(0.999999)) * size) + ivec2(0, int(size.y));
    vec4 c = throughAt(front, t);
    int b = int(k) - 1;
    if (b < 0 || b > 31) return false;
    int bits = int(floor((b < 8 ? c.r : b < 16 ? c.g : b < 24 ? c.b : c.a) * 255.0 + 0.5));
    return ((bits >> (b - (b / 8) * 8)) & 1) == 1;
  }
  vec3 throughColour(bool front, vec2 p) {
    if ((front ? uHasFrontCuts : uHasBackCuts) < 0.5) return front ? texture2D(uFrontThrough, p).rgb : texture2D(uBackThrough, p).rgb;
    // The picture is the texture's top half, raw: kept off the cuts'
    // rows by half a texel, and decoded from sRGB here.
    float h = float(front ? textureSize(uFrontThrough, 0).y : textureSize(uBackThrough, 0).y);
    vec2 q = vec2(p.x, min(p.y * 0.5, 0.5 - 0.5 / h));
    vec3 c = front ? texture2D(uFrontThrough, q).rgb : texture2D(uBackThrough, q).rgb;
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
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
      // A texture with the cuts below its picture is twice its height.
      if ((front ? uHasFrontCuts : uHasBackCuts) > 0.5) size.y *= 0.5;
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
          // Down through the leaf above this layer: paper there is a
          // wall (the page itself, then each layer at its own depth, so a
          // hole that widens beneath an overhang shows its own step).
          bool clear = k < 1.5 ? throughDepth(front, hit, size) > 0.5 : layerCut(front, hit, size, k - 1.0);
          if (!clear) { wall = 1.0; break; }
          if (!layerCut(front, hit, size, k)) break;
        }
        // Out past the book's last page with nothing there but the desk:
        // the page lets the eye through, to the real desk under the book.
        float endK = front ? uFrontEnd : uBackEnd;
        if (uSeeDesk > 0.5 && endK > 0.5 && wall < 0.5 && k > endK - 0.5) discard;
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
        // A layer reached under an overhang is not in the picture seen
        // straight down: its paper, in the shade the overhang gives it.
        bool seen = throughDepth(front, hit, size) > k - 0.5;
        hole = wall > 0.5 ? uPaper * 0.8 : seen ? throughColour(front, hit) : uPaper * 0.7;
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
export function cutDepthMaterial(cut: LeafCut = leafCut()): MeshDepthMaterial & { userData: { cut: LeafCut } } {
  const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking }) as ReturnType<typeof cutDepthMaterial>;
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

/** A leaf's cut as its depth material, its caster and a board's edges
 *  read it: the painted face whose alpha is the cut, whether that is its
 *  back, the book's mirroring, and whether there is a cut at all. */
export interface LeafCut {
  uCut: { value: Texture | null };
  uCutBack: { value: number };
  uMirror: { value: number };
  uHasCut: { value: number };
}

export const leafCut = (): LeafCut => ({ uCut: { value: null }, uCutBack: { value: 0 }, uMirror: { value: 0 }, uHasCut: { value: 0 } });

/** The leaf's cut at a point, from either face's texture. */
const CUT_UV_PARS = /* glsl */ `
  uniform sampler2D uCut;
  uniform float uCutBack;
  uniform float uMirror;
  uniform float uHasCut;
  varying vec2 vCutUv;
`;
const CUT_DISCARD = /* glsl */ `
  if (uHasCut > 0.5) {
    float u = uMirror > 0.5 ? 1.0 - vCutUv.x : vCutUv.x;
    vec2 st = uCutBack > 0.5 ? vec2(1.0 - u, vCutUv.y) : vec2(u, vCutUv.y);
    // Kept a hair inside the sheet: a board's edges stand on its rim.
    if (texture2D(uCut, clamp(st, 0.002, 0.998)).a < 0.5) discard;
  }
`;

/**
 * The edges of a board in the air (#1586): a unit box's four sides (its
 * two faces are the leaf's meshes), its colour the board's. Each side
 * stands only where the leaf has paper at its rim: a rounded or shaped
 * outline takes its edges with it. Without a lid between the two faces a
 * hole stays open through the board's thickness.
 */
export function boardEdges(cut: LeafCut): { geometry: BoxGeometry; material: MeshStandardMaterial } {
  const box = new BoxGeometry(1, 1, 1);
  // A box's groups run +x, −x, +y, −y, +z, −z: the faces are the last two.
  const sides = box.groups.slice(0, 4).reduce((n, g) => n + g.count, 0);
  box.setIndex(Array.from(box.index!.array.slice(0, sides)));
  box.clearGroups();
  const material = new MeshStandardMaterial({ roughness: 0.8 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, cut);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCutUv;")
      // The box's x runs from the spine (−½) to the fore-edge, y from foot
      // to head: the leaf's own uv.
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCutUv = position.xy + 0.5;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${CUT_UV_PARS}`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\n${CUT_DISCARD}`);
  };
  return { geometry: box, material };
}

/** The same discard for the height-map caster of a cut leaf. */
export const CASTER_CUT = { pars: CUT_UV_PARS, discard: CUT_DISCARD };

/** The leaf's cut uniforms its depth material and its board's edges share,
 *  made once per mesh. */
export const leafCutOf = (mesh: { userData: Record<string, unknown> }): LeafCut => (mesh.userData.leafCut ??= leafCut()) as LeafCut;

type CutMesh = {
  material: { userData: { uniforms: CutUniforms & { uFront: { value: Texture | null }; uBack: { value: Texture | null }; uMirror: { value: number } } } };
  customDepthMaterial?: unknown;
  userData: Record<string, unknown>;
};

/** What a page mesh's two faces carry, from the book's finishes. */
export interface CutSources {
  cutOf(src: unknown): boolean;
  throughOf(src: unknown): { texture: Texture; layers: number; end?: boolean } | null;
}

/**
 * Sets a page mesh's cut uniforms from the pages on its faces: which face
 * is cut, what its holes show (open pages), a leaf's thickness, and for a
 * leaf in the air its key-light depth material and its caster, which
 * discard the holes (the shared caster again once it is not cut). `desk`:
 * nothing lies past the book's end but the desk (no case), so an open page
 * whose holes reach it lets the key light through them too.
 */
export function dressCut(mesh: CutMesh, sources: CutSources, leafDepth: number, caster: { shared: unknown; cut: () => unknown }, desk = false) {
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
  u.uHasFrontCuts.value = ft?.texture.userData.cuts ? 1 : 0;
  u.uHasBackCuts.value = bt?.texture.userData.cuts ? 1 : 0;
  u.uThroughLayers.value = Math.max(ft?.layers ?? 0, bt?.layers ?? 0);
  u.uFrontEnd.value = ft?.end ? ft.layers : 0;
  u.uBackEnd.value = bt?.end ? bt.layers : 0;
  u.uSeeDesk.value = desk ? 1 : 0;
  const air = u.uCutMode.value === CUT_AIR;
  // The face's holes, from whichever face is painted and cut.
  const tex = fc && u.uFront.value ? u.uFront.value : bc && u.uBack.value ? u.uBack.value : null;
  const shared = leafCutOf(mesh);
  shared.uCut.value = tex;
  shared.uHasCut.value = tex ? 1 : 0;
  shared.uCutBack.value = tex && tex !== u.uFront.value ? 1 : 0;
  shared.uMirror.value = u.uMirror.value;
  // An open page drops its holes from the key light's depth only where the
  // desk shows through them: elsewhere the pages beneath are its own
  // picture, shadowed by the walk.
  const throughToDesk = open && desk && !!(ft?.end || bt?.end);
  const casterMesh = mesh.userData.caster as { material: unknown } | undefined;
  if (!tex || !(air || throughToDesk)) {
    mesh.customDepthMaterial = undefined;
    if (casterMesh) casterMesh.material = caster.shared;
    return;
  }
  mesh.customDepthMaterial = (mesh.userData.cutDepth ??= cutDepthMaterial(shared)) as ReturnType<typeof cutDepthMaterial>;
  if (!casterMesh) return;
  const cutCaster = (mesh.userData.cutCaster ??= caster.cut()) as { uniforms: Record<string, { value: unknown }> };
  const c = cutCaster.uniforms;
  c.uCut!.value = tex;
  c.uCutBack!.value = shared.uCutBack.value;
  c.uMirror!.value = shared.uMirror.value;
  c.uHasCut!.value = 1;
  casterMesh.material = cutCaster;
}

/** The caster discard's uniforms, fresh for each cut leaf. */
export const casterCut = () => ({ ...CASTER_CUT, uniforms: { ...leafCut() } as Record<string, { value: unknown }> });
