import type { FontPayload } from './protocol';

// The faces of a laid-out document and the fallback probe live in
// `fonts/faces.ts` (#629), shared with main-thread builds.
export { documentFontFaces, documentFontFamilies, unavailableFontFamilies } from '../fonts/faces';

/** The `FontFace` descriptors of a payload; a numeric weight (`700`) is
 *  accepted as well as the CSS string (`'700'`, `'bold'`). */
export function fontFaceDescriptors(face: Pick<FontPayload, 'style' | 'unicodeRange'> & { weight: string | number }): FontFaceDescriptors {
  return { weight: String(face.weight), style: face.style, unicodeRange: face.unicodeRange };
}
