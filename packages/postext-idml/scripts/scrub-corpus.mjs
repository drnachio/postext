// Turns the packages the corpus generators wrote (`corpus/*.jsx`, run in
// InDesign) into fixtures: every `file:` link is rewritten to a neutral
// place, and a package that still names the machine it was made on is
// refused.
//
//   node scripts/scrub-corpus.mjs <folder of .idml> [src/__fixtures__/corpus]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const [from, to = 'src/__fixtures__/corpus'] = process.argv.slice(2);
if (!from) {
  console.error('usage: node scripts/scrub-corpus.mjs <folder of .idml> [output folder]');
  process.exit(2);
}
const NEUTRAL = 'file:/Volumes/Work/corpus/';
// A `file:` address up to the character that ends it in XML.
const FILE_URI = /file:[^"'<>\s]{1,2000}/g;
const user = userInfo().username.toLowerCase();
const LOCAL = [/\/Users\//i, /\/private\//i, /\/home\//i, /[A-Za-z]:\\\\?Users/i, /\/var\/folders\//i];

mkdirSync(to, { recursive: true });
let failed = false;
for (const name of readdirSync(from).filter((f) => f.endsWith('.idml')).sort()) {
  const files = unzipSync(new Uint8Array(readFileSync(join(from, name))));
  const out = {};
  let rewritten = 0;
  const left = [];
  for (const [path, bytes] of Object.entries(files)) {
    if (!/\.(xml|txt)$/i.test(path) && path !== 'mimetype') {
      out[path] = bytes;
      continue;
    }
    let text = strFromU8(bytes);
    text = text.replace(FILE_URI, (uri) => {
      rewritten++;
      let last = uri.slice(uri.lastIndexOf('/') + 1);
      try {
        last = decodeURIComponent(last);
      } catch {
        // kept as written
      }
      return NEUTRAL + encodeURIComponent(basename(last));
    });
    const lower = text.toLowerCase();
    if (LOCAL.some((re) => re.test(text)) || (user.length > 2 && lower.includes(user))) left.push(path);
    out[path] = strToU8(text);
  }
  if (left.length) {
    console.error(`${name}: still names a local path or the user in ${left.join(', ')}`);
    failed = true;
    continue;
  }
  // The media type first and stored, as a reader of the package expects.
  const { mimetype, ...rest } = out;
  const zipped = zipSync({ mimetype: [mimetype, { level: 0 }], ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, [v, { level: 9 }]])) }, { mtime: new Date(1980, 0, 1) });
  writeFileSync(resolve(to, name), zipped);
  console.log(`${name}: ${Object.keys(out).length} parts, ${rewritten} links rewritten, ${zipped.length} bytes`);
}
process.exit(failed ? 1 : 0);
