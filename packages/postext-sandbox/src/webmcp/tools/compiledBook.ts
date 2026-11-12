// `sandbox_export` of a project compiled as its row of the Books panel
// does (#1526): a PDF, an HTML page or an EPUB 3 of a book that need not
// be on screen, in one of its languages, laid out apart from the book on
// screen.

import type { CompiledFormat } from '../../export/compileBook.js';
import { isCompileCancelled } from '../../export/compileStore.js';
import type { SandboxToolHost } from '../host.js';
import { ToolError } from '../modelContext.js';

/** Whether `sandbox_export` compiles from the Books panel: an html, or a
 *  pdf or an epub of a `book`. */
export const compilesFromLibrary = (format: string, args: Record<string, unknown>): format is CompiledFormat =>
  format === 'html' || (args.book !== undefined && (format === 'pdf' || format === 'epub'));

/** Compile the project `args.book` names (the one on screen for an html
 *  without it): the file and what the answer says of it. */
export async function compileFromLibrary(
  host: SandboxToolHost,
  args: Record<string, unknown>,
  format: CompiledFormat,
): Promise<{ file: { name: string; bytes: Uint8Array; mime: string }; about: Record<string, unknown> }> {
  const s = host.store.getSnapshot();
  const other = args.book as { kind: 'sample' | 'project'; id: string; language?: string } | undefined;
  if (args.scope !== undefined) throw new ToolError('"scope" goes with the pdf of the book on screen: a book compiled from the Books panel is written whole.');
  if (other?.kind === 'sample') throw new ToolError(`A ${format} is written of one of the reader's projects. Open the sample (sandbox_open_book) to write it from its tab, or copy it into a project first.`);
  const id = other?.id ?? s.activeProjectId;
  if (!id) throw new ToolError('An html is written of one of the reader\'s projects: give "book", or open a project first.');
  if (!s.projects.some((p) => p.id === id)) throw new ToolError(`No project with id ${JSON.stringify(id)}. The projects: ${s.projects.map((p) => `${p.id} (${p.name})`).join(', ') || 'none'}.`);
  try {
    const book = await host.store.projectActions.compile(id, format, {
      ...(other?.language ? { locale: other.language } : {}),
      ...(args.epubLayout ? { epubLayout: args.epubLayout as 'fixed' | 'reflowable' } : {}),
    });
    return {
      file: { name: book.fileName, bytes: book.bytes, mime: book.mime },
      about: {
        book: { kind: 'project', id, language: book.locale },
        pages: book.pages,
        ...(book.warnings.length > 0 ? { warnings: book.warnings } : {}),
        ...(book.epubNotices && book.epubNotices.length > 0 ? { epubWarnings: book.epubNotices } : {}),
      },
    };
  } catch (err) {
    if (isCompileCancelled(err)) throw new ToolError(`The ${format} was cancelled before it was written (the reader stopped it, or the book was deleted).`);
    throw new ToolError(`The ${format} could not be written: ${err instanceof Error ? err.message : String(err)}`);
  }
}
