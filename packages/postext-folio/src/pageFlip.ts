import {
  BoxGeometry,
  BufferAttribute,
  Color,
  CustomBlending,
  DirectionalLight,
  DoubleSide,
  Group,
  HalfFloatType,
  LinearMipmapLinearFilter,
  MaxEquation,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  LinearFilter,
  NeutralToneMapping,
  OneFactor,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Scene,
  ShaderChunk,
  ShaderMaterial,
  ShadowMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
  type BufferGeometry,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { resolveFolioConfig, type FolioConfig, type FolioPaperConfig, type ResolvedFolioConfig } from "postext";
import { along, BINDINGS, gutterOcclusion, profiles, stackGeometry, type Profile } from "./bookGeometry";
import { environment, type Environment, type EnvironmentKind } from "./environments";
import { pagePaper, paperSpec, type PaperSpec } from "./paper";
import { loadDeskMaps, type DeskMaps } from "./deskTextures";
import { cachedDesk, cachedRelief, type DeskKind } from "./procedural";

/** A page: an image URL, or a canvas or a decoded image to draw; "" is a
 *  blank page (drawn as paper), null no page at all. */
export type PageSource = string | HTMLCanvasElement | HTMLImageElement | null;

/** A spread: [verso, recto]. */
export type SpreadSrc = [PageSource, PageSource];

type Drawn = Exclude<PageSource, null | "">;

/** How the book is presented: the `folio` settings, the page's physical
 *  width, the leaves of the book outside the pages shown (counted for the
 *  thickness of the page block) and the paper of each leaf that is not
 *  the book's own. */
export interface FlipAppearance {
  folio?: FolioConfig;
  /** The trim width of a page, mm. Default 150. */
  pageWidthMm?: number;
  /** Leaves before the first spread and after the last one. */
  extraLeaves?: { before: number; after: number };
  /** Leaf k's own paper (a `:::paper` run), by leaf. */
  leafPapers?: readonly (FolioPaperConfig | undefined)[];
  /** One page per leaf (the single-page view): the leaf's back is blank,
   *  so a leaf counts half a sheet towards the block's thickness. */
  singlePage?: boolean;
  /** Where the scanned desk textures are served (a folder holding
   *  `manifest.json`, as postext.dev serves under `/folio/textures`).
   *  Without it, or until they load, the desk is drawn with procedural
   *  maps. */
  textureBaseUrl?: string;
  /** The leaves that are the book's own covers (`folio.binding.cover:
   *  'pages'`): the front board (leaf 0) and the back board (the last
   *  leaf), when the document has them. No case is drawn then. */
  coverLeaves?: { front?: number; back?: number };
  /** The picture printed on the spine (`folio.binding.spineImage`): the
   *  spine as seen with the book standing, head up and the front cover to
   *  the right. Fitted to cover the back of the block, centred. A
   *  saddle-stitched book has no spine and shows none. */
  spineImage?: PageSource;
}

/** Columns and rows of a leaf's mesh: fine enough for a tight roll. */
const NX = 96;
const NY = 120;
/** Columns of a page lying open (its curve runs across only). */
const NX_OPEN = 72;
/** Vertical field of view. */
const FOV = 24;
/** Radius of the roll at mid-turn for 90 g/m² offset, against the page's width. */
const ROLL = 0.11;
/** Milliseconds one leaf takes to turn. */
const DURATION = 1000;
/** A leaf follows the one before it once that one is this far through its turn. */
const GAP = 0.14;

// Ambient occlusion from the book's own shape: each frame the book is
// drawn, seen from straight above, into a height map: channel r the
// highest of everything (blocks, covers, open pages, leaves), channel g the
// leaves in the air alone. A point is occluded by paper rising round it,
// more the nearer and higher it is: the book's contact shadow on the desk
// and the dark under a lifted leaf. The open pages read only the leaves'
// channel (their gutter is worked out from the cross-section).
const OCCLUSION = /* glsl */ `
  uniform sampler2D uShadowMap;
  uniform vec4 uShadowBox;
  uniform float uShadowOn;
  uniform float uOccRadius;
  uniform float uOccBias;
  float casterAt(vec2 s, float channel) {
    vec2 uv = (s - uShadowBox.xy) / uShadowBox.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -1e4;
    vec4 t = texture2D(uShadowMap, uv);
    return (channel > 0.5 ? t.g : t.r) - 10.0;
  }
  // Horizon-based: in each of 8 directions, the highest paper seen from p
  // (as an elevation angle) hides that much of the sky: sin(horizon) of a
  // cosine-weighted slice.
  float bookOcclusion(vec3 p, float channel) {
    if (uShadowOn < 0.5) return 0.0;
    float spin = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float occ = 0.0;
    for (int d = 0; d < 8; d++) {
      float a = (float(d) + spin) * 0.785398;
      vec2 dir = vec2(cos(a), sin(a));
      float horizon = 0.0;
      for (int i = 0; i < 4; i++) {
        float t = (float(i) + 0.25 + 0.5 * spin) / 4.0;
        float r = t * t * uOccRadius + 1.0;
        float h = casterAt(p.xy + r * dir, channel) - p.z - uOccBias;
        horizon = max(horizon, h / sqrt(h * h + r * r));
      }
      occ += horizon;
    }
    return occ / 8.0;
  }
  // How far the reflection seen at p runs under paper: its ray marched
  // out through the height map (a lifted leaf hides what it would mirror,
  // and so does the leaf's own roll over the inside of its curl). The
  // march starts a few px out, past the paper round p itself.
  float reflectionOcclusion(vec3 p, vec3 r, float channel) {
    if (uShadowOn < 0.5) return 0.0;
    float hidden = 0.0;
    for (int i = 1; i <= 6; i++) {
      float t = 6.0 + float(i * i) / 36.0 * uOccRadius * 2.0;
      vec3 q = p + r * t;
      hidden = max(hidden, smoothstep(0.0, 4.0, casterAt(q.xy, channel) - q.z - uOccBias));
    }
    return hidden;
  }
`;

/** Declares the book position varying in a vertex shader and sets it:
 *  the world position with the mirror of a right-bound book undone. */
const BOOK_POS_PARS = "uniform float uSign;\nvarying vec3 vBookPos;";
const BOOK_POS = "vBookPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvBookPos.x *= uSign;";

// The casters lie outside the stage, in the book's own coordinates (as
// `vBookPos` reads the map): no mirror here (#334).
const CASTER_VERTEX = /* glsl */ `
  varying float vZ;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vZ = w.z;
    gl_Position = projectionMatrix * viewMatrix * vec4(w.xy, 0.0, 1.0);
  }
`;
const CASTER_FRAGMENT = /* glsl */ `
  uniform float uLeaf;
  varying float vZ;
  void main() {
    gl_FragColor = vec4(vZ + 10.0, uLeaf * (vZ + 10.0), 0.0, 1.0);
  }
`;

/** The occlusion uniforms every receiving material shares (same objects). */
const occlusionUniforms = {
  uShadowMap: { value: null as Texture | null },
  uShadowBox: { value: new Vector4(0, 0, 1, 1) },
  uShadowOn: { value: 0 },
  uOccRadius: { value: 60 },
  uOccBias: { value: 1 },
};

// The key light's soft shadow, each of its samples compared against the
// receiver's own plane carried to that sample (receiver-plane depth bias):
// three.js compares them all at the receiver's depth, so a sheet steep to
// the light, a leaf in the air, found itself nearer the light a few texels
// away and fell in its own shadow (#330). The shadow is kept (`keyShadow`)
// so the reflections can be cut with it too.
const SHADOW_PCF_HEAD = "float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {";
const SHADOW_PCF = /* glsl */ `
  ${SHADOW_PCF_HEAD}
    shadowCoord.xyz /= shadowCoord.w;
    shadowCoord.z += shadowBias;
    // How the receiver's depth in the map runs with the map's uv.
    vec3 sx = dFdx(shadowCoord.xyz);
    vec3 sy = dFdy(shadowCoord.xyz);
    float det = sx.x * sy.y - sx.y * sy.x;
    vec2 slope = abs(det) > 1e-12 ? vec2(sy.y * sx.z - sx.y * sy.z, sx.x * sy.z - sy.x * sx.z) / det : vec2(0.0);
    float shadow = 1.0;
    if (shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0 && shadowCoord.z <= 1.0) {
      float radius = shadowRadius / shadowMapSize.x;
      float phi = interleavedGradientNoise(gl_FragCoord.xy) * PI2;
      shadow = 0.0;
      for (int i = 0; i < 5; i++) {
        vec2 o = vogelDiskSample(i, 5, phi) * radius;
        // Held in where the plane runs nearly along the light.
        float dz = clamp(dot(slope, o), -0.05, 0.05);
        shadow += texture(shadowMap, vec3(shadowCoord.xy + o, shadowCoord.z + dz));
      }
      shadow *= 0.2;
    }
    keyShadow = shadow;
    return mix(1.0, shadow, shadowIntensity);
  }
`;
const SHADOW_PARS = (() => {
  const chunk = ShaderChunk.shadowmap_pars_fragment;
  const start = chunk.indexOf(SHADOW_PCF_HEAD);
  const end = chunk.indexOf("#elif defined( SHADOWMAP_TYPE_VSM )", start);
  // Another three.js: its own shadows (no receiver plane).
  const pars = start < 0 || end < 0 ? chunk : chunk.slice(0, start) + SHADOW_PCF + chunk.slice(end);
  return `float keyShadow = 1.0;\n${pars}`;
})();

/** How much of the environment's reflection the key's shadow takes away:
 *  the key stands where the environment's brightest emitter is, so what
 *  hides it from a point hides that emitter's reflection too. */
function keySpecular(occlusion = "1.0") {
  return /* glsl */ `{
  float keySpec = mix(1.0, keyShadow, 0.85) * (${occlusion});
  reflectedLight.indirectSpecular *= keySpec;
  #ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect *= keySpec;
  #endif
  #ifdef USE_SHEEN
    sheenSpecularIndirect *= keySpec;
  #endif
}`;
}

/** Gives a material the key's shadow on its own plane. */
function keyShadowed(fragmentShader: string): string {
  return fragmentShader.replace("#include <shadowmap_pars_fragment>", SHADOW_PARS);
}

function casterMaterial(leaf: boolean) {
  return new ShaderMaterial({
    vertexShader: CASTER_VERTEX,
    fragmentShader: CASTER_FRAGMENT,
    side: DoubleSide,
    blending: CustomBlending,
    blendEquation: MaxEquation,
    blendEquationAlpha: MaxEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    depthTest: false,
    depthWrite: false,
    uniforms: { uLeaf: { value: leaf ? 1 : 0 } },
  });
}

/** A standard material (the desk, the covers) with the book's occlusion
 *  on its ambient light. */
function occluded<T extends MeshStandardMaterial>(m: T, sign: number): T {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, occlusionUniforms, { uSign: { value: sign } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${BOOK_POS_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${BOOK_POS}`);
    shader.fragmentShader = keyShadowed(shader.fragmentShader)
      .replace("#include <common>", `#include <common>\nvarying vec3 vBookPos;\n${OCCLUSION}`)
      .replace(
        "#include <aomap_fragment>",
        "#include <aomap_fragment>\n{ float occ = 1.0 - bookOcclusion(vBookPos, 0.0); reflectedLight.indirectDiffuse *= occ; reflectedLight.indirectSpecular *= occ; }\n" + keySpecular(),
      );
  };
  return m;
}

type PageUniforms = {
  uFront: { value: Texture | null };
  uBack: { value: Texture | null };
  uHasFront: { value: number };
  uHasBack: { value: number };
  uMirror: { value: number };
  uShowThrough: { value: number };
  uPaper: { value: Color };
  /** 1 on the open pages: lifted leaves occlude them. A leaf in the air
   *  does not read that map (it holds the leaf itself, and its own roll
   *  would flicker it). */
  uLeafOcc: { value: number };
  /** Paper closer above a point than this (px) does not occlude it: a
   *  leaf's own surface round a point is not a blocker. */
  uOccBias: { value: number };
};

type PageMaterial = MeshPhysicalMaterial & { userData: { uniforms: PageUniforms; spec?: PaperSpec | null } };

/**
 * A page's material: three.js's physical (PBR) material lit by the
 * environment and the key light, the printed page on each face, the
 * paper's shade, finish (roughness, a clear coat on coated stock, a fibre
 * sheen on uncoated) and relief (a normal map), and the print on the other
 * side showing faintly through thin paper. Ambient light is cut by the
 * gutter's occlusion (a vertex attribute, from the book's cross-section)
 * and by lifted leaves nearby.
 */
function pageMaterial(mirror: boolean, sign: number): PageMaterial {
  const m = new MeshPhysicalMaterial({ side: DoubleSide, roughness: 0.85 }) as PageMaterial;
  const uniforms: PageUniforms = {
    uFront: { value: null },
    uBack: { value: null },
    uHasFront: { value: 0 },
    uHasBack: { value: 0 },
    uMirror: { value: mirror ? 1 : 0 },
    uShowThrough: { value: 0 },
    uPaper: { value: new Color(1, 1, 1) },
    uLeafOcc: { value: 0.45 },
    uOccBias: { value: 6 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, occlusionUniforms, uniforms, { uSign: { value: sign } });
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
        uniform vec3 uPaper;
        uniform float uLeafOcc;
        uniform float uSign;
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
          // The other side's print, seen through the sheet (the same point
          // of paper, so mirrored as it should be).
          float other = front ? uHasBack : uHasFront;
          if (uShowThrough > 0.0 && other > 0.5 && other < 1.5) {
            vec3 through = front ? texture2D(uBack, uvB).rgb : texture2D(uFront, uvF).rgb;
            ink *= mix(vec3(1.0), through, uShowThrough);
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
        ${keySpecular("1.0 - 0.85 * reflectionOcclusion(vBookPos, reflected, 1.0)")}`,
      );
  };
  return m;
}

/** The page block's edges: paper with a fine line between leaves (fading
 *  to their average where the lines are finer than a pixel). */
function edgeMaterial(sign: number, bands?: { lo: number; hi: number; color: Color }): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ side: DoubleSide, roughness: 0.92 });
  const band = { uBoardLo: { value: bands?.lo ?? -1 }, uBoardHi: { value: bands?.hi ?? 2 }, uBoardColor: { value: bands?.color ?? new Color(0, 0, 0) } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, occlusionUniforms, band, { uSign: { value: sign } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float layer;\nattribute float lambda;\nvarying float vLayer;\nvarying float vLambda;\n${BOOK_POS_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvLayer = layer;\nvLambda = lambda;\n${BOOK_POS}`);
    shader.fragmentShader = keyShadowed(shader.fragmentShader)
      .replace("#include <common>", `#include <common>\nuniform float uBoardLo;\nuniform float uBoardHi;\nuniform vec3 uBoardColor;\nvarying float vLayer;\nvarying float vLambda;\nvarying vec3 vBookPos;\n${OCCLUSION}`)
      .replace(
        "#include <map_fragment>",
        `{
          float w = fwidth(vLayer);
          float d = abs(fract(vLayer) - 0.5) * 2.0;
          float line = smoothstep(0.55 - w, 0.95 + w, d);
          float fine = clamp(w * 1.5, 0.0, 1.0);
          diffuseColor.rgb *= 1.0 - mix(0.22 * line, 0.08, fine);
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

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (a: number, b: number, x: number) => {
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
function edgeColorOf(image: CanvasImageSource & { width: number; height: number }): Color | null {
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

/** The lowest the reader may orbit the view: 70° from straight above. */
const MAX_PITCH = (70 * Math.PI) / 180;

/** How far (radians) a leaf in mid-turn stands off the pages at the spine. */
const LEAN = 0.12;

/** Where column `t` (0 … 1) of a page's mesh lies across it: closer
 *  together near the spine, where the gutter bends tightest. */
const column = (t: number) => Math.pow(t, 1.45);

/** Sets a page mesh's u coordinates to its columns. */
function spreadColumns(geometry: BufferGeometry, nx: number) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, column((i % (nx + 1)) / nx));
  uv.needsUpdate = true;
}

/** max(a, b), rounded over a band `k` wide (no crease where they meet). */
function smoothMax(a: number, b: number, k: number) {
  return (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
}

/** Where arc length `signed` from the spine lies on the open book's
 *  surface (right page positive): [x, z]. */
function surfaceAt(book: Surfaces, signed: number): [number, number] {
  const [bx, bz] = along(signed >= 0 ? book.right : book.left, Math.abs(signed));
  return [(signed >= 0 ? 1 : -1) * bx, bz];
}

/** A point in a leaf's own coordinates: `u` from the spine (0 … W), `v`
 *  from the middle of the page (−H/2 … H/2). Backward turns mirror x. */
interface Pt {
  u: number;
  v: number;
}

/**
 * How a leaf folds when the point `G` of it has been carried to `P`: the
 * paper stays flat up to a fold line, rolls round a cylinder of radius R
 * and lies over itself beyond it, back up (the page-curl cylinder). The
 * fold is square to the pull, placed so the point taken lands under the
 * hand, and never crosses the spine the leaf is sewn to. R grows as the
 * page lifts and shrinks to nothing as it lands on the other side; a
 * stiffer paper (`roll`) bends in a wider roll.
 */
function foldOf(G: Pt, P: Pt, W: number, H: number, roll = 1) {
  const du = G.u - P.u;
  const dv = G.v - P.v;
  const D = Math.hypot(du, dv);
  if (D < 0.5) return null;
  const n = { u: du / D, v: dv / D };
  const q = progressFrom(G, P);
  const R = Math.min(0.5, ROLL * roll) * W * (0.3 + 0.7 * smooth(0, 0.2, q)) * (1 - smooth(0.62, 1, q)) * Math.min(1, D / (0.1 * W));
  // How far the paper past the fold has turned: a leaf held up by the hand
  // stands in the air (about 110° early in the turn), and only lies back
  // flat (180°) as it lands. Folding it flat over itself all the way (the
  // table-paper curl) made a tent of a leaf dragged across the spine.
  const theta = Math.PI * (0.62 + 0.38 * smooth(0.05, 1, q));
  // The fold sits where the point taken, carried round the roll and on
  // straight, lands over the hand: R sinθ + (c − Rθ) cosθ = c − D.
  const arc = R * theta;
  const k = arc > 0 ? Math.min(1, D / arc) : 0;
  let c = (D + k * (R * Math.sin(theta) - arc * Math.cos(theta))) / (1 - Math.cos(theta));
  for (const S of [-H / 2, H / 2]) c = Math.min(c, G.u * n.u + (G.v - S) * n.v);
  if (c <= 0) return null;
  return { F: { u: G.u - n.u * c, v: G.v - n.v * c }, n, R, theta };
}

type Fold = NonNullable<ReturnType<typeof foldOf>>;

/** How far through its turn a leaf is: the point taken, from where it
 *  was to its mirror image across the spine. */
function progressFrom(G: Pt, P: Pt) {
  return Math.min(1, Math.max(0, (G.u - P.u) / (2 * G.u)));
}

/** The hand can carry the point taken no farther from the spine's ends
 *  than the paper reaches. */
function reach(G: Pt, P: Pt, H: number): Pt {
  let { u, v } = P;
  for (let i = 0; i < 4; i++) {
    for (const S of [-H / 2, H / 2]) {
      const r = Math.hypot(G.u, G.v - S);
      const d = Math.hypot(u, v - S);
      if (d > r) {
        u *= r / d;
        v = S + ((v - S) * r) / d;
      }
    }
  }
  return { u, v };
}

/** The open book's two surfaces, which a leaf lies on at rest. */
interface Surfaces {
  left: Profile;
  right: Profile;
}

/**
 * Lays a leaf's mesh out. The curl is worked out on the flat page (u from
 * the spine), then wrapped onto the book: the part on the right follows
 * the right stack's top (into the gutter and out), the part carried over
 * the spine the left one's. A stiff leaf (`rigidity`) turns more as a
 * plate on its hinge: a board does not bend at all.
 */
function layLeaf(geometry: BufferGeometry, fold: Fold | null, forward: boolean, W: number, H: number, lift: number, book: Surfaces, rigidity: number, q: number, flutter = 0, time = 0, hingeZ?: number) {
  const pos = geometry.attributes.position;
  const sx = forward ? 1 : -1;
  const [xr, zr] = along(book.right, W);
  const [xl, zl] = along(book.left, W);
  const qa = forward ? q : 1 - q;
  let hinge: number;
  let phi: number;
  let r: number;
  if (hingeZ !== undefined) {
    // A board (a case's cover): it turns on the joint at the top of the
    // block, and as it comes down to the lower side the joint comes down
    // the spine with it (the cloth flexes), so it lands flat on that side
    // instead of dropping. Flat on either side, it is exactly its rest.
    const descend = zl < zr ? smooth(0.4, 1, qa) : 1 - smooth(0.4, 1, 1 - qa);
    hinge = zr + (zl - zr) * descend;
    phi = Math.PI * ease(qa);
    r = rigidity;
  } else {
    // A stiff leaf rests on its stack's fore-edge and swings over the gutter.
    r = rigidity * smooth(0, 0.06, q) * smooth(0, 0.06, 1 - q);
    hinge = along(book.right, 0)[1];
    const a0 = Math.atan2(zr - hinge, xr);
    const a1 = Math.PI - Math.atan2(zl - hinge, xl);
    phi = a0 + (a1 - a0) * qa;
  }
  // How far a turning leaf stands off the pages: none at rest or for a
  // corner barely lifted, a few degrees through the middle of the turn.
  const inAir = smooth(0.02, 0.22, q) * smooth(0.02, 0.22, 1 - q);
  const lean = LEAN * inAir;
  const cosA = Math.cos(lean);
  const sinA = Math.sin(lean);
  const floor = along(book.right, 0)[1];
  for (let iy = 0; iy <= NY; iy++) {
    const v = (0.5 - iy / NY) * H;
    for (let ix = 0; ix <= NX; ix++) {
      const u = column(ix / NX) * W;
      let x = u;
      let y = v;
      let z = 0;
      if (fold) {
        const { F, n, R } = fold;
        const d = (u - F.u) * n.u + (v - F.v) * n.v;
        if (d > 0) {
          // Round the roll, then straight on at the fold's angle.
          const theta = fold.theta;
          let dd: number;
          if (R > 1e-3 && d < R * theta) {
            dd = R * Math.sin(d / R);
            z = R * (1 - Math.cos(d / R));
          } else {
            const rest = d - R * theta;
            dd = R * Math.sin(theta) + rest * Math.cos(theta);
            z = R * (1 - Math.cos(theta)) + rest * Math.sin(theta);
          }
          x = u - n.u * (d - dd);
          y = v - n.v * (d - dd);
        }
      }
      // Onto the book. At rest (and as it lands) the leaf lies on the open
      // book's surface, into the gutter and out. In the air it is lifted
      // off at the spine: its own plane rises from the gutter's floor at a
      // small angle, and it touches the pages only where they stand higher
      // (the gutter's walls), joined smoothly.
      const s = sx * x;
      const [rx, rz] = surfaceAt(book, s);
      let px = rx;
      let pz = rz + z + lift;
      if (inAir > 0) {
        const fx = (s >= 0 ? 1 : -1) * Math.abs(s) * cosA;
        const plane = floor + Math.abs(s) * sinA + z + lift;
        const under = surfaceAt(book, fx)[1] + lift + 0.6;
        const flying = smoothMax(plane, under, 0.02 * W);
        px += (fx - px) * inAir;
        pz += (flying - pz) * inAir;
      }
      if (r > 0) {
        px += (u * Math.cos(phi) - px) * r;
        y += (v - y) * r;
        pz += (hinge + lift + u * Math.sin(phi) - pz) * r;
      }
      // Thin paper ripples in the air, more towards its free edge.
      if (flutter > 0) pz += flutter * W * (u / W) * (u / W) * Math.sin(2 * Math.PI * (time / 520) - (3 * u) / W + (2 * v) / H);
      pos.setXYZ(iy * (NX + 1) + ix, px, y, pz);
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

type PageMesh = Mesh<BufferGeometry, PageMaterial>;

interface Turn {
  forward: boolean;
  /** A board's hinge height: the top of the block it left. */
  hinge?: number;
  /** The point taken, and where the hand holds it now. */
  G: Pt;
  P: Pt;
  /** Held by the reader's pointer: `P` follows `aim`. */
  held?: { aim: Pt; samples: { t: number; p: Pt }[] };
  /** Carried by the animation: from → to, lifted `arc` on the way. */
  anim?: { start: number; duration: number; from: Pt; to: Pt; arc: number; lands: boolean };
  /** Let go: the point eases from where the hand left it (`from`, at the
   *  hand's speed `vel`, px/ms) to `to`, arriving at rest after `duration`
   *  ms (a cubic Hermite curve: no jump, no lingering tail). */
  spring?: { from: Pt; to: Pt; vel: Pt; start: number; duration: number; lands: boolean };
}

interface Airborne {
  k: number;
  q: number;
  forward: boolean;
  fold: Fold | null;
  mesh: PageMesh;
  spec: PaperSpec;
}

/**
 * Turns the pages of the viewer's DOM spread in a 3D scene: the book lies
 * open on a desk, seen from in front and above (tilted by `folio.tilt`),
 * lit by an environment (image-based light, reflected by glossy paper) and
 * a key light that casts the shadows. The pages already read and those
 * still to come form two blocks of real thickness (leaf count × the
 * paper's caliper, the book's other chapters included), bound in a case or
 * a soft cover; the open pages curve down into the gutter, whose darkness
 * is the occlusion of that shape.
 *
 * The book is a stack of leaves: leaf k has spread k's recto on its front
 * and spread k + 1's verso on its back. `go(n)` sends every leaf before
 * spread n to the left and the rest to the right; each turns on its own,
 * following the one before it at a short remove, so several pages can be
 * in the air at once.
 *
 * The book is modelled bound on the left. A right-bound one is the same
 * book seen in a mirror (the DOM spread's `dir="rtl"`): the stage is
 * mirrored, so the verso lies on the right and the leaves turn from left
 * to right, while the page images and the pointer are mirrored back.
 */
export class PageFlipper {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 1, 10000);
  private left: PageMesh;
  private right: PageMesh;
  private desk: Mesh<PlaneGeometry, Material>;
  private stacks: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
  private covers = new Group();
  private coverMaterial: MeshPhysicalMaterial;
  /** The spine picture, once loaded, and the faces it is printed on. */
  private spineSrc: PageSource = null;
  private spineTex: Texture | null = null;
  private spineFaces: Mesh<PlaneGeometry, MeshPhysicalMaterial>[] = [];
  private edges: MeshStandardMaterial;
  private key = new DirectionalLight(0xffffff, 1);
  private pmrem: PMREMGenerator | null = null;
  private envKind: EnvironmentKind | null = null;
  private env: Environment | null = null;
  /** Everything on the desk, in the book's own coordinates (mirrored for a
   *  right-bound book). */
  private stage = new Group();
  /** 1 for a left-bound book, −1 for a right-bound one. */
  private sign: 1 | -1;
  private shadowScene = new Scene();
  private shadowCamera = new OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  private shadowTarget: WebGLRenderTarget | null = null;
  /** Draw the leaves in the air, and the rest of the book, into the
   *  height map. */
  private leafCaster: ShaderMaterial;
  private staticCaster: ShaderMaterial;
  private staticCasters: Mesh[] = [];
  private leaves = new Map<number, PageMesh>();
  private loader = new TextureLoader();
  private textures = new Map<Drawn, Promise<Texture | null>>();
  private ready = new Map<Drawn, Texture>();
  private W = 1;
  private H = 1;
  /** Leaf k lies on the left. */
  private turned: boolean[];
  private turns = new Map<number, Turn>();
  private target: number;
  private raf = 0;
  private lastFrame = 0;
  private starting = false;
  private disposed = false;
  /** The spread last reported settled (the one the DOM shows). */
  private reported: number;
  private persistent: boolean;
  private turnAt: number;
  /** A redraw of the book at rest is queued. */
  private still = 0;
  private appearance: FlipAppearance = {};
  private resolved: ResolvedFolioConfig = resolveFolioConfig(undefined);
  private bookSpec: PaperSpec = paperSpec(this.resolved.paper);
  private leafSpecs: PaperSpec[] = [];
  /** The book's own covers, as stiff laminated board. */
  private coverSpec: PaperSpec | null = null;
  private surfaces: Surfaces | null = null;
  /** What the surfaces were built for. */
  private surfaceKey = "";
  private raycaster = new Raycaster();
  /** The reader's own view (right-drag): turned round the book by `yaw`,
   *  tilted by `pitch` (radians from straight above; null: the setting's
   *  tilt). */
  private orbit: { yaw: number; pitch: number | null } = { yaw: 0, pitch: null };
  private paper: [number, number, number] = [1, 1, 1];

  constructor(
    private canvas: HTMLCanvasElement,
    private spread: HTMLElement,
    private book: SpreadSrc[],
    at: number,
    private onSettle: (index: number) => void,
    /** The reader's hand turned the book to another spread. */
    private onTarget: (index: number) => void,
    /** The edge the book is bound on. */
    binding: "left" | "right" = "left",
    /** `persistent`: the canvas draws the book at rest too (the DOM pages
     *  are hidden by the host and serve only as texture sources and text
     *  alternatives). `turnAt`: how far through its turn (0 … 1) a leaf
     *  let go of turns over rather than falling back. Default 0.5. */
    { persistent = false, turnAt = 0.5, appearance = {} }: { persistent?: boolean; turnAt?: number; appearance?: FlipAppearance } = {},
  ) {
    this.persistent = persistent;
    this.turnAt = turnAt;
    this.sign = binding === "right" ? -1 : 1;
    const mirror = this.sign < 0;
    this.coverMaterial = occluded(new MeshPhysicalMaterial({ roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 }), this.sign);
    this.edges = edgeMaterial(this.sign);
    this.leafCaster = casterMaterial(true);
    this.staticCaster = casterMaterial(false);
    // `__postextFolioPreserve`: keep the drawing buffer (to read the canvas back while debugging).
    const preserveDrawingBuffer = !!(globalThis as { __postextFolioPreserve?: boolean }).__postextFolioPreserve;
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    if (this.renderer.shadowMap) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = PCFShadowMap;
    }
    this.left = new Mesh(this.openGeometry(), pageMaterial(mirror, this.sign));
    this.right = new Mesh(this.openGeometry(), pageMaterial(mirror, this.sign));
    for (const m of [this.left, this.right]) {
      m.receiveShadow = m.castShadow = true;
      // A leaf lifting off an open page lies a hair above it: the page
      // under it gives way in depth, so it never shows through.
      m.material.polygonOffset = true;
      m.material.polygonOffsetFactor = 1;
      m.material.polygonOffsetUnits = 4;
      // Shaded under a lifted leaf, never blacked out: light still comes
      // in under its edges.
      m.material.userData.uniforms.uLeafOcc.value = 0.7;
      m.material.userData.uniforms.uOccBias.value = 1;
    }
    this.desk = new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial());
    this.desk.receiveShadow = true;
    this.desk.renderOrder = -1;
    // The desk lies a hair under the book (whose pages rest on it when the
    // book carries its own covers) and gives way in depth: seen at a grazing
    // angle the two never fight.
    this.desk.position.z = -1;
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.6;
    this.shadowCamera.position.z = 2000;
    // The height map needs a float colour buffer (and max blending).
    const ext = this.renderer.extensions;
    if (ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float")) {
      this.shadowTarget = new WebGLRenderTarget(1, 1, {
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        generateMipmaps: false,
      });
    }
    // A mirror turns three.js's face culling round with it (the front of a
    // page stays its front).
    this.stage.scale.x = this.sign;
    this.stage.add(this.desk, this.covers, this.left, this.right, this.key, this.key.target);
    this.scene.add(this.stage);
    this.target = at;
    this.reported = at;
    this.turned = Array.from({ length: Math.max(0, book.length - 1) }, (_, k) => k < at);
    this.setAppearance(appearance);
    if (preserveDrawingBuffer) (globalThis as { __postextFolioFlipper?: PageFlipper }).__postextFolioFlipper = this;
  }

  private openGeometry(): PlaneGeometry {
    const g = new PlaneGeometry(1, 1, NX_OPEN, 1);
    spreadColumns(g, NX_OPEN);
    g.setAttribute("ao", new BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
    return g;
  }

  // ── Appearance ──

  /** Changes how the book is presented (paper, binding, desk, light,
   *  tilt, the leaves round the pages shown). */
  setAppearance(appearance: FlipAppearance) {
    this.appearance = appearance;
    this.resolved = resolveFolioConfig(withStockForExtent(appearance.folio, this.pageCount(appearance)));
    this.bookSpec = paperSpec(this.resolved.paper);
    const specs = new Map<string, PaperSpec>();
    this.leafSpecs = (appearance.leafPapers ?? []).map((own) => {
      if (!own) return this.bookSpec;
      const key = JSON.stringify(own);
      let spec = specs.get(key);
      if (!spec) specs.set(key, (spec = paperSpec(pagePaper(appearance.folio, own))));
      return spec;
    });
    const r = this.resolved;
    const covers = appearance.coverLeaves;
    const ownCovers = !!covers && (covers.front !== undefined || covers.back !== undefined);
    this.coverSpec = !ownCovers
      ? null
      : r.binding.type === "saddleStitch"
        ? // A stapled booklet's cover is a sheet like the others, of the same
          // finish and a little heavier: it bends and turns as a page does.
          paperSpec({ ...r.paper, grammage: Math.min(350, Math.round(r.paper.grammage * 1.5)), showThrough: false })
        : {
            ...paperSpec({ ...r.paper, type: "board", grammage: 1250, bulk: 1.6, finish: "silk", texture: "smooth", shade: { hex: "#ffffff", model: "hex" }, showThrough: false }),
            caliperMm: BINDINGS[r.binding.type].boardMm || 2,
            // Board bends a little at the joint as it opens, no more.
            rigidity: 0.88,
            roughness: 0.45,
            clearcoat: 0.35,
            clearcoatRoughness: 0.2,
            showThrough: 0,
          };
    // The desk.
    const old = this.desk.material;
    if (r.surface.type === "none") {
      this.desk.material = new ShadowMaterial({ opacity: 0.32, transparent: true, depthWrite: false });
    } else {
      const kind = r.surface.type;
      const d = cachedDesk(kind);
      const m = occluded(new MeshStandardMaterial({ map: d.color, normalMap: d.normal, roughnessMap: d.roughness, roughness: d.roughnessScale }), this.sign);
      m.userData.tileMm = d.tileMm;
      if (r.surface.color) m.color.set(r.surface.color.hex);
      this.desk.material = m;
      // The scanned surface, once it has loaded (the procedural one meanwhile).
      const base = appearance.textureBaseUrl;
      if (base) {
        void loadDeskMaps(kind, base).then((maps) => {
          if (!maps || this.disposed || this.desk.material !== m) return;
          this.dressDesk(m, maps);
        });
      }
    }
    old.dispose();
    Object.assign(this.desk.material, { polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 16 });
    // The cover.
    const c = this.coverMaterial;
    c.color.set(r.binding.coverColor.hex);
    const mat = r.binding.coverMaterial;
    c.roughness = mat === "cloth" ? 0.95 : mat === "leather" ? 0.5 : 0.55;
    c.sheen = mat === "cloth" ? 1 : 0;
    c.sheenRoughness = 0.7;
    c.sheenColor.set(r.binding.coverColor.hex).lerp(new Color(1, 1, 1), 0.35);
    c.clearcoat = mat === "paper" ? 0.35 : 0;
    c.normalMap?.dispose();
    c.normalMap = mat === "cloth" ? cachedRelief("linen").normal.clone() : mat === "leather" ? cachedDesk("leather").normal.clone() : null;
    c.needsUpdate = true;
    // The spine.
    const spine = r.binding.type === "saddleStitch" ? null : (appearance.spineImage ?? null);
    if (spine !== this.spineSrc) {
      this.spineSrc = spine;
      this.spineTex?.dispose();
      this.spineTex = null;
      if (spine) void this.loadSpine(spine);
    }
    // The light.
    if (this.envKind !== r.lighting.environment) {
      this.envKind = r.lighting.environment;
      this.env = environment(r.lighting.environment);
      const before = this.scene.environment;
      try {
        this.pmrem ??= new PMREMGenerator(this.renderer);
        this.scene.environment = this.pmrem.fromScene(this.env.scene, 0.02).texture;
      } catch {
        // No WebGL (tests): no image-based light.
        this.scene.environment = null;
      }
      before?.dispose();
    }
    const env = this.env!;
    this.key.color.copy(env.keyColor);
    this.key.intensity = env.keyIntensity;
    this.key.castShadow = r.lighting.shadows;
    this.key.shadow.radius = 6 + env.softness * 18;
    // Soft light round the key fills its shadows: never black.
    this.key.shadow.intensity = 0.55 + 0.25 * (1 - env.softness);
    this.renderer.toneMappingExposure = env.exposure * r.lighting.intensity;
    this.edges.color.set(r.paper.shade.hex);
    this.surfaceKey = "";
    for (const mesh of [this.left, this.right, ...this.leaves.values()]) mesh.material.userData.spec = null;
    this.redraw();
  }

  /** Puts a scanned surface on the desk: colour (tinted by the surface's
   *  colour or the scan's own suggestion), relief, roughness and ambient
   *  occlusion, tiled at the scan's physical size. */
  private dressDesk(m: MeshStandardMaterial, maps: DeskMaps) {
    m.map = maps.color;
    m.normalMap = maps.normal;
    m.roughnessMap = maps.roughness;
    m.aoMap = maps.ao ?? null;
    m.aoMapIntensity = 0.8;
    m.roughness = 1;
    m.normalScale.set(1, 1);
    m.color.set(this.resolved.surface.color?.hex ?? maps.tint ?? "#ffffff");
    // A scan's tile is shown no larger than about 0.3 mm a texel: a big
    // tile at its true size would read soft and blocky this close; the
    // scans tile seamlessly, so they simply repeat more often.
    const texels = (maps.color.image as { width?: number } | undefined)?.width ?? 1024;
    m.userData.tileMm = Math.min(maps.tileMm, texels * 0.3);
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    for (const t of [maps.color, maps.normal, maps.roughness, maps.ao]) if (t) t.anisotropy = aniso;
    m.needsUpdate = true;
    this.surfaceKey = "";
    this.layout();
    this.redraw();
  }

  /** Pages in the whole book (the ones shown and those round them). */
  private pageCount(appearance: FlipAppearance): number {
    const extra = appearance.extraLeaves ?? { before: 0, after: 0 };
    const leaves = Math.max(0, this.book.length - 1) + extra.before + extra.after;
    return appearance.singlePage ? leaves : 2 * leaves;
  }

  /** The colour the book's own boards show at their edges and spine: the
   *  setting's cover colour when it names one, else the printed cover's
   *  ground. */
  private boardColor(): Color {
    const set = new Color(this.resolved.binding.coverColor.hex);
    if (this.appearance.folio?.binding?.coverColor) return set;
    const front = this.appearance.coverLeaves?.front;
    const src = front !== undefined ? this.book[front]?.[1] : null;
    if (!src) return set;
    const tex = this.ready.get(src);
    const image = (tex?.image ?? (typeof src === "string" ? null : src)) as (CanvasImageSource & { width: number; height: number }) | null;
    if (!image || !image.width) return set;
    if (this.sampled?.image !== image) this.sampled = { image, color: edgeColorOf(image) };
    return this.sampled.color ?? set;
  }
  private sampled: { image: object; color: Color | null } | null = null;

  /** The paper of leaf k (outside the pages shown: the book's). */
  private specOf(k: number): PaperSpec {
    const covers = this.appearance.coverLeaves;
    if (this.coverSpec && (k === covers?.front || k === covers?.back)) return this.coverSpec;
    return this.leafSpecs[k] ?? this.bookSpec;
  }

  private dressPage(mesh: PageMesh, spec: PaperSpec) {
    const m = mesh.material;
    if (m.userData.spec === spec) return;
    m.userData.spec = spec;
    const p = spec.paper;
    m.color.set(p.shade.hex);
    m.roughness = spec.roughness;
    m.clearcoat = spec.clearcoat;
    m.clearcoatRoughness = spec.clearcoatRoughness;
    m.sheen = spec.sheen;
    m.sheenRoughness = 0.8;
    m.sheenColor.set(1, 1, 1);
    const relief = cachedRelief(p.texture);
    const tex = relief.normal;
    const mm = this.appearance.pageWidthMm ?? 150;
    tex.repeat.set(mm / relief.tileMm, (mm * (this.H / this.W)) / relief.tileMm);
    m.normalMap = p.textureStrength > 0 ? tex : null;
    const coated = p.finish !== "uncoated";
    const s = p.textureStrength * (coated ? 0.35 : 1) * 0.6;
    m.normalScale.set(s, s);
    m.userData.uniforms.uShowThrough.value = spec.showThrough;
    m.needsUpdate = true;
  }

  // ── Layout ──

  private pxPerMm() {
    return this.W / (this.appearance.pageWidthMm ?? 150);
  }

  /** The leaves lying on each side now (in the air: neither). */
  private stackLeaves(): { left: number[]; right: number[] } {
    const left: number[] = [];
    const right: number[] = [];
    this.turned.forEach((t, k) => {
      if (!this.turns.has(k)) (t ? left : right).push(k);
    });
    return { left, right };
  }

  /** Loads the spine picture, then rebuilds the book to print it. */
  private async loadSpine(src: Drawn) {
    let tex: Texture | null = null;
    if (typeof src === "string") {
      tex = await this.loader.loadAsync(src).catch(() => null);
    } else {
      const decoded = src instanceof HTMLCanvasElement ? Promise.resolve() : src.decode();
      tex = await decoded.then(
        () => new Texture(src),
        () => null,
      );
    }
    if (!tex) return;
    if (this.disposed || this.spineSrc !== src) {
      tex.dispose();
      return;
    }
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;
    this.spineTex = tex;
    this.surfaceKey = "";
    this.buildBook();
    this.redraw();
  }

  /**
   * The spine picture on the two outer faces of the back of the block
   * (the one beside an empty side shows: the front cover is up when the
   * pages lie on the right, down when they lie on the left), fitted to
   * cover a face `depth` thick and `height` long, centred.
   */
  private printSpine(back: number, depth: number, height: number) {
    const src = this.spineTex;
    if (!src) return;
    const image = src.image as { width: number; height: number };
    const a = image.width / image.height;
    const f = depth / height;
    const rx = a > f ? f / a : 1;
    const ry = a > f ? 1 : a / f;
    const c = this.coverMaterial;
    for (const side of [-1, 1] as const) {
      const tex = src.clone();
      // u runs across the block from the back cover to the front one; a
      // right-bound book is drawn mirrored, so its picture is turned back.
      tex.repeat.set(this.sign * rx, ry);
      tex.offset.set(this.sign > 0 ? (1 - rx) / 2 : (1 + rx) / 2, (1 - ry) / 2);
      tex.needsUpdate = true;
      const m = occluded(
        new MeshPhysicalMaterial({
          map: tex,
          roughness: c.roughness,
          sheen: c.sheen,
          sheenRoughness: c.sheenRoughness,
          clearcoat: c.clearcoat,
          normalMap: c.normalMap,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 4,
        }),
        this.sign,
      );
      const face = new Mesh(new PlaneGeometry(depth, height), m);
      // The plane's +x (the picture's width) runs up the block on the face
      // that looks to −x, down it on the one that looks to +x.
      face.rotation.y = side * (Math.PI / 2);
      face.position.set(side * (back / 2 + 0.05), 0, depth / 2);
      face.receiveShadow = true;
      this.spineFaces.push(face);
      this.stage.add(face);
    }
  }

  private clearSpine() {
    for (const face of this.spineFaces) {
      face.removeFromParent();
      face.geometry.dispose();
      face.material.map?.dispose();
      face.material.dispose();
    }
    this.spineFaces = [];
  }

  /** Rebuilds the book's surfaces, blocks and covers when the stacks change. */
  private buildBook() {
    const { left, right } = this.stackLeaves();
    const extra = this.appearance.extraLeaves ?? { before: 0, after: 0 };
    const key = `${left.length}|${right.length}|${this.W}|${this.H}|${extra.before}|${extra.after}`;
    if (key === this.surfaceKey && this.surfaces) return;
    this.surfaceKey = key;
    const k = this.pxPerMm();
    const half = this.appearance.singlePage ? 0.5 : 1;
    const thick = (leaves: number[], more: number) =>
      (leaves.reduce((s, i) => s + this.specOf(i).caliperMm, 0) * half + more * this.bookSpec.caliperMm) * k;
    const tL = thick(left, extra.before);
    const tR = thick(right, extra.after);
    const binding = this.resolved.binding.type;
    // A board on top of a stack lies flat; the document's own covers
    // replace the case.
    const noCase = !!this.coverSpec;
    const rigid = (leaf: number | undefined) => leaf !== undefined && this.specOf(leaf).rigidity > 0.5;
    const { left: pl, right: pr, board } = profiles(binding, this.W, k, tL, tR, {
      flatLeft: rigid(left[left.length - 1]),
      flatRight: rigid(right[0]),
      noCase,
    });
    this.surfaces = { left: pl, right: pr };
    const { W, H } = this;
    // The open pages, with the gutter's occlusion.
    for (const [mesh, own, other, side] of [
      [this.right, pr, pl, 1],
      [this.left, pl, pr, -1],
    ] as const) {
      const ao = gutterOcclusion(own, other, W);
      const pos = mesh.geometry.attributes.position;
      const aoAttr = mesh.geometry.attributes.ao;
      for (let i = 0; i < pos.count; i++) {
        const ix = i % (NX_OPEN + 1);
        const row = Math.floor(i / (NX_OPEN + 1));
        const t = column(ix / NX_OPEN);
        const [x, z] = along(own, t * W);
        pos.setXYZ(i, side * x, row === 0 ? H / 2 : -H / 2, z + 0.02);
        aoAttr.setX(i, ao[Math.round(t * (ao.length - 1))]);
      }
      pos.needsUpdate = true;
      aoAttr.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
    }
    // The blocks of leaves.
    for (const s of this.stacks) {
      s.removeFromParent();
      s.geometry.dispose();
      if (s.material !== this.edges && s.material !== this.coverMaterial) s.material.dispose();
    }
    this.stacks = [];
    for (const [p, side, n] of [
      [pr, 1, right.length + extra.after],
      [pl, -1, left.length + extra.before],
    ] as const) {
      if (p.t < 0.05) continue;
      // The book's own boards in this block: at its base (the cover turned
      // under the pages) and on top (the book closed).
      const leaves = side > 0 ? right : left;
      const before = side > 0 ? 0 : extra.before;
      const after = side > 0 ? extra.after : 0;
      const baseLeaf = side > 0 ? (after ? undefined : leaves[leaves.length - 1]) : before ? undefined : leaves[0];
      const topLeaf = side > 0 ? leaves[0] : leaves[leaves.length - 1];
      const isBoard = (leaf: number | undefined) => leaf !== undefined && this.coverSpec !== null && this.specOf(leaf) === this.coverSpec;
      const boardPx = (this.coverSpec?.caliperMm ?? 0) * k;
      const bands = this.coverSpec
        ? {
            lo: isBoard(baseLeaf) ? boardPx / p.t : -1,
            hi: isBoard(topLeaf) && topLeaf !== baseLeaf ? 1 - boardPx / p.t : 2,
            color: this.boardColor(),
          }
        : undefined;
      const mesh = new Mesh(stackGeometry(p, side, W, H, Math.round(n * half)), bands ? edgeMaterial(this.sign, bands) : this.edges);
      mesh.castShadow = mesh.receiveShadow = true;
      this.stacks.push(mesh);
      this.stage.add(mesh);
    }
    if (noCase) this.coverMaterial.color.copy(this.boardColor());
    // The back of the block: the folds sewn at the spine, under the line
    // where the two open pages meet (nothing shows through the gutter).
    // Beside an empty side (the book closed, or opened at its first or
    // last page) the back stands as the spine, the block's full height.
    const lowSide = Math.min(tL, tR);
    // It reaches the higher of the two sides at the spine (a board lying
    // flat on one side meets it low; the block on the other stands tall).
    const meet = lowSide < 0.5 ? Math.max(tL, tR) + board : Math.max(along(pl, 0)[1], along(pr, 0)[1]);
    const back = Math.min(0.04 * W, Math.max(2, 0.25 * (tL + tR)));
    this.clearSpine();
    if (meet > 0.4) {
      // In a case the back is wrapped in the case's spine (the wall beside
      // an empty side, the headcap at head and tail); without one, the
      // folds of the sections show.
      const height = H + (noCase ? 0 : 2 * BINDINGS[binding].squareMm * k);
      const fold = new Mesh(new BoxGeometry(back, height, meet - 0.3), this.coverMaterial);
      fold.position.set(0, 0, (meet - 0.3) / 2);
      fold.castShadow = fold.receiveShadow = true;
      this.stacks.push(fold);
      this.stage.add(fold);
      this.printSpine(back, meet - 0.3, height);
    }
    // The covers.
    for (const c of [...this.covers.children]) {
      c.removeFromParent();
      (c as Mesh).geometry.dispose();
    }
    const b = BINDINGS[binding];
    const sq = b.squareMm * k;
    const joint = b.jointMm * k;
    const reachR = along(pr, W)[0];
    const reachL = along(pl, W)[0];
    // The boards stop a hair under the block they carry (and give way in
    // depth): a page lying on an empty side never sinks into them.
    const cover = (x0: number, x1: number, z1: number, h: number) => {
      const top = Math.max(0.1, z1 - 0.6);
      const m = new Mesh(new BoxGeometry(x1 - x0, h, top), this.coverMaterial);
      m.position.set((x0 + x1) / 2, 0, top / 2);
      m.castShadow = m.receiveShadow = true;
      this.covers.add(m);
    };
    const hh = H + 2 * sq;
    if (!noCase) {
      cover(joint, reachR + sq, board, hh);
      cover(-(reachL + sq), -joint, board, hh);
      // The spine under the gutter (a hollow back, a little lower).
      if (joint > 0) cover(-joint, joint, board * 0.7, hh);
    }
    const tex = this.coverMaterial.normalMap;
    if (tex) {
      const tile = this.resolved.binding.coverMaterial === "cloth" ? 6 : 60;
      tex.repeat.set(W / k / tile, H / k / tile);
    }
    // The book at rest in the height map.
    for (const c of this.staticCasters) c.removeFromParent();
    this.staticCasters = [this.left, this.right, ...this.stacks, ...(this.covers.children as Mesh[])].map((m) => {
      const c = new Mesh(m.geometry, this.staticCaster);
      c.position.copy(m.position);
      c.frustumCulled = false;
      this.shadowScene.add(c);
      return c;
    });
    occlusionUniforms.uOccRadius.value = 0.14 * W;
    this.layoutLight();
  }

  /** The key light over the book, its shadow covering the book and round. */
  private layoutLight() {
    const env = this.env;
    if (!env) return;
    const { W, H } = this;
    const d = 4 * Math.max(W, H);
    const dir = env.key;
    // The key stands where the environment's brightest emitter is, and the
    // environment is not mirrored: in a right-bound book's mirrored stage
    // the key's x is turned back (#334).
    this.key.position.set(this.sign * dir.x * d, dir.y * d, dir.z * d);
    this.key.target.position.set(0, 0, 0);
    const cam = this.key.shadow.camera;
    const span = 0.62 * Math.hypot(2 * W, H) + 0.1 * W;
    Object.assign(cam, { left: -span, right: span, top: span, bottom: -span, near: d * 0.2, far: d * 2 });
    cam.updateProjectionMatrix();
  }

  /** Sizes the drawing buffer to the canvas's device pixels and frames
   *  the tilted book onto the DOM spread: the camera stands in front of
   *  the book and above it, as far back as the whole book needs to fit the
   *  spread's box, the projection shifted so the book sits centred in it. */
  private layout() {
    const box = this.canvas.getBoundingClientRect();
    const cw = box.width;
    const ch = box.height;
    if (!cw || !ch) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.round(cw * dpr), Math.round(ch * dpr), false);
    const spread = this.spread.getBoundingClientRect();
    const W = spread.width / 2 || 1;
    const H = spread.height || 1;
    if (W !== this.W || H !== this.H) {
      this.W = W;
      this.H = H;
      for (const mesh of [this.left, this.right, ...this.leaves.values()]) mesh.material.userData.spec = null;
    }
    this.buildBook();
    // The desk: far wider than the view, tiled at its physical scale.
    const k = this.pxPerMm();
    const size = 40 * Math.max(W, H);
    if (this.desk.userData.size !== size) {
      this.desk.userData.size = size;
      this.desk.geometry.dispose();
      this.desk.geometry = new PlaneGeometry(size, size);
    }
    const dm = this.desk.material as MeshStandardMaterial;
    if (dm.map && this.resolved.surface.type !== "none") {
      const tile = ((dm.userData.tileMm as number | undefined) ?? cachedDesk(this.resolved.surface.type as DeskKind).tileMm) * k;
      for (const t of [dm.map, dm.normalMap, dm.roughnessMap, dm.aoMap]) t?.repeat.set(size / tile, size / tile);
    }
    // The camera, tilted about the book's horizontal axis and turned round
    // it as the reader has orbited it.
    const tilt = this.orbit.pitch ?? (this.resolved.tilt * Math.PI) / 180;
    const yaw = this.orbit.yaw;
    const sq = BINDINGS[this.resolved.binding.type].squareMm * k;
    const zTop = Math.max(this.topZ("left"), this.topZ("right"));
    const corners: Vector3[] = [];
    for (const x of [-(W + sq), W + sq]) for (const y of [-(H / 2 + sq), H / 2 + sq]) for (const z of [0, zTop]) corners.push(new Vector3(x, y, z));
    const cam = this.camera;
    cam.aspect = cw / ch;
    cam.clearViewOffset();
    const fx = spread.width / cw;
    const fy = spread.height / ch;
    const place = (dist: number) => {
      cam.position.set(Math.sin(yaw) * Math.sin(tilt) * dist, -Math.cos(yaw) * Math.sin(tilt) * dist, zTop / 2 + Math.cos(tilt) * dist);
      cam.up.set(-Math.sin(yaw), Math.cos(yaw), 0);
      cam.lookAt(0, 0, zTop / 2);
      // A tight near plane: the book is the nearest thing to the eye, and
      // depth precision is what keeps a leaf lying on the page under it
      // from flickering through.
      cam.near = dist * 0.35;
      cam.far = dist * 4 + size;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const c of corners) {
        const p = c.clone().project(cam);
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
      }
      return { x0, x1, y0, y1 };
    };
    let lo = (ch / 2 / Math.tan((FOV * Math.PI) / 360)) * 0.3;
    let hi = lo * 20;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      const e = place(mid);
      if ((e.x1 - e.x0) / 2 <= fx && (e.y1 - e.y0) / 2 <= fy) hi = mid;
      else lo = mid;
    }
    const e = place(hi);
    const w = Math.round(cw * dpr);
    const h = Math.round(ch * dpr);
    cam.setViewOffset(w, h, (((e.x0 + e.x1) / 2) * w) / 2, (-((e.y0 + e.y1) / 2) * h) / 2, w, h);
    cam.updateProjectionMatrix();
    // The height map covers the book and round it.
    if (this.shadowTarget) {
      const hw = W * 1.6 + 80;
      const hh = H * 0.9 + 80;
      Object.assign(this.shadowCamera, { left: -hw, right: hw, top: hh, bottom: -hh });
      this.shadowCamera.updateProjectionMatrix();
      const scale = Math.min(1, 1536 / (2 * hw));
      this.shadowTarget.setSize(Math.round(2 * hw * scale), Math.round(2 * hh * scale));
      occlusionUniforms.uShadowBox.value.set(-hw, -hh, 2 * hw, 2 * hh);
      occlusionUniforms.uShadowMap.value = this.shadowTarget.texture;
    }
  }

  /** The height of a side's open page away from the gutter. */
  private topZ(side: "left" | "right") {
    const p = this.surfaces?.[side];
    return p ? p.zs[p.zs.length - 1] : 0;
  }

  /** Turns the view round the book (`dx`, px of a drag) and tilts it
   *  (`dy`), never below a low angle over the table. */
  orbitBy(dx: number, dy: number) {
    cancelAnimationFrame(this.orbitFrame);
    this.orbitFrame = 0;
    const pitch = this.orbit.pitch ?? (this.resolved.tilt * Math.PI) / 180;
    this.orbit = {
      yaw: this.orbit.yaw - dx * 0.006,
      pitch: Math.min(MAX_PITCH, Math.max(0, pitch - dy * 0.006)),
    };
    this.redraw();
  }

  /** Back to the view the settings give, easing there (the reader let go
   *  of the view). */
  resetOrbit() {
    cancelAnimationFrame(this.orbitFrame);
    const home = (this.resolved.tilt * Math.PI) / 180;
    // The shorter way round.
    const yaw0 = Math.atan2(Math.sin(this.orbit.yaw), Math.cos(this.orbit.yaw));
    const pitch0 = this.orbit.pitch ?? home;
    if (Math.abs(yaw0) < 1e-3 && Math.abs(pitch0 - home) < 1e-3) {
      this.orbit = { yaw: 0, pitch: null };
      return this.redraw();
    }
    const start = performance.now();
    const duration = 450 + 250 * Math.min(1, Math.hypot(yaw0, pitch0 - home));
    const step = (now: number) => {
      this.orbitFrame = 0;
      if (this.disposed) return;
      const t = Math.min(1, (now - start) / duration);
      const e = ease(t);
      this.orbit = t < 1 ? { yaw: yaw0 * (1 - e), pitch: pitch0 + (home - pitch0) * e } : { yaw: 0, pitch: null };
      this.layout();
      // Leaves in the air draw in their own frames.
      if (!this.raf && !this.starting) this.draw();
      if (t < 1) this.orbitFrame = requestAnimationFrame(step);
    };
    this.orbitFrame = requestAnimationFrame(step);
  }
  private orbitFrame = 0;

  /** The colour of the book's blank pages (0 … 1, as CSS gives it). */
  setPaper(r: number, g: number, b: number) {
    this.paper = [r, g, b];
    for (const mesh of [this.left, this.right, ...this.leaves.values()]) mesh.material.userData.uniforms.uPaper.value.setRGB(r, g, b, SRGBColorSpace);
    this.redraw();
  }

  /** Starts loading the pages of these spreads as textures. */
  preload(indexes: number[]) {
    for (const i of indexes) for (const src of this.book[i] ?? []) if (src) void this.texture(src);
  }

  private texture(src: Drawn): Promise<Texture | null> {
    let hit = this.textures.get(src);
    if (!hit) {
      const prepare = (tex: Texture) => {
        tex.colorSpace = SRGBColorSpace;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this.ready.set(src, tex);
        return tex;
      };
      if (typeof src === "string") {
        hit = this.loader.loadAsync(src).then(prepare, () => null);
      } else {
        // A canvas is drawn already; an image may still be decoding.
        const tex = new Texture(src);
        const decoded = src instanceof HTMLCanvasElement ? Promise.resolve() : src.decode();
        hit = decoded.then(
          () => {
            tex.needsUpdate = true;
            return prepare(tex);
          },
          () => null,
        );
      }
      this.textures.set(src, hit);
    }
    return hit;
  }

  /**
   * Replaces the book's pages (after a relayout, or once more pages are
   * painted), keeping the open spread when `at` is left out. Leaves at
   * rest take their new pages at once; textures no page uses any more are
   * freed. A book of another length starts afresh at `at`.
   */
  setBook(book: SpreadSrc[], at?: number) {
    const resized = book.length !== this.book.length;
    this.book = book;
    if (resized || at !== undefined) {
      const open = Math.max(0, Math.min(book.length - 1, at ?? this.settledAt()));
      if (resized) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.turns.clear();
        for (const mesh of this.leaves.values()) {
          mesh.removeFromParent();
          (mesh.userData.caster as Mesh).removeFromParent();
          mesh.geometry.dispose();
          mesh.material.dispose();
        }
        this.leaves.clear();
      }
      this.turned = Array.from({ length: Math.max(0, book.length - 1) }, (_, k) => k < open);
      this.target = open;
      this.reported = open;
      // Another extent may call for another stock.
      if (resized) this.setAppearance(this.appearance);
      if (!this.raf) this.clear();
    }
    for (const [k, mesh] of this.leaves) {
      this.assign(mesh, "Front", book[k]?.[1] ?? null);
      this.assign(mesh, "Back", book[k + 1]?.[0] ?? null);
    }
    const used = new Set<PageSource>(book.flat());
    for (const mesh of [this.left, this.right]) used.add(mesh.userData.Front).add(mesh.userData.Back);
    for (const [src, tex] of this.ready) {
      if (used.has(src)) continue;
      tex.dispose();
      this.ready.delete(src);
      this.textures.delete(src);
    }
    this.redraw();
  }

  private assign(mesh: PageMesh, face: "Front" | "Back", src: PageSource) {
    const u = mesh.material.userData.uniforms;
    if (mesh.userData[face] === src) return;
    mesh.userData[face] = src;
    u[`uHas${face}`].value = 0;
    u[`u${face}`].value = null;
    if (src === "") u[`uHas${face}`].value = 2;
    if (!src) return;
    const set = (tex: Texture | null) => {
      if (!tex || mesh.userData[face] !== src) return;
      u[`u${face}`].value = tex;
      u[`uHas${face}`].value = 1;
      this.redraw();
    };
    const tex = this.ready.get(src);
    if (tex) set(tex);
    else void this.texture(src).then(set);
  }

  private leaf(k: number): PageMesh {
    let mesh = this.leaves.get(k);
    if (!mesh) {
      const geometry = new PlaneGeometry(1, 1, NX, NY);
      spreadColumns(geometry, NX);
      geometry.setAttribute("ao", new BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(1), 1));
      mesh = new Mesh(geometry, pageMaterial(this.sign < 0, this.sign));
      mesh.material.userData.uniforms.uPaper.value.setRGB(...this.paper, SRGBColorSpace);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const caster = new Mesh(mesh.geometry, this.leafCaster);
      caster.frustumCulled = false;
      this.shadowScene.add(caster);
      mesh.userData.caster = caster;
      this.assign(mesh, "Front", this.book[k]?.[1] ?? null);
      this.assign(mesh, "Back", this.book[k + 1]?.[0] ?? null);
      this.leaves.set(k, mesh);
    }
    this.dressPage(mesh, this.specOf(k));
    return mesh;
  }

  /** Turns the pages until spread `index` lies open. */
  go(index: number) {
    this.target = Math.max(0, Math.min(this.book.length - 1, index));
    if (this.raf || this.starting) return;
    const lo = Math.min(this.target, this.settledAt());
    const hi = Math.max(this.target, this.settledAt());
    if (lo === hi) return this.onSettle(this.target);
    // The first leaves' pages are warm; wait a moment for cold ones.
    this.starting = true;
    const wanted: Drawn[] = [];
    for (let i = lo; i <= Math.min(hi, lo + 2); i++) for (const src of this.book[i]) if (src) wanted.push(src);
    this.preload(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
    void Promise.race([Promise.all(wanted.map((s) => this.texture(s))), new Promise((r) => setTimeout(r, 700))]).then(() => {
      this.starting = false;
      if (this.disposed) return;
      this.layout();
      this.lastFrame = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    });
  }

  /** The spread open when no leaf is in the air. */
  private settledAt() {
    const i = this.turned.indexOf(false);
    return i < 0 ? this.turned.length : i;
  }

  /** A new turn by the virtual hand, from the bottom corner (or the
   *  point clicked) over to its mirror image. */
  private lift(forward: boolean, now: number, G: Pt = { u: this.W, v: -this.H / 2 }): Turn {
    return {
      forward,
      G,
      P: { ...G },
      anim: { start: now, duration: DURATION, from: G, to: { u: -G.u, v: G.v }, arc: 0.28 * this.H, lands: true },
    };
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = Math.min(40, Math.max(1, now - (this.lastFrame || now - 16)));
    this.lastFrame = now;
    const n = this.turned.length;
    const progress = (turn: Turn) => progressFrom(turn.G, turn.P);

    // Move the hands; land the leaves that have finished (or fallen back).
    for (const [k, turn] of this.turns) {
      const spec = this.specOf(k);
      if (turn.held) {
        // The page follows the hand with a little inertia (more for a
        // heavier leaf).
        const { aim } = turn.held;
        const f = 1 - Math.pow(1 - spec.follow, dt / 16);
        turn.P = reach(turn.G, { u: turn.P.u + (aim.u - turn.P.u) * f, v: turn.P.v + (aim.v - turn.P.v) * f }, this.H);
      } else if (turn.spring) {
        const sp = turn.spring;
        const t = Math.min(1, (now - sp.start) / sp.duration);
        const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
        const h10 = t ** 3 - 2 * t ** 2 + t;
        const h01 = -2 * t ** 3 + 3 * t ** 2;
        const at = (axis: "u" | "v") => h00 * sp.from[axis] + h10 * sp.duration * sp.vel[axis] + h01 * sp.to[axis];
        turn.P = reach(turn.G, { u: at("u"), v: at("v") }, this.H);
        if (t >= 1) {
          this.turned[k] = sp.lands ? turn.forward : !turn.forward;
          this.turns.delete(k);
        }
      } else if (turn.anim) {
        const { start, duration, from, to, arc, lands } = turn.anim;
        const t = Math.min(1, (now - start) / duration);
        const e = arc ? ease(t) : easeOut(t);
        turn.P = reach(turn.G, { u: from.u + (to.u - from.u) * e, v: from.v + (to.v - from.v) * e + arc * Math.sin(Math.PI * e) }, this.H);
        if (t >= 1) {
          this.turned[k] = lands ? turn.forward : !turn.forward;
          this.turns.delete(k);
        }
      }
    }
    // Lift the next ones: each follows its neighbour a little behind, so a
    // jump of several spreads turns every page in between.
    const pending = Math.abs(this.target - this.settledAt()) || 1;
    const gap = Math.min(GAP, 0.7 / pending);
    const follows = (k: number, forward: boolean) => {
      const turn = this.turns.get(k);
      if (!turn) return forward ? this.turned[k] : !this.turned[k];
      return turn.forward === forward && !turn.held && progress(turn) >= gap;
    };
    for (let k = 0; k < this.target && k < n; k++) {
      if (this.turned[k] || this.turns.has(k)) continue;
      if (k > 0 && !follows(k - 1, true)) break;
      this.turns.set(k, { ...this.lift(true, now), hinge: this.hingeOf(k, true) });
    }
    for (let k = n - 1; k >= this.target; k--) {
      if (!this.turned[k] || this.turns.has(k)) continue;
      if (k < n - 1 && !follows(k + 1, false)) break;
      this.turns.set(k, { ...this.lift(false, now), hinge: this.hingeOf(k, false) });
    }

    this.draw();
    this.spread.classList.add("is-turning");
    if (this.turns.size > 0 || this.settledAt() !== this.target) this.raf = requestAnimationFrame(this.frame);
    else this.settle();
  };

  private settle() {
    if (this.target === this.reported) {
      // Fallen back: the DOM already shows this spread.
      this.clear();
    } else {
      this.reported = this.target;
      this.onSettle(this.target);
    }
  }

  // ── The reader's hand ──

  /** The pointer on the pages' plane, in the book's coordinates (x
   *  mirrored for a right-bound book): a ray from the eye through the
   *  pointer, met with the plane the open pages lie in on that side. */
  private toWorld(event: { clientX: number; clientY: number }) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1));
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new Vector3();
    const at = (z: number) => (this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -z), hit) ? { x: hit.x, y: hit.y } : null);
    const zl = this.topZ("left");
    const zr = this.topZ("right");
    let p = at((zl + zr) / 2);
    if (p) p = at(p.x * this.sign > 0 ? zr : zl) ?? p;
    if (!p) return { x: 0, y: 1e9 };
    return { x: this.sign * p.x, y: p.y };
  }

  /** A board turns on the top of the block it leaves (read before it
   *  leaves it); other leaves on the gutter. */
  private hingeOf(k: number, forward: boolean): number | undefined {
    if (this.specOf(k).rigidity <= 0.5) return undefined;
    return this.topZ(forward ? "right" : "left");
  }

  /** The page under the pointer: +1 the one a forward turn takes (the
   *  recto), −1 the other, 0 none. */
  hit(event: { clientX: number; clientY: number }): 1 | -1 | 0 {
    if (!this.surfaces) this.layout();
    const { x, y } = this.toWorld(event);
    if (Math.abs(y) > this.H / 2 || Math.abs(x) > this.W * 1.05) return 0;
    return x > 0 ? 1 : -1;
  }

  /** Takes hold of the page under the pointer; false when there is none
   *  to turn (or pages are already in the air). */
  grab(event: { clientX: number; clientY: number }): boolean {
    if (this.raf || this.starting || this.turns.size) return false;
    this.layout();
    const { x, y } = this.toWorld(event);
    const at = this.settledAt();
    const forward = x > 0;
    const k = forward ? at : at - 1;
    if (k < 0 || k >= this.turned.length || Math.abs(x) > this.W * 1.05 || Math.abs(y) > this.H / 2) return false;
    const G = { u: Math.max(0.15 * this.W, Math.min(this.W, Math.abs(x))), v: y };
    this.turns.set(k, { forward, G, P: { ...G }, held: { aim: { ...G }, samples: [] }, hinge: this.hingeOf(k, forward) });
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    return true;
  }

  /** Carries the held point to the pointer. */
  drag(event: { clientX: number; clientY: number }) {
    const turn = [...this.turns.values()].find((t) => t.held);
    if (!turn?.held) return;
    const { x, y } = this.toWorld(event);
    turn.held.aim = reach(turn.G, { u: turn.forward ? x : -x, v: y }, this.H);
    const t = performance.now();
    turn.held.samples.push({ t, p: { ...turn.held.aim } });
    while (turn.held.samples.length > 2 && t - turn.held.samples[0].t > 100) turn.held.samples.shift();
  }

  /** Lets go. A click turns the page over from where it was taken; a drag
   *  carries on to the nearer side (the throw's speed counted, as if it
   *  went on a quarter of a second), the paper easing there from the hand's
   *  speed, never jumping. */
  release(click = false) {
    const entry = [...this.turns].find(([, t]) => t.held);
    if (!entry) return;
    const [k, turn] = entry;
    const { samples } = turn.held!;
    turn.held = undefined;
    if (click) {
      // The hand lifts the point clicked and carries it over, arching
      // towards the middle of the page: a click near the head turns the
      // leaf from its top corner, near the foot from its bottom one.
      turn.anim = { start: performance.now(), duration: DURATION, from: { ...turn.P }, to: { u: -turn.G.u, v: turn.G.v }, arc: (turn.G.v > 0 ? -1 : 1) * 0.2 * this.H, lands: true };
      this.target = turn.forward ? k + 1 : k;
      this.onTarget(this.target);
      return;
    }
    const first = samples[0];
    const last = samples[samples.length - 1];
    const span = first && last ? last.t - first.t : 0;
    // The hand's speed when it let go (px per ms), held to a sane range;
    // a hand that stood still before letting go throws nothing.
    const vel = span > 8 ? { u: (last.p.u - first.p.u) / span, v: (last.p.v - first.p.v) / span } : { u: 0, v: 0 };
    const speed = Math.hypot(vel.u, vel.v);
    if (speed > 4) {
      vel.u *= 4 / speed;
      vel.v *= 4 / speed;
    }
    if (last && performance.now() - last.t > 80) vel.u = vel.v = 0;
    const ahead = progressFrom(turn.G, { u: turn.P.u + vel.u * 250, v: turn.P.v });
    const over = ahead > this.turnAt;
    const to = over ? { u: -turn.G.u, v: turn.G.v } : { ...turn.G };
    // Long enough to read as paper settling, scaled by the distance left
    // and by the paper (a stiff leaf springs back sooner).
    const distance = Math.hypot(to.u - turn.P.u, to.v - turn.P.v);
    const duration = Math.min(700, Math.max(280, (180 + 0.9 * distance) * (0.0085 / this.specOf(k).spring)));
    // The hand's speed carried in, but never so much that the curve
    // overshoots the rest position.
    const along = (vel.u * (to.u - turn.P.u) + vel.v * (to.v - turn.P.v)) / (distance || 1);
    const cap = (1.5 * distance) / duration;
    const scale = along > cap ? cap / along : 1;
    turn.spring = { from: { ...turn.P }, to, vel: { u: vel.u * scale, v: vel.v * scale }, start: performance.now(), duration, lands: over };
    if (over) {
      this.target = turn.forward ? k + 1 : k;
      this.onTarget(this.target);
    }
  }

  private draw() {
    this.buildBook();
    const book = this.surfaces!;
    const { W, H } = this;
    const n = this.turned.length;
    // The leaves in the air, in book order.
    const air: Airborne[] = [...this.turns]
      .sort(([a], [b]) => a - b)
      .map(([k, turn]) => {
        const spec = this.specOf(k);
        return { k, q: progressFrom(turn.G, turn.P), forward: turn.forward, fold: foldOf(turn.G, turn.P, W, H, spec.roll), mesh: this.leaf(k), spec };
      });
    for (const leaf of this.leaves.values()) leaf.visible = (leaf.userData.caster as Mesh).visible = false;
    const k = this.pxPerMm();
    air.forEach(({ k: leafK, q, forward, fold, mesh, spec }, i) => {
      // Leaf k lies over leaf k + 1 on the right and under it on the left.
      const side = forward ? q : 1 - q;
      const lift = (0.5 + 0.6 * ((1 - side) * (air.length - 1 - i) + side * i)) * Math.max(1, spec.caliperMm * k);
      // A floppy leaf flutters in flight (none at rest, none for card).
      const flutter = 0.012 * Math.max(0, 1 / spec.roll - 0.75) * Math.sin(Math.PI * q) * (1 - spec.rigidity);
      layLeaf(mesh.geometry, fold, forward, W, H, lift, book, spec.rigidity, q, flutter, performance.now(), this.turns.get(leafK)?.hinge);
      mesh.visible = (mesh.userData.caster as Mesh).visible = true;
      if (!mesh.parent) this.stage.add(mesh);
    });

    // The pages lying open: the top leaf of each stack.
    let l = -1;
    for (let j = 0; j < n; j++) if (this.turned[j] && !this.turns.has(j)) l = j;
    let r = n;
    for (let j = n - 1; j >= 0; j--) if (!this.turned[j] && !this.turns.has(j)) r = j;
    const leftSrc = this.book[l + 1]?.[0] ?? null;
    const rightSrc = this.book[r]?.[1] ?? null;
    this.assign(this.left, "Back", leftSrc);
    this.assign(this.right, "Front", rightSrc);
    // What shows through an open page: the other side of its leaf.
    this.assign(this.left, "Front", l >= 0 ? (this.book[l]?.[1] ?? null) : null);
    this.assign(this.right, "Back", this.book[r + 1]?.[0] ?? null);
    const extra = this.appearance.extraLeaves;
    this.left.visible = leftSrc !== null || (extra?.before ?? 0) > 0;
    this.right.visible = rightSrc !== null || (extra?.after ?? 0) > 0;
    this.dressPage(this.left, l >= 0 ? this.specOf(l) : this.bookSpec);
    this.dressPage(this.right, r < n ? this.specOf(r) : this.bookSpec);

    // The height map lifted leaves occlude the sky from.
    for (const c of this.staticCasters) c.visible = true;
    this.staticCasters[0].visible = this.left.visible;
    this.staticCasters[1].visible = this.right.visible;
    occlusionUniforms.uShadowOn.value = this.shadowTarget ? 1 : 0;
    if (this.shadowTarget) {
      this.renderer.setRenderTarget(this.shadowTarget);
      this.renderer.render(this.shadowScene, this.shadowCamera);
      this.renderer.setRenderTarget(null);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Back to a transparent canvas (the DOM spread shows), unless leaves
   *  are moving again. A persistent book is drawn at rest instead. */
  clear() {
    if (this.raf || this.starting) return;
    if (this.persistent) return this.redraw();
    this.spread.classList.remove("is-turning");
    this.renderer.clear();
  }

  /** Draws the book at rest again (a page painted, the box resized) on the
   *  next frame; leaves in the air are drawn by their own frames. Only for
   *  a persistent book: the other one shows the DOM at rest. */
  redraw() {
    if (!this.persistent || this.disposed || this.still) return;
    this.still = requestAnimationFrame(() => {
      this.still = 0;
      if (this.disposed || this.raf || this.starting) return;
      this.layout();
      this.draw();
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.still);
    cancelAnimationFrame(this.orbitFrame);
    for (const tex of this.ready.values()) tex.dispose();
    this.shadowTarget?.dispose();
    this.leafCaster.dispose();
    this.staticCaster.dispose();
    this.scene.environment?.dispose();
    this.pmrem?.dispose();
    for (const mesh of [this.left, this.right, this.desk, ...this.stacks, ...this.leaves.values()]) {
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    }
    for (const c of this.covers.children) (c as Mesh).geometry.dispose();
    this.clearSpine();
    this.spineTex?.dispose();
    this.coverMaterial.normalMap?.dispose();
    this.coverMaterial.dispose();
    this.edges.dispose();
    this.renderer.dispose();
  }
}

/** WebGL is there and the reader has not asked for less motion. */
export function canFlip(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}
