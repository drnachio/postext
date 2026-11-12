// Designs (#1523) on the command line: `postext design` takes a book's
// design into a design file, `--design` sets any book in one.
import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DESIGN_PARTS } from 'postext';
import { DESIGN_PART_NAMES } from '../commands';

const MAIN = resolve(import.meta.dir, '..', 'main.ts');
const cmd = process.env.POSTEXT_BIN ? [resolve(process.env.POSTEXT_BIN)] : [process.execPath, MAIN];
const POSTEXT = resolve(import.meta.dir, '..', '..', '..', 'postext');

function run(args: string[], cwd: string) {
  const r = Bun.spawnSync([...cmd, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', POSTEXT_CACHE_DIR: join(cwd, '.cache') } });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

async function manifestOf(file: string): Promise<{ design?: { parts: string[] }; chapters: unknown[]; config: Record<string, unknown> }> {
  const { unzipSync, strFromU8 } = await import(Bun.resolveSync('fflate', POSTEXT)) as {
    unzipSync: (b: Uint8Array) => Record<string, Uint8Array>;
    strFromU8: (b: Uint8Array) => string;
  };
  const files = unzipSync(new Uint8Array(readFileSync(file)));
  return JSON.parse(strFromU8(files['preset.json']!));
}

function books(): string {
  const dir = mkdtempSync(join(tmpdir(), 'postext-design-'));
  for (const name of ['a', 'b']) {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, '01.md'), `# ${name}\n\nSome text.\n`);
  }
  writeFileSync(join(dir, 'a.json'), JSON.stringify({
    locale: 'es',
    page: { sizePreset: '21x28' },
    bodyText: { fontSize: { value: 12, unit: 'pt' } },
    headings: { textAlign: 'center' },
  }));
  return dir;
}

describe('postext design', () => {
  it('lists the engine\'s parts in its help', () => {
    expect(DESIGN_PART_NAMES).toEqual([...DESIGN_PARTS]);
  });

  it('takes a book\'s design, by parts, and sets another book in it', async () => {
    const dir = books();
    const all = run(['design', 'a', '--config', 'a.json', '-o', 'all.postext', '--design-name', 'Lean', '--json', '--offline'], dir);
    expect(all.code).toBe(0);
    expect(JSON.parse(all.stdout).design).toMatchObject({ name: 'Lean' });
    const m = await manifestOf(join(dir, 'all.postext'));
    expect(m.chapters).toEqual([]);
    expect(m.design?.parts).toEqual([...DESIGN_PARTS]);
    // The book's own settings stay with the book.
    expect(m.config.locale).toBeUndefined();
    expect(m.config.bodyText).toMatchObject({ fontSize: { value: 12, unit: 'pt' } });

    const some = run(['design', 'a', '--config', 'a.json', '--parts', 'text', '-o', 'text.postext', '-q', '--offline'], dir);
    expect(some.code).toBe(0);
    const t = await manifestOf(join(dir, 'text.postext'));
    expect(t.design?.parts).toEqual(['text']);
    expect(t.config.page).toBeUndefined();
    expect(t.config.headings).toBeUndefined();

    // Another book in the whole design, or in some of its parts.
    const info = (args: string[]) => JSON.parse(run(['info', 'b', '--json', '--offline', ...args], dir).stdout);
    expect(info([]).book.pageSize).toBeUndefined();
    expect(info(['--design', 'all.postext']).book.pageSize).toBe('21x28');
    expect(info(['--design', 'all.postext', '--design-parts', 'text']).book.pageSize).toBeUndefined();
    expect(run(['pdf', 'b', '--design', 'all.postext', '-o', 'b.pdf', '-q', '--offline'], dir).code).toBe(0);
    expect(readFileSync(join(dir, 'b.pdf')).subarray(0, 4).toString()).toBe('%PDF');
  }, 120_000);

  it('says what was wrong with the parts or the file', () => {
    const dir = books();
    expect(run(['design', 'a', '--parts', 'typography', '-o', 'x.postext'], dir).code).toBe(2);
    expect(run(['info', 'b', '--design-parts', 'text'], dir).code).toBe(2);
    writeFileSync(join(dir, 'not.postext'), 'not a zip');
    const bad = run(['info', 'b', '--design', 'not.postext', '--offline'], dir);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('not.postext');
  }, 60_000);
});
