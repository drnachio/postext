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
  { name: 'design', kind: 'string', arg: 'FILE', help: 'Set the book in the design of a design file (.postext from "postext design" or the Sandbox), or of another book' },
  { name: 'design-parts', kind: 'string', arg: 'LIST', help: 'With --design: only these parts, e.g. "page,text,headings"' },
  { name: 'composition', kind: 'string', arg: 'TAG|auto', help: 'Set the composition rules of a language\'s tradition (es, en-US, en-GB, fr, de; auto: the book\'s language), after --design' },
  { name: 'config', kind: 'string', arg: 'FILE', help: 'Configuration JSON for loose Markdown (or merged over a book\'s)' },
  { name: 'hyphenation-exceptions', kind: 'list', arg: '[LANG=]FILE', help: 'Merge a list of words kept whole (text, TeX \\hyphenation, JSON) into the book\'s for this run: every language\'s list, or LANG\'s; a JSON object of lists by language fills each (repeatable)' },
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
  { name: 'die-line', kind: 'string', arg: 'page|none', help: 'The die line of die-cut pages, on its own plate (page, default) or left out (none)' },
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

/** The parts of a design, as the engine's DESIGN_PARTS lists them (a test
 *  pins the two together; the help loads no engine). */
export const DESIGN_PART_NAMES = ['page', 'writing', 'colors', 'text', 'composition', 'headings', 'lists', 'figures', 'callouts', 'exercises', 'comics', 'running', 'parts', 'output', 'folio', 'advanced'];

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
    usage: 'postext docx <input…> [-o book.docx] [--variant semantic|formatted|facsimile]',
    description: 'Two documents of flowing text, editable in Word and Google Docs, built from the Markdown with native headings, lists, tables, notes and equations. semantic: content only, in plain styles that name each part, for correcting the words. formatted (default): the same text with the book\'s design as far as Word allows (page, columns, fonts, openers, boxes, running heads), with the book\'s fonts embedded. A third, facsimile, sets the PDF\'s pages line by line in text boxes, for comparing with the PDF; it is hard to edit and does not open well in Google Docs. All carry an export map: give the edited file back to `postext import-docx file.docx <book>` and the edits go into the chapters and resources.',
    options: [
      OUT,
      { name: 'variant', kind: 'string', arg: 'semantic|formatted|facsimile', help: 'Content only in plain styles (semantic), the book\'s design (formatted, the default) or the PDF\'s pages in text boxes (facsimile, lays the book out)' },
      { name: 'embed-fonts', kind: 'boolean', help: 'formatted, facsimile: embed the book\'s faces (default on; --no-embed-fonts names them only)' },
    ],
    examples: ['postext docx book.postext -o book.docx', 'postext docx book/ --variant semantic -o words.docx', 'postext docx book/ --variant facsimile -o pages.docx'],
    canvas: true,
    run: () => import('./commands/docx'),
  },
  {
    name: 'idml',
    summary: 'The laid-out pages as an InDesign package (IDML)',
    usage: 'postext idml <input…> [-o book.idml] [--images embed|link] [--lines keep|reflow] [--spreads facing|single] [--fonts]',
    description: 'The PDF\'s pages as an InDesign Markup package: facing spreads for a book with mirrored margins (else one page per spread), rules, boxes, paths and pictures as page items, each composed frame\'s text as a text frame with its own story, callout styles as paragraph styles, authored CMYK colours as swatches. Every line ends where Postext ended it unless --lines reflow leaves the paragraphs to InDesign\'s composer.',
    options: [
      OUT,
      { name: 'images', kind: 'string', arg: 'embed|link', help: 'Pictures inside the file (embed, default) or beside it in Links/ (link)' },
      { name: 'lines', kind: 'string', arg: 'keep|reflow', help: 'Lines as Postext broke them (keep, default) or left to InDesign\'s composer (reflow)' },
      { name: 'spreads', kind: 'string', arg: 'facing|single', help: 'Facing spreads or one page to a spread, whatever the margins say (default: facing for mirrored margins)' },
      { name: 'fonts', kind: 'boolean', help: 'Write the font files beside the package, in Document fonts/' },
    ],
    examples: ['postext idml book/ -o book.idml', 'postext idml book/ -o out/book.idml --images link --fonts'],
    canvas: true,
    run: () => import('./commands/idml'),
  },
  {
    name: 'import-docx',
    summary: 'Bring Word edits back into a book, or turn a Word document into one',
    usage: 'postext import-docx <file.docx> <book> [--dry-run]  |  postext import-docx <file.docx> [-o folder/ | -o book.postext]',
    description: 'With a book (folder, .postext or Markdown files) and a file `postext docx` exported from it: the edits made in Word are merged into the chapter files and the resources\' wording (preset.json), and each one is reported as applied, in conflict with a change made since the export, or rejected (generated text). Exit code 3 when an edit was not applied. A flow file that Google Docs saved comes back too: Docs leaves the export map out, and it is written again from the book (if the book changed since the export, the report says so). Any other Word file is converted into a new book with the import template.',
    options: [
      { name: 'dry-run', short: 'n', kind: 'boolean', help: 'With a book: print the diff and the report, write nothing' },
      { name: 'resources', kind: 'string', arg: 'DIR', help: 'With loose Markdown chapters: their pictures folder (its resources.json takes caption edits)' },
      { ...OUT, help: 'A .postext file, or a folder for the unpacked book (default: the .docx name)' },
      { name: 'template', short: 't', kind: 'string', arg: 'FILE', help: 'Import template (.json, or a .docx that carries one); default: the one inside the file' },
      { name: 'split', kind: 'boolean', help: 'A chapter at every level-1 heading (default on; --no-split keeps one chapter)' },
      { name: 'locale', short: 'l', kind: 'string', arg: 'TAG', help: 'Language of the text (default en); with a book, the edition the file was exported from' },
      { name: 'config', kind: 'string', arg: 'FILE', help: 'Configuration JSON whose styles the import maps to' },
      { name: 'name', kind: 'string', arg: 'TEXT', help: 'Book title (default: the document title)' },
      { name: 'report', kind: 'boolean', help: 'Print the quality report of the document' },
      { name: 'auto-thumbnail', kind: 'boolean', help: 'With a .postext output: paint the first page as the cover (default on)' },
    ],
    examples: ['postext import-docx book.docx book/ --dry-run', 'postext import-docx book.docx book/', 'postext import-docx manuscript.docx -o manuscript/', 'postext import-docx manuscript.docx -o manuscript.postext --locale es'],
    canvas: true,
    run: () => import('./commands/importDocx'),
  },
  {
    name: 'import-idml',
    summary: 'Turn an InDesign document (IDML), or a zipped InDesign package, into a book',
    usage: 'postext import-idml <file.idml|package.zip> [-o folder/ | -o book.postext] [--layout auto|pages|flow] [--document PATH]',
    description: 'Reads an InDesign Markup package (File › Save As › InDesign Markup in InDesign; an .indd is not read) and writes a Postext book: the chapters as Markdown, the configuration the document\'s styles and pages give, and its pictures and tables as resources. pages: composed pages that follow the document page for page, each frame where it stood. flow: a flowing book, the text in reading order under the document\'s styles, for a book that Postext will set again. auto picks one and says why. Lines the document ends with forced line breaks stay the lines of the book. The file may also be a zipped InDesign package (the folder File › Package makes, zipped, with Include IDML ticked): its IDML is imported (--document names it when there are several; an .indd alone is not read), with the pictures of its Links/ folder and the font files of its Document fonts/ folder, which the book carries. Linked pictures are read from --links first, then from the package, then from beside the file and its Links/ folder; the ones not found are listed. The fonts the document names are listed too: a bare .idml carries no font files, so give them with --font-dir when the book is built; for a package, a face found in --font-dir is carried instead of the package\'s. What Postext has no equivalent for is counted in the report (--report prints it, --json carries it); nothing is left out silently.',
    options: [
      { ...OUT, help: 'A .postext file, or a folder for the unpacked book (default: the file\'s name)' },
      { name: 'document', kind: 'string', arg: 'PATH', help: 'A zipped package that holds several IDML documents: the one to import, by its path in the zip (Book/Book.idml)' },
      { name: 'layout', kind: 'string', arg: 'auto|pages|flow', help: 'Composed pages as in the document (pages), a flowing book (flow), or the importer\'s choice (auto, default)' },
      { name: 'links', kind: 'string', arg: 'DIR', help: 'Folder of the linked pictures, before the package\'s (default: the package\'s Links/, beside the file, and its Links/)' },
      { name: 'name', kind: 'string', arg: 'TEXT', help: 'Book title (default: the document\'s)' },
      { name: 'locale', short: 'l', kind: 'string', arg: 'TAG', help: 'Language of the text (default: the one most of the text is set in)' },
      { name: 'hidden', kind: 'boolean', help: 'Read hidden layers and hidden objects too' },
      { name: 'pasteboard', kind: 'boolean', help: 'Read what lies on the pasteboard too' },
      { name: 'non-printing', kind: 'boolean', help: 'Read non-printing objects too' },
      { name: 'conditions', kind: 'string', arg: 'visible|all', help: 'Conditional text: only what is switched on (visible, default) or all of it' },
      { name: 'changes', kind: 'string', arg: 'accept|reject', help: 'Tracked changes: as if accepted (default) or rejected' },
      { name: 'masters', kind: 'boolean', help: 'Master-page items as running heads and decoration (default on; --no-masters leaves them out)' },
      { name: 'report', kind: 'boolean', help: 'Print the import report: every finding, and how each paragraph style was read' },
      { name: 'auto-thumbnail', kind: 'boolean', help: 'With a .postext output: paint the first page as the cover (default on)' },
      { name: 'font-dir', kind: 'list', arg: 'DIR', help: 'Where the cover finds the document\'s fonts; with a package, faces found here are carried instead of the package\'s (repeatable)' },
      { name: 'offline', kind: 'boolean', help: 'Never download fonts for the cover' },
      { name: 'cache-dir', kind: 'string', arg: 'DIR', help: 'Where downloaded fonts are kept (default: ~/.cache/postext)' },
    ],
    examples: ['postext import-idml book.idml -o book/', 'postext import-idml package.zip -o book.postext', 'postext import-idml package.zip --document Book/Book.idml -o book/', 'postext import-idml book.idml -o book.postext --layout flow --links pictures/', 'postext import-idml book.idml --report --json'],
    canvas: true,
    run: () => import('./commands/importIdml'),
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
      { name: 'thumbnail', kind: 'string', arg: 'FILE', help: 'Cover picture (default: the first page, painted)' },
      { name: 'auto-thumbnail', kind: 'boolean', help: 'Paint the first page as the cover when the book has none (default on; --no-auto-thumbnail leaves it out)' },
    ],
    examples: ['postext pack my-book/ -o my-book.postext', 'postext pack 01.md 02.md --name "Notes" --config config.json --resources img/'],
    canvas: true,
    run: () => import('./commands/pack'),
  },
  {
    name: 'design',
    summary: 'Take a book\'s design into a design file',
    usage: 'postext design <input…> [-o design.postext] [--parts LIST]',
    description: `A design file is a .postext with no chapters: the settings of the parts asked for (the Design panel's groups: ${DESIGN_PART_NAMES.join(', ')}), with the font files and colour profile they name. A font marked as not redistributable is left out. The text, the resources and the settings that belong to the book as a whole (language, direction, numerals, resource types, checks) are not part of a design. Give it to any book with --design, or import it in the Sandbox's Design panel.`,
    options: [
      { ...OUT, help: 'The design file (default: <book>.design.postext)' },
      { name: 'parts', kind: 'string', arg: 'LIST', help: 'The parts to take, comma separated (default: all)' },
      { name: 'design-name', kind: 'string', arg: 'TEXT', help: 'The design\'s name (default: the book\'s)' },
      { name: 'id', kind: 'string', arg: 'ID', help: 'The design\'s id (default: a slug of the name)' },
      { name: 'description', kind: 'string', arg: 'TEXT', help: 'A line on what the design is for' },
    ],
    examples: ['postext design book.postext -o novel.postext', 'postext design book/ --parts page,text,headings -o type.postext', 'postext pdf other/ --design novel.postext -o other.pdf'],
    run: () => import('./commands/design'),
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
    usage: 'postext build <input…> [--pdf F] [--html F] [--epub F] [--images DIR] [--docx F] [--idml F] [--watch]',
    options: [
      { name: 'pdf', kind: 'string', arg: 'FILE', help: 'Write the PDF here' },
      { name: 'html', kind: 'string', arg: 'PATH', help: 'Write the HTML here (.html file or folder)' },
      { name: 'epub', kind: 'string', arg: 'FILE', help: 'Write the EPUB here' },
      { name: 'images', kind: 'string', arg: 'DIR', help: 'Write page images here' },
      { name: 'docx', kind: 'string', arg: 'FILE', help: 'Write the Word file here' },
      { name: 'docx-variant', kind: 'string', arg: 'semantic|formatted|facsimile', help: 'With --docx: content only (semantic), the book\'s design (formatted, the default) or the laid-out pages in text boxes (facsimile)' },
      { name: 'docx-fonts', kind: 'boolean', help: 'With --docx: embed the book\'s faces (default on; the semantic file embeds none)' },
      { name: 'idml', kind: 'string', arg: 'FILE', help: 'Write the InDesign package (IDML) here' },
      { name: 'idml-images', kind: 'string', arg: 'embed|link', help: 'With --idml: pictures inside the file (embed, default) or beside it in Links/ (link)' },
      { name: 'idml-lines', kind: 'string', arg: 'keep|reflow', help: 'With --idml: lines as Postext broke them (keep, default) or left to InDesign\'s composer (reflow)' },
      { name: 'idml-spreads', kind: 'string', arg: 'facing|single', help: 'With --idml: facing spreads or one page to a spread, whatever the margins say' },
      { name: 'idml-fonts', kind: 'boolean', help: 'With --idml: write the font files beside the package, in Document fonts/' },
      { name: 'pages', short: 'p', kind: 'string', arg: 'LIST', help: `With --images: ${PAGES_HELP}` },
      { name: 'pattern', kind: 'string', arg: 'NAME', help: 'With --images: file name pattern (default "page-{n:03}")' },
      { name: 'jobs', short: 'j', kind: 'number', arg: 'N', help: 'With --images: images encoded at once' },
      { name: 'watch', short: 'w', kind: 'boolean', help: 'Stay running and rebuild when the sources change' },
      ...PDF_OPTIONS,
      ...HTML_OPTIONS,
      ...EPUB_OPTIONS,
      ...IMAGE_OPTIONS,
    ],
    examples: ['postext build book/ --pdf out/book.pdf --html out/book.html --images out/pages', 'postext build chapters/ --pdf book.pdf --watch', 'postext build book/ --pdf book.pdf --docx book.docx --docx-variant semantic'],
    canvas: true,
    run: () => import('./commands/build'),
  },
];

/** Commands that read a book (and take BOOK_OPTIONS). */
export const BOOK_COMMANDS = new Set(['pdf', 'html', 'epub', 'image', 'images', 'docx', 'idml', 'pack', 'design', 'info', 'check', 'build']);

export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((c) => c.name === name);
}

export function commandOptions(spec: CommandSpec): OptionSpec[] {
  const own = new Set(spec.options.map((o) => o.name));
  const book = BOOK_COMMANDS.has(spec.name) ? BOOK_OPTIONS.filter((o) => !own.has(o.name)) : [];
  return [...spec.options, ...book, ...GLOBAL_OPTIONS];
}
