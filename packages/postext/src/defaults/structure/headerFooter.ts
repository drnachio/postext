import type { DesignSlot } from '../../types.js';
import { type DesignSlotKind, legacyKind, defaultSlotFor } from './headerFooter/defaults.js';
import { isLegacyHeaderFooterSlot, migrateLegacyHeaderFooterConfig } from './headerFooter/legacy.js';

export { defaultTextOverflow, DEFAULT_HEADER_FOOTER_SLOT, DEFAULT_TEXT_ELEMENT, DEFAULT_RULE_ELEMENT, DEFAULT_BOX_ELEMENT, DEFAULT_HEADER_SLOT, DEFAULT_FOOTER_SLOT } from './headerFooter/defaults.js';
export type { HeaderFooterSlotKind, DesignSlotKind } from './headerFooter/defaults.js';
export { isLegacyHeaderFooterSlot, migrateLegacyHeaderFooterConfig } from './headerFooter/legacy.js';
export { resolveDesignLineHeight, fenceConditionOf, resolveDesignSlot, resolveHeaderFooterConfig } from './headerFooter/resolve.js';

/** `slot` as it is stored: one in the pre-placement shape migrated, any
 *  other as given. Nothing is dropped, so it serves where a slot has no
 *  default of its own (a heading style's, which stands for the
 *  document's when unset, #694). */
export function migrateDesignSlot(
  slot: DesignSlot | undefined,
  kind: DesignSlotKind = 'header',
): DesignSlot | undefined {
  if (!slot) return undefined;
  return isLegacyHeaderFooterSlot(slot)
    ? migrateLegacyHeaderFooterConfig(slot, legacyKind(kind)) ?? slot
    : slot;
}

// Strip is intentionally minimal: only returns `undefined` when the slot
// deep-equals the default (so persisted configs omit it entirely). Per-field
// stripping across the new union is not worth the complexity — the slot is
// stored as-is otherwise. A heading, part or contents row slot has no
// default to compare with, so it is never stripped.
export function stripDesignSlotDefaults(
  slot: DesignSlot | undefined,
  kind: DesignSlotKind = 'header',
): DesignSlot | undefined {
  const migrated = migrateDesignSlot(slot, kind);
  if (!migrated) return undefined;
  if (kind !== 'header' && kind !== 'footer') return migrated;
  if (JSON.stringify(migrated) === JSON.stringify(defaultSlotFor(kind))) return undefined;
  return migrated;
}

export const stripHeaderFooterDefaults = stripDesignSlotDefaults;
