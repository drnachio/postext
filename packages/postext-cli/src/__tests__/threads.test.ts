// --threads (#1611): the chapters laid out on worker threads give the
// output a layout on one thread gives. With POSTEXT_BIN set, the same runs
// against a built executable.
import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MAIN = resolve(import.meta.dir, '..', 'main.ts');
const cmd = process.env.POSTEXT_BIN ? [resolve(process.env.POSTEXT_BIN)] : [process.execPath, MAIN];

function run(args: string[], cwd: string) {
  const r = Bun.spawnSync([...cmd, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', POSTEXT_CACHE_DIR: join(cwd, '.cache') } });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

const paragraph = (word: string) => `A paragraph with the word ${word} and enough text around it to fill a few lines of the column. `.repeat(5);

/** Chapters of uneven lengths, so that the pages before each one are not
 *  what a first guess gives. */
function book(): { dir: string; files: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'postext-threads-'));
  mkdirSync(join(dir, 'ch'));
  const lengths = [2, 19, 1, 8, 30, 5];
  const files = lengths.map((paragraphs, i) => {
    const file = join('ch', `${String(i + 1).padStart(2, '0')}.md`);
    const front = i === 0 ? '---\ntitle: Threads\nauthor: A. Writer\n---\n\n' : '';
    writeFileSync(join(dir, file), `${front}# Chapter ${i + 1}\n\n${Array.from({ length: paragraphs }, (_, p) => paragraph(`w${i}x${p}`)).join('\n\n')}\n`);
    return file;
  });
  return { dir, files };
}

describe('--threads', () => {
  it('writes the pages one thread writes', () => {
    const { dir, files } = book();
    const one = run(['html', ...files, '-o', 'one.html', '--offline'], dir);
    expect(one.code).toBe(0);
    const three = run(['html', ...files, '-o', 'three.html', '--offline', '--threads', '3', '--verbose'], dir);
    expect(three.code).toBe(0);
    expect(readFileSync(join(dir, 'three.html'), 'utf8')).toBe(readFileSync(join(dir, 'one.html'), 'utf8'));
    // Run from the sources, the workers start; a built executable that
    // cannot start them says so and lays the book out on its own thread.
    expect(three.stderr + three.stdout).toMatch(/laid out on 3 threads|laying out on one thread/);
    if (!process.env.POSTEXT_BIN) expect(three.stderr + three.stdout).toContain('laid out on 3 threads');
  }, 120_000);

  it('lays a short book out on one thread when asked for auto', () => {
    const { dir, files } = book();
    const auto = run(['check', ...files, '--offline', '--threads', 'auto', '--verbose'], dir);
    expect(auto.code).toBe(0);
    expect(auto.stderr + auto.stdout).not.toContain('threads');
  }, 120_000);

  it('refuses a number of threads that is not one', () => {
    const { dir, files } = book();
    const bad = run(['check', ...files, '--offline', '--threads', 'many'], dir);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain('--threads');
  }, 120_000);
});
