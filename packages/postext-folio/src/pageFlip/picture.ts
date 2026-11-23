// The finished picture (#503, #1676): the scene drawn into a float
// picture, toned for the screen and smoothed; and, once the book lies at
// rest, the same view drawn a few more times, each a fraction of a pixel
// aside, and averaged. Kept out of pageFlip.ts for its size budget.
import { ConstantAlphaFactor, CustomBlending, HalfFloatType, LinearFilter, Mesh, OneMinusConstantAlphaFactor, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderTarget, type PerspectiveCamera, type Texture, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { occlusionUniforms } from './occlusion.js';

/** How many pictures of the book at rest are averaged. */
export const REST_SAMPLES = 16;
/** The average is shown from this many on: fewer still show steps the
 *  smoothed frame under it does not. */
const SHOW_FROM = 4;
/** The book lies at rest once nothing has drawn it for this long (ms): a
 *  hand turning the view draws a frame for each move it makes. */
const REST_MS = 120;

/** The `i`th term (from 1) of the Halton sequence in base `b`, 0 … 1. */
export function halton(i: number, b: number): number {
  let f = 1;
  let r = 0;
  for (let k = i; k > 0; k = Math.floor(k / b)) {
    f /= b;
    r += f * (k % b);
  }
  return r;
}

/** Where in its pixel the `i`th picture (from 1) is taken: an offset
 *  within half a pixel each way, the 16 of them spread evenly over it. */
export function restOffset(i: number): [number, number] {
  return [halton(i, 2) - 0.5, halton(i, 3) - 0.5];
}

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
// One more picture into the average. They are averaged as light (the
// screen's curve undone): a page's edge half over a dark desk is half the
// page's light, which the curve's own values would darken into a step.
// Colour is kept times its alpha, as the canvas takes it.
const ADD_FRAGMENT = /* glsl */ `
  uniform sampler2D tPicture;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tPicture, vUv);
    vec3 s = clamp(c.rgb, 0.0, 1.0);
    vec3 light = mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(0.04045, s));
    gl_FragColor = vec4(light * c.a, c.a);
  }
`;
const SHOW_FRAGMENT = /* glsl */ `
  uniform sampler2D tPicture;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tPicture, vUv);
    vec3 light = c.a > 0.0 ? clamp(c.rgb / c.a, 0.0, 1.0) : vec3(0.0);
    vec3 s = mix(light * 12.92, 1.055 * pow(light, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, light));
    gl_FragColor = vec4(s * c.a, c.a);
  }
`;

export class Picture {
  private composer: EffectComposer;
  private smaa = new SMAAPass();
  /** The average of the pictures taken at rest, and how many it holds. */
  private average: WebGLRenderTarget | null = null;
  private count = 0;
  private quad = new Mesh(new PlaneGeometry(2, 2));
  private quadScene = new Scene();
  private quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private add = new ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: ADD_FRAGMENT,
    uniforms: { tPicture: { value: null as Texture | null } },
    blending: CustomBlending,
    blendSrc: ConstantAlphaFactor,
    blendDst: OneMinusConstantAlphaFactor,
    depthTest: false,
    depthWrite: false,
  });
  private show = new ShaderMaterial({ vertexShader: QUAD_VERTEX, fragmentShader: SHOW_FRAGMENT, uniforms: { tPicture: { value: null as Texture | null } }, depthTest: false, depthWrite: false });
  private frame = 0;
  private drawnAt = 0;
  private over: () => void = () => undefined;
  private disposed = false;

  /** `atRest`: nothing of the book is moving (no leaf in the air). */
  constructor(
    private renderer: WebGLRenderer,
    scene: Scene,
    private camera: PerspectiveCamera,
    private atRest: () => boolean,
  ) {
    // Edges smoothed by SMAA over the finished picture (#503), not by the
    // canvas's own four samples a pixel: those left steps on long, nearly
    // level edges of strong contrast (a light page over the dark block)
    // and cost the most of a frame (resolved into a preserved drawing
    // buffer); SMAA smooths them better for a fraction of it. The scene
    // is drawn into a float picture, toned for the screen, then smoothed.
    this.composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { type: HalfFloatType }));
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.smaa);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    // The average needs a float picture to draw into.
    const ext = renderer.extensions;
    if (ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float")) {
      this.average = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false, generateMipmaps: false });
    }
  }

  /** The drawing buffer's size, in device px. */
  setSize(width: number, height: number) {
    this.composer.setPixelRatio(1);
    this.composer.setSize(width, height);
    if (this.average && (this.average.width !== width || this.average.height !== height)) this.average.setSize(width, height);
    this.count = 0;
  }

  /** Draws a frame of the book as it is now, then `over` on top of it
   *  (the magnifying glass). Left alone after it, the picture is drawn
   *  again and again from the next frames on, averaged, and shown in the
   *  frame's place: no steps left on its edges. */
  render(over: () => void) {
    this.composer.render();
    over();
    this.over = over;
    this.count = 0;
    this.drawnAt = performance.now();
    if (this.average && !this.frame) this.frame = requestAnimationFrame(this.refine);
  }

  /** Stops averaging (the canvas is cleared, or shows something else). */
  cancel() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.count = REST_SAMPLES;
  }

  private refine = (now: number) => {
    this.frame = 0;
    // A book in motion draws its own frames, and each asks for this again.
    if (this.disposed || this.count >= REST_SAMPLES || !this.atRest()) return;
    if (now - this.drawnAt >= REST_MS) this.sample();
    if (this.count < REST_SAMPLES) this.frame = requestAnimationFrame(this.refine);
  };

  /** One more picture of the book at rest into the average. */
  private sample() {
    const { renderer, camera, composer } = this;
    const average = this.average!;
    const view = camera.view;
    if (!view) return this.cancel();
    const i = ++this.count;
    const [dx, dy] = restOffset(i);
    const { offsetX, offsetY } = view;
    // Nothing has moved: the key's shadow map stands as the frame drew it.
    const shadows = renderer.shadowMap.autoUpdate;
    const clear = renderer.autoClear;
    renderer.shadowMap.autoUpdate = false;
    view.offsetX += dx;
    view.offsetY += dy;
    camera.updateProjectionMatrix();
    occlusionUniforms.uGrain.value.set(5.588238 * i, 5.588238 * i);
    // Toned for the screen, not smoothed, and kept off it.
    this.smaa.enabled = false;
    composer.renderToScreen = false;
    try {
      composer.render();
      renderer.autoClear = false;
      this.add.uniforms.tPicture.value = composer.readBuffer.texture;
      this.add.blendAlpha = 1 / i;
      this.quad.material = this.add;
      renderer.setRenderTarget(average);
      renderer.render(this.quadScene, this.quadCamera);
    } finally {
      this.smaa.enabled = true;
      composer.renderToScreen = true;
      renderer.setRenderTarget(null);
      renderer.autoClear = clear;
      renderer.shadowMap.autoUpdate = shadows;
      occlusionUniforms.uGrain.value.set(0, 0);
      view.offsetX = offsetX;
      view.offsetY = offsetY;
      camera.updateProjectionMatrix();
    }
    if (i < SHOW_FROM) return;
    this.show.uniforms.tPicture.value = average.texture;
    this.quad.material = this.show;
    renderer.render(this.quadScene, this.quadCamera);
    this.over();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.composer.dispose();
    this.average?.dispose();
    this.quad.geometry.dispose();
    this.add.dispose();
    this.show.dispose();
  }
}
