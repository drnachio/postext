// The tape of a placement pass must name everything the pass changes
// (#1639, `packages/postext/src/pipeline/build/passTape.ts`). This reads
// the pass's factories (the functions under `pipeline/build/pass/` that
// hand back closures, and `placeDocumentPass`) and lists the bindings
// declared at the top of each that can hold state: every `let`, and every
// `const` bound to a collection or an object literal. Each must be handed
// to the tape in its file (`passTape().track(…)` or `.variable(…)`) or be
// listed below with the reason it never changes while blocks are placed.
//
//   node scripts/pass-tape.mjs --check     fail when one is neither
//   node scripts/pass-tape.mjs             list them all
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(join(repo, 'packages/postext/package.json'))('typescript');
const root = join(repo, 'packages/postext/src/pipeline/build');

/** Bindings that hold no state of the pass, by `file:name`. */
export const FIXED = {
  // Constants and what the setup works out once.
  'pass/floats/citationPull.ts:CROP_SHARES': 'a constant',
  'pass.ts:trackingLadder': 'filled before the first block',
  'pass.ts:hyphenationRules': 'read from the configuration',
  'pass/setup/pageSetup.ts:physicalFrames': 'the page geometry',
  'pass/setup/pageSetup.ts:verticalFrames': 'the page geometry',
  'pass/setup/contentSetup.ts:resourceIds': 'filled by the setup',
  'pass/setup/contentSetup.ts:templateSource': 'filled by the setup',
  'pass/setup/contentSetup.ts:resourceById': 'filled by the setup',
  'pass/setup/contentSetup.ts:resourceTypeById': 'filled by the setup',
  'pass/setup/contentSetup.ts:resourceNumberById': 'filled by the setup',
  'pass/setup/contentSetup.ts:figureLabelsById': 'filled by the setup',
  'pass/setup/contentSetup.ts:syntheticBoxes': 'filled by the setup',
  'pass/setup/contentSetup.ts:exerciseBoxIds': 'filled by the setup',
  'pass/setup/contentSetup.ts:containerStyles': 'set by the setup',
  'pass/setup/contentSetup.ts:incorporated': 'filled by the setup',
  'pass/setup/contentSetup.ts:floatsByFirstBlock': 'filled by the setup',
  'pass/floats/floatFlush.ts:floatPlanOrder': 'filled when the factory is made',
  'pass/floats/floatFlush.ts:citingHeadsByPage': 'filled from the hints when the factory is made',
  'pass/notes.ts:measureCtx': 'a measuring context, its fields fixed',
  'pass/callouts/calloutCommit.ts:framePass': 'the pass as a box sees it, its fields fixed',
  'pass/composed.ts:composedMemo': 'what the memo of composed pages reads of the pass, its fields fixed',
  // Memos whose answer depends on their key alone.
  'pass/setup/pageSetup.ts:freshFlowColumnsOf': 'the key of the memo below',
  'pass/setup/pageSetup.ts:freshFlowColumns': 'a memo by the geometry in force',
  'pass/sections.ts:sectionMeasureCtxs': 'a memo by section style',
  'pass/notes.ts:noteMeasures': 'a memo by note and width, its answers never written to',
  // The loop's own variable, set at every block.
  'pass.ts:dieAt': 'set at the top of every block',
  // Made once the blocks are placed.
  'pass/setup/passFinish.ts:unplaced': 'made by the pass finish',
  'pass/setup/passFinish.ts:incorporated': 'made by the pass finish',
  'pass/setup/passFinish.ts:ruleNotes': 'made by the pass finish',
};

const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) files.push(p);
  }
};
walk(join(root, 'pass'));
files.push(join(root, 'pass.ts'));

const stateKind = (init) => {
  if (!init) return null;
  if (ts.isNewExpression(init) && /^(Map|Set|WeakMap|WeakSet|Array)$/.test(init.expression.getText())) return init.expression.getText();
  if (ts.isArrayLiteralExpression(init)) return 'array';
  if (ts.isObjectLiteralExpression(init)) return 'object';
  return null;
};

/** A function whose bindings outlive its call: the pass itself, a factory
 *  by name, or any function that hands back a function or an object (its
 *  closures then hold what it declared). */
function isFactory(fn) {
  if (/^(create|place|with|make)[A-Z]/.test(fn.name.text)) return true;
  return fn.body.statements.some((st) => ts.isReturnStatement(st) && st.expression
    && (ts.isArrowFunction(st.expression) || ts.isFunctionExpression(st.expression) || ts.isObjectLiteralExpression(st.expression)));
}

/** Every state binding: `{ file, factory, name, kind, end }` (`end`: where
 *  its statement ends in the file). */
export function passBindings() {
  const rows = [];
  for (const file of files.sort()) {
    const text = readFileSync(file, 'utf8');
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const rel = relative(root, file);
    const report = (factory, statements) => {
      for (const st of statements) {
        if (!ts.isVariableStatement(st)) continue;
        const isLet = (st.declarationList.flags & ts.NodeFlags.Let) !== 0;
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name)) continue;
          const kind = isLet ? 'let' : stateKind(d.initializer);
          if (kind) rows.push({ file: rel, factory, name: d.name.text, kind, end: st.end, text });
        }
      }
    };
    report('(module)', src.statements);
    for (const st of src.statements) {
      if (ts.isFunctionDeclaration(st) && st.name && st.body && isFactory(st)) report(st.name.text, st.body.statements);
    }
  }
  return rows;
}

/** Whether `name` is handed to the tape in `text`: a member of a
 *  `track(…, { … })` literal, or named by a `variable('….name', …)`. */
function onTape(text, name) {
  for (const m of text.matchAll(/\.track\(\s*'[^']*',\s*\{([^}]*)\}/g)) {
    if (m[1].split(',').some((part) => part.trim().split(':')[0].trim() === name)) return true;
  }
  return new RegExp(`\\.variable\\(\\s*'[^']*\\b${name}'`).test(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = passBindings();
  const missing = rows.filter((r) => !(`${r.file}:${r.name}` in FIXED) && !onTape(r.text, r.name));
  const stale = Object.keys(FIXED).filter((key) => !rows.some((r) => `${r.file}:${r.name}` === key));
  if (!process.argv.includes('--check')) {
    for (const r of rows) console.log(`${r.file}\t${r.factory}\t${r.kind}\t${r.name}\t${`${r.file}:${r.name}` in FIXED ? 'fixed' : onTape(r.text, r.name) ? 'tape' : 'MISSING'}`);
  }
  for (const r of missing) console.error(`::error file=packages/postext/src/pipeline/build/${r.file}::${r.name} (${r.kind}, in ${r.factory}) holds state of the pass and is not on its tape: add it to passTape().track(…) or list it in scripts/pass-tape.mjs with the reason it never changes`);
  for (const key of stale) console.error(`::error::scripts/pass-tape.mjs lists ${key}, which is no longer declared`);
  console.log(`${rows.length} bindings, ${missing.length} not on the tape, ${stale.length} stale`);
  if (process.argv.includes('--check') && (missing.length > 0 || stale.length > 0)) process.exit(1);
}
