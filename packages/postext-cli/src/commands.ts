// Every command the CLI knows: its options, its help and the module that
// runs it (loaded only when the command is called, so `postext unpack`
// never loads the PDF writer).

import type { OptionSpec } from './args';
import type { CommandContext } from './context';

export interface CommandSpec {
  name: string;
  summary: string;
  usage: string;
  description?: string;
  options: OptionSpec[];
  examples: string[];
  /** Lays text out or paints it: needs the canvas (Skia) loaded first. */
  canvas?: boolean;
  run: () => Promise<{ default: (ctx: CommandContext) => Promise<void> }>;
}

export const GLOBAL_OPTIONS: OptionSpec[] = [
  { name: 'json', kind: 'boolean', help: 'Print one JSON object on stdout (outputs, pages, warnings, timings); logs go to stderr' },
  { name: 'quiet', short: 'q', kind: 'boolean', help: 'Print errors only' },
  { name: 'verbose', kind: 'boolean', help: 'Print progress and every warning' },
  { name: 'color', kind: 'boolean', help: 'Colour the terminal output (--no-color turns it off; NO_COLOR is honoured)' },
  { name: 'help', short: 'h', kind: 'boolean', help: 'Show the help of the command' },
  { name: 'version', short: 'v', kind: 'boolean', help: 'Print the version' },
];

/** Options of every command that reads a book. */
export const BOOK_OPTIONS: OptionSpec[] = [
  { name: 'locale', short: 'l', kind: 'string', arg: 'TAG', help: 'Language to read a multilingual book in (es, en, pt-BR…)' },
  { name: 'chapters', short: 'c', kind: 'string', arg: 'LIST', help: 'Chapters to lay out, 1-based: "1,3-5" (page numbers restart)' },
  { name: 'set', short: 's', kind: 'list', arg: 'PATH=VALUE', help: 'Change one setting, e.g. --set page.dpi=300 --set bodyText.fontSize.value=11 (repeatable)' },
  { name: 'config', kind: 'string', arg: 'FILE', help: 'Configuration JSON for loose Markdown (or merged over a book\'s)' },
  { name: 'resources', kind: 'string', arg: 'DIR', help: 'Pictures for loose Markdown; ids are file names without extension' },
  { name: 'fonts', kind: 'string', arg: 'DIR', help: 'Font files bundled with loose Markdown' },
  { name: 'name', kind: 'string', arg: 'TEXT', help: 'Book title for loose Markdown' },
  { name: 'font-dir', kind: 'list', arg: 'DIR', help: 'Extra folder to look for fonts the book does not carry (repeatable)' },
  { name: 'offline', kind: 'boolean', help: 'Never download fonts (Google Fonts); use cached and embedded faces only' },
  { name: 'cache-dir', kind: 'string', arg: 'DIR', help: 'Where downloaded fonts are kept (default: ~/.cache/postext)' },
];

const OUT: OptionSpec = { name: 'out', short: 'o', kind: 'string', arg: 'PATH', help: 'Output path ("-" writes to stdout)' };

export const PDF_OPTIONS: OptionSpec[] = [
  { name: 'accessible', kind: 'boolean', help: 'Tagged PDF/UA structure (default: the book\'s setting, else on)' },
  { name: 'color-space', kind: 'string', arg: 'rgb|cmyk|grayscale', help: 'Colour space of the PDF' },
  { name: 'pdfx', kind: 'string', arg: 'none|x1a|x4', help: 'PDF/X standard for print' },
  { name: 'profile', kind: 'string', arg: 'NAME|FILE', help: 'Output ICC profile: fogra39, fogra51, swop5, gracol2006… or an .icc file' },
  { name: 'outlines', kind: 'boolean', help: 'PDF bookmarks from the headings (--no-outlines leaves them out)' },
  { name: 'page-negative', kind: 'boolean', help: 'Negative pages (white on black), for some print workflows' },
];

export const HTML_OPTIONS: OptionSpec[] = [
  { name: 'mode', kind: 'string', arg: 'single|multi', help: 'Pages in one column (single) or side by side (multi, default)' },
  { name: 'assets', kind: 'string', arg: 'embed|folder', help: 'Pictures and fonts inside the file (embed) or beside it in assets/ (folder)' },
];

export const EPUB_OPTIONS: OptionSpec[] = [
  { name: 'layout', kind: 'string', arg: 'fixed|reflowable', help: 'Fixed pages as printed, or reflowable text (default fixed)' },
  { name: 'cover', kind: 'string', arg: 'FILE', help: 'Cover picture (default: the book\'s thumbnail)' },
];

export const IMAGE_OPTIONS: OptionSpec[] = [
  { name: 'format', short: 'f', kind: 'string', arg: 'png|jpeg|webp', help: 'Image format (default: from the file name, else png)' },
  { name: 'dpi', kind: 'number', arg: 'N', help: 'Resolution in dots per inch (default 150)' },
  { name: 'quality', kind: 'number', arg: '1-100', help: 'JPEG / WebP quality (default 90)' },
  { name: 'print-preview', kind: 'boolean', help: 'Show the trim and bleed as a printer sees them' },
];

const PAGES_HELP = 'Pages as printed ("3", "7-9", "iv") or by position ("#1", "#10-#20"), comma separated';

export const COMMANDS: CommandSpec[] = [
  {
    name: 'pdf',
    summary: 'Typeset the book into a PDF',
    usage: 'postext pdf <input…> [-o book.pdf]',
    options: [OUT, ...PDF_OPTIONS],
    examples: ['postext pdf book.postext -o book.pdf', 'postext pdf chapters/*.md --name "My book" -o book.pdf', 'postext pdf book.postext --pdfx x4 --profile fogra51'],
    canvas: true,
    run: () => import('./commands/pdf'),
  },
  {
    name: 'html',
    summary: 'Write the laid-out pages as an HTML page',
    usage: 'postext html <input…> [-o book.html | -o folder/]',
    description: 'A path ending in .html gets one self-contained file; any other path is a folder with index.html and assets/.',
    options: [OUT, ...HTML_OPTIONS],
    examples: ['postext html book.postext -o book.html', 'postext html book.postext -o site/ --mode single'],
    canvas: true,
    run: () => import('./commands/html'),
  },
  {
    name: 'epub',
    summary: 'Write an EPUB 3 book',
    usage: 'postext epub <input…> [-o book.epub]',
    options: [OUT, ...EPUB_OPTIONS],
    examples: ['postext epub book.postext -o book.epub', 'postext epub book.postext --layout reflowable'],
    canvas: true,
    run: () => import('./commands/epub'),
  },
  {
    name: 'image',
    summary: 'Render one page as an image',
    usage: 'postext image <input…> --page N [-o page.png]',
    options: [{ name: 'page', short: 'p', kind: 'string', arg: 'N|#N', help: 'The page: as printed ("12", "iv") or by position ("#1")' }, OUT, ...IMAGE_OPTIONS],
    examples: ['postext image book.postext --page 1 -o cover.png', 'postext image book.postext -p "#3" --dpi 300 -f jpeg -o - > p3.jpg'],
    canvas: true,
    run: () => import('./commands/image'),
  },
  {
    name: 'images',
    summary: 'Render every page (or a range) as images',
    usage: 'postext images <input…> [-o folder/] [--pages LIST]',
    options: [
      { ...OUT, help: 'Output folder (default: pages/)' },
      { name: 'pages', short: 'p', kind: 'string', arg: 'LIST', help: PAGES_HELP },
      { name: 'pattern', kind: 'string', arg: 'NAME', help: 'File names: {n} position, {n:03} padded, {label} printed number, {chapter} (default "page-{n:03}")' },
      { name: 'jobs', short: 'j', kind: 'number', arg: 'N', help: 'Images encoded at once (default: CPU count)' },
      ...IMAGE_OPTIONS,
    ],
    examples: ['postext images book.postext -o pages/ --dpi 72', 'postext images book.postext --pages 1-10 -f webp'],
    canvas: true,
    run: () => import('./commands/images'),
  },
  {
    name: 'docx',
    summary: 'Export the chapters to a Word document',
    usage: 'postext docx <input…> [-o book.docx] [--template T]',
    description: 'Word styles follow the import template; what Word cannot express is kept verbatim in the "Postext Markup" styles, so the file imports back unchanged.',
    options: [OUT, { name: 'template', short: 't', kind: 'string', arg: 'FILE', help: 'Import template (.json, or a .docx that carries one)' }],
    examples: ['postext docx book.postext -o book.docx'],
    run: () => import('./commands/docx'),
  },
  {
    name: 'import-docx',
    summary: 'Turn a Word document into a postext book',
    usage: 'postext import-docx <file.docx> [-o folder/ | -o book.postext]',
    options: [
      { ...OUT, help: 'A .postext file, or a folder for the unpacked book (default: the .docx name)' },
      { name: 'template', short: 't', kind: 'string', arg: 'FILE', help: 'Import template (.json, or a .docx that carries one); default: the one inside the file' },
      { name: 'split', kind: 'boolean', help: 'A chapter at every level-1 heading (default on; --no-split keeps one chapter)' },
      { name: 'locale', short: 'l', kind: 'string', arg: 'TAG', help: 'Language of the text (default en)' },
      { name: 'config', kind: 'string', arg: 'FILE', help: 'Configuration JSON whose styles the import maps to' },
      { name: 'name', kind: 'string', arg: 'TEXT', help: 'Book title (default: the document title)' },
      { name: 'report', kind: 'boolean', help: 'Print the quality report of the document' },
    ],
    examples: ['postext import-docx manuscript.docx -o manuscript/', 'postext import-docx manuscript.docx -o manuscript.postext --locale es'],
    run: () => import('./commands/importDocx'),
  },
  {
    name: 'pack',
    summary: 'Pack a folder or loose files into a .postext bundle',
    usage: 'postext pack <folder | files…> [-o book.postext]',
    description: 'A folder with preset.json is zipped as it is. Loose Markdown files become the chapters, in the order given.',
    options: [
      OUT,
      { name: 'id', kind: 'string', arg: 'ID', help: 'Bundle id (default: a slug of the name)' },
      { name: 'description', kind: 'string', arg: 'TEXT', help: 'Bundle description' },
      { name: 'thumbnail', kind: 'string', arg: 'FILE', help: 'Cover picture' },
    ],
    examples: ['postext pack my-book/ -o my-book.postext', 'postext pack 01.md 02.md --name "Notes" --config config.json --resources img/'],
    run: () => import('./commands/pack'),
  },
  {
    name: 'unpack',
    summary: 'Extract a .postext bundle into a folder',
    usage: 'postext unpack <book.postext> [-o folder/]',
    options: [{ ...OUT, help: 'Output folder (default: the bundle name)' }, { name: 'force', kind: 'boolean', help: 'Write into a folder that is not empty' }],
    examples: ['postext unpack book.postext -o book/'],
    run: () => import('./commands/unpack'),
  },
  {
    name: 'info',
    summary: 'Describe a book: chapters, fonts, resources, locales',
    usage: 'postext info <input…> [--pages]',
    options: [{ name: 'pages', kind: 'boolean', help: 'Lay the book out to count its pages' }],
    examples: ['postext info book.postext', 'postext info book.postext --pages --json'],
    canvas: true,
    run: () => import('./commands/info'),
  },
  {
    name: 'check',
    summary: 'Lay the book out and report problems',
    usage: 'postext check <input…> [--strict]',
    description: 'Reports Markdown issues, unknown resources and directives, boxes the layout had to force, missing fonts and, for print, the preflight. Exit code 3 when an error is found (any warning with --strict).',
    options: [
      { name: 'strict', kind: 'boolean', help: 'Fail on warnings too' },
      { name: 'preflight', kind: 'boolean', help: 'Run the print preflight even when the book is not set up for print' },
    ],
    examples: ['postext check book.postext', 'postext check chapters/ --json --strict'],
    canvas: true,
    run: () => import('./commands/check'),
  },
  {
    name: 'build',
    summary: 'Lay out once and write several outputs; --watch rebuilds on change',
    usage: 'postext build <input…> [--pdf F] [--html F] [--epub F] [--images DIR] [--docx F] [--watch]',
    options: [
      { name: 'pdf', kind: 'string', arg: 'FILE', help: 'Write the PDF here' },
      { name: 'html', kind: 'string', arg: 'PATH', help: 'Write the HTML here (.html file or folder)' },
      { name: 'epub', kind: 'string', arg: 'FILE', help: 'Write the EPUB here' },
      { name: 'images', kind: 'string', arg: 'DIR', help: 'Write page images here' },
      { name: 'docx', kind: 'string', arg: 'FILE', help: 'Write the Word file here' },
      { name: 'pages', short: 'p', kind: 'string', arg: 'LIST', help: `With --images: ${PAGES_HELP}` },
      { name: 'pattern', kind: 'string', arg: 'NAME', help: 'With --images: file name pattern (default "page-{n:03}")' },
      { name: 'jobs', short: 'j', kind: 'number', arg: 'N', help: 'With --images: images encoded at once' },
      { name: 'watch', short: 'w', kind: 'boolean', help: 'Stay running and rebuild when the sources change' },
      { name: 'template', short: 't', kind: 'string', arg: 'FILE', help: 'With --docx: import template' },
      ...PDF_OPTIONS,
      ...HTML_OPTIONS,
      ...EPUB_OPTIONS,
      ...IMAGE_OPTIONS,
    ],
    examples: ['postext build book/ --pdf out/book.pdf --html out/book.html --images out/pages', 'postext build chapters/ --pdf book.pdf --watch'],
    canvas: true,
    run: () => import('./commands/build'),
  },
];

/** Commands that read a book (and take BOOK_OPTIONS). */
export const BOOK_COMMANDS = new Set(['pdf', 'html', 'epub', 'image', 'images', 'docx', 'pack', 'info', 'check', 'build']);

export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((c) => c.name === name);
}

export function commandOptions(spec: CommandSpec): OptionSpec[] {
  const own = new Set(spec.options.map((o) => o.name));
  const book = BOOK_COMMANDS.has(spec.name) ? BOOK_OPTIONS.filter((o) => !own.has(o.name)) : [];
  return [...spec.options, ...book, ...GLOBAL_OPTIONS];
}
