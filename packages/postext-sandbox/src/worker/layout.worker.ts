/// <reference lib="webworker" />
// The Sandbox's layout worker: Postext's own worker entry, with the citation
// engine (postext-citeproc, its CSL styles and locales) loaded the first
// time a document cites works — a chunk of its own, so a document without
// citations never fetches it.
import { setCitationEngineLoader, setFigureStyleFamilies } from 'postext';
import 'postext/worker/entry';
import { takesFigureFeatures } from '../controls/fonts/systemFonts.js';

setCitationEngineLoader(() => import('postext-citeproc/register'));
// A style's figures (#1237) leave a face only the system has as it is, as
// on the page (`fontLoader.ts`).
setFigureStyleFamilies((family) => takesFigureFeatures(family, (self as unknown as { fonts?: Iterable<{ family: string }> }).fonts));
