// The materials of the book: what lies behind the leaves in the air, the
// page material, the cut face of a page block and the colour round a
// printed cover's edge, with the easing curves (#1276: split out of pageFlip.ts).
import { Texture, Vector2, Color, Vector4, Vector3, MeshPhysicalMaterial, DoubleSide, type WebGLProgramParametersWithUniforms, MeshStandardMaterial, SRGBColorSpace } from 'three';
import type { FolioConfig } from 'postext';
import type { PaperSpec } from '../paper.js';
import { MAX_PAGE_VIDEOS } from '../videoAtlas.js';
import { occlusionUniforms, BOOK_POS_PARS, BOOK_POS, keyShadowed, OCCLUSION, keySpecular } from './occlusion.js';

/** What lies behind the leaves in the air (#484): the scene drawn without
 *  the translucent leaves (colour, mipmapped, and depth), shared by every
 *  page. `uBehindSize`: the screen in device px; `uBehindClip`: the
 *  camera's near and far planes; `uBehindScale`: texels of that picture
 *  per book unit at a view depth of 1; `uBehindFloor`: how far (book
 *  units) the sheet's fibres spread even what touches it. */
export const behindUniforms = {
  uBehind: { value: null as Texture | null },
  uBehindDepth: { value: null as Texture | null },
  uBehindOn: { value: 0 },
  uBehindSize: { value: new Vector2(1, 1) },
  uBehindClip: { value: new Vector2(1, 2) },
  uBehindScale: { value: 1 },
  uBehindFloor: { value: 1 },
};

type PageUniforms = {
  uFront: { value: Texture | null };
  uBack: { value: Texture | null };
  uHasFront: { value: number };
  uHasBack: { value: number };
  uMirror: { value: number };
  uShowThrough: { value: number };
  /** The page lying under an open page (the next leaf's face under it)
   *  and how much of its print comes through (#484). */
  uUnder: { value: Texture | null };
  uHasUnder: { value: number };
  uUnderK: { value: number };
  /** How much of the light behind a leaf in the air comes through it. */
  uTransmit: { value: number };
  uPaper: { value: Color };
  /** 1 on the open pages: lifted leaves occlude them. A leaf in the air
   *  does not read that map (it holds the leaf itself, and its own roll
   *  would flicker it). */
  uLeafOcc: { value: number };
  /** Paper closer above a point than this (px) does not occlude it: a
   *  leaf's own surface round a point is not a blocker. */
  uOccBias: { value: number };
  /** The videos playing on the leaf's pages (#477, #507): the atlas their
   *  pictures are drawn into, one texel of it, how many there are and, for
   *  each, where it lies on its page (`origin`, `across`: xy, zw; see
   *  {@link PageVideoFrame}), its `down` and face (xy; z 1 front, 2
   *  back) and its slot in the atlas (fractions from its top left). */
  uVideo: { value: Texture | null };
  uVidTexel: { value: Vector2 };
  uVidCount: { value: number };
  uVidOA: { value: Vector4[] };
  uVidDF: { value: Vector4[] };
  uVidRect: { value: Vector4[] };
  /** The leaves in the air as a gloss open page mirrors them (#483): the
   *  picture (drawn from the camera mirrored in the page's plane, so a
   *  point of the page finds what it mirrors at its own place on screen,
   *  turned left for right), whether it is on, and the size of the screen
   *  in device px. */
  uReflection: { value: Texture | null };
  uReflectionOn: { value: number };
  uReflectionSize: { value: Vector2 };
  /** The mirror plane's normal (world). */
  uReflectionNormal: { value: Vector3 };
};

export type PageMaterial = MeshPhysicalMaterial & { userData: { uniforms: PageUniforms; spec?: PaperSpec | null } };

/**
 * A page's material: three.js's physical (PBR) material lit by the
 * environment and the key light, the printed page on each face, the
 * paper's shade, finish (roughness, a clear coat on coated stock, a fibre
 * sheen on uncoated) and relief (a normal map), and the print on the other
 * side showing faintly through thin paper. Ambient light is cut by the
 * gutter's occlusion (a vertex attribute, from the book's cross-section)
 * and by lifted leaves nearby.
 */
export function pageMaterial(mirror: boolean, sign: number): PageMaterial {
  const m = new MeshPhysicalMaterial({ side: DoubleSide, roughness: 0.85 }) as PageMaterial;
  const uniforms: PageUniforms = {
    uFront: { value: null },
    uBack: { value: null },
    uHasFront: { value: 0 },
    uHasBack: { value: 0 },
    uMirror: { value: mirror ? 1 : 0 },
    uShowThrough: { value: 0 },
    uUnder: { value: null },
    uHasUnder: { value: 0 },
    uUnderK: { value: 0 },
    uTransmit: { value: 0 },
    uPaper: { value: new Color(1, 1, 1) },
    uLeafOcc: { value: 0.45 },
    uOccBias: { value: 6 },
    uVideo: { value: null },
    uVidTexel: { value: new Vector2(1, 1) },
    uVidCount: { value: 0 },
    uVidOA: { value: Array.from({ length: MAX_PAGE_VIDEOS }, () => new Vector4()) },
    uVidDF: { value: Array.from({ length: MAX_PAGE_VIDEOS }, () => new Vector4()) },
    uVidRect: { value: Array.from({ length: MAX_PAGE_VIDEOS }, () => new Vector4()) },
    uReflection: { value: null },
    uReflectionOn: { value: 0 },
    uReflectionSize: { value: new Vector2(1, 1) },
    uReflectionNormal: { value: new Vector3(0, 0, 1) },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, occlusionUniforms, behindUniforms, uniforms, { uSign: { value: sign } });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float ao;
        varying float vAo;
        varying vec2 vPageUv;
        ${BOOK_POS_PARS}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vAo = ao;
        vPageUv = uv;
        ${BOOK_POS}`,
      );
    shader.fragmentShader = keyShadowed(shader.fragmentShader)
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D uFront;
        uniform sampler2D uBack;
        uniform float uHasFront;
        uniform float uHasBack;
        uniform float uMirror;
        uniform float uShowThrough;
        uniform sampler2D uUnder;
        uniform float uHasUnder;
        uniform float uUnderK;
        uniform float uTransmit;
        uniform sampler2D uBehind;
        uniform sampler2D uBehindDepth;
        uniform float uBehindOn;
        uniform vec2 uBehindSize;
        uniform vec2 uBehindClip;
        uniform float uBehindScale;
        uniform float uBehindFloor;
        // The print of both faces at this point: what light coming
        // through the sheet passes on its way.
        vec3 transInk = vec3(1.0);
        uniform vec3 uPaper;
        uniform float uLeafOcc;
        uniform float uSign;
        uniform sampler2D uVideo;
        uniform vec2 uVidTexel;
        uniform float uVidCount;
        uniform vec4 uVidOA[${MAX_PAGE_VIDEOS}];
        uniform vec4 uVidDF[${MAX_PAGE_VIDEOS}];
        uniform vec4 uVidRect[${MAX_PAGE_VIDEOS}];
        uniform sampler2D uReflection;
        uniform float uReflectionOn;
        uniform vec2 uReflectionSize;
        uniform vec3 uReflectionNormal;
        varying float vAo;
        varying vec2 vPageUv;
        varying vec3 vBookPos;
        ${OCCLUSION}`,
      )
      .replace(
        "#include <map_fragment>",
        `{
          // 0 no page, 1 its image, 2 blank paper; uv.x runs from the spine.
          bool front = gl_FrontFacing;
          float has = front ? uHasFront : uHasBack;
          float u = uMirror > 0.5 ? 1.0 - vPageUv.x : vPageUv.x;
          vec2 uvF = vec2(u, vPageUv.y);
          vec2 uvB = vec2(1.0 - u, vPageUv.y);
          vec3 ink = uPaper;
          if (has > 0.5 && has < 1.5) ink = front ? texture2D(uFront, uvF).rgb : texture2D(uBack, uvB).rgb;
          // The videos playing on this face, printed over their posters:
          // the point of the page (from its top left corner) in each
          // picture's own frame, which may lie turned on the page, then in
          // its slot of the atlas (kept half a texel inside it, clear of
          // the next slot).
          vec2 tuv = front ? uvF : uvB;
          for (int i = 0; i < ${MAX_PAGE_VIDEOS}; i++) {
            if (float(i) >= uVidCount) break;
            vec4 oa = uVidOA[i];
            vec4 df = uVidDF[i];
            if ((df.z < 1.5) != front) continue;
            vec2 p = vec2(tuv.x, 1.0 - tuv.y) - oa.xy;
            vec2 st = vec2(dot(p, oa.zw) / dot(oa.zw, oa.zw), dot(p, df.xy) / dot(df.xy, df.xy));
            if (st.x >= 0.0 && st.x <= 1.0 && st.y >= 0.0 && st.y <= 1.0) {
              vec4 r = uVidRect[i];
              vec2 v = clamp(r.xy + st * r.zw, r.xy + 0.5 * uVidTexel, r.xy + r.zw - 0.5 * uVidTexel);
              ink = texture2D(uVideo, vec2(v.x, 1.0 - v.y)).rgb;
            }
          }
          // The other side's print, seen through the sheet (the same point
          // of paper, so mirrored as it should be).
          float other = front ? uHasBack : uHasFront;
          vec3 through = vec3(1.0);
          if ((uShowThrough > 0.0 || uTransmit > 0.0) && other > 0.5 && other < 1.5) {
            through = front ? texture2D(uBack, uvB).rgb : texture2D(uFront, uvF).rgb;
          }
          transInk = ink * through;
          if (uShowThrough > 0.0) ink *= mix(vec3(1.0), through, uShowThrough);
          // The page lying under an open page: its print comes through the
          // whole sheet (the fibres spread it by a fraction of a millimetre,
          // finer than the page's own texels: a softer sample would blur
          // a page seen small to grey).
          if (uHasUnder > 0.5 && uUnderK > 0.0) {
            vec3 under = texture2D(uUnder, front ? uvF : uvB).rgb;
            ink *= mix(vec3(1.0), under, uUnderK);
          }
          diffuseColor.rgb *= ink;
        }`,
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
        {
          // A leaf's own roll counts among the leaves it is occluded by:
          // held to what its open side would let in.
          float occ = vAo * (1.0 - uLeafOcc * bookOcclusion(vBookPos, 1.0));
          reflectedLight.indirectDiffuse *= occ;
          reflectedLight.indirectSpecular *= mix(1.0, occ, 0.85);
        }
        // The reflection's ray, in book coordinates.
        vec3 reflected = (vec4(reflect(-geometryViewDir, normal), 0.0) * viewMatrix).xyz;
        reflected.x *= uSign;
        // A mirrored leaf stands for what it hides itself.
        ${keySpecular("1.0 - 0.85 * (uReflectionOn > 0.5 ? 0.0 : reflectionOcclusion(vBookPos, reflected, 1.0))")}
        #ifdef USE_CLEARCOAT
        if (uReflectionOn > 0.5) {
          // The leaves in the air, mirrored in a gloss page: where one is
          // seen, it takes the place of the environment it hides, through
          // the coating's Fresnel and the paper's own. A plane holds only
          // where the page lies in it: the mirror fades up the gutter.
          vec2 st = gl_FragCoord.xy / uReflectionSize;
          vec4 seen = texture2D(uReflection, vec2(1.0 - st.x, st.y));
          float lies = smoothstep(0.97, 0.995, abs(dot((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz, uReflectionNormal)));
          float a = seen.a * lies;
          vec3 leaf = seen.rgb * lies;
          clearcoatSpecularIndirect = clearcoatSpecularIndirect * (1.0 - a)
            + leaf * EnvironmentBRDF(geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness);
          reflectedLight.indirectSpecular = reflectedLight.indirectSpecular * (1.0 - a)
            + leaf * EnvironmentBRDF(geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness);
        }
        #endif
        if (uBehindOn > 0.5 && uTransmit > 0.0) {
          // Thin paper in the air lets through the light behind it (#484):
          // what lies there on screen, seen through the print of both
          // faces. The sheet scatters what it lets through about evenly
          // (near Lambertian), so a thing a gap behind it is spread over
          // about twice that gap: sharp where the leaf touches the page
          // under it, a soft glow a few millimetres off. A page close
          // under it is lit only through the leaf, so its print comes
          // back at about half the leaf's transmittance (1 − opacity, as
          // the open page shows the one under it); what lies further, out
          // of the leaf's shade, at the whole of it. Stronger and sharper,
          // the page under a leaf about to land read as lying over it
          // (#492). What it lets through it does not reflect.
          vec2 st = gl_FragCoord.xy / uBehindSize;
          float depth = texture2D(uBehindDepth, st).x;
          float zBehind = uBehindClip.x * uBehindClip.y / (uBehindClip.y - depth * (uBehindClip.y - uBehindClip.x));
          float gap = max(0.0, zBehind - vViewPosition.z);
          float spread = (uBehindFloor + 2.0 * gap) * uBehindScale / vViewPosition.z;
          vec4 seen = textureLod(uBehind, st, log2(max(1.0, 2.0 * spread)));
          float carried = uTransmit * mix(0.5, 1.0, smoothstep(0.0, 8.0 * uBehindFloor, gap));
          float lost = carried * seen.a;
          reflectedLight.directDiffuse *= 1.0 - lost;
          reflectedLight.indirectDiffuse = reflectedLight.indirectDiffuse * (1.0 - lost) + carried * seen.rgb * transInk;
        }`,
      );
  };
  return m;
}

/** The uniforms every page block's edge material shares: book units per
 *  mm, and how strongly the cut face is relieved (uncoated stock shows
 *  its fibres; a coated sheet is cut cleaner). */
export const edgeUniforms = {
  uEdgeK: { value: 1 },
  uEdgeRelief: { value: 1 },
};

// The cut face of a page block, as a height field in mm over (leaf, mm
// along the cut): every leaf a rounded ridge standing a hair proud of or
// behind its neighbours (sheets are never quite in line), the sections
// and the bundles the knife took together a little out of line with the
// next, and the faint streaks the guillotine drags across the block. Each
// scale fades out where it is finer than a pixel, so the face never
// shimmers. The relief bends the normal (bump mapping from the screen-
// space derivatives of the field), so the face catches a grazing light.
const EDGE_RELIEF = /* glsl */ `
  uniform float uEdgeK;
  uniform float uEdgeRelief;
  varying float vRun;
  float eHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  float eHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float eNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(eHash2(i), eHash2(i + vec2(1.0, 0.0)), u.x), mix(eHash2(i + vec2(0.0, 1.0)), eHash2(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // fade: x = the leaves, y = the bundles, z = the fine knife marks.
  float edgeHeight(vec2 lv, vec3 fade) {
    float id = floor(lv.x);
    float ridge = sin(fract(lv.x) * PI);
    float proud = eHash(id) - 0.5 + 0.8 * (eNoise(vec2(id * 0.37, lv.y * 0.12)) - 0.5);
    float leaf = (0.45 * ridge + proud) * 0.04 * fade.x;
    float bundle = (eNoise(vec2(lv.x / 5.0, lv.y * 0.03)) - 0.5) * 0.12 * fade.y
      + (eNoise(vec2(lv.x / 24.0 + 7.0, lv.y * 0.02)) - 0.5) * 0.18;
    float knife = (eNoise(vec2(lv.y * 0.7, lv.x / 90.0)) - 0.5) * 0.035
      + (eNoise(vec2(lv.y * 3.0, lv.x / 40.0)) - 0.5) * 0.006 * fade.z;
    return leaf + bundle + knife;
  }
  vec3 edgeNormal(vec3 surfPos, vec3 n, vec2 dH, float faceDir) {
    vec3 sx = dFdx(surfPos);
    vec3 sy = dFdy(surfPos);
    vec3 r1 = cross(sy, n);
    vec3 r2 = cross(n, sx);
    float det = dot(sx, r1) * faceDir;
    vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
    return normalize(abs(det) * n - grad);
  }
`;

/** The page block's edges: paper with a fine line between leaves (fading
 *  to their average where the lines are finer than a pixel), its cut face
 *  in relief. */
export function edgeMaterial(sign: number, bands?: { lo: number; hi: number; color: Color }, paper?: Color): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ side: DoubleSide, roughness: 0.92 });
  if (paper) m.color.copy(paper);
  const band = { uBoardLo: { value: bands?.lo ?? -1 }, uBoardHi: { value: bands?.hi ?? 2 }, uBoardColor: { value: bands?.color ?? new Color(0, 0, 0) } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, occlusionUniforms, edgeUniforms, band, { uSign: { value: sign } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float layer;\nattribute float lambda;\nattribute float run;\nvarying float vLayer;\nvarying float vLambda;\nvarying float vRun;\n${BOOK_POS_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvLayer = layer;\nvLambda = lambda;\nvRun = run;\n${BOOK_POS}`);
    shader.fragmentShader = keyShadowed(shader.fragmentShader)
      .replace("#include <common>", `#include <common>\nuniform float uBoardLo;\nuniform float uBoardHi;\nuniform vec3 uBoardColor;\nvarying float vLayer;\nvarying float vLambda;\nvarying vec3 vBookPos;\n${OCCLUSION}\n${EDGE_RELIEF}`)
      .replace(
        "#include <normal_fragment_maps>",
        `{
          vec2 lv = vec2(vLayer, vRun / uEdgeK);
          vec2 dx = dFdx(lv);
          vec2 dy = dFdy(lv);
          float wl = fwidth(vLayer);
          vec3 fade = vec3(
            1.0 - smoothstep(0.3, 0.8, wl),
            1.0 - smoothstep(2.0, 5.0, wl),
            1.0 - smoothstep(0.05, 0.15, fwidth(lv.y))
          );
          float h0 = edgeHeight(lv, fade);
          vec2 dH = vec2(edgeHeight(lv + dx, fade) - h0, edgeHeight(lv + dy, fade) - h0) * uEdgeK * uEdgeRelief;
          if (vLambda >= uBoardLo && vLambda <= uBoardHi) normal = edgeNormal(-vViewPosition, normal, dH, faceDirection);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `{
          float w = fwidth(vLayer);
          float d = abs(fract(vLayer) - 0.5) * 2.0;
          float line = smoothstep(0.55 - w, 0.95 + w, d);
          float fine = clamp(w * 1.5, 0.0, 1.0);
          diffuseColor.rgb *= 1.0 - mix(0.22 * line, 0.08, fine);
          // The bundles' sheets are never quite one shade.
          diffuseColor.rgb *= 1.0 + 0.06 * uEdgeRelief * (eNoise(vec2(vLayer / 9.0, 3.0)) - 0.5);
          // A board lying in the block (the book's own cover) shows its
          // own edge, not paper.
          if (vLambda < uBoardLo || vLambda > uBoardHi) diffuseColor.rgb = uBoardColor;
        }`,
      )
      .replace(
        "#include <aomap_fragment>",
        "#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= 1.0 - bookOcclusion(vBookPos, 0.0);",
      );
  };
  return m;
}

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The stock a publisher would print a book of `pages` pages on, when its
 * settings name none: a long book goes on lighter paper, a very long one
 * on bible paper (2,000 pages make a volume about 4.5 cm thick, not 11).
 * Settings that name a stock, a grammage or a bulk are kept as they are.
 */
export function withStockForExtent(folio: FolioConfig | undefined, pages: number): FolioConfig | undefined {
  const paper = folio?.paper;
  if (paper?.type !== undefined || paper?.grammage !== undefined || paper?.bulk !== undefined) return folio;
  if (pages > 1000) return { ...folio, paper: { ...paper, type: "bible" } };
  if (pages > 600) return { ...folio, paper: { ...paper, grammage: 70 } };
  return folio;
}

/** The colour round the edge of a printed cover (its ground), averaged: the
 *  colour its boards and spine show when the book carries its own covers.
 *  Null when the image cannot be read. */
export function edgeColorOf(image: CanvasImageSource & { width: number; height: number }): Color | null {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    if (!g) return null;
    g.drawImage(image, 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data;
    let r = 0;
    let gr = 0;
    let b = 0;
    let n = 0;
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        if (x > 1 && x < 30 && y > 1 && y < 30) continue;
        const i = (y * 32 + x) * 4;
        r += d[i];
        gr += d[i + 1];
        b += d[i + 2];
        n++;
      }
    return new Color().setRGB(r / n / 255, gr / n / 255, b / n / 255, SRGBColorSpace);
  } catch {
    return null;
  }
}
