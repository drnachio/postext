/**
 * The output profiles postext ships (`packages/postext/icc`, served by the
 * site at `/icc/<id>.icc` and by any npm CDN at `postext/icc/<id>.icc`).
 * All are CC0; see `icc/README.md` for provenance.
 */

import { parseIccProfile, type IccProfile } from './icc';

export interface OutputProfileInfo {
  id: string;
  /** Human name, as print buyers know the condition. */
  name: string;
  /** ICC characterization registry name: the PDF/X OutputConditionIdentifier. */
  registryName: string;
  /** The printing condition, for the PDF/X OutputCondition string. */
  condition: string;
  /** Paper family, for the Sandbox list. */
  paper: 'coated' | 'uncoated' | 'web-coated' | 'newsprint' | 'sc';
  /** Total ink limit the profile separates to, percent. */
  inkLimit: number;
}

export const OUTPUT_PROFILES: readonly OutputProfileInfo[] = [
  { id: 'fogra39', name: 'Coated FOGRA39 (ISO Coated v2)', registryName: 'FOGRA39', condition: 'Offset commercial and specialty printing according to ISO 12647-2:2004 / Amd 1, OFCOM, paper type 1 or 2 = gloss or matt coated offset, 115 g/m2, screen ruling 60/cm', paper: 'coated', inkLimit: 300 },
  { id: 'fogra51', name: 'PSO Coated v3 (FOGRA51)', registryName: 'FOGRA51', condition: 'Offset printing according to ISO 12647-2:2013, OFCOM, print substrate 1 = premium coated, 115 g/m2, tone value increase curves A (CMYK)', paper: 'coated', inkLimit: 300 },
  { id: 'fogra52', name: 'PSO Uncoated v3 (FOGRA52)', registryName: 'FOGRA52', condition: 'Offset printing according to ISO 12647-2:2013, OFCOM, print substrate 5 = wood-free uncoated, 120 g/m2, tone value increase curves C (CMYK)', paper: 'uncoated', inkLimit: 300 },
  { id: 'fogra47', name: 'PSO Uncoated ISO 12647 (FOGRA47)', registryName: 'FOGRA47', condition: 'Offset printing according to ISO 12647-2:2004 / Amd 1, paper type 5 = uncoated white offset, 120 g/m2, screen ruling 60/cm', paper: 'uncoated', inkLimit: 300 },
  { id: 'fogra29', name: 'Uncoated FOGRA29', registryName: 'FOGRA29', condition: 'Offset printing according to ISO 12647-2:2004 / Amd 1, paper type 4 = uncoated white offset, 120 g/m2, screen ruling 60/cm', paper: 'uncoated', inkLimit: 300 },
  { id: 'fogra30', name: 'Uncoated yellowish FOGRA30', registryName: 'FOGRA30', condition: 'Offset printing according to ISO 12647-2:2004, paper type 5 = uncoated yellowish offset, 115 g/m2, screen ruling 60/cm', paper: 'uncoated', inkLimit: 340 },
  { id: 'fogra27', name: 'Coated FOGRA27', registryName: 'FOGRA27', condition: 'Offset printing according to ISO 12647-2:1996, paper type 1 or 2 = gloss or matt coated, 115 g/m2, screen ruling 60/cm', paper: 'coated', inkLimit: 300 },
  { id: 'fogra28', name: 'Web coated FOGRA28', registryName: 'FOGRA28', condition: 'Heatset web offset printing according to ISO 12647-2:2004, paper type 3 = glossy LWC, 65 g/m2, screen ruling 60/cm', paper: 'web-coated', inkLimit: 300 },
  { id: 'fogra45', name: 'Improved LWC FOGRA45', registryName: 'FOGRA45', condition: 'Heatset web offset printing according to ISO 12647-2:2004 / Amd 1, improved LWC, screen ruling 60/cm', paper: 'web-coated', inkLimit: 300 },
  { id: 'fogra40', name: 'SC paper FOGRA40', registryName: 'FOGRA40', condition: 'Heatset web offset printing according to ISO 12647-2:2004 / Amd 1, SC paper, screen ruling 60/cm', paper: 'sc', inkLimit: 340 },
  { id: 'gracol2006', name: 'GRACoL 2006 Coated 1 (CGATS TR 006)', registryName: 'CGATS TR 006', condition: 'Commercial offset lithography, grade 1 coated paper, GRACoL 2006', paper: 'coated', inkLimit: 300 },
  { id: 'swop3', name: 'SWOP 2006 Coated 3 (CGATS TR 003)', registryName: 'CGATS TR 003', condition: 'Publication web offset lithography, grade 3 coated paper, SWOP 2006', paper: 'web-coated', inkLimit: 300 },
  { id: 'swop5', name: 'SWOP 2006 Coated 5 (CGATS TR 005)', registryName: 'CGATS TR 005', condition: 'Publication web offset lithography, grade 5 coated paper, SWOP 2006', paper: 'web-coated', inkLimit: 300 },
  { id: 'ifra26', name: 'ISO Newspaper 26 (IFRA26)', registryName: 'IFRA26', condition: 'Coldset offset printing according to ISO 12647-3:2004, newsprint', paper: 'newsprint', inkLimit: 230 },
  { id: 'snap2007', name: 'SNAP 2007 Newsprint (CGATS TR 002)', registryName: 'CGATS TR 002', condition: 'Coldset offset newspaper printing, SNAP 2007', paper: 'newsprint', inkLimit: 320 },
];

export const DEFAULT_OUTPUT_PROFILE_ID = 'fogra39';

export function outputProfileInfo(id: string): OutputProfileInfo | undefined {
  return OUTPUT_PROFILES.find((p) => p.id === id);
}

/** Where the catalogue's files are fetched from when the caller does not
 *  say: the npm CDN copy of this package's `icc/` folder. The Sandbox
 *  passes its own origin (`/icc/`). */
export const DEFAULT_PROFILE_BASE_URL = 'https://cdn.jsdelivr.net/npm/postext/icc/';

const loads = new Map<string, Promise<IccProfile>>();

/** Fetch and parse a catalogue profile (memoized per URL). */
export function loadOutputProfile(id: string, baseUrl: string = DEFAULT_PROFILE_BASE_URL): Promise<IccProfile> {
  if (!outputProfileInfo(id)) return Promise.reject(new Error(`unknown output profile "${id}"`));
  const url = `${baseUrl.replace(/\/?$/, '/')}${id}.icc`;
  let p = loads.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`could not fetch ${url} (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => parseIccProfile(new Uint8Array(buf)));
    p.catch(() => loads.delete(url));
    loads.set(url, p);
  }
  return p;
}
