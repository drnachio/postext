/// <reference lib="webworker" />
// The Sandbox's layout worker: Postext's own worker entry, with the citation
// engine (postext-citeproc, its CSL styles and locales) loaded the first
// time a document cites works — a chunk of its own, so a document without
// citations never fetches it.
import { setCitationEngineLoader } from 'postext';
import 'postext/worker/entry';

setCitationEngineLoader(() => import('postext-citeproc/register'));
