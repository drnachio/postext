#!/usr/bin/env node
// Bundles the math engine's MathJax module (src/math/mathjax.ts) and every
// MathJax file it reaches into one self-contained ES module, written over
// the tsc output at dist/math/mathjax.js. Run by `pnpm build`, after tsc.
//
// Why: a CDN such as esm.sh builds each `mathjax-full/js/...` subpath as its
// own bundle, each with a private copy of MathJax's core (the handler
// registry, the MathML node classes checked with `instanceof`). Imported
// piece by piece from there, the engine could not render a single formula.
// Shipped as one module, there is one copy wherever postext is loaded from.
// That is also why `mathjax-full` is a devDependency: the published package
// carries only this bundle.
//
// The bundle is also made safe for Fast Refresh dev servers; see
// hideHookLikeCalls below.
//
// MathJax and mhchemParser are Apache-2.0: the bundle carries their notices
// in its banner, and dist/math/THIRD_PARTY_LICENSES.txt, written next to it,
// carries the licence text itself (the published package ships `dist` only).
//
//   node scripts/bundle-mathjax.mjs            write dist/math/mathjax.js and its licences
//   node scripts/bundle-mathjax.mjs --stdout   print the bundle instead
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { parseAst } from 'rolldown/parseAst';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

/** The file name of the licence notice written next to the bundle. */
export const LICENSES_FILE = 'THIRD_PARTY_LICENSES.txt';

/** Where the two bundled packages live, with their versions. */
function bundledPackages() {
  const mathjaxDir = dirname(require.resolve('mathjax-full/package.json'));
  const mhchemDir = dirname(require.resolve('mhchemparser/package.json', { paths: [mathjaxDir] }));
  return {
    mathjax: { dir: mathjaxDir, version: require(join(mathjaxDir, 'package.json')).version },
    mhchem: { dir: mhchemDir, version: require(join(mhchemDir, 'package.json')).version },
  };
}

function banner() {
  const { mathjax, mhchem } = bundledPackages();
  return [
    '/*!',
    ' * postext math engine: MathJax, bundled into one module (scripts/bundle-mathjax.mjs).',
    ` * MathJax ${mathjax.version} (mathjax-full), Copyright (c) The MathJax Consortium,`,
    ' *   Apache License 2.0, https://github.com/mathjax/MathJax-src',
    ` * mhchemParser ${mhchem.version}, Copyright (c) Martin Hensel,`,
    ' *   Apache License 2.0, https://github.com/mhchem/mhchemParser',
    ' * Changed: bundled into one module, minified, and method calls named like',
    ' *   React hooks written as computed member calls.',
    ` * Licence text: ${LICENSES_FILE}, next to this file.`,
    ' */',
  ].join('\n');
}

/** The first `Copyright (c) …` line of a source file, trimmed. */
async function copyrightOf(file) {
  const text = await readFile(file, 'utf8');
  const line = /Copyright \(c\)[^\n]*/.exec(text)?.[0].trim();
  if (!line) throw new Error(`bundle-mathjax: no copyright line in ${file}`);
  return line;
}

/**
 * The notice shipped next to the bundle: what it contains, each package's
 * copyright, what was changed, and the Apache License 2.0 in full (taken
 * from mathjax-full's own LICENSE file) — Apache-2.0 §4 (a)–(c).
 */
export async function thirdPartyLicenses() {
  const { mathjax, mhchem } = bundledPackages();
  const licence = (await readFile(join(mathjax.dir, 'LICENSE'), 'utf8')).replace(/^\s*\n/, '');
  if (!licence.includes('Apache License') || !licence.includes('Version 2.0')) {
    throw new Error('bundle-mathjax: mathjax-full/LICENSE is not the Apache License 2.0');
  }
  const mhchemLicence = JSON.parse(await readFile(join(mhchem.dir, 'package.json'), 'utf8')).license;
  if (mhchemLicence !== 'Apache-2.0') throw new Error(`bundle-mathjax: mhchemparser is ${mhchemLicence}, not Apache-2.0`);
  return [
    'Third-party code in postext',
    '===========================',
    '',
    'dist/math/mathjax.js bundles the following packages, each licensed under the',
    'Apache License, Version 2.0, reproduced in full below. The bundle is made by',
    'scripts/bundle-mathjax.mjs in the postext repository',
    '(https://github.com/drnachio/postext): the packages\' modules are bundled into',
    'one ES module and minified, and method calls named like React hooks',
    '(`x.useLocalID(…)`) are written as computed member calls (x[`useLocalID`](…)).',
    '',
    `MathJax ${mathjax.version} (npm package mathjax-full)`,
    `  ${await copyrightOf(join(mathjax.dir, 'ts/mathjax.ts'))}`,
    '  https://github.com/mathjax/MathJax-src',
    '',
    `mhchemParser ${mhchem.version} (npm package mhchemparser)`,
    `  ${await copyrightOf(join(mhchem.dir, 'src/mhchemParser.ts'))}`,
    '  https://github.com/mhchem/mhchemParser',
    '',
    '-------------------------------------------------------------------------------',
    '',
    licence.trimEnd(),
    '',
  ].join('\n');
}

/** React Refresh's test for a hook name. */
const HOOK_NAME = /^use[A-Z]/;

/**
 * Rewrites every method call whose name looks like a React hook
 * (`x.useLocalID(…)`) into the equivalent computed call
 * (x[`useLocalID`](…)), and throws on a plain `useThing(…)` call, which
 * cannot be rewritten safely.
 *
 * Why: a dev server with Fast Refresh (Next.js with Turbopack, Vite)
 * transforms a linked workspace package like app code. React Refresh takes
 * any call to a `use[A-Z]…` function or method for a hook call and wraps the
 * calling function in a refresh signature, `_s(function …)`. Inside a Web
 * Worker, Turbopack's signature stub returns undefined, so MathJax's
 * `typesetSVG` (which calls `this.fontCache.useLocalID(…)`) became
 * undefined in the layout worker and every formula failed. React Refresh
 * does not look at computed member calls.
 */
export function hideHookLikeCalls(code) {
  const edits = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      if (callee.type === 'Identifier' && HOOK_NAME.test(callee.name)) {
        throw new Error(`bundle-mathjax: a call to ${callee.name}() would be taken for a React hook by Fast Refresh dev servers`);
      }
      if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier'
        && HOOK_NAME.test(callee.property.name)) {
        const { name, start, end } = callee.property;
        // Replace the `.name` (or `?.name`) itself, found back from the
        // property: the object may end in a parenthesis its node leaves out.
        let dot = start - 1;
        while (dot > 0 && /\s/.test(code[dot])) dot--;
        if (code.slice(start, end) !== name || code[dot] !== '.') {
          throw new Error(`bundle-mathjax: cannot rewrite the call to .${name}() at offset ${start}`);
        }
        const optional = code[dot - 1] === '?';
        edits.push({ start: optional ? dot - 1 : dot, end, text: `${optional ? '?.' : ''}[\`${name}\`]` });
      }
    }
    for (const key in node) {
      if (key !== 'type' && key !== 'start' && key !== 'end') visit(node[key]);
    }
  };
  visit(parseAst(code));
  let out = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

/** The bundle's source code. */
export async function bundleMathJax() {
  const build = await rolldown({
    input: join(root, 'src/math/mathjax.ts'),
    platform: 'neutral',
    logLevel: 'warn',
  });
  try {
    const { output } = await build.generate({ format: 'esm', minify: true, banner: banner() });
    if (output.length !== 1 || output[0].type !== 'chunk') {
      throw new Error(`expected one chunk, got ${output.map((o) => o.fileName).join(', ')}`);
    }
    return hideHookLikeCalls(output[0].code);
  } finally {
    await build.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const code = await bundleMathJax();
  if (process.argv.includes('--stdout')) {
    process.stdout.write(code);
  } else {
    const out = join(root, 'dist/math/mathjax.js');
    await writeFile(out, code);
    // tsc's source map describes the unbundled module.
    await rm(`${out}.map`, { force: true });
    await writeFile(join(root, 'dist/math', LICENSES_FILE), await thirdPartyLicenses());
    console.log(`bundle-mathjax: dist/math/mathjax.js ${(code.length / 1024).toFixed(0)} KB, with dist/math/${LICENSES_FILE}`);
  }
}
