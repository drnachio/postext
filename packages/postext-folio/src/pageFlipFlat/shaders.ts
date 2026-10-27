// The flat flipper's light, its page and desk shaders with the key
// light's shadow, the shadow casters and the page material
// (#1276: split out of pageFlipFlat.ts).
import { Vector3, Texture, Vector4, ShaderMaterial, DoubleSide } from 'three';

/** Towards the light: from above, a little to the upper left. */
export const LIGHT = new Vector3(-0.22, 0.3, 1).normalize();

export const VERTEX = /* glsl */ `
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
export const DESK = /* glsl */ `
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
export const CASTER_VERTEX = /* glsl */ `
  uniform vec3 uLd;
  varying float vZ;
  void main() {
    vZ = position.z;
    vec2 s = position.xy - uLd.xy / uLd.z * position.z;
    gl_Position = projectionMatrix * viewMatrix * vec4(s, 0.0, 1.0);
  }
`;
export const CASTER_FRAGMENT = /* glsl */ `
  varying float vZ;
  void main() {
    gl_FragColor = vec4(vZ + 10.0, 0.0, 0.0, 1.0);
  }
`;

/** The shadow uniforms every receiving material shares (same objects). */
export const shadowUniforms = {
  uShadowMap: { value: null as Texture | null },
  uShadowBox: { value: new Vector4(0, 0, 1, 1) },
  uLd: { value: LIGHT },
  uShadowOn: { value: 0 },
};
/** The book's paper, for its blank pages (shared too). */
export const paperUniform = { uPaper: { value: new Vector3(1, 1, 1) } };

export function material(lit: boolean, mirror: boolean) {
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
