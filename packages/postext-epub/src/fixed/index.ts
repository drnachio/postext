// Fixed-layout (pre-paginated) rendition. Owner: #395.

import type { EpubPublication, EpubSource, RenderToEpubOptions } from '../types';

export async function buildFixedPublication(_docs: EpubSource, _options: RenderToEpubOptions): Promise<EpubPublication> {
  throw new Error('buildFixedPublication: not implemented yet (#395)');
}
