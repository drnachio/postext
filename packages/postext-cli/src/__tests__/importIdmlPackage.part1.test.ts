// #1539: `postext import-idml` reads a zipped InDesign package (the folder
// File › Package makes, zipped: the .idml, `Document fonts/`, `Links/`),
// as the Sandbox does since #1538: the book takes the package's linked
// pictures and font files; --links and --font-dir come first.
import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const MAIN = resolve(import.meta.dir, '..', 'main.ts');
const cmd = process.env.POSTEXT_BIN ? [resolve(process.env.POSTEXT_BIN)] : [process.execPath, MAIN];
const POSTEXT = resolve(import.meta.dir, '..', '..', '..', 'postext');

// fflate, from postext (the CLI does not depend on it).
const { unzipSync, zipSync, strFromU8 } = await import(Bun.resolveSync('fflate', POSTEXT)) as {
  unzipSync: (b: Uint8Array) => Record<string, Uint8Array>;
  zipSync: (f: Record<string, Uint8Array>) => Uint8Array;
  strFromU8: (b: Uint8Array) => string;
};

function run(args: string[], cwd: string) {
  const r = Bun.spawnSync([...cmd, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', POSTEXT_CACHE_DIR: join(cwd, '.cache') } });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

interface Font { name: string; variants: { weight: number; style: string; file: string }[] }

const square = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="${fill}"/></svg>`;

/** Every file under `dir`, by its path from `dir`. */
function filesOf(dir: string, prefix = ''): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[prefix + relative(dir, p)] = new Uint8Array(readFileSync(p));
    }
  };
  walk(dir);
  return out;
}

describe('postext import-idml with a zipped package', () => {
  it('imports the package with its pictures and fonts; --links and --font-dir come first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-cli-'));
    mkdirSync(join(dir, 'ch'));
    mkdirSync(join(dir, 'res'));
    writeFileSync(join(dir, 'ch', '01.md'), '# One\n\nSome *text* with **weight**.\n');
    writeFileSync(join(dir, 'ch', '02.md'), '# Two\n\n::resource{id="sq"}\n');
    writeFileSync(join(dir, 'res', 'sq.svg'), square('#c00'));
    // The package as InDesign's File › Package lays it out, zipped.
    const made = run(['idml', 'ch', '--resources', 'res', '--images', 'link', '--fonts', '-o', 'pkg/Book.idml', '--offline', '-q'], dir);
    expect(made.code).toBe(0);
    const pkg = filesOf(join(dir, 'pkg'), 'Book Folder/');
    expect(Object.keys(pkg)).toContain('Book Folder/Links/sq.svg');
    expect(Object.keys(pkg).some((p) => p.startsWith('Book Folder/Document fonts/'))).toBe(true);
    writeFileSync(join(dir, 'package.zip'), zipSync(pkg));

    const r = run(['import-idml', 'package.zip', '-o', 'book.postext', '--no-auto-thumbnail', '--json'], dir);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.package.document).toBe('Book Folder/Book.idml');
    expect(data.package.links).toEqual(['sq.svg']);
    expect(data.package.fonts).toBeGreaterThan(0);
    expect(data.package.carriedFonts).toContain('EB Garamond');
    expect(data.missingLinks).toEqual([]);
    const book = unzipSync(new Uint8Array(readFileSync(join(dir, 'book.postext'))));
    expect(strFromU8(book['resources/sq.svg']!)).toContain('#c00');
    const regular = (preset: { fonts?: Font[] }) => preset.fonts?.find((f) => f.name === 'EB Garamond')?.variants.find((v) => v.weight === 400 && v.style === 'normal')?.file;
    const file = regular(JSON.parse(strFromU8(book['preset.json']!)))!;
    expect(file).toMatch(/^fonts\/ebgaramond-regular\.ttf$/i);
    expect(book[file]).toBeDefined();

    // --links and --font-dir come before the package's files.
    mkdirSync(join(dir, 'mine'));
    writeFileSync(join(dir, 'mine', 'sq.svg'), square('#00c'));
    mkdirSync(join(dir, 'fd'));
    const garamond = Object.keys(pkg).find((p) => /EBGaramond-Regular\.ttf$/.test(p))!;
    writeFileSync(join(dir, 'fd', 'Mine-Garamond.ttf'), pkg[garamond]!);
    const own = run(['import-idml', 'package.zip', '-o', 'own', '--links', 'mine', '--font-dir', 'fd', '--json'], dir);
    expect(own.code).toBe(0);
    expect(JSON.parse(own.stdout).package.links).toEqual([]);
    expect(readFileSync(join(dir, 'own', 'resources', 'sq.svg'), 'utf8')).toContain('#00c');
    const ownFile = regular(JSON.parse(readFileSync(join(dir, 'own', 'preset.json'), 'utf8')))!;
    expect(ownFile).toMatch(/^fonts\/mine-garamond\.ttf$/i);
    expect(readFileSync(join(dir, 'own', ownFile)).equals(Buffer.from(pkg[garamond]!))).toBe(true);

    // Two documents: --document names the one to import.
    writeFileSync(join(dir, 'two.zip'), zipSync({ ...pkg, 'Other/Other.idml': pkg['Book Folder/Book.idml']! }));
    const picked = run(['import-idml', 'two.zip', '--document', 'Book Folder/Book.idml', '-o', 'picked', '-q'], dir);
    expect(picked.code).toBe(0);
    expect(readFileSync(join(dir, 'picked', 'resources', 'sq.svg'), 'utf8')).toContain('#c00');
  }, 120_000);
});
