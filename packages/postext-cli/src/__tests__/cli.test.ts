// End to end: the CLI run from its sources on a small book of loose
// Markdown (default fonts, no network). With POSTEXT_BIN set, the same
// runs against a built executable.
import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MAIN = resolve(import.meta.dir, '..', 'main.ts');
const cmd = process.env.POSTEXT_BIN ? [resolve(process.env.POSTEXT_BIN)] : [process.execPath, MAIN];
const POSTEXT = resolve(import.meta.dir, '..', '..', '..', 'postext');

/** A Word file with `from` replaced by `to` in its body, as an edit made
 *  in Word that keeps the runs leaves it. */
async function editDocx(src: string, out: string, from: string, to: string): Promise<void> {
  // fflate, from postext (the CLI does not depend on it).
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import(Bun.resolveSync('fflate', POSTEXT)) as {
    unzipSync: (b: Uint8Array) => Record<string, Uint8Array>;
    zipSync: (f: Record<string, Uint8Array>) => Uint8Array;
    strFromU8: (b: Uint8Array) => string;
    strToU8: (s: string) => Uint8Array;
  };
  const files = unzipSync(new Uint8Array(readFileSync(src)));
  const xml = strFromU8(files['word/document.xml']!);
  expect(xml).toContain(`>${from}`);
  files['word/document.xml'] = strToU8(xml.replace(`>${from}`, `>${to}`));
  writeFileSync(out, zipSync(files));
}

/** A Word file as Google Docs saves it in what matters to the import:
 *  no custom XML part, so no export map; the properties and the bookmarks
 *  stay. `from`/`to`: a word changed there. */
async function withoutMap(src: string, out: string, from?: string, to?: string): Promise<void> {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import(Bun.resolveSync('fflate', POSTEXT)) as {
    unzipSync: (b: Uint8Array) => Record<string, Uint8Array>;
    zipSync: (f: Record<string, Uint8Array>) => Uint8Array;
    strFromU8: (b: Uint8Array) => string;
    strToU8: (s: string) => Uint8Array;
  };
  const files = unzipSync(new Uint8Array(readFileSync(src)));
  for (const path of Object.keys(files)) if (path.startsWith('customXml/')) delete files[path];
  if (from !== undefined) {
    const xml = strFromU8(files['word/document.xml']!);
    expect(xml).toContain(`>${from}`);
    files['word/document.xml'] = strToU8(xml.replace(`>${from}`, `>${to}`));
  }
  writeFileSync(out, zipSync(files));
}

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
    for (const c of ['pdf', 'html', 'epub', 'image', 'images', 'docx', 'idml', 'pack', 'unpack', 'import-docx', 'import-idml']) expect(r.stdout).toContain(c);
  }, 30_000);

  // `pdf` with no input loads the whole engine before it reports the usage
  // error, which can take more than 5 s on a busy runner (#1429).
  it('exits 2 on wrong usage', () => {
    expect(run(['pfd'], tmpdir()).code).toBe(2);
    expect(run(['pdf', '--bogus'], tmpdir()).code).toBe(2);
    expect(run(['pdf'], tmpdir()).code).toBe(2);
  }, 30_000);

  it('writes a PDF, HTML, EPUB, page images and Word from one layout', () => {
    const dir = book();
    const r = run(['build', 'ch', '--pdf', 'out/b.pdf', '--html', 'out/b.html', '--epub', 'out/b.epub', '--images', 'out/p', '--dpi', '30', '--docx', 'out/b.docx', '--docx-variant', 'facsimile', '--offline', '--json'], dir);
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

  // #1210: a bundle carries its first page as the cover a file manager shows.
  it('packs the first page as the cover of a book that names none', async () => {
    const { loadImage } = await import('@napi-rs/canvas');
    const dir = book();
    const coverOf = async (bundle: string, folder: string) => {
      expect(run(['unpack', bundle, '-o', folder, '-q'], dir).code).toBe(0);
      const manifest = JSON.parse(readFileSync(join(dir, folder, 'preset.json'), 'utf8'));
      if (!manifest.thumbnail) return null;
      const bytes = readFileSync(join(dir, folder, manifest.thumbnail));
      const image = await loadImage(bytes);
      return { path: manifest.thumbnail, jpeg: bytes[0] === 0xff && bytes[1] === 0xd8, long: Math.max(image.width, image.height) };
    };
    expect(run(['pack', 'ch', '--name', 'Test', '-o', 'b.postext', '-q', '--offline'], dir).code).toBe(0);
    expect(await coverOf('b.postext', 'u')).toEqual({ path: 'thumbnail.jpg', jpeg: true, long: 1024 });
    expect(run(['pack', 'ch', '--name', 'Test', '--no-auto-thumbnail', '-o', 'n.postext', '-q'], dir).code).toBe(0);
    expect(await coverOf('n.postext', 'n')).toBeNull();
    // A folder whose manifest names none gets one too.
    expect(run(['pack', 'n', '-o', 'f.postext', '-q', '--offline'], dir).code).toBe(0);
    expect(await coverOf('f.postext', 'f')).toEqual({ path: 'thumbnail.jpg', jpeg: true, long: 1024 });
    // A cover the reader gave is kept as it is.
    writeFileSync(join(dir, 'mine.png'), readFileSync(join(dir, 'u', 'thumbnail.jpg')));
    expect(run(['pack', 'ch', '--name', 'Test', '--thumbnail', 'mine.png', '-o', 'm.postext', '-q'], dir).code).toBe(0);
    expect((await coverOf('m.postext', 'm'))?.path).toBe('thumbnail.png');
  }, 60_000);

  it('exports the three Word variants of a book and applies the edits of a facsimile file', async () => {
    const dir = book();
    expect(run(['pack', 'ch', '--name', 'Test', '--no-auto-thumbnail', '-o', 'b.postext', '-q'], dir).code).toBe(0);
    expect(run(['unpack', 'b.postext', '-o', 'proj', '-q'], dir).code).toBe(0);
    const { isExportedDocx } = await import('postext/word');
    const { unzipSync } = await import(Bun.resolveSync('fflate', POSTEXT)) as { unzipSync: (b: Uint8Array) => Record<string, Uint8Array> };
    const entries = (file: string) => unzipSync(new Uint8Array(readFileSync(join(dir, file))));
    const boxed = (file: string) => new TextDecoder().decode(entries(file)['word/document.xml']).includes('<w:txbxContent>');
    const embedded = (file: string) => Object.keys(entries(file)).some((f) => f.startsWith('word/fonts/'));
    // No --variant: the formatted file, flowing text with the book's faces.
    const formatted = run(['docx', 'proj', '-o', 'd.docx', '--offline', '--json'], dir);
    expect(formatted.code).toBe(0);
    expect(JSON.parse(formatted.stdout).outputs[0]).toMatchObject({ variant: 'formatted' });
    expect(JSON.parse(formatted.stdout).outputs[0].pages).toBeUndefined();
    expect(isExportedDocx(new Uint8Array(readFileSync(join(dir, 'd.docx'))))).toBe(true);
    expect(boxed('d.docx')).toBe(false);
    expect(embedded('d.docx')).toBe(true);
    expect(run(['docx', 'proj', '--variant', 'formatted', '--no-embed-fonts', '-o', 'n.docx', '--offline', '-q'], dir).code).toBe(0);
    expect(embedded('n.docx')).toBe(false);
    // Content only: flowing text, no face embedded.
    const semantic = run(['docx', 'proj', '--variant', 'semantic', '-o', 's.docx', '--offline', '--json'], dir);
    expect(semantic.code).toBe(0);
    expect(JSON.parse(semantic.stdout).outputs[0]).toMatchObject({ variant: 'semantic' });
    expect(boxed('s.docx')).toBe(false);
    expect(embedded('s.docx')).toBe(false);
    // Neither flow file, unedited, has anything to apply; each names
    // itself as the user chose it, the writer as its properties do (#1517).
    for (const [file, variant] of [['d.docx', 'formatted'], ['s.docx', 'semantic']] as const) {
      const same = run(['import-docx', file, 'proj', '--dry-run', '--json'], dir);
      expect(same.code).toBe(0);
      expect(JSON.parse(same.stdout)).toMatchObject({ edits: [], variant, writer: 'semantic' });
      expect(run(['import-docx', file, 'proj', '--dry-run'], dir).stderr).toContain(`${file} (${variant}): 0 applied`);
      expect(new TextDecoder().decode(entries(file)['docProps/custom.xml'])).toMatch(new RegExp(`postext\\.export">\\s*<vt:lpwstr>${variant}<`));
    }
    // The PDF's pages in text boxes.
    const facsimile = run(['docx', 'proj', '--variant', 'facsimile', '-o', 'f.docx', '--offline', '--json'], dir);
    expect(facsimile.code).toBe(0);
    expect(JSON.parse(facsimile.stdout).outputs[0].pages).toBeGreaterThan(0);
    expect(isExportedDocx(new Uint8Array(readFileSync(join(dir, 'f.docx'))))).toBe(true);
    expect(boxed('f.docx')).toBe(true);
    expect(run(['docx', 'proj', '--variant', 'pages', '-o', 'x.docx'], dir).code).toBe(2);
    // Unedited: nothing to apply.
    const none = run(['import-docx', 'f.docx', 'proj', '--dry-run', '--json'], dir);
    expect(none.code).toBe(0);
    expect(JSON.parse(none.stdout).edits).toEqual([]);
    // A word changed in Word: the dry run prints the diff and writes nothing.
    await editDocx(join(dir, 'f.docx'), join(dir, 'fe.docx'), 'More', 'Much');
    const chapter = join(dir, 'proj', 'chapters', '02-two.md');
    const before = readFileSync(chapter, 'utf8');
    const dry = run(['import-docx', 'fe.docx', 'proj', '--dry-run'], dir);
    expect(dry.code).toBe(0);
    expect(dry.stdout).toContain('--- a/chapters/02-two.md');
    expect(dry.stdout).toContain('-More text.\n+Much text.');
    expect(dry.stderr).toContain('applied chapters/02-two.md:3');
    expect(readFileSync(chapter, 'utf8')).toBe(before);
    const real = run(['import-docx', 'fe.docx', 'proj', '--json'], dir);
    expect(real.code).toBe(0);
    const report = JSON.parse(real.stdout);
    expect(report).toMatchObject({ variant: 'facsimile', writer: 'formatted' });
    expect(report.edits.map((e: { status: string; at: string }) => [e.status, e.at])).toEqual([['applied', 'chapters/02-two.md:3']]);
    expect(report.files).toEqual(['chapters/02-two.md']);
    expect(readFileSync(chapter, 'utf8')).toBe(before.replace('More text.', 'Much text.'));
    // The same file again: the book already holds its edit, nothing to bring.
    expect(run(['import-docx', 'fe.docx', 'proj', '-q'], dir).code).toBe(0);
    expect(readFileSync(chapter, 'utf8')).toBe(before.replace('More text.', 'Much text.'));
    // The chapter changed another way since the export: the edit is a
    // conflict and the exit code says an edit was not applied.
    writeFileSync(chapter, before.replace('More text.', 'Other text.'));
    expect(run(['import-docx', 'fe.docx', 'proj', '-q'], dir).code).toBe(3);
    expect(readFileSync(chapter, 'utf8')).toBe(before.replace('More text.', 'Other text.'));
  }, 120_000);

  it('brings back a flow file that lost its export map, as Google Docs saves it (#1458)', async () => {
    const dir = book();
    expect(run(['pack', 'ch', '--name', 'Test', '--no-auto-thumbnail', '-o', 'b.postext', '-q'], dir).code).toBe(0);
    expect(run(['unpack', 'b.postext', '-o', 'proj', '-q'], dir).code).toBe(0);
    const { isExportedDocx, exportMapLost } = await import('postext/word');
    const chapter = join(dir, 'proj', 'chapters', '02-two.md');
    const before = readFileSync(chapter, 'utf8');
    for (const variant of ['semantic', 'formatted']) {
      expect(run(['docx', 'proj', '--variant', variant, '--no-embed-fonts', '-o', `${variant}.docx`, '--offline', '-q'], dir).code).toBe(0);
      // Unedited: the map is written again from the book, nothing to apply.
      await withoutMap(join(dir, `${variant}.docx`), join(dir, `${variant}-g.docx`));
      const bytes = new Uint8Array(readFileSync(join(dir, `${variant}-g.docx`)));
      expect(isExportedDocx(bytes)).toBe(false);
      expect(exportMapLost(bytes)).toBe(true);
      const same = run(['import-docx', `${variant}-g.docx`, 'proj', '--dry-run', '--json'], dir);
      expect(same.code).toBe(0);
      const report = JSON.parse(same.stdout);
      expect(report.edits).toEqual([]);
      expect(report.notes).toEqual([{ code: 'map-rebuilt' }]);
      // A word changed there lands in its chapter.
      await withoutMap(join(dir, `${variant}.docx`), join(dir, `${variant}-e.docx`), 'More', 'Much');
      const dry = run(['import-docx', `${variant}-e.docx`, 'proj', '--dry-run'], dir);
      expect(dry.code).toBe(0);
      expect(dry.stdout).toContain('-More text.\n+Much text.');
      expect(dry.stderr).toContain('came back without its export map');
      expect(readFileSync(chapter, 'utf8')).toBe(before);
    }
    // The book changed since the export: the edit still lands, and the
    // report says what the file was compared with.
    writeFileSync(join(dir, 'proj', 'chapters', '01-one.md'), readFileSync(join(dir, 'proj', 'chapters', '01-one.md'), 'utf8').replace('# One\n', '# One\n\nA paragraph written since.\n'));
    const later = run(['import-docx', 'semantic-e.docx', 'proj', '--json'], dir);
    expect(later.code).toBe(0);
    const report = JSON.parse(later.stdout);
    expect(report.notes.map((n: { code: string }) => n.code)).toEqual(['map-rebuilt', 'book-changed']);
    expect(report.notes[1].chapters).toEqual(['chapters/01-one.md']);
    expect(report.edits.map((e: { status: string; at: string }) => [e.status, e.at])).toEqual([['applied', 'chapters/02-two.md:3']]);
    expect(readFileSync(chapter, 'utf8')).toBe(before.replace('More text.', 'Much text.'));
    expect(readFileSync(join(dir, 'proj', 'chapters', '01-one.md'), 'utf8')).toContain('A paragraph written since.');
    // A file from another book has nothing this book can place.
    const other = mkdtempSync(join(tmpdir(), 'postext-cli-'));
    mkdirSync(join(other, 'ch'));
    writeFileSync(join(other, 'ch', '01.md'), '# Elsewhere\n\nNothing shared between the two.\n');
    expect(run(['docx', 'ch', '--variant', 'semantic', '-o', 'o.docx', '--offline', '-q'], other).code).toBe(0);
    await withoutMap(join(other, 'o.docx'), join(dir, 'o-g.docx'));
    const foreign = run(['import-docx', 'o-g.docx', 'proj', '--dry-run'], dir);
    expect(foreign.code).toBe(1);
    expect(foreign.stderr).toContain('cannot be written again from this book');
  }, 180_000);

  it('never picks the Word variant from the content: comic pages go out formatted too (#1458)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-cli-'));
    mkdirSync(join(dir, 'ch'));
    const page = ':::page{split="40 / *"}\n::panel\ncaption: The lighthouse keeper climbs the stairs every evening.\n::panel\nmaya: Grandpa! I am here, and the boat is late again.\n:::\n';
    writeFileSync(join(dir, 'ch', '01.md'), `# Pages\n\n${page}\n${page}`);
    const picked = run(['docx', 'ch', '-o', 'p.docx', '--offline', '--json'], dir);
    expect(picked.code).toBe(0);
    expect(JSON.parse(picked.stdout).outputs[0]).toMatchObject({ variant: 'formatted' });
    expect(JSON.parse(picked.stdout).outputs[0].pages).toBeUndefined();
    const asked = run(['docx', 'ch', '--variant', 'facsimile', '-o', 's.docx', '--offline', '--json'], dir);
    expect(asked.code).toBe(0);
    expect(JSON.parse(asked.stdout).outputs[0].pages).toBeGreaterThan(0);
  }, 120_000);

  it('applies the edits of a semantic file to loose Markdown, and converts it without a book', async () => {
    const dir = book();
    // Windows line ends and a byte-order mark stay as they were.
    writeFileSync(join(dir, 'ch', '02.md'), '\uFEFF# Two\r\n\r\nMore text.\r\n\r\n- a\r\n- b\r\n');
    expect(run(['docx', 'ch', '--variant', 'semantic', '-o', 'b.docx', '-q'], dir).code).toBe(0);
    await editDocx(join(dir, 'b.docx'), join(dir, 'e.docx'), 'More', 'Less');
    // A book named, -o (a new book) makes no sense.
    expect(run(['import-docx', 'e.docx', 'ch', '-o', 'x', '-q'], dir).code).toBe(2);
    // The chapters are found again from another folder, typed another way.
    const r = run(['import-docx', join(dir, 'e.docx'), '.', '--json'], join(dir, 'ch'));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).variant).toBe('semantic');
    expect(JSON.parse(r.stdout).edits.map((e: { status: string; at: string }) => e.status)).toEqual(['applied']);
    expect(readFileSync(join(dir, 'ch', '02.md'), 'utf8')).toBe('\uFEFF# Two\r\n\r\nLess text.\r\n\r\n- a\r\n- b\r\n');
    expect(readdirSync(join(dir, 'ch')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    // Without a book the file is converted into a new one, as any other.
    expect(run(['import-docx', 'b.docx', '-o', 'back', '-q'], dir).code).toBe(0);
    expect(readdirSync(join(dir, 'back', 'chapters')).some((f) => readFileSync(join(dir, 'back', 'chapters', f), 'utf8').includes('More text.'))).toBe(true);
    // A Word file postext did not export has no edits to apply.
    expect(run(['import-docx', join(POSTEXT, 'src', 'word', '__fixtures__', 'old-lantern.docx'), 'ch', '-q'], dir).code).toBe(1);
    expect(run(['import-docx', 'b.docx', '--dry-run', '-q'], dir).code).toBe(2);
  }, 120_000);

  // #932: the character spacing of Word's styles goes on the book's styles that set none.
  it('brings the character spacing of Word styles onto the book\'s styles that set none', () => {
    const dir = book();
    // A file the old exporter wrote with heading 1 at 0.02 em and the
    // Firma paragraph style at 0.05 em.
    writeFileSync(join(dir, 'b.docx'), readFileSync(join(POSTEXT, 'src', 'word', '__fixtures__', 'old-tracking.docx')));
    writeFileSync(join(dir, 'bare.json'), JSON.stringify({ paragraphStyles: [{ id: 'firma', name: 'Firma' }] }));
    const r = run(['import-docx', 'b.docx', '--config', 'bare.json', '-o', 'back', '--json'], dir);
    expect(r.code).toBe(0);
    const applied = JSON.parse(r.stdout).styleTracking.applied as string[];
    expect(applied).toContain('Firma 0.05 em');
    expect(applied).toContain('heading 1 0.02 em');
    const back = (JSON.parse(readFileSync(join(dir, 'back', 'preset.json'), 'utf8')) as { config: { paragraphStyles: { letterSpacing?: unknown }[]; headings: { levels: { level: number; letterSpacing?: unknown }[] } } }).config;
    expect(back.paragraphStyles[0]!.letterSpacing).toEqual({ value: 0.05, unit: 'em' });
    expect(back.headings.levels.find((l) => l.level === 1)!.letterSpacing).toEqual({ value: 0.02, unit: 'em' });
  }, 60_000);

  it('renders one page to stdout', () => {
    const dir = book();
    const r = Bun.spawnSync([...cmd, 'image', 'ch', '--page', '#1', '-o', '-', '--dpi', '20', '--offline', '-q'], { cwd: dir, env: { ...process.env, POSTEXT_CACHE_DIR: join(dir, '.cache') } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.subarray(1, 4).toString()).toBe('PNG');
  }, 60_000);

  it('writes an IDML package, and refuses linked pictures on stdout', () => {
    const dir = book();
    const r = run(['idml', 'ch', '-o', 'b.idml', '--offline', '-q'], dir);
    expect(r.code).toBe(0);
    expect(readFileSync(join(dir, 'b.idml')).subarray(0, 2).toString()).toBe('PK');
    const stdout = run(['idml', 'ch', '--images', 'link', '-o', '-', '--offline'], dir);
    expect(stdout.code).toBe(2);
    expect(stdout.stderr).toContain('--images link');
  }, 60_000);

  // #1500: the lines kept as Postext broke them or left to InDesign, and
  // the font files beside the package.
  it('takes --lines and --fonts for an IDML package', () => {
    const dir = book();
    const help = run(['idml', '--help'], dir);
    expect(help.code).toBe(0);
    for (const o of ['--images', '--lines', 'keep|reflow', '--fonts']) expect(help.stdout).toContain(o);
    const kept = run(['idml', 'ch', '-o', 'kept.idml', '--offline', '-q'], dir);
    expect(kept.code).toBe(0);
    const reflow = run(['idml', 'ch', '--lines', 'reflow', '-o', 'reflow.idml', '--offline', '-q'], dir);
    expect(reflow.code).toBe(0);
    expect(readFileSync(join(dir, 'reflow.idml')).subarray(0, 2).toString()).toBe('PK');
    // Kept lines are forced breaks in the stories: the two packages differ.
    expect(readFileSync(join(dir, 'reflow.idml')).equals(readFileSync(join(dir, 'kept.idml')))).toBe(false);
    // #1514: spreads set whatever the margins say.
    expect(help.stdout).toContain('--spreads');
    const single = run(['idml', 'ch', '--spreads', 'single', '-o', 'single.idml', '--offline', '-q'], dir);
    expect(single.code).toBe(0);
    expect(run(['idml', 'ch', '--spreads', 'pairs', '-o', 'x.idml', '--offline'], dir).code).toBe(2);
    const wrong = run(['idml', 'ch', '--lines', 'loose', '-o', 'x.idml', '--offline'], dir);
    expect(wrong.code).toBe(2);
    expect(wrong.stderr).toContain('--lines');
    const fonts = run(['idml', 'ch', '--fonts', '-o', 'out/b.idml', '--offline', '-q'], dir);
    expect(fonts.code).toBe(0);
    expect(readdirSync(join(dir, 'out', 'Document fonts')).length).toBeGreaterThan(0);
    const stdout = run(['idml', 'ch', '--fonts', '-o', '-', '--offline'], dir);
    expect(stdout.code).toBe(2);
    expect(stdout.stderr).toContain('--fonts');
  }, 120_000);

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

  // #891: each edition of a bundle in several languages under its own title.
  it('names the edition read with its localized title', () => {
    const dir = book();
    expect(run(['pack', 'ch', '--name', 'Geografía', '-o', 'b.postext', '-q'], dir).code).toBe(0);
    expect(run(['unpack', 'b.postext', '-o', 'u', '-q'], dir).code).toBe(0);
    const path = join(dir, 'u', 'preset.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...manifest, locale: 'es', description: 'Libro', localized: { ca: { name: 'Geografia', description: 'Llibre' }, en: { name: 'Geography' } } }));
    expect(run(['pack', 'u', '-o', 's.postext', '-q'], dir).code).toBe(0);
    const meta = (input: string, locale: string) => {
      const { book: b } = JSON.parse(run(['info', input, '--locale', locale, '--json', '--offline'], dir).stdout);
      return [b.name, b.description];
    };
    for (const input of ['u', 's.postext']) {
      expect(meta(input, 'ca')).toEqual(['Geografia', 'Llibre']);
      expect(meta(input, 'en')).toEqual(['Geography', 'Libro']);
      expect(meta(input, 'es')).toEqual(['Geografía', 'Libro']);
    }
    expect(run(['info', 's.postext', '--locale', 'ca', '--offline'], dir).stdout.split('\n')[0]).toBe('Geografia — Llibre');
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

  // #1105: a character the text sets in a face that has no glyph for it is
  // reported once per face for the book, with the characters.
  it('reports the characters a face lacks once per face', async () => {
    const { minimalFont } = await import('../../../postext/src/fonts/minimalFont');
    const dir = book();
    writeFileSync(join(dir, 'ch', '01.md'), '# One\n\nAn arrow → here and ← there.\n');
    writeFileSync(join(dir, 'ch', '02.md'), '# Two\n\nAnother → arrow.\n');
    mkdirSync(join(dir, 'fd'));
    writeFileSync(join(dir, 'fd', 'SubsetSans.ttf'), minimalFont({ family: 'Subset Sans', ranges: [[0x20, 0x7e]], advanceEm: 0.5 }));
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ bodyText: { fontFamily: 'Subset Sans' }, headings: { fontFamily: 'Subset Sans', fontWeight: 400 } }));
    const report = JSON.parse(run(['check', 'ch', '--config', 'config.json', '--font-dir', 'fd', '--offline', '--json'], dir).stdout) as { warnings: { kind: string; message: string; data?: { characters: string[]; count: number } }[] };
    const glyphs = report.warnings.filter((w) => w.kind === 'glyphFallback');
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.message).toContain('"Subset Sans" 400 has no glyph for 2 characters (→ ←)');
    expect(glyphs[0]!.data).toMatchObject({ characters: ['→', '←'], count: 2 });
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

  // #939: a JSON report longer than the pipe's 64 KiB buffer reaches a reader
  // that starts late whole (the process used to exit with the pipe still full).
  it('writes a long --json report to a pipe without cutting it', async () => {
    const dir = book();
    writeFileSync(join(dir, 'ch', '03.md'), `# Three\n\n${Array.from({ length: 600 }, (_, i) => `::resource{id="nowhere${i}"}\n`).join('\n')}`);
    // A real OS pipe with a reader that starts late (`sleep`), as a Python
    // subprocess.run is.
    const proc = Bun.spawn(['sh', '-c', '"$@" | { sleep 3; cat; }', 'sh', ...cmd, 'check', 'ch', '--offline', '--json'], {
      cwd: dir, env: { ...process.env, NO_COLOR: '1', POSTEXT_CACHE_DIR: join(dir, '.cache') }, stdout: 'pipe', stderr: 'ignore',
    });
    const text = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(text.length).toBeGreaterThan(70_000);
    const report = JSON.parse(text);
    expect(report.warnings.filter((w: { kind: string }) => w.kind === 'unknownResourceId').length).toBe(600);
    expect(report.exitCode).toBe(0);
  }, 60_000);

  // #1125: a closing fence after a one-line directive is reported, not printed.
  it('check reports a stray ::: after :::toc', () => {
    const dir = book();
    writeFileSync(join(dir, 'ch', '03.md'), '# Contents\n\n:::toc\n:::\n');
    const report = JSON.parse(run(['check', 'ch', '--offline', '--json'], dir).stdout) as { warnings: { kind: string; message: string; at?: string }[] };
    const stray = report.warnings.filter((w) => w.kind === 'strayFence');
    expect(stray).toHaveLength(1);
    expect(stray[0]!.message).toContain(':::toc');
  }, 60_000);

  it('check --strict fails on warnings with exit code 3', () => {
    const dir = book();
    writeFileSync(join(dir, 'ch', '03.md'), '# Three\n\n::resource{id="nowhere"}\n');
    const r = run(['check', 'ch', '--strict', '--offline', '--json'], dir);
    expect(r.code).toBe(3);
    expect(JSON.parse(r.stdout).warnings.some((w: { kind: string }) => w.kind === 'unknownResourceId')).toBe(true);
    expect(run(['check', 'ch', '--offline', '-q'], dir).code).toBe(0);
  }, 60_000);

  // #856: a composed page whose first box grows reports it, in words and in --json.
  it('check reports the reflow log of a composed page', () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-cli-'));
    mkdirSync(join(dir, 'ch'));
    const mm = (value: number) => ({ value, unit: 'mm' });
    writeFileSync(join(dir, 'config.json'), JSON.stringify({
      pageTemplates: [{
        id: 'boxes',
        frames: [{ name: 'a', minHeight: mm(10) }, { name: 'b', minHeight: mm(10) }],
        groups: [{ name: 'g', frames: ['a', 'b'], gap: mm(5) }],
      }],
    }));
    const text = 'Money lets us swap our work for the things we need, because everybody accepts what it is worth. '.repeat(12);
    writeFileSync(join(dir, 'ch', '01.md'), `::::page{template="boxes"}\n:::frame{slot="a"}\n${text}\n:::\n\n:::frame{slot="b"}\nB.\n:::\n::::\n`);
    const r = run(['check', 'ch', '--config', 'config.json', '--offline', '--json'], dir);
    expect(r.code).toBe(0);
    const reflow = JSON.parse(r.stdout).reflow as { template: string; events: { frame: string; kind: string; cause?: string }[]; lines: string[] }[];
    expect(reflow).toHaveLength(1);
    expect(reflow[0]!.template).toBe('boxes');
    expect(reflow[0]!.events.map((e) => `${e.frame} ${e.kind}`)).toEqual(['a grew', 'b moved']);
    expect(reflow[0]!.events[1]!.cause).toBe('a');
    expect(reflow[0]!.lines[0]).toMatch(/^a grew [\d.]+ mm$/);
    expect(r.stderr).toMatch(/reflow p\. \S+ \(boxes\): a grew [\d.]+ mm; b moved down [\d.]+ mm/);
  }, 60_000);

  // #1087: a `when` / `unless` on an attribute no page fence sets is a note.
  it('check notes a decoration condition no page of the book meets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-cli-'));
    mkdirSync(join(dir, 'ch'));
    const mm = (value: number) => ({ value, unit: 'mm' });
    const folio = { kind: 'text', id: 'folio', content: '{pageNumber}', placement: { anchor: { to: 'page', edge: 'bottom-center' }, offset: { y: mm(-8) } } };
    writeFileSync(join(dir, 'config.json'), JSON.stringify({
      pageTemplates: [{
        id: 'shell',
        frames: [{ name: 'texto', flow: true }],
        decoration: { elements: [{ ...folio, when: 'folio' }, { ...folio, id: 'band', unless: 'appendix' }] },
      }],
    }));
    writeFileSync(join(dir, 'ch', '01.md'), '::::page{template="shell" frontmatter}\nFront.\n::::\n\n::::page{template="shell" folio}\nBody.\n::::\n');
    const r = run(['check', 'ch', '--config', 'config.json', '--offline', '--json'], dir);
    expect(r.code).toBe(0);
    const notes = (JSON.parse(r.stdout).warnings as { kind: string; severity: string; data?: Record<string, unknown> }[]).filter((x) => x.kind === 'conditionNeverMet');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.severity).toBe('info');
    expect(notes[0]!.data).toEqual({ path: 'pageTemplates[0].decoration.elements[1].unless', condition: 'unless', attribute: 'appendix' });
  }, 60_000);

  // #1124: a colour pair `contrast.allow` accepts is listed as accepted,
  // as a note, and is no warning for --strict.
  it('check lists an allowed contrast pair as accepted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-cli-'));
    mkdirSync(join(dir, 'ch'));
    const ochre = { hex: '#b7820f', model: 'hex' };
    const write = (allow: unknown[] | undefined) => writeFileSync(join(dir, 'config.json'), JSON.stringify({ bodyText: { color: ochre }, ...(allow ? { contrast: { allow } } : {}) }));
    writeFileSync(join(dir, 'ch', '01.md'), 'Ochre text on paper.\n');
    type Row = { kind: string; severity: string; message: string; data?: Record<string, unknown> };
    const contrastRows = () => {
      const r = run(['check', 'ch', '--config', 'config.json', '--offline', '--json'], dir);
      return (JSON.parse(r.stdout).warnings as Row[]).filter((x) => x.kind === 'contrast.lowContrast');
    };
    write(undefined);
    expect(contrastRows().map((x) => x.severity)).toEqual(['warning']);
    write([{ fg: '#b7820f', bg: '#ffffff', reason: 'The publisher\'s ochre' }]);
    const rows = contrastRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.severity).toBe('info');
    expect(rows[0]!.message).toMatch(/^accepted \(The publisher's ochre\): #b7820f on #ffffff/);
    expect(rows[0]!.data).toEqual({ accepted: { reason: 'The publisher\'s ochre', fg: '#b7820f', bg: '#ffffff' } });
    expect(run(['check', 'ch', '--config', 'config.json', '--strict', '--offline', '-q'], dir).code).toBe(0);
  }, 60_000);

  // #1152: an {attr.x} no heading or fence sets always reads ''.
  it('check notes an {attr.x} that no heading or fence sets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-cli-'));
    mkdirSync(join(dir, 'ch'));
    const text = (id: string, content: string) => ({ kind: 'text', id, content, placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { x: { value: 0, unit: 'mm' }, y: { value: -8, unit: 'mm' } } }, size: { width: { value: 40, unit: 'mm' }, height: 'auto' } });
    writeFileSync(join(dir, 'config.json'), JSON.stringify({
      footer: { elements: [text('foot', '{attr.foot}'), text('unit', '{attr.unit}')] },
    }));
    writeFileSync(join(dir, 'ch', '01.md'), '# One {unit="Unit 1"}\n\nText.\n');
    const r = run(['check', 'ch', '--config', 'config.json', '--offline', '--json'], dir);
    const notes = (JSON.parse(r.stdout).warnings as { kind: string; data?: Record<string, unknown> }[]).filter((x) => x.kind === 'conditionNeverMet');
    expect(notes.map((n) => n.data)).toEqual([{ path: 'footer.elements[0].content', condition: 'attr', attribute: 'foot' }]);
  }, 60_000);

  // #1163: a composed page whose running foot reads an attribute its fence
  // leaves unset, while its siblings of the template set it.
  it('check reports folioMissing with the template and the element', () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-cli-'));
    mkdirSync(join(dir, 'ch'));
    const mm = (value: number) => ({ value, unit: 'mm' });
    writeFileSync(join(dir, 'config.json'), JSON.stringify({
      pageTemplates: [{
        id: 'shell',
        frames: [{ name: 'texto', flow: true }],
        footer: { elements: [{ kind: 'text', id: 'foot', content: '{attr.foot}', placement: { anchor: { to: 'page', edge: 'bottom-left' }, offset: { y: mm(-8) } } }] },
      }],
    }));
    const pages = ['foot="A"', 'foot="A"', 'foot="A"', 'foot="A"', 'foot="A"', '', 'foot="A"'].map((a) => `::::page{template="shell"${a ? ` ${a}` : ''}}\n\nWords.\n\n::::`);
    writeFileSync(join(dir, 'ch', '01.md'), pages.join('\n\n') + '\n');
    const r = run(['check', 'ch', '--config', 'config.json', '--offline', '--json'], dir);
    const rows = (JSON.parse(r.stdout).warnings as { kind: string; severity: string; page?: string; data?: Record<string, unknown> }[]).filter((x) => x.kind === 'folioMissing');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.severity).toBe('warning');
    expect(rows[0]!.page).toBe('6');
    expect(rows[0]!.data).toEqual({ template: 'shell', elementId: 'foot', slot: 'footer', folio: false, side: 'verso', drawnOn: 2, siblings: 2 });
  }, 60_000);

  // #858: a frame whose text still does not fit names the steps tried and
  // the proposals, in words and, with their values, in --json.
  it('check prints frameOverflow with its proposals', () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-cli-'));
    mkdirSync(join(dir, 'ch'));
    const mm = (value: number) => ({ value, unit: 'mm' });
    writeFileSync(join(dir, 'config.json'), JSON.stringify({
      locale: 'en',
      pageTemplates: [{ id: 'small', frames: [{ name: 'a', flow: true, width: mm(60), height: mm(20) }] }],
    }));
    const text = 'Money lets us swap our work for the things we need, because everybody accepts what it is worth. '.repeat(8);
    writeFileSync(join(dir, 'ch', '01.md'), `::::page{template="small"}\n${text}\n::::\n`);
    const r = run(['check', 'ch', '--config', 'config.json', '--offline', '--json'], dir);
    const w = (JSON.parse(r.stdout).warnings as { kind: string; message: string; data?: Record<string, unknown> }[]).find((x) => x.kind === 'frameOverflow')!;
    expect(w.data).toMatchObject({ template: 'small', frame: 'a', locale: 'en', scale: 0.9, stepsTried: ['free', 'shrinkText'] });
    const kinds = (w.data!.proposals as { kind: string }[]).map((p) => p.kind);
    expect(kinds).toEqual(expect.arrayContaining(['allowShrink', 'raiseMax', 'continueNextPage', 'shortenText']));
    const raise = (w.data!.proposals as { kind: string; path?: string; value?: { value: number } }[]).find((p) => p.kind === 'raiseMax')!;
    expect(raise.path).toBe('/pageTemplates/0/frames/0/maxHeight');
    expect(raise.value!.value).toBeGreaterThan(20);
    expect(w.message).toContain('to fit: ');
    expect(r.stderr).toMatch(/frameOverflow.*Frame "a" of template "small" \(en\) is [\d.]+ mm short of its content after free space, text down to 90 %/);
  }, 60_000);

  // #1053: a caption under a picture frame, a tab under a cut-out photo, a
  // note past its card and text past the trim (the engine's fixture), in
  // words and, with the frames and fixes, in --json.
  it('check prints frameCovered and frameOutsideArea with their fixes', () => {
    const fixture = resolve(import.meta.dir, '..', '..', '..', 'postext', 'src', '__tests__', 'composed', 'fixtures', 'overlap');
    const r = run(['check', join(fixture, 'overlap.md'), '--config', join(fixture, 'config.json'), '--resources', join(fixture, 'res'), '--offline', '--json'], tmpdir());
    expect(r.code).toBe(0);
    type W = { kind: string; message: string; page?: string; data?: Record<string, unknown> };
    const ws = JSON.parse(r.stdout).warnings as W[];
    const covered = ws.filter((w) => w.kind === 'frameCovered').map((w) => `${w.data!.frame}<${w.data!.coveredBy}`).sort();
    expect(covered).toEqual(['card<cutout', 'figure<photo']);
    const caption = ws.find((w) => w.kind === 'frameCovered' && w.data!.frame === 'figure')!;
    expect(caption.data).toMatchObject({ template: 'overlaps', fenceIndex: 0, locale: 'en', coveredByPath: '/pageTemplates/0/frames/1' });
    expect(caption.data!.text).toMatch(/^Rainfall/);
    // Every move off the caption takes the photo out of the figure it is
    // anchored inside, so none is offered (#1075); the cut-out over the card
    // has a clear move.
    expect((caption.data!.proposals as { kind: string }[]).map((p) => p.kind)).not.toContain('move');
    const card = ws.find((w) => w.kind === 'frameCovered' && w.data!.frame === 'card')!;
    expect((card.data!.proposals as { kind: string }[]).map((p) => p.kind)).toContain('move');
    expect(caption.page).toBe('1');
    const past = ws.filter((w) => w.kind === 'frameOutsideArea').map((w) => `${w.data!.frame}>${w.data!.past}`).sort();
    expect(past).toEqual(['note>frame', 'strap>trim']);
    expect(r.stderr).toMatch(/frameCovered.*Frame "card" of template "overlaps" \(en\) lies under frame "cutout"/);
    expect(r.stderr).toMatch(/frameOutsideArea.*Frame "note" of template "overlaps" \(en\) runs [\d.]+ mm past the frame "card" it is anchored inside/);
  }, 60_000);

  // #943: a magazine kept as one chapter file per article. A story jumps from
  // its file into a page fence of a later file; the CLI lays the book out
  // chapter by chapter and hands the rest to the chapter that has the page.
  it('lays out a story that jumps into a page of a later chapter file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'postext-cli-'));
    mkdirSync(join(dir, 'ch'));
    const mm = (value: number) => ({ value, unit: 'mm' });
    const top = { anchor: { to: 'container', edge: 'top-left' } };
    writeFileSync(join(dir, 'config.json'), JSON.stringify({
      locale: 'en',
      pageTemplates: [
        { id: 'article', frames: [{ name: 'body', flow: true, width: mm(120), height: mm(60), placement: top, overflow: { continueIn: 'page:{attr.next}', mark: 'Continued on page {page}' }, fit: { shrinkText: false } }] },
        { id: 'jump', frames: [{ name: 'head', flow: true, width: mm(120), height: mm(30), placement: top }, { name: 'rest', width: mm(120), placement: { anchor: { to: '#head', edge: 'below' }, offset: { y: mm(10) } } }] },
      ],
    }));
    const text = 'Money lets us swap our work for the things we need, because everybody accepts what it is worth. '.repeat(40);
    writeFileSync(join(dir, 'ch', '01.md'), `::::page{template="article" next="p9"}\n${text}\n::::\n`);
    writeFileSync(join(dir, 'ch', '02.md'), 'A chapter between.\n');
    writeFileSync(join(dir, 'ch', '03.md'), '::::page{template="jump" id="p9"}\nThe page the story goes on in.\n::::\n');
    const r = run(['check', 'ch', '--config', 'config.json', '--offline', '--json'], dir);
    expect(r.code).toBe(0);
    const report = JSON.parse(r.stdout) as { pages: number; warnings: { kind: string }[] };
    expect(report.warnings.filter((w) => w.kind === 'continueTargetMissing' || w.kind === 'frameOverflow')).toEqual([]);
    // One page for the article, one between, one for the page with the rest.
    expect(report.pages).toBe(3);
    // A name no later file has warns, and the rest goes on the next page.
    writeFileSync(join(dir, 'ch', '01.md'), `::::page{template="article" next="nowhere"}\n${text}\n::::\n`);
    const lost = JSON.parse(run(['check', 'ch', '--config', 'config.json', '--offline', '--json'], dir).stdout) as { pages: number; warnings: { kind: string; data?: { target: string } }[] };
    expect(lost.warnings.find((w) => w.kind === 'continueTargetMissing')!.data!.target).toBe('nowhere');
    expect(lost.pages).toBeGreaterThan(3);
  }, 60_000);
  it('imports an InDesign package as a book, and writes one from build (#1506)', () => {
    const dir = book();
    // The package `build` writes beside the PDF, from the same layout.
    const built = run(['build', 'ch', '--idml', 'out/b.idml', '--pdf', 'out/b.pdf', '--offline', '--json'], dir);
    expect(built.code).toBe(0);
    expect(JSON.parse(built.stdout).outputs.map((o: { kind: string }) => o.kind).sort()).toEqual(['idml', 'pdf']);
    expect(readFileSync(join(dir, 'out', 'b.idml')).subarray(0, 2).toString()).toBe('PK');
    expect(run(['build', 'ch', '--idml', 'x.idml', '--idml-lines', 'loose', '--offline'], dir).code).toBe(2);
    expect(run(['build', 'ch', '--idml', 'x.idml', '--idml-text', 'columns', '--offline'], dir).code).toBe(2);
    // The package as a book: an unpacked folder, with a report.
    const folder = run(['import-idml', 'out/b.idml', '-o', 'back', '--json'], dir);
    expect(folder.code).toBe(0);
    const data = JSON.parse(folder.stdout);
    expect(['pages', 'flow']).toContain(data.layout);
    expect(data.report.counts.pages).toBeGreaterThan(0);
    expect(['faithful', 'approximate', 'lossy']).toContain(data.report.verdict);
    expect(data.chapters).toBeGreaterThan(0);
    expect(existsSync(join(dir, 'back', 'preset.json'))).toBe(true);
    const preset = JSON.parse(readFileSync(join(dir, 'back', 'preset.json'), 'utf8'));
    expect(JSON.stringify(preset)).toContain('"justifyHardBreaks":true');
    // The words of the book are in its chapters.
    const words = run(['import-idml', 'out/b.idml', '-o', 'flow', '--layout', 'flow', '-q'], dir);
    expect(words.code).toBe(0);
    const chapters = readdirSync(join(dir, 'flow', 'chapters')).map((f) => readFileSync(join(dir, 'flow', 'chapters', f), 'utf8')).join('\n');
    expect(chapters).toContain('More text.');
    // The imported book builds.
    expect(run(['pdf', 'back', '-o', 'back.pdf', '--offline', '-q'], dir).code).toBe(0);
    expect(readFileSync(join(dir, 'back.pdf')).subarray(0, 4).toString()).toBe('%PDF');
    // A bundle, the report printed.
    const bundle = run(['import-idml', 'out/b.idml', '-o', 'back.postext', '--no-auto-thumbnail', '--report'], dir);
    expect(bundle.code).toBe(0);
    expect(bundle.stderr + bundle.stdout).toContain('Import:');
    expect(readFileSync(join(dir, 'back.postext')).subarray(0, 2).toString()).toBe('PK');
    // Wrong usage and files that are no package.
    expect(run(['import-idml'], dir).code).toBe(2);
    expect(run(['import-idml', 'out/b.idml', '--layout', 'grid'], dir).code).toBe(2);
    expect(run(['import-idml', 'missing.idml'], dir).code).toBe(1);
    writeFileSync(join(dir, 'not.idml'), 'not a package');
    const bad = run(['import-idml', 'not.idml'], dir);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('not.idml');
  }, 180_000);
});
