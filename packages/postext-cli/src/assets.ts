// Files compiled into the executable: the default faces (EB Garamond for
// text, Open Sans for headings: the engine's defaults), HarfBuzz for
// Arabic and other complex scripts in PDFs, and the ICC output profiles
// of the print settings. `bun build --compile` embeds every file imported
// with `type: 'file'`; run from source, the imports are the files on disk.

import { readFileSync } from 'node:fs';
import ebg400 from '../fonts/EBGaramond-400.ttf' with { type: 'file' };
import ebg400i from '../fonts/EBGaramond-400i.ttf' with { type: 'file' };
import ebg700 from '../fonts/EBGaramond-700.ttf' with { type: 'file' };
import ebg700i from '../fonts/EBGaramond-700i.ttf' with { type: 'file' };
import os400 from '../fonts/OpenSans-400.ttf' with { type: 'file' };
import os400i from '../fonts/OpenSans-400i.ttf' with { type: 'file' };
import os600 from '../fonts/OpenSans-600.ttf' with { type: 'file' };
import os700 from '../fonts/OpenSans-700.ttf' with { type: 'file' };
import os700i from '../fonts/OpenSans-700i.ttf' with { type: 'file' };
import harfbuzz from '../../postext-pdf/dist/harfbuzz.wasm' with { type: 'file' };
import fogra27 from 'postext/icc/fogra27.icc' with { type: 'file' };
import fogra28 from 'postext/icc/fogra28.icc' with { type: 'file' };
import fogra29 from 'postext/icc/fogra29.icc' with { type: 'file' };
import fogra30 from 'postext/icc/fogra30.icc' with { type: 'file' };
import fogra39 from 'postext/icc/fogra39.icc' with { type: 'file' };
import fogra40 from 'postext/icc/fogra40.icc' with { type: 'file' };
import fogra45 from 'postext/icc/fogra45.icc' with { type: 'file' };
import fogra47 from 'postext/icc/fogra47.icc' with { type: 'file' };
import fogra51 from 'postext/icc/fogra51.icc' with { type: 'file' };
import fogra52 from 'postext/icc/fogra52.icc' with { type: 'file' };
import gracol2006 from 'postext/icc/gracol2006.icc' with { type: 'file' };
import ifra26 from 'postext/icc/ifra26.icc' with { type: 'file' };
import snap2007 from 'postext/icc/snap2007.icc' with { type: 'file' };
import swop3 from 'postext/icc/swop3.icc' with { type: 'file' };
import swop5 from 'postext/icc/swop5.icc' with { type: 'file' };

export interface EmbeddedFace {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  path: string;
}

export const EMBEDDED_FACES: readonly EmbeddedFace[] = [
  { family: 'EB Garamond', weight: 400, style: 'normal', path: ebg400 },
  { family: 'EB Garamond', weight: 400, style: 'italic', path: ebg400i },
  { family: 'EB Garamond', weight: 700, style: 'normal', path: ebg700 },
  { family: 'EB Garamond', weight: 700, style: 'italic', path: ebg700i },
  { family: 'Open Sans', weight: 400, style: 'normal', path: os400 },
  { family: 'Open Sans', weight: 400, style: 'italic', path: os400i },
  { family: 'Open Sans', weight: 600, style: 'normal', path: os600 },
  { family: 'Open Sans', weight: 700, style: 'normal', path: os700 },
  { family: 'Open Sans', weight: 700, style: 'italic', path: os700i },
];

/** The family a face the book names but nobody has is measured and drawn
 *  with, so the layout and the PDF agree. */
export const FALLBACK_FAMILY = 'EB Garamond';

const ICC: Record<string, string> = {
  fogra27, fogra28, fogra29, fogra30, fogra39, fogra40, fogra45, fogra47, fogra51, fogra52, gracol2006, ifra26, snap2007, swop3, swop5,
};

export const ICC_PROFILES = Object.keys(ICC);

export function readEmbedded(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

export function iccProfile(name: string): Uint8Array | undefined {
  const path = ICC[name];
  return path ? readEmbedded(path) : undefined;
}

export function harfbuzzWasm(): Uint8Array {
  return readEmbedded(harfbuzz);
}
