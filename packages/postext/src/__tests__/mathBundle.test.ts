import { describe, it, expect } from 'vitest';
import { transformSync } from 'rolldown/experimental';
// @ts-expect-error -- plain-JS build script, no type declarations
import { bundleMathJax, hideHookLikeCalls, LICENSES_FILE, thirdPartyLicenses } from '../../scripts/bundle-mathjax.mjs';

interface Converter {
  document: { convert(tex: string, options: object): unknown };
  adaptor: { outerHTML(node: unknown): string };
}

// Bundling takes a few seconds: every test shares one build.
let bundle: Promise<string> | null = null;
const bundled = (): Promise<string> => (bundle ??= bundleMathJax() as Promise<string>);

/** The code a Fast Refresh dev server (Turbopack, Vite) runs for `code`. */
const withReactRefresh = (code: string): string =>
  transformSync('mathjax.js', code, { lang: 'js', jsx: { refresh: true } }).code;

// `pnpm build` ships the math engine's MathJax module pre-bundled. A CDN
// that builds each `mathjax-full` subpath on its own (esm.sh) must find no
// MathJax import left in it to split, or formulas fail there.
describe('bundled MathJax module (scripts/bundle-mathjax.mjs)', () => {
  it('is one self-contained ES module that renders TeX to SVG', async () => {
    const code = await bundled();
    // No import, dynamic import or require of anything: MathJax, mhchem and
    // the handler all live in this one file.
    expect(code).not.toMatch(/\bimport\s*[\s{*("'`]/);
    expect(code).not.toMatch(/\brequire\s*\(\s*["'`]/);
    expect(code).toContain('Apache License 2.0');
    const mod = (await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`)) as {
      createMathJaxConverter(): Converter;
    };
    const { document, adaptor } = mod.createMathJaxConverter();
    const svg = adaptor.outerHTML(document.convert('\\frac{a}{b}+\\ce{H2O}', { display: true, em: 16, ex: 8, containerWidth: 1280 }));
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('merror');
    expect((svg.match(/<(path|use|rect)\b/g) ?? []).length).toBeGreaterThan(4);
  }, 60_000);

  // A dev server with Fast Refresh transforms a linked workspace package
  // like app code. It takes any call to a `use[A-Z]…` method for a React
  // hook and wraps the calling function in a refresh signature; inside the
  // layout Web Worker, Turbopack's signature stub returns undefined, so
  // MathJax's `typesetSVG` (which calls `fontCache.useLocalID(…)`) vanished
  // and every formula failed with "this.typesetSVG is not a function".
  it('makes no call a Fast Refresh transform would take for a React hook', async () => {
    const code = await bundled();
    // (Matches, not the code, so a failure prints the offending calls only.)
    expect(code.match(/\.use[A-Z][\w$]*\s*\(/g) ?? []).toEqual([]);
    expect(code.match(/(?<![\w$.])use[A-Z][\w$]*\s*\(/g) ?? []).toEqual([]);
    expect(withReactRefresh(code).match(/\$RefreshSig\$/g) ?? []).toEqual([]);
  }, 60_000);
});

// MathJax and mhchemParser are Apache-2.0 and the published package ships
// `dist` only: the licence text travels next to the bundle (§4 a–c).
describe('the bundle\'s third-party licences', () => {
  it('names each bundled package with its copyright and carries the Apache License 2.0 in full', async () => {
    const text = (await thirdPartyLicenses()) as string;
    expect(LICENSES_FILE).toBe('THIRD_PARTY_LICENSES.txt');
    expect(text).toMatch(/MathJax 3\.\d+\.\d+ \(npm package mathjax-full\)\n {2}Copyright \(c\) [\d-]+ The MathJax Consortium/);
    expect(text).toMatch(/mhchemParser 4\.\d+\.\d+ \(npm package mhchemparser\)\n {2}Copyright \(c\) [\d-]+ Martin Hensel/);
    expect(text).toContain('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION');
    expect(text).toContain('END OF TERMS AND CONDITIONS');
    // The bundle points at it.
    expect(await bundled()).toContain(`Licence text: ${LICENSES_FILE}, next to this file.`);
  }, 60_000);
});

describe('hideHookLikeCalls', () => {
  it('turns hook-like method calls into computed calls and leaves everything else alone', () => {
    const src = [
      'var a={useIC:!0};',
      'a.p.useNode=function(e){return e};',
      'function f(e){return this.fontCache.useLocalID(e),this.useNode(e),e?.useNode(1),(e||a).useNode(2)}',
      'var s=".useNode(",t=`x.useLocalID()`;',
      'a.user(1),a.use(2);',
    ].join('');
    const out = hideHookLikeCalls(src) as string;
    expect(out).toBe([
      'var a={useIC:!0};',
      'a.p.useNode=function(e){return e};',
      'function f(e){return this.fontCache[`useLocalID`](e),this[`useNode`](e),e?.[`useNode`](1),(e||a)[`useNode`](2)}',
      'var s=".useNode(",t=`x.useLocalID()`;',
      'a.user(1),a.use(2);',
    ].join(''));
    expect(withReactRefresh(src)).toContain('$RefreshSig$');
    expect(withReactRefresh(out)).not.toContain('$RefreshSig$');
  });

  it('refuses a hook-like call it cannot rewrite', () => {
    expect(() => hideHookLikeCalls('function f(){return useThing(1)}')).toThrow(/useThing/);
  });
});
