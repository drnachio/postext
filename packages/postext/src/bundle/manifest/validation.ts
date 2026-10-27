// Manifest validation: type guards for every manifest field.
import type { BundleChapterSpec, BundleLocaleOverrides, BundleViewSpec, BundleManifest } from '../types.js';

// ---------------------------------------------------------------------------
// Validation

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isOptionalString(v: unknown): boolean {
  return v === undefined || typeof v === 'string';
}

function isOptionalStringList(v: unknown): boolean {
  return v === undefined || (Array.isArray(v) && v.every(isNonEmptyString));
}

/** The optional showcase fields: wrong types reject the manifest rather
 *  than being silently dropped. */
export function hasValidShowcaseMeta(v: Record<string, unknown>): boolean {
  return isOptionalStringList(v.locales)
    && isOptionalString(v.thumbnail)
    && isOptionalString(v.openLocale)
    && isOptionalString(v.license)
    && isOptionalString(v.credits)
    && isOptionalStringList(v.tags);
}

function isMarkdownField(v: unknown): v is string | Record<string, string> {
  if (isNonEmptyString(v)) return true;
  if (!isRecord(v)) return false;
  const values = Object.values(v);
  return values.length > 0 && values.every(isNonEmptyString);
}

function isChapterSpec(v: unknown): v is BundleChapterSpec {
  return isRecord(v) && typeof v.title === 'string' && isNonEmptyString(v.file);
}

function isChapterList(v: unknown): v is BundleChapterSpec[] {
  return Array.isArray(v) && v.length > 0 && v.every(isChapterSpec);
}

function isChaptersField(v: unknown): v is BundleChapterSpec[] | Record<string, BundleChapterSpec[]> {
  if (isChapterList(v)) return true;
  if (!isRecord(v)) return false;
  const values = Object.values(v);
  return values.length > 0 && values.every(isChapterList);
}

function isLocaleOverrides(v: unknown): v is BundleLocaleOverrides {
  if (!isRecord(v)) return false;
  if (!isOptionalString(v.name) || !isOptionalString(v.description)) return false;
  if (v.config !== undefined && !isRecord(v.config)) return false;
  if (v.view !== undefined && !isViewField(v.view)) return false;
  if (v.start !== undefined && !isRecord(v.start)) return false;
  if (v.resources !== undefined) {
    if (!Array.isArray(v.resources)) return false;
    if (!v.resources.every((r) => isRecord(r) && isNonEmptyString(r.id))) return false;
  }
  return true;
}

function isViewField(v: unknown): v is BundleViewSpec {
  if (!isRecord(v)) return false;
  return v.canvasScope === undefined || v.canvasScope === 'book' || v.canvasScope === 'chapter';
}

function isLocalizedField(v: unknown): v is Record<string, BundleLocaleOverrides> {
  return isRecord(v) && Object.values(v).every(isLocaleOverrides);
}

/** True when `data` is a valid `preset.json`, version 1 (`markdown`) or 2
 *  (`chapters`). */
export function isBundleManifest(data: unknown): data is BundleManifest {
  if (!isRecord(data)) return false;
  if (data.version !== 1 && data.version !== 2) return false;
  if (!isNonEmptyString(data.id) || !isNonEmptyString(data.name)) return false;
  if (data.version === 1 && !isMarkdownField(data.markdown)) return false;
  if (data.version === 2 && !isChaptersField(data.chapters)) return false;
  if (!hasValidShowcaseMeta(data)) return false;
  if (data.view !== undefined && !isViewField(data.view)) return false;
  if (data.start !== undefined && !isRecord(data.start)) return false;
  if (data.localized !== undefined && !isLocalizedField(data.localized)) return false;
  if (data.config !== undefined && !isRecord(data.config)) return false;
  if (data.resources !== undefined) {
    if (!Array.isArray(data.resources)) return false;
    if (!data.resources.every((r) => isRecord(r) && isNonEmptyString(r.id) && isNonEmptyString(r.typeId))) return false;
  }
  if (data.fonts !== undefined) {
    if (!Array.isArray(data.fonts)) return false;
    const ok = data.fonts.every((f) =>
      isRecord(f) && isNonEmptyString(f.name) && Array.isArray(f.variants)
      && (f.fallback === undefined || isNonEmptyString(f.fallback))
      && f.variants.every((v) => isRecord(v) && typeof v.weight === 'number' && isNonEmptyString(v.file)),
    );
    if (!ok) return false;
  }
  return true;
}
