// `postext join <book> <part>` (#1727): a part of a book made apart joined
// to it, run from the sources (or POSTEXT_BIN) on bundles written here.
import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Resource } from 'postext';
import { createBundle, openBundleZip } from 'postext/bundle';
import { parseJoinChapters, parseJoinRenames } from '../commands/join';

const MAIN = resolve(import.meta.dir, '..', 'main.ts');
const cmd = process.env.POSTEXT_BIN ? [resolve(process.env.POSTEXT_BIN)] : [process.execPath, MAIN];

function run(args: string[], cwd: string) {
  const r = Bun.spawnSync([...cmd, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', POSTEXT_CACHE_DIR: join(cwd, '.cache') } });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed]);
const picture = (id: string, file: string): Resource => ({ id, typeId: 'figure', kind: 'bitmap', bitmap: { fileId: file, format: 'png', width: 10, height: 10 }, createdAt: 0, updatedAt: 0 } as Resource);

/** A book of chapters 1, 2 and 9, and a part with a corrected chapter 2 and
 *  a chapter 5 whose picture is named as the book's first chapter's. */
async function books(dir: string): Promise<void> {
  const book = await createBundle({
    name: 'Fisioterapia', locale: 'es', config: {},
    chapters: [
      { title: 'Uno', markdown: '# Uno\n\n::resource{id="fig-1-1"}\n' },
      { title: 'Dos', markdown: '# Dos\n\nTexto.\n' },
      { title: 'Columna lumbar', markdown: '# Columna lumbar {startAt=9}\n\nTexto.\n' },
    ],
    resources: [picture('fig-1-1', 'a')],
    files: { a: png(1) },
  });
  const part = await createBundle({
    name: 'Parte', locale: 'es', config: {},
    chapters: [
      { title: 'Dos, corregido', markdown: '# Dos {startAt=2}\n\nTexto corregido.\n' },
      { title: 'Muñeca y mano', markdown: '# Muñeca y mano {startAt=5}\n\n::resource{id="fig-1-1"}\n' },
    ],
    resources: [picture('fig-1-1', 'x')],
    files: { x: png(5) },
  });
  writeFileSync(join(dir, 'book.postext'), book.bytes);
  writeFileSync(join(dir, 'part.postext'), part.bytes);
}

describe('postext join', () => {
  it('reads --chapters and --rename', () => {
    expect(parseJoinChapters('replace, add:5,skip', [2, 5, null])).toEqual([{ action: 'replace', number: 2 }, { action: 'add', number: 5 }, { action: 'skip', number: 0 }]);
    expect(() => parseJoinChapters('add', [2, 5])).toThrow(/one entry per chapter/);
    expect(() => parseJoinChapters('move,add', [2, 5])).toThrow(/not add/);
    expect(parseJoinRenames(['fig-1-1=fig-5-1'])).toEqual({ 'fig-1-1': 'fig-5-1' });
    expect(() => parseJoinRenames(['fig-1-1'])).toThrow(/OLD=NEW/);
  });

  it('shows the plan, then joins the part in place', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-join-'));
    await books(dir);
    const before = readFileSync(join(dir, 'book.postext'));
    const dry = run(['join', 'book.postext', 'part.postext', '--dry-run', '--json'], dir);
    expect(dry.code).toBe(0);
    const plan = JSON.parse(dry.stdout) as { join: { choices: unknown; clashes: unknown } };
    expect(plan.join.choices).toEqual([{ action: 'replace', number: 2 }, { action: 'add', number: 5 }]);
    expect(plan.join.clashes).toEqual([{ id: 'fig-1-1', rename: 'fig-1-1-2' }]);
    expect(readFileSync(join(dir, 'book.postext'))).toEqual(before);

    const r = run(['join', 'book.postext', 'part.postext', '--rename', 'fig-1-1=fig-5-1'], dir);
    expect(r.code).toBe(0);
    const zip = openBundleZip(new Uint8Array(readFileSync(join(dir, 'book.postext'))));
    const manifest = JSON.parse(new TextDecoder().decode(zip.files.get('preset.json')!)) as { chapters: { title: string; file: string }[]; resources: { id: string; file: string }[] };
    expect(manifest.chapters.map((c) => c.file)).toEqual(['chapters/01-uno.md', 'chapters/02-dos.md', 'chapters/05-muneca-y-mano.md', 'chapters/09-columna-lumbar.md']);
    expect(new TextDecoder().decode(zip.files.get('chapters/02-dos.md')!)).toContain('Texto corregido.');
    expect(new TextDecoder().decode(zip.files.get('chapters/05-muneca-y-mano.md')!)).toContain('::resource{id="fig-5-1"}');
    const files = new Map(manifest.resources.map((x) => [x.id, x.file]));
    expect(zip.files.get(files.get('fig-1-1')!)).toEqual(png(1));
    expect(zip.files.get(files.get('fig-5-1')!)).toEqual(png(5));
  }, 60_000);

  it('refuses choices that do not fit, writing nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-join-'));
    await books(dir);
    const before = readFileSync(join(dir, 'book.postext'));
    const r = run(['join', 'book.postext', 'part.postext', '--chapters', 'add,add:9'], dir);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('the number is taken');
    expect(readFileSync(join(dir, 'book.postext'))).toEqual(before);
  }, 60_000);

  it('joins into an unpacked book folder and writes a new bundle with -o', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-join-'));
    await books(dir);
    expect(run(['unpack', 'book.postext', '-o', 'book'], dir).code).toBe(0);
    expect(run(['join', 'book', 'part.postext', '--chapters', 'skip,add'], dir).code).toBe(0);
    const manifest = JSON.parse(readFileSync(join(dir, 'book', 'preset.json'), 'utf8')) as { chapters: { file: string }[] };
    expect(manifest.chapters.map((c) => c.file)).toEqual(['chapters/01-uno.md', 'chapters/02-dos.md', 'chapters/05-muneca-y-mano.md', 'chapters/09-columna-lumbar.md']);
    expect(readFileSync(join(dir, 'book', 'chapters', '02-dos.md'), 'utf8')).toBe('# Dos\n\nTexto.\n');
    expect(run(['join', 'book.postext', 'part.postext', '-o', 'joined.postext'], dir).code).toBe(0);
    expect(openBundleZip(new Uint8Array(readFileSync(join(dir, 'joined.postext')))).files.has('chapters/05-muneca-y-mano.md')).toBe(true);
  }, 60_000);
});
