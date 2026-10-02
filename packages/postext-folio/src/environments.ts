import {
  BackSide,
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  type Object3D,
} from "three";

export type EnvironmentKind = "studio" | "daylight" | "lamp" | "overcast" | "night";

/** A lighting environment: a small scene of emitters the reflections and
 *  the soft (image-based) light are taken from, and the key light that
 *  casts the shadows, placed where the scene's brightest emitter is. */
export interface Environment {
  scene: Scene;
  /** Towards the key light (book coordinates: x right, y to the head of
   *  the page, z up from the desk). */
  key: Vector3;
  keyColor: Color;
  /** The key light's strength. */
  keyIntensity: number;
  /** How soft the key light's shadows are (its apparent size, 0 … 1). */
  softness: number;
  /** Exposure, so paper at rest reads as its own colour. */
  exposure: number;
}

/** An emitter: a panel of light of colour × strength (HDR, so it can be
 *  far brighter than white). */
function panel(w: number, h: number, color: string, strength: number, at: [number, number, number], lookAt: [number, number, number] = [0, 0, 0]): Mesh {
  const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(strength), side: 2 }));
  m.position.set(...at);
  m.lookAt(...lookAt);
  return m;
}

function room(color: string, strength = 1, size: [number, number, number] = [20, 20, 12]): Mesh {
  const g = new BoxGeometry(...size);
  // The floor (the desk's plane, z < 0 in the room) a little darker.
  const m = new Mesh(g, new MeshBasicMaterial({ color: new Color(color).multiplyScalar(strength), side: BackSide }));
  m.position.z = size[2] / 2 - 2;
  return m;
}

function sphere(color: string, strength: number, at: [number, number, number], r = 0.5): Mesh {
  const m = new Mesh(new SphereGeometry(r, 24, 12), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(strength) }));
  m.position.set(...at);
  return m;
}

function sceneOf(...objects: Object3D[]): Scene {
  const scene = new Scene();
  scene.add(...objects);
  return scene;
}

/**
 * The environments: a photographer's studio (a large softbox above left,
 * a fill on the right, a neutral grey room), daylight from a tall window
 * on the left, a warm reading lamp in a dim room, an even overcast sky,
 * and night (a lamp, a faint cool window). Coordinates are in book units
 * where the book is about 2 across, centred at the origin on the desk.
 */
export function environment(kind: EnvironmentKind): Environment {
  switch (kind) {
    case "studio":
      return {
        scene: sceneOf(
          room("#6d6d6d"),
          panel(6, 4, "#ffffff", 7, [-4, 3, 7]),
          panel(4, 6, "#ffffff", 2.2, [7, -1, 4]),
          panel(10, 2, "#ffffff", 1.5, [0, 8, 6]),
        ),
        key: new Vector3(-0.4, 0.3, 0.86).normalize(),
        keyColor: new Color("#ffffff"),
        keyIntensity: 0.5,
        softness: 0.55,
        exposure: 1.15,
      };
    case "daylight":
      return {
        scene: sceneOf(
          room("#9a948c"),
          // The window: bright, a little cool; the sky through it brighter
          // above.
          panel(1, 9, "#dfe9ff", 14, [-9.5, 1, 4.5], [0, 1, 4.5]),
          panel(1, 4, "#f2f6ff", 22, [-9.4, 1, 8], [0, 1, 8]),
          // Sunlit floor bounce.
          panel(8, 4, "#ffe6c4", 1.8, [-3, 0, -1.9], [-3, 0, 5]),
          // Light bounced off the room's far wall.
          panel(10, 8, "#fff8f0", 1.6, [9.5, 0, 4], [0, 0, 4]),
        ),
        key: new Vector3(-0.75, 0.15, 0.64).normalize(),
        keyColor: new Color("#fff4e6"),
        keyIntensity: 1.0,
        softness: 0.35,
        exposure: 1.2,
      };
    case "lamp":
      return {
        scene: sceneOf(room("#2a2420", 0.6), sphere("#ffdcb4", 60, [-2.2, 1.8, 3.4], 0.45), panel(3, 3, "#ffd2a4", 0.8, [-2.2, 1.8, 4.2], [-2.2, 1.8, 0])),
        key: new Vector3(-0.5, 0.42, 0.76).normalize(),
        keyColor: new Color("#ffe2c0"),
        keyIntensity: 1.8,
        softness: 0.18,
        exposure: 1.15,
      };
    case "overcast":
      return {
        scene: sceneOf(
          room("#8c8e92"),
          // The sky round the room more than overhead: the camera looks
          // nearly straight down, so the zenith is what every page mirrors
          // back at it, a veil over the ink (#327). A dim ceiling and four
          // bright walls give as much light with little to reflect.
          panel(18, 18, "#f4f6fa", 0.8, [0, 0, 9.9], [0, 0, 0]),
          panel(18, 8, "#e6eaf0", 1.7, [0, 9.9, 4.5], [0, 0, 4.5]),
          panel(18, 8, "#e6eaf0", 1.4, [0, -9.9, 4.5], [0, 0, 4.5]),
          panel(18, 8, "#e6eaf0", 1.6, [-9.9, 0, 4.5], [0, 0, 4.5]),
          panel(18, 8, "#e6eaf0", 1.5, [9.9, 0, 4.5], [0, 0, 4.5]),
        ),
        // Faint, and far enough off the vertical that its glint on gloss
        // falls off the spread.
        key: new Vector3(-0.4, 0.45, 0.8).normalize(),
        keyColor: new Color("#f3f6ff"),
        keyIntensity: 0.25,
        softness: 1,
        exposure: 1.14,
      };
    case "night":
      return {
        scene: sceneOf(
          room("#14161c", 0.6),
          sphere("#ffd8ac", 45, [1.8, 2.4, 3.0], 0.4),
          panel(1, 6, "#4b5f8c", 1.6, [-9.5, 0, 4], [0, 0, 4]),
        ),
        key: new Vector3(0.45, 0.55, 0.7).normalize(),
        keyColor: new Color("#ffdcb2"),
        keyIntensity: 1.6,
        softness: 0.15,
        exposure: 1.25,
      };
  }
}
