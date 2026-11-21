/**
 * A stored production record read back (IndexedDB, a book's bundle, a
 * file): what reads is kept, what does not is left out.
 */

import type { ProductionVersion } from 'postext';
import { readCoverElements, readCoverFinishes, readCoverLogos } from './coverLayers.js';
import { readEndpapers } from '../library/collections.js';
import { COVER_FIELDS, readTextBoxes } from './coverTexts.js';
import { DESIGN_ZONES, type BookPaper, type BookProduction, type CoverDesignSettings, type RoleStyle, type ZoneStyle } from './bookProduction.js';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A stored production record as it reads, or null: versions without an id
 *  or a binding are left out, texts that are not strings dropped. */
export function readBookProduction(raw: unknown): BookProduction | null {
  if (!isRecord(raw) || typeof raw.projectId !== 'string') return null;
  const versions = (Array.isArray(raw.versions) ? raw.versions : []).filter(
    (v): v is ProductionVersion => isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string'
      && (typeof v.binding === 'string' || isRecord(v.binding)),
  );
  const texts: BookProduction['texts'] = {};
  if (isRecord(raw.texts)) {
    for (const key of [...COVER_FIELDS, 'front'] as const) {
      const t = raw.texts[key];
      if (typeof t === 'string') texts[key] = t;
    }
  }
  const design = readDesign(raw.design);
  const paper = readPaper(raw.paper);
  const endpapers = readEndpapers(raw.endpapers);
  const active = typeof raw.activeVersionId === 'string' && versions.some((v) => v.id === raw.activeVersionId)
    ? raw.activeVersionId
    : undefined;
  return {
    projectId: raw.projectId,
    versions,
    ...(active ? { activeVersionId: active } : {}),
    texts,
    ...(design ? { design } : {}),
    ...(paper ? { paper } : {}),
    ...(endpapers ? { endpapers } : {}),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

function readPaper(raw: unknown): BookPaper | undefined {
  if (!isRecord(raw)) return undefined;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
  const inserts = (Array.isArray(raw.inserts) ? raw.inserts : []).flatMap((i) => {
    if (!isRecord(i)) return [];
    const pages = n(i.pages);
    const grammage = n(i.grammage);
    const bulk = n(i.bulk);
    return pages && grammage && bulk ? [{ pages: Math.round(pages), grammage, bulk, ...(typeof i.name === 'string' && i.name.trim() ? { name: i.name } : {}) }] : [];
  });
  const out: BookPaper = {
    ...(typeof raw.profileId === 'string' && raw.profileId ? { profileId: raw.profileId } : {}),
    ...(inserts.length ? { inserts } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

function readDesign(raw: unknown): CoverDesignSettings | undefined {
  if (!isRecord(raw)) return undefined;
  const out: CoverDesignSettings = {};
  if (typeof raw.background === 'string' && HEX.test(raw.background)) out.background = raw.background;
  if (typeof raw.textColor === 'string' && HEX.test(raw.textColor)) out.textColor = raw.textColor;
  if (isRecord(raw.image) && typeof raw.image.resourceId === 'string') {
    out.image = { resourceId: raw.image.resourceId, ...(raw.image.area === 'front' ? { area: 'front' as const } : {}) };
  }
  if (isRecord(raw.zones)) {
    const zones: NonNullable<CoverDesignSettings['zones']> = {};
    for (const z of DESIGN_ZONES) {
      const c = raw.zones[z];
      if (typeof c === 'string' && HEX.test(c)) zones[z] = c;
    }
    if (Object.keys(zones).length > 0) out.zones = zones;
  }
  if (isRecord(raw.zoneStyles)) {
    const styles: NonNullable<CoverDesignSettings['zoneStyles']> = {};
    for (const z of DESIGN_ZONES) {
      const st = readZoneStyle(raw.zoneStyles[z]);
      if (st) styles[z] = st;
    }
    if (Object.keys(styles).length > 0) out.zoneStyles = styles;
  }
  const elements = readCoverElements(raw.elements);
  if (elements.length > 0) out.elements = elements;
  const effects = readCoverElements(raw.effects);
  if (effects.length > 0) out.effects = effects;
  const logos = readCoverLogos(raw.logos);
  if (logos.length > 0) out.logos = logos;
  const finishes = readCoverFinishes(raw.finishes);
  if (finishes.length > 0) out.finishes = finishes;
  const boxes = readTextBoxes(raw.texts, readRole);
  if (boxes) out.texts = boxes;
  return Object.keys(out).length > 0 ? out : undefined;
}

const ALIGNS: ReadonlySet<string> = new Set(['left', 'center', 'right', 'justify']);
const VERTICALS: ReadonlySet<string> = new Set(['top', 'middle', 'bottom']);

function readRole(raw: unknown): RoleStyle | undefined {
  if (!isRecord(raw)) return undefined;
  const out: RoleStyle = {};
  if (typeof raw.fontFamily === 'string' && raw.fontFamily.trim()) out.fontFamily = raw.fontFamily;
  if (typeof raw.fontSize === 'number' && raw.fontSize > 0 && raw.fontSize < 400) out.fontSize = raw.fontSize;
  if (typeof raw.bold === 'boolean') out.bold = raw.bold;
  if (typeof raw.italic === 'boolean') out.italic = raw.italic;
  if (typeof raw.align === 'string' && ALIGNS.has(raw.align)) out.align = raw.align as RoleStyle['align'];
  if (typeof raw.lineHeight === 'number' && raw.lineHeight > 0 && raw.lineHeight < 500) out.lineHeight = raw.lineHeight;
  if (typeof raw.color === 'string' && HEX.test(raw.color)) out.color = raw.color;
  if (typeof raw.tracking === 'number' && Number.isFinite(raw.tracking) && Math.abs(raw.tracking) <= 1000) out.tracking = raw.tracking;
  if (raw.caps === 'upper' || raw.caps === 'small') out.caps = raw.caps;
  if (typeof raw.spaceAfter === 'number' && raw.spaceAfter >= 0 && raw.spaceAfter < 500) out.spaceAfter = raw.spaceAfter;
  return Object.keys(out).length > 0 ? out : undefined;
}

function readZoneStyle(raw: unknown): ZoneStyle | undefined {
  if (!isRecord(raw)) return undefined;
  const title = readRole(raw.title);
  const text = readRole(raw.text);
  const out: ZoneStyle = {
    ...(title ? { title } : {}),
    ...(text ? { text } : {}),
    ...(typeof raw.vertical === 'string' && VERTICALS.has(raw.vertical) ? { vertical: raw.vertical as ZoneStyle['vertical'] } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}
