// The Cover panel's words for what the engine names by id: the built-in
// binding profiles (named in Spanish in the engine), the sheets, the
// zones and the checks.

import type { BindingProfile, BuildCoverIssue, CoverSheetKind } from 'postext/production';
import type { SandboxLabels } from '../../types/labels.js';

const PROFILE_LABEL: Record<string, keyof SandboxLabels> = {
  perfect: 'coverProfilePerfect',
  'sewn-softcover': 'coverProfileSewn',
  'case-flat': 'coverProfileCaseFlat',
  'case-round': 'coverProfileCaseRound',
};

/** A profile's name: a built-in one's in the interface's language, the
 *  book's own as it was named. */
export function profileName(labels: SandboxLabels, profile: BindingProfile, builtIn: boolean): string {
  const key = builtIn ? PROFILE_LABEL[profile.id] : undefined;
  return key ? String(labels[key]) : profile.name;
}

export const SHEET_LABEL: Record<CoverSheetKind, keyof SandboxLabels> = {
  cover: 'coverSheetCover',
  jacket: 'coverSheetJacket',
  endpaperFront: 'coverSheetEndpaperFront',
  endpaperBack: 'coverSheetEndpaperBack',
};

export const ZONE_LABEL: Record<string, keyof SandboxLabels> = {
  front: 'coverZoneFront',
  back: 'coverZoneBack',
  spine: 'coverZoneSpine',
  flapFront: 'coverZoneFlapFront',
  flapBack: 'coverZoneFlapBack',
  pastedown: 'coverZonePastedown',
  flyleaf: 'coverZoneFlyleaf',
};

const mm = (n: unknown) => (typeof n === 'number' ? n.toFixed(1) : String(n));

/** A check of the cover in a line. */
export function coverIssueText(labels: SandboxLabels, issue: BuildCoverIssue): string {
  const i = issue as BuildCoverIssue & Record<string, unknown>;
  const fill = (s: string, values: Record<string, unknown>) => Object.entries(values).reduce((t, [k, v]) => t.replaceAll(`__${k}__`, String(v)), s);
  switch (issue.kind) {
    case 'bindingProfileMissing': return fill(labels.coverCheckBindingProfileMissing, { profile: i.profile });
    case 'isbnInvalid':
    case 'coverIsbnInvalid': return fill(labels.coverCheckIsbnInvalid, { isbn: i.isbn });
    case 'spineOverridden': return fill(labels.coverCheckSpineOverridden, { used: mm(i.used), calculated: mm(i.calculated) });
    case 'signatureBlanks': return fill(labels.coverCheckSignatureBlanks, { blanks: i.blanks });
    case 'spineTooThinForText': return fill(labels.coverCheckSpineTooThin, { spine: mm(i.spine), min: mm(i.minSpine) });
    case 'profileOutOfRange': return fill(labels.coverCheckProfileOutOfRange, { value: mm(i.value), limit: mm(i.limit) });
    case 'coverTextBoxName': return fill(labels.coverCheckTextBoxName, { name: i.name });
    case 'coverMirrorSkipped': return labels.coverCheckMirrorSkipped;
    case 'coverMirrorCapped': return labels.coverCheckMirrorCapped;
    case 'coverClipSkipped': return labels.coverCheckClipSkipped;
    case 'coverBarcodeSize': return labels.coverCheckBarcodeSize;
    case 'coverSlotUnknown': return fill(labels.coverCheckSlotUnknown, { slot: i.slot });
    case 'coverSlotRepeated': return fill(labels.coverCheckSlotRepeated, { slot: i.slot });
    case 'coverFrameSheetUnknown': return fill(labels.coverCheckFrameSheetUnknown, { sheet: i.sheet });
    case 'coverVersionMissing': return labels.coverNoVersions;
    case 'coverSheetMissing': return fill(labels.coverCheckSheetMissing, { sheet: labels[SHEET_LABEL[i.sheet as CoverSheetKind]] });
    default: return (issue as { kind: string }).kind;
  }
}
