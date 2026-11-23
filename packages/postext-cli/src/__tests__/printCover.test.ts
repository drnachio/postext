// `postext cover` (#1668): the print cover of a version from a book
// folder, as a PDF and as a picture of its front, and the EPUB's cover
// taken from it.
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

/** A book folder with two print versions, a cover design and a cover
 *  Markdown; `production: false` leaves the versions out. */
function book(production = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'postext-cover-'));
  mkdirSync(join(dir, 'chapters'));
  const text = Array.from({ length: 40 }, () => 'A line of the book, and another, to give the spine some pages.').join('\n\n');
  writeFileSync(join(dir, 'chapters', '01.md'), `---\ntitle: The Lantern\nauthor: Ann Reed\n---\n\n# One\n\n${text}\n`);
  writeFileSync(join(dir, 'cover.md'), ':::frame{slot="back"}\nA story of lighthouses.\n:::\n\n:::frame{slot="pastedown"}\nEx libris.\n:::\n');
  writeFileSync(join(dir, 'preset.json'), JSON.stringify({
    version: 2,
    id: 'lantern',
    name: 'The Lantern',
    locale: 'en',
    coverMarkdown: 'cover.md',
    chapters: [{ title: 'One', file: 'chapters/01.md' }],
    config: {
      page: { sizePreset: 'custom', width: { value: 150, unit: 'mm' }, height: { value: 230, unit: 'mm' } },
      ...(production ? {
        production: {
          versions: [
            { id: 'pb', name: 'Paperback', binding: 'perfect', isbn: '978-0-306-40615-7' },
            { id: 'hc', name: 'Hardcover', binding: 'case-flat' },
          ],
        },
      } : {}),
      cover: { background: { hex: '#123456', model: 'hex' } },
    },
  }));
  return dir;
}

const pngSize = (bytes: Uint8Array) => {
  const v = new DataView(bytes.buffer, bytes.byteOffset);
  return { width: v.getUint32(16), height: v.getUint32(20) };
};

describe('postext cover', () => {
  it('writes the sheet of the first version as a one-page PDF, its spine measured from the book', () => {
    const dir = book();
    const r = run(['cover', '.', '-o', 'cover.pdf', '--json'], dir);
    expect(r.code).toBe(0);
    const report = JSON.parse(r.stdout);
    expect(report.cover.version).toBe('pb');
    expect(report.cover.spineMm).toBeGreaterThan(0);
    // Back, spine and front: wider than two trims.
    expect(report.cover.widthMm).toBeGreaterThan(300);
    expect(report.outputs[0]).toMatchObject({ kind: 'pdf', pages: 1 });
    expect(new TextDecoder().decode(readFileSync(join(dir, 'cover.pdf')).subarray(0, 5))).toBe('%PDF-');
  }, 60_000);

  it('paints the front cover as a picture the size of the trim', () => {
    const dir = book();
    const r = run(['cover', '.', '-o', 'front.png', '--dpi', '50'], dir);
    expect(r.code).toBe(0);
    const { width, height } = pngSize(new Uint8Array(readFileSync(join(dir, 'front.png'))));
    // 150 × 230 mm at 50 dpi.
    expect(width).toBe(Math.round((150 / 25.4) * 50));
    expect(height).toBe(Math.round((230 / 25.4) * 50));
  }, 60_000);

  it('takes another version and sheet, and keeps the other sheets\' frames out of the warnings', () => {
    const dir = book();
    const r = run(['cover', '.', '--print-version', 'hc', '--sheet', 'endpaper-front', '-o', 'ep.pdf', '--json'], dir);
    expect(r.code).toBe(0);
    const report = JSON.parse(r.stdout);
    expect(report.cover).toMatchObject({ version: 'hc', sheet: 'endpaper-front' });
    expect(report.pages).toBe(1);
    expect(report.warnings.map((w: { kind: string }) => w.kind)).not.toContain('cover.coverSlotUnknown');
  }, 60_000);

  it('fails with a message for a book with no print version or an unknown one', () => {
    expect(run(['cover', '.', '-o', 'c.pdf'], book(false)).stderr).toContain('no print version');
    const r = run(['cover', '.', '--print-version', 'nope', '-o', 'c.pdf'], book());
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('no print version "nope" (it has pb, hc)');
  }, 60_000);

  it('gives the EPUB the front of the print cover', async () => {
    const dir = book();
    expect(run(['epub', '.', '-o', 'b.epub'], dir).code).toBe(0);
    const { unzipSync } = await import(Bun.resolveSync('fflate', resolve(import.meta.dir, '..', '..', '..', 'postext'))) as { unzipSync: (b: Uint8Array) => Record<string, Uint8Array> };
    const files = unzipSync(new Uint8Array(readFileSync(join(dir, 'b.epub'))));
    const cover = Object.keys(files).find((p) => /images\/cover\.jpe?g$/.test(p));
    expect(cover).toBeDefined();
    // A JPEG, 1600 px on its long side.
    const jpeg = files[cover!]!;
    expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
  }, 60_000);
});
