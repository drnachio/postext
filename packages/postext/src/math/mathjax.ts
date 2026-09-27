// Every MathJax module the math engine uses, imported from this one file.
//
// `pnpm build` bundles this module and its MathJax dependencies into one
// self-contained file (scripts/bundle-mathjax.mjs). A CDN that builds each
// `mathjax-full` subpath on its own — esm.sh does — would otherwise give the
// engine a private copy of MathJax's core per subpath: the handler registry
// and the node classes the TeX input and the SVG output test with
// `instanceof` would not be shared, and every formula would fail. Keep the
// engine's MathJax imports here, and nowhere else.
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { HTMLHandler } from 'mathjax-full/js/handlers/html/HTMLHandler.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

/** What the engine needs from MathJax: a TeX → SVG converter over a
 *  DOM-free (lite) adaptor. */
export interface MathJaxConverter {
  document: {
    convert: (tex: string, options: {
      display: boolean;
      em: number;
      ex: number;
      containerWidth: number;
    }) => unknown;
  };
  adaptor: {
    outerHTML: (node: unknown) => string;
  };
  /** The TeX font's x-height in em (0.442): what one `ex` of MathJax's
   *  SVG sizes stands for. */
  xHeight: number;
}

export function createMathJaxConverter(): MathJaxConverter {
  const adaptor = liteAdaptor();
  // The document is built from the handler itself, not through
  // `mathjax.document()` and MathJax's global handler registry: nothing is
  // registered, so a page that runs MathJax of its own is left untouched.
  const handler = new HTMLHandler(adaptor);
  const tex = new TeX({ packages: AllPackages });
  const svg = new SVG({ fontCache: 'local', exFactor: 0.5 });
  const document = handler.create('', { InputJax: tex, OutputJax: svg });
  const xHeight = (svg as unknown as { font?: { params?: { x_height?: number } } }).font?.params?.x_height;
  return { document, adaptor, xHeight: typeof xHeight === 'number' && xHeight > 0 ? xHeight : 0.442 } as unknown as MathJaxConverter;
}
