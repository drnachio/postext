// The build of a document from its content and config. The work lives in
// build/ (#1276): drivers.ts runs the passes, pass.ts is one placement pass,
// balanced.ts the column-balancing passes; this module is their entry point.
export { BuildCancelledError } from './build/passTypes.js';
export type { BuildDocumentOptions, BuildPassInfo, BuildProgress, PassHints, CitingPageSlot, PassResult, CitingPageRefusal } from './build/passTypes.js';
export { buildDocumentPass } from './build/pass.js';
export { buildDocument, yieldToEventLoop, buildDocumentAsync, buildDocumentGen } from './build/drivers.js';
export { resolveJumpMarks } from './build/pageMarks.js';
