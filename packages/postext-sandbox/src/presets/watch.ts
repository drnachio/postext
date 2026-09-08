// The one decision behind live presets, kept pure so the polling effect in
// SandboxContext stays a thin loop around it.

import type { AppliedPresetSnapshot } from './types';

export type PresetUpdateDecision = 'apply' | 'stale' | 'none';

export interface PresetUpdateInput {
  /** Fingerprint the source reports right now; null when unknown. */
  liveFingerprint: string | null;
  /** What was recorded when the active preset was last applied. */
  snapshot: AppliedPresetSnapshot | null | undefined;
  /** Whether the document still matches the snapshot (see hash.ts). */
  untouched: boolean;
}

/** `apply` — the bundle changed and the user has no local edits: re-apply
 *  silently. `stale` — it changed but the user edited something: keep their
 *  work and offer a reload. `none` — nothing changed, or nothing is known
 *  (no live fingerprint, no snapshot, or a snapshot taken without one). */
export function decidePresetUpdate({ liveFingerprint, snapshot, untouched }: PresetUpdateInput): PresetUpdateDecision {
  if (!liveFingerprint || !snapshot || !snapshot.fingerprint) return 'none';
  if (snapshot.fingerprint === liveFingerprint) return 'none';
  return untouched ? 'apply' : 'stale';
}
