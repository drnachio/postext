// Word export (`postext/word`): the chapters as a .docx whose styles follow
// the import template; what Word cannot say is kept verbatim in the
// "Postext Markup" styles, and the template travels inside the file, so it
// imports back unchanged.

import { readFileSync } from 'node:fs';
import { extractFrontmatter, metadataText } from 'postext';
import { emptyTemplate, parseTemplate, postextToDocx, readDocx, type WordTemplate } from 'postext/word';
import { CliError } from '../args';
import type { Book, BookChapter } from '../input';
import { byteLength, writeOut } from '../io';
import type { Reporter } from '../log';

/** A template from a .json file, or from the one a .docx carries. */
export function readTemplate(path: string): WordTemplate {
  const bytes = new Uint8Array(readFileSync(path));
  let source: unknown;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) source = readDocx(bytes).embeddedTemplate;
  else {
    try {
      source = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new CliError(`${path} is neither a template (.json) nor a Word file`);
    }
  }
  const template = parseTemplate(source);
  if (!template) throw new CliError(`${path} holds no import template`);
  return template;
}

export async function writeDocx(book: Book, chapters: readonly BookChapter[], templatePath: string | undefined, reporter: Reporter, out: string): Promise<void> {
  const template = templatePath ? readTemplate(templatePath) : emptyTemplate();
  const meta = extractFrontmatter(chapters[0]?.markdown ?? '').metadata as Record<string, unknown>;
  const author = metadataText(Array.isArray(meta.author) ? meta.author.join(', ') : meta.author);
  const title = metadataText(meta.title) ?? book.name;
  const bytes = reporter.time('docx', () => postextToDocx(
    chapters.map((c) => ({ title: c.title, markdown: c.markdown })),
    { template, config: book.config, book: chapters.length > 1, title, ...(author ? { author } : {}) },
  ));
  await writeOut(out, bytes);
  reporter.output({ kind: 'docx', path: out, bytes: byteLength(bytes) });
}
