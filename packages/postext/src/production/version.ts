import { BUILT_IN_BINDING_PROFILES, DEFAULT_SPINE_TEXT } from '../defaults/output/production.js';
import type { BindingProfile, BindingStyle, ProductionVersion, TrimMm } from '../types/output/production.js';
import {
  caseSheet,
  caseSpineWidth,
  endpaperSheet,
  jacketSheet,
  softcoverSheet,
  type ProductionSheet,
} from './geometry.js';
import { parseIsbn, type IsbnError } from './isbn.js';
import { checkProfileAccepts, resolveBindingMeasures, type ProfileOutOfRangeWarning, type ResolvedBindingMeasures } from './measures.js';
import { spineFromRuns, type PageRun, type SpineReading } from './spine.js';

/** Whether a style is bound in a case: a jacket instead of flaps, and
 *  endpapers. */
export const isCaseBinding = (style: BindingStyle): boolean => style === 'caseFlat' || style === 'caseRound';

export type ProductionWarning =
  | ProfileOutOfRangeWarning
  | { kind: 'bindingProfileMissing'; profile: string }
  | { kind: 'isbnInvalid'; isbn: string; error: IsbnError }
  | { kind: 'spineOverridden'; calculated: number; used: number }
  | { kind: 'signatureBlanks'; blanks: number }
  | { kind: 'spineTooThinForText'; spine: number; minSpine: number };

/** Everything that is manufactured for one version of a book. */
export interface VersionSheets {
  version: string;
  profile: BindingProfile;
  measures: ResolvedBindingMeasures;
  spine: SpineReading & {
    /** The spine the sheets use, mm: the calculated one, or the
     *  version's `spineOverride`. For a case, the block's (the case's own
     *  is `caseSpine`). */
    used: number;
    caseSpine?: number;
  };
  /** The softcover's cover, or the case's covering. */
  cover: ProductionSheet;
  jacket?: ProductionSheet;
  endpapers?: { front: ProductionSheet; back: ProductionSheet };
  /** The version's ISBN as the barcode's thirteen digits. */
  isbn13?: string;
  warnings: ProductionWarning[];
}

/** The binding profile a version names: its own, one of the library's, or
 *  a built-in one. */
export function findBindingProfile(
  ref: ProductionVersion['binding'],
  library: readonly BindingProfile[] = [],
): BindingProfile | undefined {
  if (typeof ref !== 'string') return ref;
  return library.find((p) => p.id === ref) ?? BUILT_IN_BINDING_PROFILES.find((p) => p.id === ref);
}

/**
 * The sheets of one version of a book: from the trim, the runs of paper of
 * its laid-out pages (see `pageRunsOf`) and its binding, the spine, the
 * cover (or case), the jacket, the endpapers, and what to warn about.
 * Returns undefined when the version's binding profile cannot be found.
 */
export function versionSheets(
  version: ProductionVersion,
  trim: TrimMm,
  runs: readonly PageRun[],
  options: { library?: readonly BindingProfile[]; rtl?: boolean } = {},
): VersionSheets | { warnings: ProductionWarning[] } {
  const profile = findBindingProfile(version.binding, options.library);
  if (!profile) {
    return { warnings: [{ kind: 'bindingProfileMissing', profile: String(version.binding) }] };
  }
  const warnings: ProductionWarning[] = [];
  const m = resolveBindingMeasures(profile, trim, version.overrides);
  const reading = spineFromRuns(runs, profile.signature, m.spineAllowance);
  const used = version.spineOverride ?? reading.spine;
  if (version.spineOverride !== undefined) warnings.push({ kind: 'spineOverridden', calculated: reading.spine, used });
  if (reading.blanks > 0) warnings.push({ kind: 'signatureBlanks', blanks: reading.blanks });
  warnings.push(...checkProfileAccepts(profile, trim, used));
  const minSpine = version.spineText?.minSpine ?? DEFAULT_SPINE_TEXT.minSpine;
  if (used < minSpine) warnings.push({ kind: 'spineTooThinForText', spine: used, minSpine });

  let isbn13: string | undefined;
  if (version.isbn) {
    const r = parseIsbn(version.isbn);
    if (r.ok) isbn13 = r.isbn13;
    else warnings.push({ kind: 'isbnInvalid', isbn: version.isbn, error: r.error });
  }

  const base = { version: version.id, profile, measures: m, warnings, ...(isbn13 ? { isbn13 } : {}) };
  if (!isCaseBinding(profile.style)) {
    return { ...base, spine: { ...reading, used }, cover: softcoverSheet(trim, used, m, !!version.flaps) };
  }
  const caseSpine = caseSpineWidth(used, profile.style, m);
  return {
    ...base,
    spine: { ...reading, used, caseSpine },
    cover: caseSheet(trim, caseSpine, m),
    ...(version.flaps ? { jacket: jacketSheet(trim, caseSpine, m) } : {}),
    endpapers: {
      front: endpaperSheet(trim, m, 'front', options.rtl),
      back: endpaperSheet(trim, m, 'back', options.rtl),
    },
  };
}
