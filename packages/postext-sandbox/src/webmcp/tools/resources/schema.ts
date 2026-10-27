// The pieces the resource tools' input schemas and replies are built from:
// sizes, table rows, resource types, the placement schema and settings
// naming (#1276: split out of resources.ts).
import { type Resource, type TableModel, type ResourceType, defaultResourceTypes, type ResourcePlacement, type PostextConfig, primaryFontFamily, type CustomFontVariant } from 'postext';
import type { SandboxState } from '../../../context/SandboxContext.js';
import { placementWith } from '../../../panels/resources/resourceEdits.js';
import { type JsonSchema, ToolError } from '../../modelContext.js';

export const sizeOf = (r: Resource): { width: number; height: number } | null => {
  const from = r.bitmap ?? r.svg ?? r.video;
  return from?.width && from?.height ? { width: from.width, height: from.height } : null;
};

export const tableRows = (model: TableModel): string[][] => model.rows.map((row) => row.map((cell) => cell.content));

/** The resource types of the book, as the Resources panel lists them. */
export const typesOf = (s: SandboxState): ResourceType[] => s.config.resourceTypes ?? defaultResourceTypes(s.locale);

/** `value` without the members set to `undefined`. */
export function defined<T extends object>(value: T): T {
  const out = { ...value };
  for (const key of Object.keys(out) as (keyof T)[]) if (out[key] === undefined) delete out[key];
  return out;
}

const nullable = (schema: JsonSchema): JsonSchema => ({
  ...schema,
  type: [...(typeof schema.type === 'string' ? [schema.type] : schema.type ?? []), 'null'],
  ...(schema.enum ? { enum: [...schema.enum, null] } : {}),
});

export const PLACEMENT_SCHEMA: JsonSchema = {
  type: 'object',
  description: 'Where it goes on the page, merged into its placement key by key. A key set to null goes back to its resource type\'s default.',
  properties: {
    position: nullable({ type: 'string', enum: ['auto', 'top', 'bottom', 'here'], description: 'A float at the head or the foot of a page or column near its first reference (auto lets the layout choose), or here: set in the text where its ::resource line stands.' }),
    span: nullable({ type: 'string', enum: ['column', 'page', 'side'], description: 'A float as wide as its column, as the page, or in the side column of a column-and-a-half layout.' }),
    rotate: nullable({ type: 'string', enum: ['none', 'ccw', 'cw'], description: 'Turned a quarter turn on a page of its own (a landscape table in a portrait book).' }),
    width: nullable({ type: 'number', description: 'The share of the column (or page) it takes, above 0 and up to 1.' }),
    align: nullable({ type: 'string', enum: ['left', 'center', 'right', 'start', 'end'], description: 'Where a resource narrower than its slot sits.' }),
    columns: nullable({ type: 'integer', minimum: 1, description: 'How many adjacent columns a column float takes.' }),
    citingPage: nullable({ type: 'boolean', description: 'Head the page or column where the line that first cites it lands.' }),
    captionSide: nullable({ type: ['boolean', 'string'], enum: [true, false, 'inside'], description: 'Set the caption beside it: true puts it in the side column of a column-and-a-half layout; "inside" sets it beside a picture within the picture\'s own slot, the picture taking width of the slot (0.5 by default).' }),
    wrap: nullable({ type: 'string', enum: ['none', 'left', 'right', 'start', 'end', 'contour'], description: 'Run the text beside it, at this side of its column; "contour" runs it round the picture\'s own shape (its alpha channel, or a polygon in the record\'s contour.points, set through fields), at the side its align names.' }),
    wrapGap: nullable({ type: 'object', description: 'The space between it and the text beside it, as { value, unit }.' }),
    shrink: nullable({ type: 'string', enum: ['never', 'page', 'slot'], description: 'Scale a floated picture down to the room of its slot instead of moving it on.' }),
    minScale: nullable({ type: 'number', description: 'The smallest scale shrink sets it at, above 0 and up to 1.' }),
    captionMeasure: nullable({ type: 'string', enum: ['slot', 'body'], description: 'A narrower picture\'s caption at the slot\'s measure, or as wide as the picture.' }),
  },
  additionalProperties: false,
};

/** `placement` with the keys of `patch` laid over it as the detail pane's
 *  rows store them; `null` takes a key back to the type's default. */
export function withPlacement(placement: ResourcePlacement | undefined, patch: Record<string, unknown>): ResourcePlacement | undefined {
  let next = placement;
  for (const [name, given] of Object.entries(patch)) {
    const key = name as keyof ResourcePlacement;
    let value = given;
    if (value === null || (key === 'rotate' && value === 'none')) value = undefined;
    if ((key === 'width' || key === 'minScale') && value !== undefined && !((value as number) > 0 && (value as number) <= 1)) {
      throw new ToolError(`placement.${key} is a share, above 0 and up to 1 (0.5 for a half), not ${JSON.stringify(given)}.`);
    }
    if (key === 'wrapGap' && value !== undefined) {
      const gap = value as { value?: unknown; unit?: unknown };
      if (typeof gap.value !== 'number' || typeof gap.unit !== 'string') throw new ToolError('placement.wrapGap is a length: { value, unit } with a unit such as pt, mm or em.');
    }
    next = placementWith(next, key, value as never);
  }
  return next;
}

/** The paths of `config` whose `fontFamily` setting names `family`. */
export function settingsNaming(config: PostextConfig, family: string): string[] {
  const paths: string[] = [];
  const visit = (node: unknown, path: string): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => visit(item, `${path}[${i}]`));
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const at = path ? `${path}.${key}` : key;
      if (typeof value === 'string') {
        if (/fontFamily$/i.test(key) && primaryFontFamily(value) === family) paths.push(at);
      } else if (at !== 'customFonts') visit(value, at);
    }
  };
  visit(config, '');
  return paths;
}

export const faceOf = (v: CustomFontVariant): { weight: number; style: string; file: string } => ({ weight: v.weight, style: v.style, file: v.fileName ?? v.format });
