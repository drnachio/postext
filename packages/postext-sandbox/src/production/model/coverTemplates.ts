/**
 * Cover templates: a cover's design kept apart from any book, by parts (a
 * collection's ground and logos, a series' type), to lay on another book.
 *
 * A template keeps the parts of a design it was saved with, each a layer
 * of the designer: the background (the ground, its picture, the zones'
 * colours), the movable elements, the texts (their boxes and type, and
 * the general texts they show, never what those say), the effects, the
 * logos and the finishes.
 * It carries the pictures of the cover's gallery and the logos of the
 * library it places, so it lays the same on any book and travels as a
 * file. Every item is placed by its zone with that zone's size, so it
 * fits another format and another spine.
 *
 * Laying a template replaces the parts chosen of the book's design and
 * leaves the others as they were; its pictures join the book's gallery,
 * its logos the library (those already there kept).
 */

import type { CoverDesignSettings } from './bookProduction.js';
import type { CoverGallery, GalleryPicture } from '../library/coverGallery.js';
import { isGalleryResourceId } from '../library/coverGallery.js';
import { sniffLogoMime, type LogoRecord } from '../library/logoLibrary.js';

export type TemplatePart = 'background' | 'elements' | 'texts' | 'effects' | 'logos' | 'finishes';
export const TEMPLATE_PARTS: readonly TemplatePart[] = ['background', 'elements', 'texts', 'effects', 'logos', 'finishes'];

export interface CoverTemplate {
  id: string;
  name: string;
  /** The parts it keeps. */
  parts: TemplatePart[];
  design: CoverDesignSettings;
  /** The gallery pictures its parts place. */
  pictures: GalleryPicture[];
  /** The library logos its logos place. */
  logos: LogoRecord[];
  /** The cover it was saved from, small (a JPEG of the sheet's trim), to
   *  know it at a glance. */
  thumbnail?: Uint8Array;
  updatedAt: number;
}

/** The parts a design has something in. */
export function designParts(design: CoverDesignSettings | undefined): TemplatePart[] {
  if (!design) return [];
  return TEMPLATE_PARTS.filter((p) => {
    switch (p) {
      case 'background': return !!(design.background || design.image || (design.zones && Object.keys(design.zones).length));
      case 'texts': return !!(design.textColor || design.texts || (design.zoneStyles && Object.keys(design.zoneStyles).length));
      default: return !!design[p]?.length;
    }
  });
}

/** The part of a design `part` is. */
function partOf(design: CoverDesignSettings, part: TemplatePart): Partial<CoverDesignSettings> {
  switch (part) {
    case 'background': return {
      ...(design.background ? { background: design.background } : {}),
      ...(design.image ? { image: design.image } : {}),
      ...(design.zones ? { zones: design.zones } : {}),
    };
    case 'texts': return {
      ...(design.textColor ? { textColor: design.textColor } : {}),
      ...(design.zoneStyles ? { zoneStyles: design.zoneStyles } : {}),
      // The boxes, with their fields: what those say comes from each book.
      ...(design.texts ? { texts: design.texts } : {}),
    };
    default: return design[part]?.length ? { [part]: design[part] } : {};
  }
}

/** A design with `part` taken out. */
function withoutPart(design: CoverDesignSettings, part: TemplatePart): CoverDesignSettings {
  const out = { ...design };
  if (part === 'background') {
    delete out.background;
    delete out.image;
    delete out.zones;
  } else if (part === 'texts') {
    delete out.textColor;
    delete out.zoneStyles;
    delete out.texts;
  } else {
    delete out[part];
  }
  return out;
}

/** The gallery pictures and library logos a design places. */
function placedIn(design: CoverDesignSettings): { pictures: Set<string>; logos: Set<string> } {
  const pictures = new Set<string>();
  for (const id of [design.image?.resourceId, ...[...(design.elements ?? []), ...(design.effects ?? []), ...(design.logos ?? [])].map((e) => e.resourceId)]) {
    if (id && isGalleryResourceId(id)) pictures.add(id.slice('cover:'.length));
  }
  return { pictures, logos: new Set((design.logos ?? []).flatMap((l) => (l.logoId ? [l.logoId] : []))) };
}

/** A template of the parts of `design` asked (those with something in
 *  them), with the pictures and logos they place. */
export function templateFromDesign(
  design: CoverDesignSettings | undefined,
  parts: readonly TemplatePart[],
  sources: { gallery: CoverGallery | null; logos: readonly LogoRecord[] },
  name: string,
  id = newTemplateId(),
  now = Date.now(),
): CoverTemplate {
  const kept = parts.filter((p) => designParts(design).includes(p));
  const saved: CoverDesignSettings = {};
  for (const p of kept) Object.assign(saved, partOf(design!, p));
  const placed = placedIn(saved);
  return {
    id,
    name,
    parts: kept,
    design: saved,
    pictures: (sources.gallery?.pictures ?? []).filter((p) => placed.pictures.has(p.id)),
    logos: sources.logos.filter((l) => placed.logos.has(l.id)),
    updatedAt: now,
  };
}

/** A book's design with the template's parts asked laid over it (the
 *  others as they were), and its gallery with the template's pictures. */
export function applyTemplate(
  template: CoverTemplate,
  parts: readonly TemplatePart[],
  design: CoverDesignSettings | undefined,
  gallery: CoverGallery,
): { design: CoverDesignSettings; gallery: CoverGallery; logos: LogoRecord[] } {
  const laid = parts.filter((p) => template.parts.includes(p));
  let out: CoverDesignSettings = { ...design };
  for (const p of laid) out = { ...withoutPart(out, p), ...partOf(template.design, p) };
  const placed = placedIn(out);
  const have = new Set(gallery.pictures.map((p) => p.id));
  const pictures = template.pictures.filter((p) => placed.pictures.has(p.id) && !have.has(p.id));
  return {
    design: out,
    gallery: pictures.length ? { ...gallery, pictures: [...gallery.pictures, ...pictures] } : gallery,
    logos: template.logos.filter((l) => placed.logos.has(l.id)),
  };
}

export function newTemplateId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const TEMPLATE_FILE_FORMAT = 'postext-cover-templates';
const TEMPLATE_FILE_VERSION = 1;

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Templates as a file to share, their pictures and logos in base64. */
export function exportTemplates(templates: readonly CoverTemplate[]): unknown {
  return {
    format: TEMPLATE_FILE_FORMAT,
    version: TEMPLATE_FILE_VERSION,
    templates: templates.map(({ thumbnail, ...t }) => ({
      ...t,
      ...(thumbnail ? { thumbnail: base64(thumbnail) } : {}),
      pictures: t.pictures.map(({ bytes, ...p }) => ({ ...p, data: base64(bytes) })),
      logos: t.logos.map(({ bytes, ...l }) => ({ ...l, data: base64(bytes) })),
    })),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A thumbnail written in a file: base64 bytes that are a picture. */
function thumbnailOf(raw: unknown): Uint8Array | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const bytes = fromBase64(raw);
    return sniffLogoMime(bytes) ? bytes : undefined;
  } catch {
    return undefined;
  }
}

/** The templates of a file (parsed JSON) that read; `ok` false when it is
 *  no templates file. Their design is kept as written: it is read again,
 *  part by part, when laid on a book. */
export function importTemplates(data: unknown, now = Date.now()): { templates: CoverTemplate[]; ok: boolean } {
  if (!isRecord(data) || data.format !== TEMPLATE_FILE_FORMAT || !Array.isArray(data.templates)) return { templates: [], ok: false };
  const withBytes = <T>(list: unknown): (T & { bytes: Uint8Array })[] =>
    (Array.isArray(list) ? list : []).flatMap((x) => {
      if (!isRecord(x) || typeof x.data !== 'string' || typeof x.id !== 'string') return [];
      let bytes: Uint8Array;
      try {
        bytes = fromBase64(x.data);
      } catch {
        return [];
      }
      const mime = sniffLogoMime(bytes);
      if (!mime) return [];
      const rest = { ...x };
      delete rest.data;
      return [{ ...(rest as T), mime, bytes }];
    });
  const templates = data.templates.flatMap((t): CoverTemplate[] => {
    if (!isRecord(t) || typeof t.id !== 'string' || typeof t.name !== 'string' || !isRecord(t.design)) return [];
    const parts = (Array.isArray(t.parts) ? t.parts : []).filter((p): p is TemplatePart => TEMPLATE_PARTS.includes(p as TemplatePart));
    return [{
      id: t.id,
      name: t.name,
      parts,
      design: t.design as CoverDesignSettings,
      pictures: withBytes<GalleryPicture>(t.pictures).map((p) => ({ ...p, updatedAt: now })),
      logos: withBytes<LogoRecord>(t.logos).map((l) => ({ ...l, updatedAt: now })),
      ...(thumbnailOf(t.thumbnail) ? { thumbnail: thumbnailOf(t.thumbnail)! } : {}),
      updatedAt: now,
    }];
  });
  return { templates, ok: true };
}
