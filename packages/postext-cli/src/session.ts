// The steps every book command shares: read the book, resolve its fonts,
// lay it out.

import { basename, extname, resolve } from 'node:path';
import type { MeasurementCache } from 'postext';
import { slugify } from 'postext/bundle';
import type { CommandContext } from './context';
import { resolveFonts, type FontSet } from './fonts';
import { loadBook, type Book } from './input';
import { layOut, type Layout } from './layout';

export interface Session {
  book: Book;
  fonts: FontSet;
}

export async function openBook(ctx: CommandContext): Promise<Session> {
  const { opts, reporter } = ctx;
  const book = await reporter.time('read', () => loadBook(ctx.inputs, opts, reporter));
  reporter.data.book = { name: book.name, id: book.id, locale: book.locale, chapters: book.chapters.length };
  reporter.detail(`${book.name} (${book.locale}): ${book.chapters.length} chapters, ${book.resources.length} resources`);
  const fonts = await reporter.time('fonts', () => resolveFonts(book, {
    fontDirs: opts.list('font-dir'),
    offline: opts.flag('offline') === true,
    ...(opts.string('cache-dir') ? { cacheDir: opts.string('cache-dir')! } : {}),
  }, reporter));
  return { book, fonts };
}

export async function openAndLayOut(ctx: CommandContext, cache?: MeasurementCache): Promise<Session & { layout: Layout }> {
  const session = await openBook(ctx);
  const layout = await layOut(session.book, ctx.opts, ctx.reporter, cache);
  ctx.reporter.info(`${session.book.name}: ${layout.pageCount} pages in ${layout.chapters.length} chapter${layout.chapters.length === 1 ? '' : 's'} (${Math.round(ctx.reporter.timings.layout ?? 0)} ms)`);
  return { ...session, layout };
}

/** Where an output goes when -o is not given: beside nothing, in the
 *  current folder, named after the input. */
export function defaultOutput(ctx: CommandContext, book: Book, ext: string): string {
  const input = ctx.inputs.length === 1 ? ctx.inputs[0]! : undefined;
  const base = input ? basename(resolve(input), extname(input)) : slugify(book.name) || 'book';
  return `${base}${ext}`;
}
