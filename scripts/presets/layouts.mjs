#!/usr/bin/env node
// Ship the pagination of the public showcase bundles.
//
//   node scripts/presets/layouts.mjs [--base http://localhost:3107] [--verify] [preset[:lang] …]
//
// Opens every edition of every bundle in apps/web/public/presets in a
// headless Sandbox (a fresh browser profile each), waits until the
// paginator has laid out every chapter (`data-postext-pagination="done"` on
// the root element), reads the chapter records it stored in IndexedDB and
// writes them to the bundle as `layouts.<locale>.json` — the file the
// Sandbox reads when it opens the bundle (`presets/bundle.ts`), so a book
// opens paginated at once. Then refreshes the bundle's `fingerprint.json`.
//
// The records are stamped with the engine (`postext` version + record
// format), the configuration and the resources they were laid out with, so
// they go stale on a release: run this after raising `postext` to the
// version the release will publish (the release publishes a version raised
// by hand as-is). `--verify` writes nothing: it opens each edition again and
// fails when the Sandbox lays out any chapter instead of taking the shipped
// record.
//
// Needs the web app serving this checkout (`next dev -p 3107`, the
// `web-only` launch entry) and Google Chrome.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRESETS = join(ROOT, 'apps/web/public/presets');
const require = createRequire(join(ROOT, 'apps/web/package.json'));
const puppeteer = require('puppeteer-core');

const RECORD_FORMAT = Number(/const RECORD_FORMAT = (\d+);/.exec(readFileSync(join(ROOT, 'packages/postext-sandbox/src/book/layoutKeys.ts'), 'utf8'))[1]);
const ENGINE_VERSION = JSON.parse(readFileSync(join(ROOT, 'packages/postext/package.json'), 'utf8')).version;
const ENGINE_KEY = `${ENGINE_VERSION}/${RECORD_FORMAT}`;

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const [, value] = args.splice(at, 2);
  return value;
};
const BASE = flag('--base') ?? 'http://localhost:3107';
const VERIFY = args.includes('--verify') ? (args.splice(args.indexOf('--verify'), 1), true) : false;
const ONLY = args; // preset or preset:lang
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** The longest one edition may take to paginate (ms). */
const TIMEOUT_MS = 30 * 60_000;

/** `postext/bundle`'s slugify: preset chapter ids are derived from it. */
const slugify = (input) => input.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
const chapterId = (presetId, file) => `preset-chapter:${presetId}:${slugify(file)}`;

/** Every edition of the index: preset id, directory, locale, chapter files. */
function editions() {
  const index = JSON.parse(readFileSync(join(PRESETS, 'index.json'), 'utf8'));
  const out = [];
  for (const entry of index.presets) {
    const manifest = JSON.parse(readFileSync(join(PRESETS, entry.dir, 'preset.json'), 'utf8'));
    const byLang = Array.isArray(manifest.chapters)
      ? { [manifest.locale ?? entry.locale]: manifest.chapters }
      : manifest.chapters;
    for (const [lang, chapters] of Object.entries(byLang)) {
      if (ONLY.length && !ONLY.includes(entry.id) && !ONLY.includes(`${entry.id}:${lang}`)) continue;
      out.push({ id: manifest.id, dir: join(PRESETS, entry.dir), lang, files: chapters.map((c) => c.file) });
    }
  }
  return out;
}

/** Every chapter record the Sandbox stored, by chapter id. */
const readRecords = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const open = indexedDB.open('postext-sandbox');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('layouts')) { db.close(); resolve({}); return; }
    const req = db.transaction('layouts', 'readonly').objectStore('layouts').getAll();
    req.onsuccess = () => {
      db.close();
      resolve(Object.fromEntries(req.result.map((r) => [r.chapterId, r])));
    };
    req.onerror = () => reject(req.error);
  };
}));

/** JSON with sorted object keys: a record read back from IndexedDB keeps
 *  the order it was written in. */
const stable = (value) => JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  : v));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Open one edition in a fresh profile and wait until every chapter has a
 *  current record. Returns the records in book order. */
async function paginate(edition) {
  const profile = mkdtempSync(join(tmpdir(), 'postext-layouts-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: profile,
    args: ['--no-first-run', '--window-size=1600,1000'],
    protocolTimeout: TIMEOUT_MS,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => { if (msg.type() === 'error' && /Paginator|Layout error/.test(msg.text())) errors.push(msg.text()); });
    // The PDF tab lays nothing out until asked: every chapter goes through
    // the paginator, in book order.
    const url = `${BASE}/en/sandbox#preset=${encodeURIComponent(edition.id)}&lang=${encodeURIComponent(edition.lang)}&view=pdf&chapter=1`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    const ids = edition.files.map((f) => chapterId(edition.id, f));
    const started = Date.now();
    let doneSince = 0;
    let last = '';
    // How many records the first snapshot holding any had: all of them
    // when the Sandbox took the bundle's, one at a time when it lays the
    // chapters out.
    let firstCount = 0;
    for (;;) {
      if (Date.now() - started > TIMEOUT_MS) throw new Error(`timed out (${last})`);
      await sleep(1000);
      const state = await page.evaluate(() => document.documentElement.dataset.postextPagination ?? 'absent').catch(() => 'absent');
      const records = await readRecords(page).catch(() => ({}));
      const current = ids.filter((id) => records[id]?.engine === ENGINE_KEY);
      if (!firstCount) firstCount = current.length;
      const status = `${state} ${current.length}/${ids.length}`;
      if (status !== last) {
        process.stdout.write(`\r  ${edition.id}:${edition.lang} ${status} ${Math.round((Date.now() - started) / 1000)} s   `);
        last = status;
      }
      if (state === 'done' && current.length === ids.length) {
        // The records are saved a moment after the last layout lands, and
        // a chapter printing the contents may be laid out once more.
        if (!doneSince) doneSince = Date.now();
        if (Date.now() - doneSince > 4000) {
          const keys = new Set(current.map((id) => `${records[id].configKey}|${records[id].resourcesKey}`));
          if (keys.size !== 1) throw new Error(`records of several configurations: ${[...keys].join(', ')}`);
          process.stdout.write('\n');
          if (errors.length) console.warn(`  page errors:\n    ${errors.join('\n    ')}`);
          return { records: ids.map((id) => records[id]), seconds: Math.round((Date.now() - started) / 1000), takenWhole: firstCount === ids.length };
        }
      } else doneSince = 0;
    }
  } finally {
    await browser.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

/** The bundle's `fingerprint.json`, written by the showcase builders'
 *  own helper (`_common.write_fingerprint`), so the Sandbox reloads it. */
function refreshFingerprint(dir) {
  execFileSync('python3', ['-c', 'import sys; sys.path.insert(0, sys.argv[1]); import _common; _common.write_fingerprint(sys.argv[2])', join(ROOT, 'scripts/presets/showcase'), dir], { stdio: 'inherit' });
}

const list = editions();
console.log(`engine ${ENGINE_KEY}, ${list.length} editions${VERIFY ? ' (verify)' : ''}`);
const touched = new Set();
const failures = [];
for (const edition of list) {
  let result;
  try {
    result = await paginate(edition);
  } catch (err) {
    process.stdout.write('\n');
    failures.push(`${edition.id}:${edition.lang}: ${err.message}`);
    console.error(`  ${edition.id}:${edition.lang} failed: ${err.message}`);
    continue;
  }
  const { records, seconds, takenWhole } = result;
  const pages = records.reduce((n, r) => n + r.leadingBlankPages + r.pageCount, 0);
  console.log(`  ${edition.id}:${edition.lang}: ${records.length} chapters, ${pages} pages, ${seconds} s`);
  const { configKey, resourcesKey } = records[0];
  const chapters = {};
  records.forEach((r, i) => {
    const { chapterId: _id, markdown: _md, configKey: _c, resourcesKey: _r, engine: _e, ...rest } = r;
    chapters[edition.files[i]] = rest;
  });
  const file = { version: 1, engine: ENGINE_KEY, configKey, resourcesKey, chapters };
  const path = join(edition.dir, `layouts.${edition.lang}.json`);
  if (VERIFY) {
    // The Sandbox took the shipped records when it ends where they say.
    let shipped = null;
    try { shipped = JSON.parse(readFileSync(path, 'utf8')); } catch { /* missing */ }
    const same = (a, b) => stable(a) === stable(b);
    const differ = !shipped ? edition.files : edition.files.filter((f) => !same(shipped.chapters?.[f], chapters[f]));
    if (shipped && !takenWhole) failures.push(`${edition.id}:${edition.lang}: the Sandbox laid the chapters out instead of taking the shipped records`);
    if (!shipped || shipped.engine !== ENGINE_KEY || shipped.configKey !== configKey || shipped.resourcesKey !== resourcesKey || differ.length) {
      failures.push(`${edition.id}:${edition.lang}: ${!shipped ? 'no layouts file' : `stamps ${shipped.engine}/${shipped.configKey}/${shipped.resourcesKey} vs ${ENGINE_KEY}/${configKey}/${resourcesKey}, ${differ.length} chapters differ`}`);
    }
    continue;
  }
  writeFileSync(path, JSON.stringify(file));
  touched.add(edition.dir);
}

for (const dir of touched) refreshFingerprint(dir);

if (failures.length) {
  console.error(`\n${failures.length} failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
