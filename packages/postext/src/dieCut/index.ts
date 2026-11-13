// Die-cuts (#1565): holes through leaves, rounded corners, shaped books.
// See DESIGN.md beside this file.

export { pathBounds, mirrorPath, rectPath, roundRectPath, ellipsePath, flattenPath } from './geometry.js';
export { type DieCutMetrics, dieMetricsOf, dieShapeInBox, dieShapeBox, dieShapePath, dieWrapGapPx, leafOutline } from './shapes.js';
export { isRectoAt, leafAt, pagesOfLeaf, leafSide, pageBeneath } from './leaves.js';
export { type DiePlacement, type DieCutsInput, parsePageList, shapePlacement, configPlacements, holesByPage, holesOnPage, buildDieCuts } from './place.js';
export { type SeeThroughLayer, seeThrough } from './seeThrough.js';
export { type PathSink, traceDiePaths, dieCutPath2D } from './path2d.js';
