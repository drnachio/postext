// The book's ambient occlusion from its height map, the key light's soft
// shadow with a receiver-plane bias, and the caster copies of the meshes
// drawn into the map (#1276: split out of pageFlip.ts).
import { Texture, Vector4, ShaderChunk, BufferGeometry, Mesh, BufferAttribute, ShaderMaterial, DoubleSide, CustomBlending, MaxEquation, OneFactor, MeshStandardMaterial } from 'three';

// Ambient occlusion from the book's own shape: each frame the book is
// drawn, seen from straight above, into a height map: channel r the
// highest of everything (blocks, covers, open pages, leaves), channel g the
// leaves in the air alone. A point is occluded by paper rising round it,
// more the nearer and higher it is: the book's contact shadow on the desk
// and the dark under a lifted leaf. The open pages read only the leaves'
// channel (their gutter is worked out from the cross-section).
export const OCCLUSION = /* glsl */ `
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
  // march starts a few px out, past the paper round p itself. Its steps
  // are shifted a little from pixel to pixel: at fixed steps the leaf's
  // outline was cut in at each of them, a row of teeth (#483).
  float reflectionOcclusion(vec3 p, vec3 r, float channel) {
    if (uShadowOn < 0.5) return 0.0;
    // Interleaved gradient noise: neighbours take evenly spread shifts.
    float spin = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float hidden = 0.0;
    for (int i = 0; i < 8; i++) {
      float s = (float(i) + spin) / 8.0;
      float t = 6.0 + s * s * uOccRadius * 2.0;
      vec3 q = p + r * t;
      hidden = max(hidden, smoothstep(0.0, 4.0, casterAt(q.xy, channel) - q.z - uOccBias));
    }
    return hidden;
  }
`;

/** Declares the book position varying in a vertex shader and sets it:
 *  the world position with the mirror of a right-bound book undone. */
export const BOOK_POS_PARS = "uniform float uSign;\nvarying vec3 vBookPos;";
export const BOOK_POS = "vBookPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvBookPos.x *= uSign;";

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
export const occlusionUniforms = {
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
export function keySpecular(occlusion = "1.0") {
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
export function keyShadowed(fragmentShader: string): string {
  return fragmentShader.replace("#include <shadowmap_pars_fragment>", SHADOW_PARS);
}

/** A caster's own copy of a mesh's shape. The height map is drawn before
 *  the main view, and three.js uploads a geometry once per frame number,
 *  which the key's shadow pass at the end of the last main view had
 *  already taken: a caster sharing a leaf's geometry drew the leaf where
 *  it lay a frame before, and a leaf moving down was shaded by its own
 *  old self, moving up it was not (#488). */
export function casterGeometry(source: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", source.attributes.position.clone());
  if (source.index) g.setIndex(source.index.clone());
  return g;
}

/** Brings a caster's copy to its mesh's shape as laid out this frame. */
export function syncCaster(caster: Mesh, source: BufferGeometry) {
  const to = caster.geometry.attributes.position as BufferAttribute;
  (to.array as Float32Array).set(source.attributes.position.array as Float32Array);
  to.needsUpdate = true;
}

export function casterMaterial(leaf: boolean) {
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
export function occluded<T extends MeshStandardMaterial>(m: T, sign: number): T {
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
