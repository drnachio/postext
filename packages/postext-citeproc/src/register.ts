// Side effect: register the citeproc engine, with every bundled style and
// locale, as the engine Postext builds format citations with.
import { registerCitationEngine } from 'postext';
import { createCiteprocEngine } from './engine';
import { LOCALES } from './generated/locales';
import { STYLES } from './generated/styles';

registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
