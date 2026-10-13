// Replays a Knuth–Plass corpus (bench-layout.ts --kp-dump) in one process
// against the TypeScript breaker and the WebAssembly one, checks that each
// chooses the recorded breaks, and times them on the same calls.
//
//   bun rust/bench/replay.mjs [--proto <breakpoints.js>] <corpus.jsonl> …
//   node rust/bench/replay.mjs …
//
// --proto adds another build of the TypeScript breaker (a candidate change,
// e.g. #780's two-pass looseness) to the comparison.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadLineBreaker } from '../crates/wasm/js/linebreak.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let proto;
const corpora = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--proto') proto = args[++i];
  else corpora.push(args[i]);
}

const wasm = readFileSync(resolve(here, '../target/postext_wasm.opt.wasm'));
const impls = {
  'ts': (await import(pathToFileURL(resolve(here, process.env.TS_BREAKPOINTS ?? '../../packages/postext/dist/knuthPlass/breakpoints.js')).href)).computeBreakpoints,
  ...(proto ? { 'ts two-pass': (await import(pathToFileURL(resolve(proto)).href)).computeBreakpoints } : {}),
  'wasm single': await loadLineBreaker(wasm, { single: true }),
  'wasm two-pass': await loadLineBreaker(wasm),
};

/** A recorded call back as the TypeScript breaker takes it. */
function revive(line) {
  const { items, options, breaks } = JSON.parse(line);
  const kp = items.map(([kind, width, stretch, shrink, penalty, flags, chars, postWidth, postChars, postShift]) => {
    const sourceIndex = flags & 8 ? 0 : -1;
    if (kind === 0) return { type: 'box', width, sourceIndex, chars, ...(flags & 4 ? { noTracking: true } : {}), ...(flags & 16 ? { stretch } : {}) };
    if (kind === 1) return { type: 'glue', width, stretch, shrink, sourceIndex };
    return { type: 'penalty', width, penalty, flagged: !!(flags & 1), ...(flags & 2 ? { zoned: true } : {}), sourceIndex, chars, postWidth, postChars, postShift };
  });
  const { widths, ...rest } = options;
  const last = widths.length - 1;
  return { items: kp, options: { ...rest, lineWidth: (l) => widths[Math.min(l, last)] }, breaks };
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

for (const path of corpora) {
  const calls = readFileSync(path, 'utf8').split('\n').filter(Boolean).map(revive);
  const results = {};
  for (const [name, fn] of Object.entries(impls)) {
    const times = [];
    let out;
    for (let round = 0; round < 2; round++) {
      const t0 = performance.now();
      out = calls.map((c) => fn(c.items, c.options));
      times.push(performance.now() - t0);
    }
    results[name] = out;
    const differ = out.filter((b, i) => !same(b, calls[i].breaks)).length;
    console.log(`${path.split('/').pop()} ${name.padEnd(14)} first ${times[0].toFixed(0).padStart(6)} ms, warm ${times[1].toFixed(0).padStart(6)} ms; differ from recorded: ${differ}/${calls.length}`);
  }
  if (results['ts two-pass']) {
    const d = results['ts two-pass'].filter((b, i) => !same(b, results['wasm two-pass'][i])).length;
    console.log(`  ts two-pass vs wasm two-pass: ${d} calls differ`);
  }
}
