/**
 * The in-page half of the Cookbook capture harness, served at /__cb/probe.js
 * by scripts/cookbook/serve.ts and imported by harness.ts once the pen has
 * settled. It reads what the shims recorded in `window.__cb` and returns
 * plain JSON: the facts the checks judge in Node (checks.ts), and the page,
 * card and OG images, painted by the pen's own engine instance (so the
 * image registry is shared) and encoded by Chrome.
 *
 * Browser ES module; no dependencies. The code lives in probe/, imported
 * from /__cb/probe/<name>.js.
 */

export { settle, fontsReady, frames, pdfState, epubState, pdfBase64 } from './probe/settle.js';
export { parseFont, blankFont, textOfFaces, charsInNoFace, paintedFaces, systemFontChars } from './probe/fonts.js';
export { mathErrorsOf } from './probe/paint.js';
export { COMPOSED_CONTENT_KINDS, COMPOSED_FENCE, composedRoundTrip, composedFacts } from './probe/composed.js';
export { facts } from './probe/facts.js';
export { renderPages, PAGE_DIFFERENCE, pageDifference, pagesDiffer, comparePages, taintedPages, kitState } from './probe/render.js';
export { composeCard } from './probe/card.js';
export { configKeyOf, bundleGroup } from './probe/bundle.js';
export { layoutHash, linesHash, warningsOf, extraWarnings } from './probe/hashes.js';
export { readBundleBack, namedLanguage, languageBack, startOf, startLossNotes, bundleLocale, bundleLanguage } from './probe/readBack.js';
export { sandboxBundle } from './probe/sandboxBundle.js';
