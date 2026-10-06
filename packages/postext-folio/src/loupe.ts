import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";

/** A magnifying glass held over the book (#527): where its centre is on
 *  the canvas (device px from the top left), the radius of its glass and
 *  the width of its rim (device px), and how much it magnifies at its
 *  centre. */
export interface LoupeView {
  x: number;
  y: number;
  radius: number;
  rim: number;
  zoom: number;
}

/** The share of the lens's field its centre takes: the sample radius at a
 *  point r (0 … 1) of the glass is r (A + (1 − A) r²), so the centre
 *  magnifies 1 / A times more than a flat lens of the same field and the
 *  rim gathers the field round it in, curving it as a real glass does. */
export const LOUPE_A = 0.58;
/** The biggest picture the lens is drawn into (device px a side). */
const MAX_SIDE = 2048;

const VERTEX = /* glsl */ `
uniform vec2 uCenter;
varying vec2 vPos;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPos = world.xy - uCenter;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * The glass and its rim, over the book as the screen shows it. The glass
 * shows the lens's own picture of the book (drawn from the reader's eye
 * through the lens's field, in linear light), refracted: magnified most at
 * the centre, curving in towards the rim, the colours parting a little
 * there; its edge darkens where the light bends away, and it catches a
 * soft window and a bright arc on the side the light comes from. The rim
 * is black plastic with a rounded section, lit by the same light, and
 * casts a soft shadow on the book. Toned for the screen as the book is.
 */
const FRAGMENT = /* glsl */ `
uniform sampler2D uScene;
uniform float uGlass;
uniform float uRim;
uniform float uShadow;
uniform vec2 uShadowOffset;
uniform float uA;
varying vec2 vPos;

vec4 over(vec4 src, vec4 dst) { return src + dst * (1.0 - src.a); }

void main() {
  float d = length(vPos);
  float R = uGlass;
  float outer = R + uRim;
  vec2 dir = d > 0.0 ? vPos / d : vec2(0.0);
  vec2 light = normalize(vec2(-0.55, 0.65));
  float lit = dot(dir, light);

  // The rim's shadow on the page (premultiplied, as everything here).
  float sd = length(vPos - uShadowOffset);
  vec4 color = vec4(0.0, 0.0, 0.0, 0.42 * (1.0 - smoothstep(outer - 0.6 * uShadow, outer + uShadow, sd)));
  // A thin dark edge round the rim, where it meets the page.
  color = over(vec4(0.0, 0.0, 0.0, 0.35 * (1.0 - smoothstep(outer, outer + 2.0, d))), color);

  // The rim: black plastic, a rounded section a little flatter on top.
  if (d < outer + 1.0) {
    float t = clamp((d - R) / uRim, 0.0, 1.0);
    float c = 2.0 * t - 1.0;
    vec3 n = normalize(vec3(dir * c * 1.15, sqrt(max(0.0, 1.0 - c * c)) + 0.2));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 L = normalize(vec3(light * 0.75, 0.66));
    vec3 L2 = normalize(vec3(-light * 0.7, 0.7));
    float diff = max(dot(n, L), 0.0);
    float nh = max(dot(n, normalize(L + V)), 0.0);
    float nh2 = max(dot(n, normalize(L2 + V)), 0.0);
    vec3 plastic = vec3(0.008) + vec3(0.02) * diff + vec3(0.9) * pow(nh, 90.0) + vec3(0.06) * pow(nh, 10.0) + vec3(0.1) * pow(nh2, 50.0);
    // The groove the glass sits in.
    plastic *= mix(0.25, 1.0, smoothstep(0.0, 0.14, t));
    float a = 1.0 - smoothstep(outer - 1.0, outer + 0.5, d);
    color = over(vec4(plastic * a, a), color);
  }

  // The glass.
  if (d < R + 1.0) {
    float r = clamp(d / R, 0.0, 1.0);
    float s = r * (uA + (1.0 - uA) * r * r);
    float ca = 0.012 * r * r * r;
    vec2 at = dir * 0.5;
    vec4 g = texture2D(uScene, 0.5 + at * s);
    g.r = texture2D(uScene, 0.5 + at * s * (1.0 + ca)).r;
    g.b = texture2D(uScene, 0.5 + at * s * (1.0 - ca)).b;
    // Darker towards the edge, where the light bends away, and in the
    // rim's shadow on the side away from the light.
    g.rgb *= mix(1.0, 0.7, smoothstep(0.8, 1.0, r));
    g.rgb *= 1.0 - 0.3 * smoothstep(0.9, 1.0, r) * (0.5 - 0.5 * lit);
    // What the glass mirrors: a soft window and an arc on its lit edge.
    vec2 q = (vPos / R - vec2(-0.36, 0.42)) * vec2(2.3, 3.4);
    float spot = 0.07 * exp(-dot(q, q));
    float arc = 0.4 * smoothstep(0.85, 0.96, r) * (1.0 - smoothstep(0.96, 1.0, r)) * max(0.0, lit);
    vec4 glass = vec4(g.rgb + vec3(spot + arc), clamp(g.a + spot + arc, 0.0, 1.0));
    float a = 1.0 - smoothstep(R - 1.0, R + 0.5, d);
    color = mix(color, glass, a);
  }

  if (color.a <= 0.0) discard;
  gl_FragColor = vec4(color.rgb / color.a, color.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;

/** The magnifying glass: its picture of the book and the glass drawn over
 *  the screen. */
export class Loupe {
  private target: WebGLRenderTarget | null = null;
  private camera = new PerspectiveCamera();
  private overlay = new Scene();
  private overlayCamera = new OrthographicCamera(0, 1, 1, 0, -1, 1);
  private mesh: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor() {
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uScene: { value: null as Texture | null },
        uCenter: { value: new Vector2() },
        uGlass: { value: 1 },
        uRim: { value: 1 },
        uShadow: { value: 1 },
        uShadowOffset: { value: new Vector2() },
        uA: { value: LOUPE_A },
      },
      transparent: true,
      premultipliedAlpha: true,
      blending: NormalBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), material);
    this.mesh.frustumCulled = false;
    this.overlay.add(this.mesh);
  }

  /** How far from its centre (device px) the field the glass shows
   *  reaches on the screen. */
  static field(view: LoupeView): number {
    return view.radius / (LOUPE_A * Math.max(1, view.zoom));
  }

  /**
   * Draws the lens's picture: the book from the eye (`camera`, the main
   * view) through the lens's field only, a square around the lens's centre
   * as wide as the field, into a picture with about one texel for each
   * screen pixel at the glass's centre (more towards the rim, which
   * gathers the field in: no multisampling, which would cost more than the
   * book's own frame). `before` and `after` run round the
   * draw (the host swaps in its sharper paintings and turns off what reads
   * the main view's screen).
   */
  capture(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, view: LoupeView, before: () => void, after: () => void) {
    const max = Math.min(MAX_SIDE, (renderer.capabilities as { maxRenderbufferSize?: number }).maxRenderbufferSize ?? MAX_SIDE);
    const side = Math.max(16, Math.min(max, Math.ceil((2 * view.radius) / LOUPE_A)));
    let target = this.target;
    if (!target) {
      target = new WebGLRenderTarget(side, side, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false });
      this.target = target;
    } else if (target.width !== side) target.setSize(side, side);
    const field = Loupe.field(view);
    const cam = this.camera;
    cam.copy(camera);
    const v = camera.view;
    const full = v ? { w: v.fullWidth, h: v.fullHeight, x: v.offsetX, y: v.offsetY } : { w: 1, h: 1, x: 0, y: 0 };
    cam.setViewOffset(full.w, full.h, full.x + view.x - field, full.y + view.y - field, 2 * field, 2 * field);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const shadows = renderer.shadowMap.autoUpdate;
    // The key's shadow map as the main view drew it.
    renderer.shadowMap.autoUpdate = false;
    before();
    try {
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, cam);
    } finally {
      renderer.setRenderTarget(null);
      renderer.shadowMap.autoUpdate = shadows;
      after();
    }
  }

  /** Draws the glass and its rim over the screen (`width` × `height`
   *  device px), its picture as `capture` drew it last. */
  draw(renderer: WebGLRenderer, width: number, height: number, view: LoupeView) {
    if (!this.target) return;
    const cam = this.overlayCamera;
    if (cam.right !== width || cam.top !== height) {
      cam.right = width;
      cam.top = height;
      cam.updateProjectionMatrix();
    }
    const u = this.mesh.material.uniforms;
    const shadow = Math.max(6, view.rim * 1.6);
    const offset = new Vector2(view.rim * 0.35, -view.rim * 0.55);
    const reach = view.radius + view.rim + shadow + offset.length() + 2;
    // The overlay's y runs up from the bottom of the screen.
    const cx = view.x;
    const cy = height - view.y;
    this.mesh.position.set(cx, cy, 0);
    this.mesh.scale.set(2 * reach, 2 * reach, 1);
    this.mesh.updateMatrixWorld();
    u.uScene.value = this.target.texture;
    u.uCenter.value.set(cx, cy);
    u.uGlass.value = view.radius;
    u.uRim.value = view.rim;
    u.uShadow.value = shadow;
    u.uShadowOffset.value.copy(offset);
    const clear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.render(this.overlay, cam);
    renderer.autoClear = clear;
  }

  dispose() {
    this.target?.dispose();
    this.target = null;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
