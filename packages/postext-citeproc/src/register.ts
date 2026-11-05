/**
 * `postext-citeproc/register`: import it for its side effect. It registers the
 * citeproc engine, with every bundled style and locale, as the engine Postext
 * builds format citations with.
 *
 * @module
 */

import { registerCitationEngine } from 'postext';
import { createCiteprocEngine } from './engine.js';
import { LOCALES } from './generated/locales.js';
import { STYLES } from './generated/styles.js';

registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
