import {
  CustomBlending,
  DoubleSide,
  Group,
  HalfFloatType,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  MaxEquation,
  Mesh,
  NearestFilter,
  NoColorSpace,
  OneFactor,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";

/** A page: an image URL, or a canvas or a decoded image to draw; "" is a
 *  blank page (drawn as paper), null no page at all. */
export type PageSource = string | HTMLCanvasElement | HTMLImageElement | null;

/** A spread: [verso, recto]. */
export type SpreadSrc = [PageSource, PageSource];

type Drawn = Exclude<PageSource, null | "">;

/** Columns and rows of a leaf's mesh: fine enough for a tight roll. */
const NX = 96;
const NY = 120;
/** Vertical field of view: low, so a page at rest maps 1:1 onto the DOM spread. */
const FOV = 26;
/** Radius of the roll at mid-turn, relative to the page's width. */
const ROLL = 0.11;
/** Milliseconds one leaf takes to turn. */
const DURATION = 1000;
/** A leaf follows the one before it once that one is this far through its turn. */
const GAP = 0.14;
/** Towards the light: from above, a little to the upper left. */
const LIGHT = new Vector3(-0.22, 0.3, 1).normalize();

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vNormal = normal;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Shadows are cast for real: each frame the leaves in the air are drawn,
// seen from the light, into a height map (the highest paper over each
// point, drawn in `draw`). A surface is in shadow where paper lies between
// it and the light; the penumbra widens with the gap, as a real one does
// (a blocker search, then a filter of that width). Paper lifted nearby
// also hides part of the sky from it (ambient occlusion): the soft
// darkening along a roll and round a flap.
const SHADOW = /* glsl */ `
  uniform sampler2D uShadowMap;
  uniform vec4 uShadowBox;
  uniform vec3 uLd;
  uniform float uShadowOn;

  float casterAt(vec2 s) {
    vec2 uv = (s - uShadowBox.xy) / uShadowBox.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -1e4;
    return texture2D(uShadowMap, uv).r - 10.0;
  }

  // How much of the sky paper lifted nearby hides: 0 … 1.
  float occlusionAt(vec3 p, vec2 s, float spin) {
    float occ = 0.0;
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 2.39996 + spin;
      float r = sqrt((float(i) + 0.5) / 16.0) * 72.0;
      float h = casterAt(s + r * vec2(cos(a), sin(a)));
      occ += clamp((h - p.z - 2.5) / (r + 14.0), 0.0, 1.0);
    }
    return occ / 16.0;
  }

  // The light lost at p: 0 … about 0.6.
  float shadowAt(vec3 p) {
    if (uShadowOn < 0.5) return 0.0;
    vec2 s = p.xy - uLd.xy / uLd.z * p.z;
    float spin = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
    float ambient = 0.34 * occlusionAt(p, s, spin);
    const float bias = 2.5;
    float sum = 0.0;
    float found = 0.0;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 2.39996 + spin;
      vec2 o = sqrt((float(i) + 0.5) / 12.0) * vec2(cos(a), sin(a));
      float h = casterAt(s + o * 16.0);
      if (h > p.z + bias) {
        sum += h;
        found += 1.0;
      }
    }
    if (found < 0.5) return ambient;
    float gap = sum / found - p.z;
    float spread = clamp(gap * 0.3, 1.5, 40.0);
    float hit = 0.0;
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 2.39996 + spin;
      vec2 o = sqrt((float(i) + 0.5) / 16.0) * vec2(cos(a), sin(a));
      if (casterAt(s + o * spread) > p.z + bias) hit += 1.0;
    }
    // Paper high above casts a paler shadow (more light gets round it).
    float direct = 0.4 * hit / 16.0 * (1.0 - 0.4 * smoothstep(30.0, 300.0, gap));
    return min(0.6, 1.0 - (1.0 - direct) * (1.0 - ambient));
  }
`;

// Colours are passed through untouched (textures and output both without
// colour management) so a page at rest matches the <img> pixel for pixel,
// spine gradient included (the CSS one, blended the way CSS blends it).
// Lighting never brightens: a page facing the reader is as the <img> is,
// turned from the light it darkens. On a mirrored stage (a right-bound
// book) the images are read back the right way round.
const FRAGMENT = /* glsl */ `
  uniform sampler2D uFront;
  uniform sampler2D uBack;
  // 0 no page, 1 its image, 2 blank paper.
  uniform float uHasFront;
  uniform float uHasBack;
  uniform vec3 uPaper;
  uniform float uBlank;
  uniform float uLit;
  uniform float uMirror;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPos;
  ${SHADOW}

  float spine(float u, float a0, float a1) {
    if (u < 0.03) return mix(a0, a1, u / 0.03);
    if (u < 0.09) return mix(a1, 0.0, (u - 0.03) / 0.06);
    return 0.0;
  }

  void main() {
    bool front = gl_FrontFacing;
    float has = front ? uHasFront : uHasBack;
    vec3 col;
    if (has < 0.5 && uBlank < 0.5) discard;
    if (has < 0.5 || has > 1.5) {
      col = uPaper;
    } else {
      float u = uMirror > 0.5 ? 1.0 - vUv.x : vUv.x;
      col = front ? texture2D(uFront, vec2(u, vUv.y)).rgb : texture2D(uBack, vec2(1.0 - u, vUv.y)).rgb;
    }
    // uv.x is the distance from the spine on both faces.
    col *= 1.0 - (front ? spine(vUv.x, 0.18, 0.05) : spine(vUv.x, 0.16, 0.04));

    vec3 p = vPos;
    if (uLit > 0.5) {
      vec3 n = normalize(vNormal) * (front ? 1.0 : -1.0);
      col *= mix(0.6, 1.0, clamp(dot(n, uLd) / uLd.z, 0.0, 1.0));
      // Look the shadow up a little off the surface (no self-shadow acne).
      p += n * 2.0;
    }
    col *= 1.0 - shadowAt(p);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// The desk under the book: the pages' drop shadow (the CSS box-shadow of
// `.cb-lt-page`, a gaussian-blurred rectangle) and the leaves'.
const DESK = /* glsl */ `
  uniform float uW;
  uniform float uH;
  uniform vec2 uPages;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPos;
  ${SHADOW}

  float erf(float x) {
    float a = abs(x);
    float t = 1.0 / (1.0 + 0.3275911 * a);
    float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
    return sign(x) * y;
  }
  float band(float x, float lo, float hi, float sigma) {
    return 0.5 * (erf((x - lo) / (sigma * 1.4142)) - erf((x - hi) / (sigma * 1.4142)));
  }
  // box-shadow: 0 1px 1px .35, 0 16px 36px -8px .65 (CSS y runs down).
  float page(vec2 p, float x0, float x1) {
    float h = uH / 2.0;
    float soft = 0.65 * band(p.x, x0 + 8.0, x1 - 8.0, 18.0) * band(p.y + 16.0, -h + 8.0, h - 8.0, 18.0);
    float hard = 0.35 * band(p.x, x0, x1, 0.5) * band(p.y + 1.0, -h, h, 0.5);
    return 1.0 - (1.0 - soft) * (1.0 - hard);
  }

  void main() {
    vec2 p = vPos.xy;
    float clear = 1.0;
    if (uPages.x > 0.5) clear *= 1.0 - page(p, -uW, 0.0);
    if (uPages.y > 0.5) clear *= 1.0 - page(p, 0.0, uW);
    clear *= 1.0 - 1.3 * shadowAt(vPos);
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - clear);
  }
`;

// Draws the leaves as the light sees them: each point where its shadow
// falls on the desk plane, keeping the highest paper (max blending).
const CASTER_VERTEX = /* glsl */ `
  uniform vec3 uLd;
  varying float vZ;
  void main() {
    vZ = position.z;
    vec2 s = position.xy - uLd.xy / uLd.z * position.z;
    gl_Position = projectionMatrix * viewMatrix * vec4(s, 0.0, 1.0);
  }
`;
const CASTER_FRAGMENT = /* glsl */ `
  varying float vZ;
  void main() {
    gl_FragColor = vec4(vZ + 10.0, 0.0, 0.0, 1.0);
  }
`;

/** The shadow uniforms every receiving material shares (same objects). */
const shadowUniforms = {
  uShadowMap: { value: null as Texture | null },
  uShadowBox: { value: new Vector4(0, 0, 1, 1) },
  uLd: { value: LIGHT },
  uShadowOn: { value: 0 },
};
/** The book's paper, for its blank pages (shared too). */
const paperUniform = { uPaper: { value: new Vector3(1, 1, 1) } };

function material(lit: boolean, mirror: boolean) {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: DoubleSide,
    uniforms: {
      uFront: { value: null },
      uBack: { value: null },
      uHasFront: { value: 0 },
      uHasBack: { value: 0 },
      uBlank: { value: lit ? 1 : 0 },
      uLit: { value: lit ? 1 : 0 },
      uMirror: { value: mirror ? 1 : 0 },
      ...shadowUniforms,
      ...paperUniform,
    },
  });
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

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
 * page lifts and shrinks to nothing as it lands on the other side.
 */
function foldOf(G: Pt, P: Pt, W: number, H: number) {
  const du = G.u - P.u;
  const dv = G.v - P.v;
  const D = Math.hypot(du, dv);
  if (D < 0.5) return null;
  const n = { u: du / D, v: dv / D };
  const q = progressFrom(G, P);
  const R = ROLL * W * (0.3 + 0.7 * smooth(0, 0.2, q)) * (1 - smooth(0.62, 1, q)) * Math.min(1, D / (0.1 * W));
  const roll = Math.PI * R;
  let c = (D + roll * Math.min(1, roll > 0 ? D / roll : 0)) / 2;
  for (const S of [-H / 2, H / 2]) c = Math.min(c, G.u * n.u + (G.v - S) * n.v);
  if (c <= 0) return null;
  return { F: { u: G.u - n.u * c, v: G.v - n.v * c }, n, R };
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

/** Lays a leaf's mesh out for a fold (flat when there is none). */
function layLeaf(geometry: PlaneGeometry, fold: Fold | null, forward: boolean, W: number, H: number, z0: number) {
  const pos = geometry.attributes.position;
  const sx = forward ? 1 : -1;
  for (let iy = 0; iy <= NY; iy++) {
    const v = (0.5 - iy / NY) * H;
    for (let ix = 0; ix <= NX; ix++) {
      const u = (ix / NX) * W;
      let x = u;
      let y = v;
      let z = 0;
      if (fold) {
        const { F, n, R } = fold;
        const d = (u - F.u) * n.u + (v - F.v) * n.v;
        if (d > 0) {
          let dd: number;
          if (R < 1e-3) dd = -d;
          else if (d < Math.PI * R) {
            dd = R * Math.sin(d / R);
            z = R * (1 - Math.cos(d / R));
          } else {
            dd = -(d - Math.PI * R);
            z = 2 * R;
          }
          x = u - n.u * (d - dd);
          y = v - n.v * (d - dd);
        }
      }
      pos.setXYZ(iy * (NX + 1) + ix, sx * x, y, z + z0);
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

type PageMesh = Mesh<PlaneGeometry, ShaderMaterial>;

interface Turn {
  forward: boolean;
  /** The point taken, and where the hand holds it now. */
  G: Pt;
  P: Pt;
  /** Held by the reader's pointer: `P` follows `aim`. */
  held?: { aim: Pt; samples: { t: number; q: number }[] };
  /** Carried by the animation: from → to, lifted `arc` on the way. */
  anim?: { start: number; duration: number; from: Pt; to: Pt; arc: number; lands: boolean };
}

interface Airborne {
  k: number;
  q: number;
  forward: boolean;
  fold: Fold | null;
  mesh: PageMesh;
}

/**
 * Turns the pages of the light table's DOM spread. The book is a stack of
 * leaves: leaf k has spread k's recto on its front and spread k + 1's verso
 * on its back. `go(n)` sends every leaf before spread n to the left and
 * the rest to the right; each turns on its own, following the one before
 * it at a short remove, so several pages can be in the air at once. At
 * rest the canvas is transparent and the <img> pages show; while leaves
 * move it draws the spread, lit, with the lifted leaves' shadows.
 *
 * The book is modelled bound on the left. A right-bound one is the same
 * book seen in a mirror (the DOM spread's `dir="rtl"`): the stage is
 * mirrored, so the verso lies on the right and the leaves turn from left
 * to right, while the page images, the pointer and the light are mirrored
 * back to read as they are on the desk.
 */
export class PageFlipper {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 1, 10000);
  private left: PageMesh;
  private right: PageMesh;
  private desk: PageMesh;
  /** Everything on the desk, in the book's own coordinates (mirrored for a
   *  right-bound book). */
  private stage = new Group();
  /** 1 for a left-bound book, −1 for a right-bound one. */
  private sign: 1 | -1;
  /** Towards the light, in the book's coordinates. */
  private light: Vector3;
  private shadowScene = new Scene();
  private shadowCamera = new OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  private shadowTarget: WebGLRenderTarget | null = null;
  private casterMaterial = new ShaderMaterial({
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
    uniforms: { uLd: { value: LIGHT } },
  });
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
  private starting = false;
  private disposed = false;
  /** The spread last reported settled (the one the DOM shows). */
  private reported: number;

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
  ) {
    this.sign = binding === "right" ? -1 : 1;
    this.light = new Vector3(this.sign * LIGHT.x, LIGHT.y, LIGHT.z);
    this.casterMaterial.uniforms.uLd.value = this.light;
    const mirror = this.sign < 0;
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.left = new Mesh(new PlaneGeometry(1, 1, 1, 1), material(false, mirror));
    this.right = new Mesh(new PlaneGeometry(1, 1, 1, 1), material(false, mirror));
    this.desk = new Mesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: DESK,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uW: { value: 1 },
          uH: { value: 1 },
          uPages: { value: new Vector2() },
          ...shadowUniforms,
        },
      }),
    );
    this.desk.renderOrder = -1;
    this.shadowCamera.position.z = 100;
    // The height map needs a float colour buffer (and max blending).
    const ext = this.renderer.extensions;
    if (ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float")) {
      this.shadowTarget = new WebGLRenderTarget(1, 1, {
        type: HalfFloatType,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        depthBuffer: false,
        generateMipmaps: false,
      });
    }
    // A mirror turns three.js's face culling round with it (the front of a
    // page stays its front).
    this.stage.scale.x = this.sign;
    this.stage.add(this.desk, this.left, this.right);
    this.scene.add(this.stage);
    this.target = at;
    this.reported = at;
    this.turned = Array.from({ length: Math.max(0, book.length - 1) }, (_, k) => k < at);
  }

  /** Fits the camera so the z = 0 plane maps onto the DOM spread 1:1. */
  private layout() {
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (!cw || !ch) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(cw, ch, false);
    this.camera.aspect = cw / ch;
    this.camera.position.set(0, 0, ch / 2 / Math.tan((FOV * Math.PI) / 360));
    this.camera.near = this.camera.position.z / 20;
    this.camera.far = this.camera.position.z * 4;
    this.camera.updateProjectionMatrix();
    this.W = this.spread.clientWidth / 2;
    this.H = this.spread.clientHeight;
    this.flat(this.right.geometry, 1);
    this.flat(this.left.geometry, -1);
    // The desk plane fills the canvas (its vertices are world positions).
    const pos = this.desk.geometry.attributes.position;
    for (let i = 0; i < 4; i++) pos.setXYZ(i, (i % 2 ? 1 : -1) * this.W * 2, (i < 2 ? 1 : -1) * this.H, -1);
    pos.needsUpdate = true;
    this.desk.material.uniforms.uW.value = this.W;
    this.desk.material.uniforms.uH.value = this.H;
    // The height map covers the canvas (1 texel ≈ 1 px at the desk).
    if (this.shadowTarget) {
      const hw = cw / 2 + 60;
      const hh = ch / 2 + 60;
      Object.assign(this.shadowCamera, { left: -hw, right: hw, top: hh, bottom: -hh });
      this.shadowCamera.updateProjectionMatrix();
      const scale = Math.min(1, 2048 / (2 * hw));
      this.shadowTarget.setSize(Math.round(2 * hw * scale), Math.round(2 * hh * scale));
      shadowUniforms.uShadowBox.value.set(-hw, -hh, 2 * hw, 2 * hh);
      shadowUniforms.uShadowMap.value = this.shadowTarget.texture;
    }
  }

  private flat(geometry: PlaneGeometry, side: 1 | -1) {
    const pos = geometry.attributes.position;
    // PlaneGeometry(1, 1, 1, 1): TL, TR, BL, BR; uv.x = 0 at the spine.
    const { W, H } = this;
    pos.setXYZ(0, 0, H / 2, 0);
    pos.setXYZ(1, side * W, H / 2, 0);
    pos.setXYZ(2, 0, -H / 2, 0);
    pos.setXYZ(3, side * W, -H / 2, 0);
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  /** The colour of the book's paper (0 … 1), for its blank pages. */
  setPaper(r: number, g: number, b: number) {
    paperUniform.uPaper.value.set(r, g, b);
  }

  /** Starts loading the pages of these spreads as textures. */
  preload(indexes: number[]) {
    for (const i of indexes) for (const src of this.book[i] ?? []) if (src) void this.texture(src);
  }

  private texture(src: Drawn): Promise<Texture | null> {
    let hit = this.textures.get(src);
    if (!hit) {
      const prepare = (tex: Texture) => {
        tex.colorSpace = NoColorSpace;
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
  }

  private assign(mesh: PageMesh, face: "Front" | "Back", src: PageSource) {
    const u = mesh.material.uniforms;
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
    };
    const tex = this.ready.get(src);
    if (tex) set(tex);
    else void this.texture(src).then(set);
  }

  private leaf(k: number): PageMesh {
    let mesh = this.leaves.get(k);
    if (!mesh) {
      mesh = new Mesh(new PlaneGeometry(1, 1, NX, NY), material(true, this.sign < 0));
      const caster = new Mesh(mesh.geometry, this.casterMaterial);
      caster.frustumCulled = false;
      this.shadowScene.add(caster);
      mesh.userData.caster = caster;
      this.assign(mesh, "Front", this.book[k]?.[1] ?? null);
      this.assign(mesh, "Back", this.book[k + 1]?.[0] ?? null);
      this.leaves.set(k, mesh);
    }
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
    const n = this.turned.length;
    const progress = (turn: Turn) => progressFrom(turn.G, turn.P);

    // Move the hands; land the leaves that have finished (or fallen back).
    for (const [k, turn] of this.turns) {
      if (turn.held) {
        // The page follows the hand with a little inertia.
        const { aim } = turn.held;
        turn.P = reach(turn.G, { u: turn.P.u + (aim.u - turn.P.u) * 0.35, v: turn.P.v + (aim.v - turn.P.v) * 0.35 }, this.H);
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
      this.turns.set(k, this.lift(true, now));
    }
    for (let k = n - 1; k >= this.target; k--) {
      if (!this.turned[k] || this.turns.has(k)) continue;
      if (k < n - 1 && !follows(k + 1, false)) break;
      this.turns.set(k, this.lift(false, now));
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

  /** The pointer on the z = 0 plane, in the book's coordinates (x
   *  mirrored for a right-bound book). */
  private toWorld(event: { clientX: number; clientY: number }) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: this.sign * (event.clientX - (rect.left + rect.width / 2)), y: -(event.clientY - (rect.top + rect.height / 2)) };
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
    if (k < 0 || k >= this.turned.length || Math.abs(x) > this.W || Math.abs(y) > this.H / 2) return false;
    const G = { u: Math.max(0.15 * this.W, Math.abs(x)), v: y };
    this.turns.set(k, { forward, G, P: { ...G }, held: { aim: { ...G }, samples: [] } });
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
    turn.held.samples.push({ t, q: progressFrom(turn.G, turn.held.aim) });
    while (turn.held.samples.length > 2 && t - turn.held.samples[0].t > 120) turn.held.samples.shift();
  }

  /** Lets go. A click turns the page over from where it was taken; a drag
   *  carries on over if the page is past halfway or thrown that way, and
   *  falls back otherwise. */
  release(click = false) {
    const entry = [...this.turns].find(([, t]) => t.held);
    if (!entry) return;
    const [k, turn] = entry;
    const { samples } = turn.held!;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const speed = first && last && last.t > first.t ? (last.q - first.q) / (last.t - first.t) : 0; // per ms
    const q = progressFrom(turn.G, turn.P);
    const over = click || q + speed * 250 > 0.5;
    const to = over ? { u: -turn.G.u, v: turn.G.v } : { ...turn.G };
    turn.held = undefined;
    turn.anim = {
      start: performance.now(),
      duration: click ? DURATION : Math.max(260, DURATION * 0.8 * (over ? 1 - q : q)),
      from: { ...turn.P },
      to,
      arc: click ? 0.2 * this.H : 0,
      lands: over,
    };
    if (over) {
      this.target = turn.forward ? k + 1 : k;
      this.onTarget(this.target);
    }
  }

  private draw() {
    const { W, H } = this;
    const n = this.turned.length;
    // The leaves in the air, in book order.
    const air: Airborne[] = [...this.turns]
      .sort(([a], [b]) => a - b)
      .map(([k, turn]) => ({
        k,
        q: progressFrom(turn.G, turn.P),
        forward: turn.forward,
        fold: foldOf(turn.G, turn.P, W, H),
        mesh: this.leaf(k),
      }));
    for (const leaf of this.leaves.values()) leaf.visible = (leaf.userData.caster as Mesh).visible = false;
    air.forEach(({ q, forward, fold, mesh }, i) => {
      // Leaf k lies over leaf k + 1 on the right and under it on the left.
      const side = forward ? q : 1 - q;
      layLeaf(mesh.geometry, fold, forward, W, H, 0.6 + 0.8 * ((1 - side) * (air.length - 1 - i) + side * i));
      mesh.visible = (mesh.userData.caster as Mesh).visible = true;
      if (!mesh.parent) this.stage.add(mesh);
    });

    // The pages lying flat: the top leaf of each stack.
    let l = -1;
    for (let k = 0; k < n; k++) if (this.turned[k] && !this.turns.has(k)) l = k;
    let r = n;
    for (let k = n - 1; k >= 0; k--) if (!this.turned[k] && !this.turns.has(k)) r = k;
    const leftSrc = this.book[l + 1]?.[0] ?? null;
    const rightSrc = this.book[r]?.[1] ?? null;
    this.assign(this.left, "Back", leftSrc);
    this.assign(this.right, "Front", rightSrc);
    this.desk.material.uniforms.uPages.value.set(Number(leftSrc !== null), Number(rightSrc !== null));

    // The height map the shadows are read from.
    shadowUniforms.uLd.value = this.light;
    shadowUniforms.uShadowOn.value = this.shadowTarget && air.length ? 1 : 0;
    if (this.shadowTarget && air.length) {
      this.renderer.setRenderTarget(this.shadowTarget);
      this.renderer.render(this.shadowScene, this.shadowCamera);
      this.renderer.setRenderTarget(null);
    }

    this.renderer.render(this.scene, this.camera);
  }

  /** Back to a transparent canvas (the DOM spread shows), unless leaves
   *  are moving again. */
  clear() {
    if (this.raf || this.starting) return;
    this.spread.classList.remove("is-turning");
    this.renderer.clear();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const tex of this.ready.values()) tex.dispose();
    this.shadowTarget?.dispose();
    this.casterMaterial.dispose();
    for (const mesh of [this.left, this.right, this.desk, ...this.leaves.values()]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
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
