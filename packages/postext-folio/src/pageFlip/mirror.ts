// A gloss open page's mirror of the leaves in the air (#483), split out of
// pageFlip.ts to keep that file within its size budget.
import { Matrix4, Plane, Vector4, type Object3D, type PerspectiveCamera, type Scene, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { behindUniforms } from './materials.js';

/** What the mirror is drawn with: the renderer, the scene and its camera,
 *  the camera kept for the mirror, the stage and what of it stays in the
 *  mirror's picture (the leaves in the air and the light on them). */
export interface MirrorScene {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  mirror: PerspectiveCamera;
  stage: Object3D;
  keep: ReadonlySet<Object3D>;
}

/** Draws the leaves in the air as `plane` (an open page's) mirrors them. */
export function drawMirror({ renderer, scene, camera, mirror: cam, stage, keep }: MirrorScene, target: WebGLRenderTarget, plane: Plane) {
  // The eye mirrored in the plane, turned round its up axis so it is
  // still a camera (no mirror in it): its picture is the reflection
  // turned left for right, and its frustum the main one turned so too.
  const { x, y, z } = plane.normal;
  const d = -plane.constant;
  const reflect = new Matrix4().set(
    1 - 2 * x * x, -2 * x * y, -2 * x * z, 2 * d * x,
    -2 * y * x, 1 - 2 * y * y, -2 * y * z, 2 * d * y,
    -2 * z * x, -2 * z * y, 1 - 2 * z * z, 2 * d * z,
    0, 0, 0, 1,
  );
  cam.matrix.copy(reflect).multiply(camera.matrixWorld).multiply(new Matrix4().makeScale(-1, 1, 1));
  cam.updateMatrixWorld(true);
  const p = cam.projectionMatrix.copy(camera.projectionMatrix);
  p.elements[8] *= -1;
  // Its near plane laid along the page (an oblique frustum): nothing
  // under the page shows in its mirror.
  const near = new Plane(plane.normal.clone(), plane.constant + 0.2).applyMatrix4(cam.matrixWorldInverse);
  const clip = new Vector4(near.normal.x, near.normal.y, near.normal.z, near.constant);
  const e = p.elements;
  const q = new Vector4((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
  clip.multiplyScalar(2 / clip.dot(q));
  e[2] = clip.x;
  e[6] = clip.y;
  e[10] = clip.z + 1;
  e[14] = clip.w;
  cam.projectionMatrixInverse.copy(p).invert();
  // Only the leaves in the air (and the light on them).
  const hidden: Object3D[] = [];
  for (const c of stage.children) {
    if (keep.has(c) || !c.visible) continue;
    c.visible = false;
    hidden.push(c);
  }
  // The key's shadow map as the main view drew it last: the leaves'
  // own faces under them are not lit by the key anyway.
  const shadows = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  // The picture behind the leaves lies on the main view's screen, not
  // this one's.
  const behind = behindUniforms.uBehindOn.value;
  behindUniforms.uBehindOn.value = 0;
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  renderer.shadowMap.autoUpdate = shadows;
  behindUniforms.uBehindOn.value = behind;
  for (const c of hidden) c.visible = true;
}
