'use client';

// The colours and box styles the safe area and lettering marks are drawn
// with, a picture's intrinsic size and the key of a mark target (#1276:
// split out of SafeAreaEditor.tsx).
import type { CSSProperties } from 'react';
import type { LabelStyle, Resource, ResourceSafeArea } from 'postext';
import type { MarkTarget } from '../pictureMarks.js';

export const NO_LABEL_STYLES: LabelStyle[] = [];

export const pct = (v: number) => Math.round(v * 1000) / 10;

/** One colour per speaker, cycled, so a mouth, its head and its face read
 *  as one person. */
const SPEAKER_COLORS = ['#f97316', '#22d3ee', '#facc15', '#a3e635', '#e879f9', '#60a5fa'];
export const speakerColor = (i: number) => SPEAKER_COLORS[i % SPEAKER_COLORS.length]!;
export const AVOID_COLOR = '#ef4444';
export const AVOID_FILL = 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.32) 0 5px, rgba(239, 68, 68, 0.08) 5px 10px)';
/** A bystander's face is drawn as a speaker's face is (a tinted box, no
 *  hatching), in a colour no speaker takes. */
export const BYSTANDER_COLOR = '#a78bfa';

/** The picture's intrinsic size, from the resource or, failing that, the
 *  loaded image. */
export function intrinsicOf(resource: Resource): { width: number; height: number } | undefined {
  if (resource.kind === 'bitmap' && resource.bitmap && resource.bitmap.width > 0 && resource.bitmap.height > 0) {
    return { width: resource.bitmap.width, height: resource.bitmap.height };
  }
  if (resource.kind === 'svg' && resource.svg?.width && resource.svg.height) {
    return { width: resource.svg.width, height: resource.svg.height };
  }
  const poster = resource.kind === 'video' ? resource.video?.poster : undefined;
  if (poster && poster.width > 0 && poster.height > 0) return { width: poster.width, height: poster.height };
  return undefined;
}

/** `object-fit` showing `source` of a picture in a box of the same ratio
 *  (as the HTML backend sets a cropped picture). */
export function croppedStyle(source: ResourceSafeArea | undefined): CSSProperties {
  if (!source) return { objectFit: 'fill' };
  const x = source.width < 1 ? (source.x / (1 - source.width)) * 100 : 0;
  const y = source.height < 1 ? (source.y / (1 - source.height)) * 100 : 0;
  return { objectFit: 'cover', objectPosition: `${x}% ${y}%` };
}

/** The rectangle `r` of the shown picture, in % of its box. */
export function boxStyle(r: ResourceSafeArea): CSSProperties {
  return { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` };
}

export const targetKey = (t: MarkTarget) => (t.kind === 'safe' ? 'safe' : `${t.kind}-${t.index}`);

/** Lettering marks only mean something on a picture (a video poster is
 *  cropped like one but never lettered). */
export const lettered = (resource: Resource) => resource.kind === 'bitmap' || resource.kind === 'svg';
