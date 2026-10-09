// `buildDocumentWithFonts` (#629): font preparation around a build, apart
// from `prepare.ts` so the worker client can prepare faces without
// bringing the layout pipeline in.

import type { PostextConfig, PostextContent } from '../types';
import type { VDTDocument } from '../vdt';
import type { BuildDocumentOptions } from '../pipeline/build';
import type { MeasurementCache } from '../measure/types';
import { buildDocumentAsync } from '../pipeline/build';
import { contentTexts, prepareFonts, withLoadedFonts, type LoadedFontsOptions } from './prepare';

export interface BuildDocumentWithFontsOptions extends LoadedFontsOptions, BuildDocumentOptions {
  /** The measurement cache handed to every build. */
  cache?: MeasurementCache;
  /** How a build yields between passes (see `buildDocumentAsync`). */
  yieldBetweenPasses?: () => Promise<void>;
}

/**
 * {@link prepareFonts}, then {@link buildDocumentAsync}, then any face the
 * pages used that was not there loaded and the document built again (see
 * {@link withLoadedFonts}): the document laid out with the real faces in
 * one call. The report of what was found goes to `options.onFonts`.
 */
export async function buildDocumentWithFonts(
  content: PostextContent,
  config?: PostextConfig,
  options: BuildDocumentWithFontsOptions = {},
): Promise<VDTDocument> {
  await prepareFonts(content, config, { ...options, watch: false });
  return withLoadedFonts(
    () => buildDocumentAsync(content, config, options.cache, options),
    { ...options, text: options.text ?? contentTexts(content) },
  );
}
