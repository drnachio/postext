// The marks of a picture as a tool hands them over — its safe area, its
// anchors (the points a map's or a diagram's ::label lines stand at, #866,
// and the speakers a comic's lettering points at), the zones and the faces
// no balloon covers — checked and stored the way the "Safe area, anchors &
// lettering" dialog stores them.

import { normalizeSafeArea, type Resource, type ResourceAnchor, type ResourceSafeArea } from 'postext';
import {
  anchorIdProblem,
  anchorOutsideSafeArea,
  applyMarks,
  firstAnchorIdProblem,
  marksOf,
  normalizeMarks,
  type PictureMarks,
} from '../panels/resources/marks/pictureMarks.js';
import { ToolError, type JsonSchema } from './modelContext.js';

/** The `marks` parameter of the resource tool: each member replaces that
 *  kind of mark, `null` removes it, one left out stays as it is. */
export interface MarksInput {
  safeArea?: ResourceSafeArea | null;
  anchors?: ResourceAnchor[] | null;
  avoid?: ResourceSafeArea[] | null;
  faces?: ResourceSafeArea[] | null;
  /** An SVG's own symbols (#994): the elements named by an id prefix or a class get an avoid zone each, added to the zones the picture has. */
  svgSymbols?: { idPrefix?: string; className?: string };
}

const RECT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } },
  required: ['x', 'y', 'width', 'height'],
  additionalProperties: false,
};
const POINT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' } },
  required: ['x', 'y'],
  additionalProperties: false,
};

export const MARKS_SCHEMA: JsonSchema = {
  type: 'object',
  description: 'The marks drawn over a picture, in fractions of it (0 to 1 from its top left corner; a rectangle is { x, y, width, height }). Each member given replaces that kind of mark whole, null removes it, one left out stays.',
  properties: {
    safeArea: { ...RECT_SCHEMA, type: ['object', 'null'], description: 'The part of the picture that must stay in view: the layout may crop what lies outside it to fit the page. null: the picture always shows whole. For a bitmap, an SVG or a video\'s poster.' },
    anchors: {
      type: ['array', 'null'],
      description: 'The named points of the picture. For a map or a diagram, the anchors its labels stand at: a :::figure{resource="…"} sets ::label[TEXT]{at="id"} at the anchor with that id, and the anchor\'s label fields (style, align, verticalAlign, rotate, width, writingMode, overlap) are what such a label takes unless it says otherwise. For a comic panel, the speakers: id is the key the script names (as in "ana: Hello"), x and y the mouth a speech balloon\'s tail points at, and optionally head (where a thought balloon points) and face (a rectangle no balloon covers).',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          head: POINT_SCHEMA,
          face: RECT_SCHEMA,
          style: { type: 'string', description: 'A label style id of the design (labelStyles) for the label set here.' },
          align: { type: 'string', enum: ['start', 'center', 'end'], description: 'Which side of the label stands at the point, in the label\'s direction (default center).' },
          verticalAlign: { type: 'string', enum: ['top', 'middle', 'bottom'], description: 'Which edge of the label stands at the point (default middle).' },
          rotate: { type: 'number', description: 'Degrees, clockwise, about the point (default 0).' },
          width: { type: 'number', description: 'The label\'s measure as a fraction of the picture\'s width (0 to 1; of its height for a vertical label); the label wraps within it. Unset: its natural width.' },
          writingMode: { type: 'string', enum: ['horizontal-tb', 'vertical-rl'], description: 'vertical-rl sets the label in vertical writing, characters upright in columns from right to left (default horizontal-tb).' },
          overlap: { type: 'string', enum: ['check', 'allow'], description: 'allow leaves the label set here out of the labelOverlap check: the source prints it touching its neighbours (a dense map). Default check.' },
          gutter: { type: 'string', enum: ['keep', 'cross'], description: 'On a figure across the spine of a spread: keep slides the label off the binding band, to the side its point lies on (default); cross leaves it where the point puts it, a title set across both pages.' },
          labelAt: { ...POINT_SCHEMA, description: 'Where the label set here stands, away from its point (fractions of the picture): align, verticalAlign and rotate place the label about this point; a leader and a pointer still end at x, y. Unset: the label stands at its point.' },
          leader: {
            type: ['boolean', 'object'],
            description: 'A line from the label to its point: true in the label style\'s leader look, an object over that look field by field, false none. Unset: a leader when the label stands away (labelAt) and its style has a leader. A label\'s own leader attribute (sandbox_edit_labels) wins.',
            properties: {
              color: { description: 'A colour value ({ hex, model } or a palette link), default the label\'s text colour.' },
              width: { description: 'A length ({ value, unit }), default 0.75pt.' },
              dash: { type: 'array', description: 'Dash lengths (on, off, …).' },
              startCap: { type: 'string', enum: ['none', 'dot', 'arrow'] },
              endCap: { type: 'string', enum: ['none', 'dot', 'arrow'] },
              capSize: { description: 'A length, default three times the width.' },
              routing: { type: 'string', enum: ['straight', 'elbow'] },
            },
            additionalProperties: false,
          },
        },
        required: ['id', 'x', 'y'],
        additionalProperties: false,
      },
    },
    avoid: { type: ['array', 'null'], description: 'Zones of a comic panel\'s picture the balloons keep clear of (a hand, a key object).', items: RECT_SCHEMA },
    svgSymbols: {
      type: 'object',
      description: 'For an SVG map: add an avoid zone over each element of the drawing named by idPrefix (its id starts with it) or className (its class list holds it) — the dots and icons labels should keep clear of. The zones already there stay; ones that cover an old zone are not added twice. Measured in the browser, as the marks dialog does.',
      properties: { idPrefix: { type: 'string' }, className: { type: 'string' } },
      additionalProperties: false,
    },
    faces: { type: ['array', 'null'], description: 'The faces of people in a comic panel\'s picture who do not speak: no balloon covers them.', items: RECT_SCHEMA },
  },
  additionalProperties: false,
};

const ALIGNS = new Set(['start', 'center', 'end']);
const VERTICAL_ALIGNS = new Set(['top', 'middle', 'bottom']);
const WRITING_MODES = new Set(['horizontal-tb', 'vertical-rl']);
const OVERLAPS = new Set(['check', 'allow']);
const GUTTERS = new Set(['keep', 'cross']);

/** Why the label fields of `a` cannot be stored, if they cannot. */
function labelFieldProblem(a: ResourceAnchor): string | undefined {
  if (a.align !== undefined && !ALIGNS.has(a.align)) return 'align is start, center or end';
  if (a.verticalAlign !== undefined && !VERTICAL_ALIGNS.has(a.verticalAlign)) return 'verticalAlign is top, middle or bottom';
  if (a.rotate !== undefined && !Number.isFinite(a.rotate)) return 'rotate is a number of degrees';
  if (a.writingMode !== undefined && !WRITING_MODES.has(a.writingMode)) return 'writingMode is horizontal-tb or vertical-rl';
  if (a.overlap !== undefined && !OVERLAPS.has(a.overlap)) return 'overlap is check or allow';
  if (a.gutter !== undefined && !GUTTERS.has(a.gutter)) return 'gutter is keep or cross';
  if (a.width !== undefined && !(Number.isFinite(a.width) && a.width > 0 && a.width <= 1)) return 'width is a fraction of the picture\'s width, above 0 and up to 1';
  if (a.style !== undefined && (typeof a.style !== 'string' || !a.style.trim())) return 'style is a label style id';
  if (a.labelAt !== undefined && !(a.labelAt && Number.isFinite(a.labelAt.x) && Number.isFinite(a.labelAt.y))) return 'labelAt is a point { x, y } in fractions of the picture';
  if (a.leader !== undefined && typeof a.leader !== 'boolean' && (typeof a.leader !== 'object' || a.leader === null || Array.isArray(a.leader))) return 'leader is true, false or a leader look';
  return undefined;
}

const ID_PROBLEMS = {
  empty: 'is empty',
  invalid: 'is not a script key (letters, digits, "_", "." and "-" only)',
  reserved: 'is a key the script keeps for itself (caption, sfx, note)',
  duplicate: 'is the id of another speaker too',
} as const;

/** Whether the dialog would store `rect` (inside the picture, not a
 *  sliver). */
const storable = (rect: ResourceSafeArea): boolean => normalizeMarks({ anchors: [], avoid: [rect], faces: [] }).avoid.length === 1;

/**
 * `resource` carrying the marks `input` asks for, and what an author would
 * be told of them: the speakers a crop to the safe area may hide. Throws a
 * {@link ToolError} for marks the dialog would not save.
 */
export function withMarks(resource: Resource, input: MarksInput, labelStyles?: readonly string[]): { resource: Resource; notes: string[] } {
  const picture = resource.kind === 'bitmap' ? resource.bitmap?.fileId : resource.kind === 'svg' ? resource.svg?.fileId : undefined;
  const poster = resource.kind === 'video' ? resource.video?.poster?.fileId : undefined;
  if (!picture && !poster) {
    throw new ToolError(resource.kind === 'video'
      ? 'This video has no poster to mark a safe area on: give it one first (video.poster, video.posterTime, or the link of a YouTube or Vimeo video).'
      : `Marks are drawn over a picture; ${JSON.stringify(resource.id)} is a ${resource.kind}.`);
  }
  // A poster is cropped like a picture but never lettered.
  const lettering = (['anchors', 'avoid', 'faces'] as const).filter((k) => input[k] !== undefined && input[k] !== null && input[k]!.length > 0);
  if (!picture && lettering.length > 0) throw new ToolError(`A video's poster takes a safe area only, not ${lettering.join(', ')}: anchors and lettering marks are for bitmap and SVG pictures.`);

  const marks: PictureMarks = marksOf(resource);
  if (input.safeArea !== undefined) {
    if (input.safeArea !== null && !normalizeSafeArea(input.safeArea)) {
      throw new ToolError('marks.safeArea must be a rectangle inside the picture, in fractions of it (0 to 1), smaller than the whole picture and not a sliver. null removes the safe area.');
    }
    marks.safeArea = input.safeArea ?? undefined;
  }
  for (const key of ['avoid', 'faces'] as const) {
    const rects = input[key];
    if (rects === undefined) continue;
    const bad = (rects ?? []).findIndex((r) => !storable(r));
    if (bad >= 0) throw new ToolError(`marks.${key}[${bad}] is not a rectangle inside the picture: x, y, width and height are fractions of it (0 to 1), and it must reach into it.`);
    marks[key] = (rects ?? []).map((r) => ({ ...r }));
  }
  if (input.anchors !== undefined) {
    const anchors = (input.anchors ?? []).map((a) => ({ ...a, id: a.id.trim() }));
    const bad = firstAnchorIdProblem(anchors);
    if (bad >= 0) throw new ToolError(`marks.anchors[${bad}].id ${JSON.stringify(anchors[bad]!.id)} ${ID_PROBLEMS[anchorIdProblem(anchors, bad)!]}.`);
    const face = anchors.findIndex((a) => a.face && !storable(a.face));
    if (face >= 0) throw new ToolError(`marks.anchors[${face}].face is not a rectangle inside the picture: x, y, width and height are fractions of it (0 to 1).`);
    for (let i = 0; i < anchors.length; i++) {
      const problem = labelFieldProblem(anchors[i]!);
      if (problem) throw new ToolError(`marks.anchors[${i}]: ${problem}.`);
    }
    marks.anchors = anchors.map((a) => (a.style !== undefined ? { ...a, style: a.style.trim() } : a));
  }
  const next = applyMarks(resource, marks);
  const notes: string[] = [];
  const hidden = (next.anchors ?? []).filter((a) => anchorOutsideSafeArea(a, next.safeArea)).map((a) => a.id);
  if (hidden.length > 0) notes.push(`${hidden.join(', ')} lie${hidden.length === 1 ? 's' : ''} outside the safe area: a crop may hide ${hidden.length === 1 ? 'it' : 'them'}.`);
  if (labelStyles && input.anchors) {
    const unknown = [...new Set((next.anchors ?? []).map((a) => a.style).filter((st): st is string => !!st && !labelStyles.includes(st)))];
    if (unknown.length > 0) notes.push(`No label style ${unknown.map((u) => JSON.stringify(u)).join(', ')} in the design (labelStyles: ${labelStyles.join(', ') || 'none'}): a label set there takes the body text's look. Add the style with sandbox_set_config.`);
  }
  return { resource: next, notes };
}
