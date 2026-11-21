/**
 * The cover designer's names for what it shows: its layers, finishes,
 * zones, shapes, general texts and text roles, by the labels' keys; and a
 * text box's Markdown with its fields by their names and back.
 */

import { type BasicShape, type CoverFinishKind, type CoverZoneName } from 'postext';
import {
  type CoverLayer,
} from '../model/coverLayers.js';
import { type CoverField, type TextBoxRole } from '../model/coverTexts.js';
import type { Labels } from '../productionUi.js';


export const LAYER_LABEL: Record<CoverLayer, keyof Labels> = {
  background: 'coverLayerBackground',
  elements: 'coverLayerElements',
  texts: 'coverLayerTexts',
  effects: 'coverLayerEffects',
  logos: 'coverLayerLogos',
  finishes: 'coverLayerFinishes',
};
export const LAYER_HINT: Partial<Record<CoverLayer, keyof Labels>> = {
  texts: 'coverLayerTextsHint',
  effects: 'coverLayerEffectsHint',
  logos: 'coverLayerLogosHint',
  finishes: 'coverLayerFinishesHint',
};
export const FINISH_LABEL: Record<CoverFinishKind, keyof Labels> = {
  varnish: 'coverFinishVarnish',
  lamination: 'coverFinishLamination',
  foilGold: 'coverFinishFoilGold',
  foilSilver: 'coverFinishFoilSilver',
  emboss: 'coverFinishEmboss',
  deboss: 'coverFinishDeboss',
};
export const ZONE_LABEL: Partial<Record<CoverZoneName, keyof Labels>> = {
  front: 'productionZoneFront',
  back: 'productionZoneBack',
  spine: 'productionZoneSpine',
  flapFront: 'productionZoneFlapFront',
  flapBack: 'productionZoneFlapBack',
  jointFront: 'coverZoneJoint',
  jointBack: 'coverZoneJoint',
};
export const SHAPE_LABEL: Record<BasicShape, keyof Labels> = {
  rectangle: 'coverShapeRectangle',
  ellipse: 'coverShapeEllipse',
  polygon: 'coverShapePolygon',
  star: 'coverShapeStar',
  line: 'coverShapeLine',
};
export const round1 = (v: number) => Math.round(v * 10) / 10;
export const FIELD_LABEL: Record<CoverField, keyof Labels> = {
  title: 'coverFieldTitle',
  subtitle: 'coverFieldSubtitle',
  author: 'coverFieldAuthor',
  back: 'productionZoneBack',
  spine: 'productionZoneSpine',
  flapFront: 'productionZoneFlapFront',
  flapBack: 'productionZoneFlapBack',
  front: 'productionZoneFront',
};
export const fieldLabel = (labels: Labels, f: CoverField): string => String(labels[FIELD_LABEL[f]]);
/** A box's Markdown as the field shows it, its fields by their names
 *  (`{{Título}}`), and back. */
export function fieldsShown(text: string, labels: Labels): string {
  return text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (m, key: string) => (key in FIELD_LABEL ? `{{${fieldLabel(labels, key as CoverField)}}}` : m));
}
export function fieldsStored(text: string, labels: Labels): string {
  const byName = new Map((Object.keys(FIELD_LABEL) as CoverField[]).map((f) => [fieldLabel(labels, f).toLocaleLowerCase(), f] as const));
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, name: string) => {
    const f = byName.get(name.toLocaleLowerCase()) ?? (name in FIELD_LABEL ? name : undefined);
    return f ? `{{${f}}}` : m;
  });
}
export const ROLE_LABEL: Record<TextBoxRole, keyof Labels> = { h1: 'coverTextRoleH1', h2: 'coverTextRoleH2', h3: 'coverTextRoleH3', text: 'coverTextRoleText' };
