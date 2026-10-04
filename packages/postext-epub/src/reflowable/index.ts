// Reflowable rendition. Owner: #396.

import type { EpubPublication, EpubSource, RenderToEpubOptions } from '../types';

export async function buildReflowablePublication(_docs: EpubSource, _options: RenderToEpubOptions): Promise<EpubPublication> {
  throw new Error('buildReflowablePublication: not implemented yet (#396)');
}
