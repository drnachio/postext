// The table of the chapter on languages (#1296) counts what each edition of
// the guide sets for itself over the general settings the built-in preset
// gives it: the numbers it prints are held to the configurations here.

import { describe, expect, it } from 'vitest';
import { overridePaths } from 'postext';
import { createPostextGuidePreset } from '../presets/builtin.js';
import { editionOverride } from '../editions/configLayers.js';
import { EDITION_OVERRIDES } from '../defaultResources/editionTables.js';

const preset = createPostextGuidePreset({ name: 'Postext' });
const count = async (lang: string) => {
  const loaded = await preset.load(lang);
  return { own: overridePaths(editionOverride(loaded.sharedConfig!, loaded.config)).length, general: overridePaths(loaded.sharedConfig as unknown as Parameters<typeof overridePaths>[0]).length };
};

describe('the edition layers table', () => {
  it('prints what each edition sets for itself', async () => {
    const latin = await Promise.all(['en', 'es', 'ca', 'pt-BR', 'fr', 'de', 'it'].map(count));
    const got = {
      general: latin[0].general,
      latin: [Math.min(...latin.map((c) => c.own)), Math.max(...latin.map((c) => c.own))],
      ar: (await count('ar')).own,
      zh: (await count('zh-Hans')).own,
      ja: (await count('ja')).own,
    };
    expect(EDITION_OVERRIDES).toEqual(got);
  });
});
