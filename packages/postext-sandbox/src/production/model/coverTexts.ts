/**
 * The cover's texts: general texts written once in the Cover panel (the
 * title, the author, the back cover's blurb…), and text boxes the designer
 * places, each with its own frame, its own type and its own Markdown, in
 * which `{{title}}` and the other fields stand for the general texts. A
 * box shows what its fields say now: the title changed in the panel
 * changes on the cover.
 *
 * A design without boxes of its own shows the default ones: a box over
 * each zone's safe area with that zone's general text, set as the zone's
 * type was (its `zoneStyles`), so a cover made before the boxes looks as
 * it did. The first change to a box keeps them all in the design.
 *
 * A box's Markdown is set by its blocks: one that starts with `#`, `##` or
 * `###` in the box's title, subtitle or heading type, any other in its
 * text type.
 */

import { DEFAULT_SPINE_TEXT, resolveHeadingsConfig, type CoverZoneName, type Dimension, type ParagraphStyleConfig, type PostextConfig, type ProductionSheet, type ProductionVersion } from 'postext';
import type { CoverDesignSettings, DesignZone, RoleStyle } from './bookProduction.js';
import { elementAt, elementRect, newElementId, type CoverElementSetting } from './coverLayers.js';

/** The general texts the Cover panel edits. `front` is a front cover's
 *  text from before the fields, kept as written when it did not split
 *  into a title, a subtitle and an author. */
export const COVER_FIELDS = ['title', 'subtitle', 'author', 'back', 'spine', 'flapFront', 'flapBack'] as const;
export type CoverField = (typeof COVER_FIELDS)[number] | 'front';
export type CoverTexts = Partial<Record<CoverField, string>>;

export type TextBoxRole = 'h1' | 'h2' | 'h3' | 'text';
export const TEXT_BOX_ROLES: readonly TextBoxRole[] = ['h1', 'h2', 'h3', 'text'];

export interface CoverTextBox {
  id: string;
  name?: string;
  /** Markdown, with `{{field}}` for a general text. */
  text: string;
  zone: CoverZoneName;
  x: number;
  y: number;
  width: number;
  height: number;
  basis?: { width: number; height: number };
  /** Across zones: its right edge on the zone it ends in. */
  to?: { zone: CoverZoneName; x: number; basis?: number };
  /** Left off the cover, its text kept. */
  hidden?: boolean;
  /** Turned to read up (−90) or down (90) its box, as a spine's text. */
  rotate?: 90 | -90;
  vertical?: 'top' | 'middle' | 'bottom';
  styles?: Partial<Record<TextBoxRole, RoleStyle>>;
}

const FIELD = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/** The general texts of a record, a front cover's old text split into
 *  its title (the block that starts with `#`), subtitle and author when it
 *  is written so (the panel's «Use the book's title and author» wrote it
 *  so), else kept as `front`. */
export function coverFields(texts: CoverTexts): CoverTexts {
  if (!texts.front || texts.title !== undefined || texts.subtitle !== undefined || texts.author !== undefined) return texts;
  const blocks = texts.front.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const [first, ...rest] = blocks;
  if (!first || !/^#\s/.test(first) || rest.length > 2 || rest.some((b) => /^#/.test(b))) return texts;
  const out: CoverTexts = { ...texts, title: first.replace(/^#\s+/, '') };
  delete out.front;
  if (rest.length === 2) {
    out.subtitle = rest[0]!;
    out.author = rest[1]!;
  } else if (rest.length === 1) {
    out.author = rest[0]!;
  }
  return out;
}

/** A box's Markdown with its fields' texts in: a block left empty (its
 *  field has nothing) goes, so does a `#` left alone. */
export function expandFields(text: string, fields: CoverTexts): string {
  return text
    .replace(FIELD, (_, key: string) => (fields[key as CoverField] ?? '').trim())
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b && !/^#{1,6}$/.test(b))
    .join('\n\n');
}

/** The fields a box's Markdown names. */
export function fieldsIn(text: string): CoverField[] {
  return [...text.matchAll(FIELD)].map((m) => m[1] as CoverField).filter((k, i, all) => all.indexOf(k) === i);
}

/** Id of the paragraph style of a box's role. */
export const boxStyleId = (box: string, role: TextBoxRole): string => `cover-box-${box}-${role}`;

/** A box's expanded Markdown with each run of blocks in its role's style. */
export function styledBoxText(markdown: string, box: string): string {
  const runs: { role: TextBoxRole; blocks: string[] }[] = [];
  for (const block of markdown.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
    const hashes = /^(#{1,6})\s+/.exec(block)?.[1]?.length ?? 0;
    const role: TextBoxRole = hashes === 0 ? 'text' : hashes === 1 ? 'h1' : hashes === 2 ? 'h2' : 'h3';
    const body = hashes ? block.replace(/^#{1,6}\s+/, '') : block;
    const last = runs[runs.length - 1];
    if (last && last.role === role) last.blocks.push(body);
    else runs.push({ role, blocks: [body] });
  }
  return runs.map((r) => [`:::paragraphs{style="${boxStyleId(box, r.role)}"}`, ...r.blocks, ':::'].join('\n\n')).join('\n\n');
}

const designZoneOf = (zone: CoverZoneName): DesignZone | undefined =>
  zone === 'flapFront' || zone === 'flapBack' ? 'flaps' : zone === 'front' || zone === 'back' || zone === 'spine' ? zone : undefined;

/** What each zone's default box says. */
function defaultText(zone: CoverZoneName, fields: CoverTexts): string | undefined {
  switch (zone) {
    case 'front': return fields.front !== undefined ? '{{front}}' : '# {{title}}\n\n{{subtitle}}\n\n{{author}}';
    case 'back': return '{{back}}';
    case 'spine': return '{{spine}}';
    case 'flapFront': return '{{flapFront}}';
    case 'flapBack': return '{{flapBack}}';
    default: return undefined;
  }
}

/** The boxes of a design that has none of its own: one over each text
 *  zone's safe area, set as the zone's type was. The spine's, when it is
 *  wide enough to letter, reads along it. */
export function defaultTextBoxes(sheet: ProductionSheet, design: CoverDesignSettings | undefined, fields: CoverTexts, spineText?: ProductionVersion['spineText']): CoverTextBox[] {
  const lettering = { ...DEFAULT_SPINE_TEXT, ...spineText };
  const out: CoverTextBox[] = [];
  for (const zone of sheet.zones) {
    const text = defaultText(zone.name, fields);
    const dz = designZoneOf(zone.name);
    if (!text || !dz) continue;
    if (zone.name === 'spine' && zone.rect.width < lettering.minSpine) continue;
    const style = design?.zoneStyles?.[dz];
    const styles: CoverTextBox['styles'] = {
      ...(style?.title ? { h1: style.title } : {}),
      ...(style?.text ? { text: style.text } : {}),
    };
    const placed = elementAt(sheet, { id: `text-${zone.name}`, kind: 'box', zone: zone.name, x: 0, y: 0, width: 1, height: 1 }, zone.safe);
    out.push({
      id: `text-${zone.name}`,
      text,
      zone: placed.zone,
      x: placed.x,
      y: placed.y,
      width: placed.width,
      height: placed.height,
      ...(placed.basis ? { basis: placed.basis } : {}),
      ...(zone.name === 'spine' ? { rotate: lettering.direction === 'bottomToTop' ? -90 as const : 90 as const, vertical: 'middle' as const } : style?.vertical ? { vertical: style.vertical } : {}),
      ...(Object.keys(styles).length ? { styles } : {}),
    });
  }
  return out;
}

/** The boxes a cover shows: the design's own, else the default ones. */
export function textBoxesOf(sheet: ProductionSheet, design: CoverDesignSettings | undefined, fields: CoverTexts, spineText?: ProductionVersion['spineText']): CoverTextBox[] {
  return design?.texts ?? defaultTextBoxes(sheet, design, fields, spineText);
}

/** A new box of the general text `field` (or of words of its own), in the
 *  middle of the front cover's safe area. */
export function newTextBox(sheet: ProductionSheet, field?: (typeof COVER_FIELDS)[number], words = ''): CoverTextBox | undefined {
  const zoneName: CoverZoneName = field === 'back' ? 'back' : field === 'spine' ? 'spine' : field === 'flapFront' ? 'flapFront' : field === 'flapBack' ? 'flapBack' : 'front';
  const zone = sheet.zones.find((z) => z.name === zoneName) ?? sheet.zones.find((z) => z.name === 'front');
  if (!zone) return undefined;
  const s = zone.safe;
  const spine = zone.name === 'spine';
  const width = spine ? s.width : Math.min(s.width, 80);
  const height = spine ? Math.min(s.height, 120) : 20;
  const id = newElementId().replace(/^el-/, 'text-');
  const placed = elementAt(sheet, { id, kind: 'box', zone: zone.name, x: 0, y: 0, width: 1, height: 1 }, { x: s.x + (s.width - width) / 2, y: s.y + (s.height - height) / 2, width, height });
  return {
    id,
    text: field ? (field === 'title' ? '# {{title}}' : `{{${field}}}`) : words,
    zone: placed.zone,
    x: placed.x,
    y: placed.y,
    width: placed.width,
    height: placed.height,
    ...(placed.basis ? { basis: placed.basis } : {}),
    ...(spine ? { rotate: -90 as const, vertical: 'middle' as const } : {}),
  };
}

/** A box as the canvas moves it. */
export function textBoxAsElement(box: CoverTextBox): CoverElementSetting {
  return { id: box.id, kind: 'box', zone: box.zone, x: box.x, y: box.y, width: box.width, height: box.height, ...(box.basis ? { basis: box.basis } : {}), ...(box.to ? { to: box.to } : {}) };
}

/** A box moved where its element now stands. */
export function textBoxFromElement(box: CoverTextBox, el: CoverElementSetting): CoverTextBox {
  const out: CoverTextBox = { ...box, zone: el.zone, x: el.x, y: el.y, width: el.width, height: el.height };
  if (el.basis) out.basis = el.basis;
  else delete out.basis;
  if (el.to) out.to = el.to;
  else delete out.to;
  return out;
}

/** A box's rectangle on the sheet, mm. */
export function textBoxRect(sheet: ProductionSheet, box: CoverTextBox) {
  return elementRect(sheet, textBoxAsElement(box));
}

const pt = (value: number): Dimension => ({ value, unit: 'pt' });

/** The paragraph styles of the boxes: a title as the book's level-1
 *  heading, a subtitle and a heading as its levels 2 and 3, text as its
 *  body; each with the box's own changes, in the design's text colour
 *  unless the box gives one. Set as display: no word broken, no indent,
 *  off the book's grid. */
export function textBoxParagraphStyles(config: PostextConfig, design: CoverDesignSettings | undefined, boxes: readonly CoverTextBox[], ink: (hex: string) => ParagraphStyleConfig['color']): ParagraphStyleConfig[] {
  const headings = resolveHeadingsConfig(config.headings);
  const level = (n: number) => headings.levels.find((l) => l.level === n);
  const color = design?.textColor ? ink(design.textColor) : undefined;
  const out: ParagraphStyleConfig[] = [];
  for (const box of boxes) {
    for (const role of TEXT_BOX_ROLES) {
      const own = box.styles?.[role] ?? {};
      const h = role === 'text' ? undefined : level(role === 'h1' ? 1 : role === 'h2' ? 2 : 3);
      const base: ParagraphStyleConfig = h
        ? { id: boxStyleId(box.id, role), fontFamily: h.fontFamily, fontSize: h.fontSize, lineHeight: h.lineHeight, fontWeight: h.fontWeight, ...(h.italic ? { italic: true } : {}), color: color ?? h.color }
        : { id: boxStyleId(box.id, role), ...(color ? { color } : {}) };
      out.push({
        ...base,
        hyphenation: false,
        firstLineIndent: pt(0),
        indent: pt(0),
        textAlign: 'start',
        snapToGrid: false,
        ...roleStyleConfig(own, ink),
      });
    }
  }
  return out;
}

/** What a role's own changes are as a paragraph style. */
export function roleStyleConfig(own: RoleStyle, ink: (hex: string) => ParagraphStyleConfig['color']): Partial<ParagraphStyleConfig> {
  return {
    ...(own.fontFamily ? { fontFamily: own.fontFamily } : {}),
    ...(own.fontSize ? { fontSize: pt(own.fontSize), lineHeight: pt(own.lineHeight ?? Math.round(own.fontSize * 1.2 * 10) / 10) } : own.lineHeight ? { lineHeight: pt(own.lineHeight) } : {}),
    ...(own.bold !== undefined ? { fontWeight: own.bold ? 700 : 400 } : {}),
    ...(own.italic !== undefined ? { italic: own.italic } : {}),
    ...(own.align ? { textAlign: own.align } : {}),
    ...(own.color ? { color: ink(own.color) } : {}),
    // Tracking, in thousandths of an em.
    ...(own.tracking ? { letterSpacing: { value: own.tracking / 1000, unit: 'em' } as Dimension } : {}),
    ...(own.caps === 'upper' ? { textTransform: 'uppercase' as const } : own.caps === 'small' ? { smallCaps: true } : {}),
    ...(own.spaceAfter !== undefined ? { marginBottom: pt(own.spaceAfter) } : {}),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Boxes as stored, those that read. */
export function readTextBoxes(raw: unknown, readRole: (raw: unknown) => RoleStyle | undefined): CoverTextBox[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((b): CoverTextBox[] => {
    if (!isRecord(b) || typeof b.id !== 'string' || typeof b.text !== 'string' || typeof b.zone !== 'string') return [];
    const [x, y, width, height] = [num(b.x), num(b.y), num(b.width), num(b.height)];
    if (x === undefined || y === undefined || !width || !height) return [];
    const styles: CoverTextBox['styles'] = {};
    if (isRecord(b.styles)) {
      for (const role of TEXT_BOX_ROLES) {
        const st = readRole(b.styles[role]);
        if (st) styles[role] = st;
      }
    }
    const basis = isRecord(b.basis) && num(b.basis.width) && num(b.basis.height) ? { width: b.basis.width as number, height: b.basis.height as number } : undefined;
    return [{
      id: b.id,
      ...(typeof b.name === 'string' && b.name ? { name: b.name } : {}),
      text: b.text,
      zone: b.zone as CoverZoneName,
      x, y, width, height,
      ...(basis ? { basis } : {}),
      ...(isRecord(b.to) && typeof b.to.zone === 'string' && num(b.to.x) !== undefined ? { to: { zone: b.to.zone as CoverZoneName, x: b.to.x as number, ...(num(b.to.basis) ? { basis: b.to.basis as number } : {}) } } : {}),
      ...(b.hidden === true ? { hidden: true } : {}),
      ...(b.rotate === 90 || b.rotate === -90 ? { rotate: b.rotate } : {}),
      ...(b.vertical === 'middle' || b.vertical === 'bottom' || b.vertical === 'top' ? { vertical: b.vertical } : {}),
      ...(Object.keys(styles).length ? { styles } : {}),
    }];
  });
}
