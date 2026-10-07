// Comics lettering (SPEC D3): engine-made balloons, captions and sound
// effects over one panel. Entry: `letterPanel`.

export { letterPanel, letterPanelDetailed } from './letter';
export { presetLetteringStyles, type PresetInputs } from './presets';
export { shapeText, shapeTextCandidates, ovalProfile, type ShapedText, type ShapeOptions } from './shape-text';
export { prepareText, readLetteringText, breakPoints, type PreparedText, type BreakPoint } from './text';
export { buildBody, buildTail, buildNeck, fitSuperellipse, type Body, type Tail } from './shapes';
export type {
  BalloonShapeKind, BalloonTailKind, ComicBalloonOut, LetteringAnchor, LetteringDiagnostic, LetteringEnv, LetteringItem,
  LetteringPanel, LetteringPosition, LetteringResult, LetteringStyle, LetteringText, PanelSide, Point, Rect,
} from './types';
