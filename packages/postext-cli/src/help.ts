// The help screens: the overview `postext` prints with no arguments, and
// one page per command (`postext help pdf`, `postext pdf --help`).

import type { OptionSpec } from './args';
import { BOOK_COMMANDS, BOOK_OPTIONS, COMMANDS, GLOBAL_OPTIONS, type CommandSpec } from './commands';
import { style } from './log';
import { VERSION } from './version';

function optionLines(options: readonly OptionSpec[]): string[] {
  const label = (o: OptionSpec) => {
    const flag = o.kind === 'boolean' && o.name === 'color' ? '--[no-]color' : `--${o.name}`;
    const short = o.short ? `-${o.short}, ` : '    ';
    return `${short}${flag}${o.arg ? ` ${o.arg}` : ''}`;
  };
  const width = Math.min(34, Math.max(...options.map((o) => label(o).length)) + 2);
  return options.map((o) => {
    const l = label(o);
    return `  ${l.padEnd(width)}${l.length >= width ? `\n  ${' '.repeat(width)}` : ''}${o.help}`;
  });
}

const INPUT_LINES = [
  '  book.postext            a packed book (zip with preset.json)',
  '  folder/                 an unpacked book (preset.json, chapters/, resources/, fonts/)',
  '  a.md b.md …  | folder/  loose Markdown chapters, in the order given (a folder: its',
  '                          .md files by name); add --config, --resources, --fonts, --name',
];

export function mainHelp(): string {
  const width = Math.max(...COMMANDS.map((c) => c.name.length)) + 3;
  return [
    `${style.bold('postext')} ${VERSION} — typeset Markdown books into PDF, HTML, EPUB, page images and Word`,
    '',
    style.bold('Usage'),
    '  postext <command> <input…> [options]',
    '  postext help <command>',
    '',
    style.bold('Commands'),
    ...COMMANDS.map((c) => `  ${c.name.padEnd(width)}${c.summary}`),
    '',
    style.bold('Input'),
    ...INPUT_LINES,
    '',
    style.bold('Examples'),
    '  postext pdf book.postext -o book.pdf',
    '  postext image book.postext --page 1 -o cover.png',
    '  postext images book.postext -o pages/ --dpi 100',
    '  postext html chapters/ --name "Field notes" -o notes.html',
    '  postext build book/ --pdf book.pdf --epub book.epub --watch',
    '  postext check book.postext --json',
    '',
    style.bold('Book options') + ' (every command that reads a book)',
    ...optionLines(BOOK_OPTIONS),
    '',
    style.bold('Global options'),
    ...optionLines(GLOBAL_OPTIONS),
    '',
    style.bold('Exit codes') + '  0 done · 1 failed · 2 wrong usage · 3 check found problems',
    '',
    `Run ${style.bold('postext help <command>')} for the options of a command. Docs: https://postext.dev/docs`,
  ].join('\n');
}

export function commandHelp(spec: CommandSpec): string {
  const own = spec.options;
  return [
    `${style.bold(`postext ${spec.name}`)} — ${spec.summary}`,
    '',
    style.bold('Usage'),
    `  ${spec.usage}`,
    ...(spec.description ? ['', ...wrap(spec.description, 78).map((l) => `  ${l}`)] : []),
    ...(BOOK_COMMANDS.has(spec.name) ? ['', style.bold('Input'), ...INPUT_LINES] : []),
    '',
    style.bold('Options'),
    ...optionLines(own),
    ...(BOOK_COMMANDS.has(spec.name) ? ['', style.bold('Book options'), ...optionLines(BOOK_OPTIONS.filter((o) => !own.some((x) => x.name === o.name)))] : []),
    '',
    style.bold('Global options'),
    ...optionLines(GLOBAL_OPTIONS),
    '',
    style.bold('Examples'),
    ...spec.examples.map((e) => `  ${e}`),
  ].join('\n');
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
