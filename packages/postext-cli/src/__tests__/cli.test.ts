// End to end: the CLI run from its sources on a small book of loose
// Markdown (default fonts, no network). With POSTEXT_BIN set, the same
// runs against a built executable.
import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

  // #771: a raster inside an SVG picture, as `pdftocairo -svg` writes it.
  it('paints the rasters an SVG picture holds in the page images', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-cli-'));
    mkdirSync(join(dir, 'res'));
    const { createCanvas, loadImage } = await import('@napi-rs/canvas');
    const square = createCanvas(4, 4);
    const sq = square.getContext('2d');
    sq.fillStyle = '#dc1e1e';
    sq.fillRect(0, 0, 4, 4);
    const red = `data:image/png;base64,${(await square.encode('png')).toString('base64')}`;
    const open = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="60" height="60" viewBox="0 0 60 60">';
    writeFileSync(join(dir, 'res', 'a-href.svg'), `${open}<image href="${red}" width="60" height="60"/></svg>`);
    writeFileSync(join(dir, 'res', 'c-defs-use.svg'), `${open}<defs><image id="s" width="60" height="60" xlink:href="${red}"/></defs><use xlink:href="#s"/></svg>`);
    writeFileSync(join(dir, 'book.md'), '# Pictures\n\n::resource{id="a-href"}\n\n::resource{id="c-defs-use"}\n');
    expect(run(['pack', 'book.md', '--resources', 'res', '-o', 'b.postext', '-q', '--offline'], dir).code).toBe(0);
    expect(run(['images', 'b.postext', '-o', 'pages', '--dpi', '72', '-q', '--offline'], dir).code).toBe(0);
    const page = await loadImage(readFileSync(join(dir, 'pages', 'page-001.png')));
    const canvas = createCanvas(page.width, page.height);
    canvas.getContext('2d').drawImage(page, 0, 0);
    const { data } = canvas.getContext('2d').getImageData(0, 0, page.width, page.height);
    let reds = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! > 200 && data[i + 1]! < 60 && data[i + 2]! < 60) reds++;
    // Two squares of 60 × 60 px at 72 dpi or more; none before #771.
    expect(reds).toBeGreaterThan(2 * 50 * 50);
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

  // #695: `preset.json`'s `start` says where a book that is part of a longer
  // one starts; every command lays the book out from there.
  it('lays a book out from where its preset.json says it starts', () => {
    const dir = book();
    expect(run(['pack', 'ch', '--name', 'Test', '-o', 'b.postext', '-q'], dir).code).toBe(0);
    expect(run(['unpack', 'b.postext', '-o', 'u', '-q'], dir).code).toBe(0);
    const pages = (input: string, ...more: string[]) => {
      const report = JSON.parse(run(['info', input, '--pages', '--json', '--offline', ...more], dir).stdout);
      return { start: report.book.start, chapters: report.chapters.map((c: { pages?: number }) => c.pages) };
    };
    const plain = pages('u');
    expect(plain.start).toBeUndefined();
    // One page before the book: page 1 is a verso, and the chapter, which
    // opens on a recto, leaves it blank.
    const path = join(dir, 'u', 'preset.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...manifest, start: { pageIndexOffset: 1, pageNumbering: { startAt: 58 }, headings: { h1: 3 } } }));
    const started = pages('u');
    expect(started.start).toEqual({ pageIndexOffset: 1, pageNumbering: { startAt: 58 }, headings: { h1: 3, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } });
    expect(started.chapters[0]).toBe(plain.chapters[0] + 1);
    expect(started.chapters[1]).toBe(plain.chapters[1]);
    // Packed again, the bundle carries it.
    expect(run(['pack', 'u', '-o', 's.postext', '-q'], dir).code).toBe(0);
    expect(pages('s.postext')).toEqual(started);
    const text = run(['info', 's.postext', '--offline'], dir).stdout;
    expect(text).toContain('starts after 1 page (page 1 is a verso), numbered from 58, after chapter 3');
    expect(run(['check', 's.postext', '--offline', '-q'], dir).code).toBe(0);
    // A selection that leaves the first chapter out starts at page 1.
    expect(pages('s.postext', '--chapters', '2').chapters).toEqual(pages('b.postext', '--chapters', '2').chapters);
  }, 60_000);

  // #696: a comic line may name its own face (`font=`). The book's fonts
  // are the configuration's and the ones its text names.
  it('resolves the face a comic line names in the text alone', () => {
    const dir = book();
    const families = () => JSON.parse(run(['info', 'ch', '--json', '--offline'], dir).stdout).fonts.map((f: { family: string }) => f.family);
    expect(families()).not.toContain('Dela Gothic One');
    writeFileSync(join(dir, 'ch', '03.md'), ':::page{split="*"}\n::panel\nrival{shout}: MEEEN!\nsfx{at="74% 30%" font="Dela Gothic One" vertical}: ドン\n:::\n');
    const withComic = families();
    expect(withComic).toContain('Dela Gothic One');
    // The lettering faces of a comic page were asked for already.
    expect(withComic).toContain('Comic Neue');
    // The same words outside a comic page name nothing.
    writeFileSync(join(dir, 'ch', '03.md'), '# Three\n\nA line that says font="Dela Gothic One".\n');
    expect(families()).not.toContain('Dela Gothic One');
  }, 60_000);

  // #741: a bold weight the configuration names is asked of the family, and
  // a weight the family ships that the set does not hold is reported (the
  // canvas measured the text with another face of the family).
  it('reports a weight the family ships when another face stood in for it', () => {
    const dir = book();
    const embeddedFace = (weight: number | string) => readFileSync(resolve(import.meta.dir, '..', '..', 'fonts', `OpenSans-${weight}.ttf`));
    mkdirSync(join(dir, 'fd'));
    for (const face of [400, '400i', 700]) writeFileSync(join(dir, 'fd', `OpenSans-${face}.ttf`), embeddedFace(face));
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ bodyText: { fontFamily: 'Open Sans', boldFontWeight: 600 }, headings: { fontFamily: 'Open Sans' } }));
    const check = () => JSON.parse(run(['check', 'ch', '--config', 'config.json', '--font-dir', 'fd', '--offline', '--json'], dir).stdout) as { warnings: { kind: string; message: string }[] };
    // The folder holds 400, its italic and 700, and nothing says the family has more: a
    // weight a family does not ship is set in its nearest face on purpose.
    expect(check().warnings.filter((w) => w.kind === 'fontFallback')).toEqual([]);
    // The cache's record says the family ships a 600.
    mkdirSync(join(dir, '.cache', 'fonts', 'open-sans'), { recursive: true });
    writeFileSync(join(dir, '.cache', 'fonts', 'open-sans', 'meta.json'), JSON.stringify({ available: true, weights: [300, 400, 600, 700, 800], styles: ['normal', 'italic'], checkedAt: Date.now(), v: 2 }));
    const fallbacks = check().warnings.filter((w) => w.kind === 'fontFallback');
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]!.message).toContain('Open Sans 600');
    expect(fallbacks[0]!.message).toContain('set in its 700');
    // With the file in the folder the face is there and nothing is said.
    writeFileSync(join(dir, 'fd', 'OpenSans-600.ttf'), embeddedFace(600));
    expect(check().warnings.filter((w) => w.kind === 'fontFallback')).toEqual([]);
  }, 60_000);

  it('raises no fallback for a bold a one-weight family does not ship', () => {
    const dir = book();
    mkdirSync(join(dir, 'fd'));
    writeFileSync(join(dir, 'fd', 'OpenSans-400.ttf'), readFileSync(resolve(import.meta.dir, '..', '..', 'fonts', 'OpenSans-400.ttf')));
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ bodyText: { fontFamily: 'Open Sans' }, headings: { fontFamily: 'Open Sans' } }));
    mkdirSync(join(dir, '.cache', 'fonts', 'open-sans'), { recursive: true });
    writeFileSync(join(dir, '.cache', 'fonts', 'open-sans', 'meta.json'), JSON.stringify({ available: true, weights: [400], styles: ['normal'], checkedAt: Date.now(), v: 2 }));
    const report = JSON.parse(run(['check', 'ch', '--config', 'config.json', '--font-dir', 'fd', '--offline', '--json'], dir).stdout) as { warnings: { kind: string }[] };
    expect(report.warnings.filter((w) => w.kind === 'fontFallback')).toEqual([]);
  }, 60_000);

  // #782: a rebuild lays out again only the chapters a change reaches and
  // paints only their pages; a changed picture lays out everything.
  it('rebuilds only what a change reaches in --watch', async () => {
    const dir = book();
    mkdirSync(join(dir, 'res'));
    const square = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="${fill}"/></svg>`;
    writeFileSync(join(dir, 'res', 'sq.svg'), square('#c00'));
    writeFileSync(join(dir, 'ch', '03.md'), '# Three\n\n::resource{id="sq"}\n');
    const proc = Bun.spawn([...cmd, 'build', 'ch', '--resources', 'res', '--images', 'out', '--dpi', '20', '--offline', '--watch'], {
      cwd: dir, env: { ...process.env, NO_COLOR: '1', POSTEXT_CACHE_DIR: join(dir, '.cache') }, stderr: 'pipe', stdout: 'ignore',
    });
    const reader = proc.stderr.getReader();
    let log = '';
    /** The log from now until a line matching `re`. */
    const until = async (re: RegExp): Promise<string> => {
      const from = log.length;
      const deadline = Date.now() + 30_000;
      while (!re.test(log.slice(from))) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${re}:\n${log}`);
        const { value, done } = await reader.read();
        if (done) throw new Error(`exited:\n${log}`);
        log += new TextDecoder().decode(value);
      }
      return log.slice(from);
    };
    try {
      const first = await until(/watching/);
      expect(first).toMatch(/wrote \d+ PNG images/);
      const pages = readdirSync(join(dir, 'out')).sort();
      const stamp = () => pages.map((p) => statSync(join(dir, 'out', p)).mtimeMs);
      const before = stamp();
      writeFileSync(join(dir, 'ch', '02.md'), '# Two\n\nOther text.\n\n- a\n- b\n');
      const edit = await until(/rebuilt in/);
      expect(edit).toContain('1 of 3 chapters laid out');
      // Chapter two's pages only.
      const [, written, unchanged] = /wrote (\d+) PNG images .*, (\d+) unchanged/.exec(edit) ?? [];
      expect(Number(written) + Number(unchanged)).toBe(pages.length);
      expect(Number(unchanged)).toBeGreaterThan(0);
      // The first chapter's page is left as it was.
      expect(stamp()[0]).toBe(before[0]);
      const last = join(dir, 'out', pages[pages.length - 1]!);
      const red = readFileSync(last);
      writeFileSync(join(dir, 'res', 'sq.svg'), square('#00c'));
      const picture = await until(/rebuilt in/);
      expect(picture).not.toContain('chapters laid out');
      expect(picture).toMatch(new RegExp(`wrote ${pages.length} PNG images`));
      // The picture is drawn anew.
      expect(readFileSync(last).equals(red)).toBe(false);
    } finally {
      proc.kill('SIGINT');
      await proc.exited;
    }
  }, 90_000);

  it('check --strict fails on warnings with exit code 3', () => {
    const dir = book();
    writeFileSync(join(dir, 'ch', '03.md'), '# Three\n\n::resource{id="nowhere"}\n');
    const r = run(['check', 'ch', '--strict', '--offline', '--json'], dir);
    expect(r.code).toBe(3);
    expect(JSON.parse(r.stdout).warnings.some((w: { kind: string }) => w.kind === 'unknownResourceId')).toBe(true);
    expect(run(['check', 'ch', '--offline', '-q'], dir).code).toBe(0);
  }, 60_000);
});
