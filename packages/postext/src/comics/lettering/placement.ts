// Where the balloons of one panel go (SPEC D3.3). Deterministic:
// captions pinned to a corner or an edge are butted first; the others are
// placed greedily in reading order, each at the best of a set of candidate
// centres (a grid over the panel and slots around its speaker), then a few
// passes move each one to its best candidate given all the others. The
// cost weighs hard faults (covering a face, an avoid zone, a speaker's
// mouth or another balloon; running out of the panel) far above the soft
// preferences (near its speaker, high in the panel, Kurlander's reading
// order mirrored for right-to-left pages, tails that do not cross). When a
// balloon cannot be placed cleanly the fallbacks are tried in order: break
// the border (when allowed), cover avoid zones (never faces), reshape the
// text block; then it is placed anyway and reported.



export { livePolygon } from './placement/scene.js';
export type { UnitVariant, TargetSpec, PlaceUnit, Placed } from './placement/scene.js';
export { offPanelPoint } from './placement/cost.js';
export { positionAnchor } from './placement/candidates.js';
export { uncrossTails, placeUnits } from './placement/search.js';
export type { PlacementResult } from './placement/search.js';
