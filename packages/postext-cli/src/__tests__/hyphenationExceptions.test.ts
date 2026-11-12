// Hyphenation exception files on the command line (#1530):
// `--hyphenation-exceptions [LANG=]FILE` merges a file into the book's
// lists of words kept whole for the run.
import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { UsageError } from '../args';
import { applyExceptionFiles, parseExceptionsSpec } from '../hyphenation';

const MAIN = resolve(import.meta.dir, '..', 'main.ts');
const cmd = process.env.POSTEXT_BIN ? [resolve(process.env.POSTEXT_BIN)] : [process.execPath, MAIN];

function run(args: string[], cwd: string) {
  const r = Bun.spawnSync([...cmd, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', POSTEXT_CACHE_DIR: join(cwd, '.cache') } });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

function files(): string {
  const dir = mkdtempSync(join(tmpdir(), 'postext-hyphenation-'));
  writeFileSync(join(dir, 'words.txt'), '# from the source\nca-mi-no\nAlice, You~Tube\n1984\n');
  writeFileSync(join(dir, 'book.tex'), '\\documentclass{book}\n\\hyphenation{Ma-drid ri-ñón} % names\n\\begin{document}x\\end{document}\n');
  writeFileSync(join(dir, 'lists.json'), JSON.stringify({ '*': ['Blender'], en: ['ta-ble'], el: ['λέ-ξη'] }));
  return dir;
}

describe('--hyphenation-exceptions', () => {
  it('reads a language before = only when it reads as a tag', () => {
    expect(parseExceptionsSpec('words.txt')).toEqual({ path: 'words.txt' });
    expect(parseExceptionsSpec('es=words.txt')).toEqual({ language: 'es', path: 'words.txt' });
    expect(parseExceptionsSpec('pt-BR=a/b.txt')).toEqual({ language: 'pt-BR', path: 'a/b.txt' });
    expect(parseExceptionsSpec('*=words.txt')).toEqual({ path: 'words.txt' });
    expect(parseExceptionsSpec('my list=1.txt')).toEqual({ path: 'my list=1.txt' });
    expect(() => parseExceptionsSpec('el=words.txt')).toThrow(UsageError);
  });

  it('merges plain lists into the list named, TeX blocks only, and JSON lists by their keys', () => {
    const dir = files();
    const warnings: string[] = [];
    const config = { locale: 'es', bodyText: { fontSize: { value: 11, unit: 'pt' as const }, hyphenation: { exceptions: ['ca-mino'] } } };
    const done = applyExceptionFiles(config, [join(dir, 'words.txt'), `es=${join(dir, 'book.tex')}`, join(dir, 'lists.json')], (w) => warnings.push(w));
    expect(done.config.bodyText?.fontSize).toEqual({ value: 11, unit: 'pt' });
    expect(done.config.bodyText?.hyphenation).toEqual({
      exceptions: ['Alice', 'Blender', 'You-Tube', 'ca-mi-no'],
      exceptionsByLanguage: { es: ['Ma-drid', 'ri-ñón'], en: ['ta-ble'] },
    });
    expect(done).toMatchObject({ added: 6, replaced: 1 });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('"1984"');
    expect(warnings[1]).toContain('"el"');
    // The book's configuration is not touched.
    expect(config.bodyText.hyphenation).toEqual({ exceptions: ['ca-mino'] });
  });

  it('runs on a book, says what it merged in --json, and refuses a language without patterns', () => {
    const dir = files();
    mkdirSync(join(dir, 'book'));
    writeFileSync(join(dir, 'book', '01.md'), '# One\n\nSome text about Alice.\n');
    const ok = run(['info', 'book', '--hyphenation-exceptions', 'words.txt', '--hyphenation-exceptions', 'es=book.tex', '--json', '--offline'], dir);
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout).hyphenationExceptions).toEqual({ added: 5, replaced: 0 });
    const wrong = run(['info', 'book', '--hyphenation-exceptions', 'el=words.txt', '-q', '--offline'], dir);
    expect(wrong.code).toBe(2);
    expect(wrong.stderr).toContain('no hyphenation patterns for "el"');
    const missing = run(['info', 'book', '--hyphenation-exceptions', 'nope.txt', '-q', '--offline'], dir);
    expect(missing.code).toBe(1);
  }, 120_000);
});
