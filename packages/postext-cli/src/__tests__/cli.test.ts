// End to end: the CLI run from its sources on a small book of loose
// Markdown (default fonts, no network). With POSTEXT_BIN set, the same
// runs against a built executable.
import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MAIN = resolve(import.meta.dir, '..', 'main.ts');
const cmd = process.env.POSTEXT_BIN ? [resolve(process.env.POSTEXT_BIN)] : [process.execPath, MAIN];

function run(args: string[], cwd: string) {
  const r = Bun.spawnSync([...cmd, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', POSTEXT_CACHE_DIR: join(cwd, '.cache') } });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

function book(): string {
  const dir = mkdtempSync(join(tmpdir(), 'postext-cli-'));
  mkdirSync(join(dir, 'ch'));
  writeFileSync(join(dir, 'ch', '01.md'), '---\ntitle: Test book\nauthor: A. Writer\n---\n\n# One\n\nSome *text* with **weight** and a formula $a^2 + b^2 = c^2$.\n');
  writeFileSync(join(dir, 'ch', '02.md'), '# Two\n\nMore text.\n\n- a\n- b\n');
  return dir;
}

describe('postext cli', () => {
  it('prints the help with no arguments', () => {
    const r = run([], tmpdir());
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Usage');
    for (const c of ['pdf', 'html', 'epub', 'image', 'images', 'pack', 'unpack', 'import-docx']) expect(r.stdout).toContain(c);
  });

  it('exits 2 on wrong usage', () => {
    expect(run(['pfd'], tmpdir()).code).toBe(2);
    expect(run(['pdf', '--bogus'], tmpdir()).code).toBe(2);
    expect(run(['pdf'], tmpdir()).code).toBe(2);
  });

  it('writes a PDF, HTML, EPUB, page images and Word from one layout', () => {
    const dir = book();
    const r = run(['build', 'ch', '--pdf', 'out/b.pdf', '--html', 'out/b.html', '--epub', 'out/b.epub', '--images', 'out/p', '--dpi', '30', '--docx', 'out/b.docx', '--offline', '--json'], dir);
    expect(r.code).toBe(0);
    const report = JSON.parse(r.stdout);
    expect(report.ok).toBe(true);
    expect(report.pages).toBeGreaterThan(0);
    expect(readFileSync(join(dir, 'out/b.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
    expect(readFileSync(join(dir, 'out/b.html'), 'utf8')).toContain('<!doctype html>');
    expect(readFileSync(join(dir, 'out/b.epub')).subarray(0, 2).toString()).toBe('PK');
    expect(readFileSync(join(dir, 'out/b.docx')).subarray(0, 2).toString()).toBe('PK');
    expect(existsSync(join(dir, 'out/p/page-001.png'))).toBe(true);
  }, 60_000);

  it('packs, unpacks and reads the bundle back', () => {
    const dir = book();
    expect(run(['pack', 'ch', '--name', 'Test', '-o', 'b.postext', '-q'], dir).code).toBe(0);
    const first = readFileSync(join(dir, 'b.postext'));
    expect(run(['pack', 'ch', '--name', 'Test', '-o', 'c.postext', '-q'], dir).code).toBe(0);
    expect(Buffer.compare(first, readFileSync(join(dir, 'c.postext')))).toBe(0);
    expect(run(['unpack', 'b.postext', '-o', 'u', '-q'], dir).code).toBe(0);
    expect(existsSync(join(dir, 'u', 'preset.json'))).toBe(true);
    const info = JSON.parse(run(['info', 'u', '--json', '--offline'], dir).stdout);
    expect(info.chapters).toHaveLength(2);
    expect(info.book.name).toBe('Test');
  }, 60_000);

  it('round-trips the Markdown through Word', () => {
    const dir = book();
    expect(run(['docx', 'ch', '-o', 'b.docx', '-q'], dir).code).toBe(0);
    expect(run(['import-docx', 'b.docx', '-o', 'back', '-q'], dir).code).toBe(0);
    const again = readFileSync(join(dir, 'back', 'chapters', '02-two.md'), 'utf8');
    expect(again).toContain('More text.');
  }, 60_000);

  it('renders one page to stdout', () => {
    const dir = book();
    const r = Bun.spawnSync([...cmd, 'image', 'ch', '--page', '#1', '-o', '-', '--dpi', '20', '--offline', '-q'], { cwd: dir, env: { ...process.env, POSTEXT_CACHE_DIR: join(dir, '.cache') } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.subarray(1, 4).toString()).toBe('PNG');
  }, 60_000);

  it('check --strict fails on warnings with exit code 3', () => {
    const dir = book();
    writeFileSync(join(dir, 'ch', '03.md'), '# Three\n\n::resource{id="nowhere"}\n');
    const r = run(['check', 'ch', '--strict', '--offline', '--json'], dir);
    expect(r.code).toBe(3);
    expect(JSON.parse(r.stdout).warnings.some((w: { kind: string }) => w.kind === 'unknownResourceId')).toBe(true);
    expect(run(['check', 'ch', '--offline', '-q'], dir).code).toBe(0);
  }, 60_000);
});
