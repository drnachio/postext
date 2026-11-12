// #1539: `postext import-idml` reads a zipped InDesign package (the folder
// File › Package makes, zipped: the .idml, `Document fonts/`, `Links/`),
// as the Sandbox does since #1538. Here: which document, and what is refused.
import { describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MAIN = resolve(import.meta.dir, '..', 'main.ts');
const cmd = process.env.POSTEXT_BIN ? [resolve(process.env.POSTEXT_BIN)] : [process.execPath, MAIN];
const POSTEXT = resolve(import.meta.dir, '..', '..', '..', 'postext');

// fflate, from postext (the CLI does not depend on it).
const { zipSync } = await import(Bun.resolveSync('fflate', POSTEXT)) as {
  zipSync: (f: Record<string, Uint8Array>) => Uint8Array;
};

function run(args: string[], cwd: string) {
  const r = Bun.spawnSync([...cmd, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', POSTEXT_CACHE_DIR: join(cwd, '.cache') } });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

const square = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="${fill}"/></svg>`;

describe('postext import-idml with a zipped package', () => {
  it('asks which document when there are several, and refuses a package with no IDML', () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-cli-'));
    // The choice is made before any document is read.
    const idml = new TextEncoder().encode('no IDML read');
    writeFileSync(join(dir, 'two.zip'), zipSync({ 'Book Folder/Book.idml': idml, 'Other/Other.idml': idml, 'Book Folder/Links/sq.svg': new TextEncoder().encode(square('#c00')) }));
    const ask = run(['import-idml', 'two.zip', '-o', 'x'], dir);
    expect(ask.code).toBe(2);
    expect(ask.stderr).toContain('--document');
    expect(ask.stderr).toContain('Book Folder/Book.idml');
    expect(ask.stderr).toContain('Other/Other.idml');
    expect(run(['import-idml', 'two.zip', '--document', 'Nowhere.idml', '-o', 'x'], dir).code).toBe(2);
    // --document is for a package only.
    writeFileSync(join(dir, 'bare.idml'), idml);
    expect(run(['import-idml', 'bare.idml', '--document', 'Book.idml', '-o', 'x'], dir).code).toBe(2);

    // A package with the .indd alone says how to get the IDML.
    writeFileSync(join(dir, 'indd.zip'), zipSync({ 'Book Folder/Book.indd': new Uint8Array([0x06, 0x06, 0xed, 0xf5, 0, 0, 0, 0]), 'Book Folder/Links/sq.svg': new TextEncoder().encode(square('#c00')) }));
    const indd = run(['import-idml', 'indd.zip', '-o', 'x'], dir);
    expect(indd.code).toBe(1);
    expect(indd.stderr).toContain('Book Folder/Book.indd');
    expect(indd.stderr).toContain('Include IDML');
  }, 60_000);
});
