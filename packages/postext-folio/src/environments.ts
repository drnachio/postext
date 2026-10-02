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
        keyIntensity: 1.6,
        softness: 0.55,
        exposure: 0.95,
      };
    case "daylight":
      return {
        scene: sceneOf(
          room("#7a746c"),
          // The window: bright, a little cool; the sky through it brighter
          // above.
          panel(1, 9, "#dfe9ff", 14, [-9.5, 1, 4.5], [0, 1, 4.5]),
          panel(1, 4, "#f2f6ff", 22, [-9.4, 1, 8], [0, 1, 8]),
          // Sunlit floor bounce.
          panel(8, 4, "#ffe6c4", 1.4, [-3, 0, -1.9], [-3, 0, 5]),
        ),
        key: new Vector3(-0.75, 0.15, 0.64).normalize(),
        keyColor: new Color("#fff4e6"),
        keyIntensity: 2.2,
        softness: 0.35,
        exposure: 0.9,
      };
    case "lamp":
      return {
        scene: sceneOf(room("#2a2420", 0.6), sphere("#ffc98f", 60, [-2.2, 1.8, 3.4], 0.45), panel(3, 3, "#ffb36b", 0.8, [-2.2, 1.8, 4.2], [-2.2, 1.8, 0])),
        key: new Vector3(-0.5, 0.42, 0.76).normalize(),
        keyColor: new Color("#ffcf96"),
        keyIntensity: 2.6,
        softness: 0.18,
        exposure: 1.05,
      };
    case "overcast":
      return {
        scene: sceneOf(
          room("#8c8e92"),
          panel(18, 18, "#f4f6fa", 3.2, [0, 0, 9.9], [0, 0, 0]),
          panel(18, 6, "#e6eaf0", 1.5, [0, 9.9, 4], [0, 0, 4]),
          panel(18, 6, "#e6eaf0", 1.2, [0, -9.9, 4], [0, 0, 4]),
        ),
        key: new Vector3(-0.1, 0.25, 0.96).normalize(),
        keyColor: new Color("#f3f6ff"),
        keyIntensity: 0.9,
        softness: 1,
        exposure: 1.0,
      };
    case "night":
      return {
        scene: sceneOf(
          room("#14161c", 0.6),
          sphere("#ffc27a", 45, [1.8, 2.4, 3.0], 0.4),
          panel(1, 6, "#4b5f8c", 1.6, [-9.5, 0, 4], [0, 0, 4]),
        ),
        key: new Vector3(0.45, 0.55, 0.7).normalize(),
        keyColor: new Color("#ffc887"),
        keyIntensity: 2.4,
        softness: 0.15,
        exposure: 1.15,
      };
  }
}
