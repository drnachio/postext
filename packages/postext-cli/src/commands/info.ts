import type { CommandContext } from '../context';
import { layOut } from '../layout';
import { style } from '../log';
import { openBook } from '../session';

export default async function info(ctx: CommandContext): Promise<void> {
  const { opts, reporter } = ctx;
  const { book, fonts } = await openBook(ctx);
  const layout = opts.flag('pages') ? await layOut(book, opts, reporter) : undefined;
  const kinds: Record<string, number> = {};
  for (const r of book.resources) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
  const families = [...fonts.families].map((family) => {
    const faces = fonts.familyFaces(family);
    return {
      family,
      source: [...new Set(faces.map((f) => f.source))].join('+') || 'missing',
      variants: faces.map((f) => `${f.weight}${f.style === 'italic' ? 'i' : ''}`).sort(),
    };
  });
  const chapters = book.chapters.map((c, i) => ({
    title: c.title,
    ...(c.file ? { file: c.file } : {}),
    words: c.markdown.split(/\s+/).filter(Boolean).length,
    ...(layout && layout.chapters.includes(c) ? { pages: layout.docs[layout.chapters.indexOf(c)]!.pages.length } : {}),
    index: i + 1,
  }));
  const page = book.config.page;
  Object.assign(reporter.data, {
    book: {
      name: book.name,
      id: book.id,
      ...(book.description ? { description: book.description } : {}),
      kind: book.kind,
      locale: book.locale,
      ...(book.locales ? { locales: book.locales } : {}),
      ...(page?.sizePreset ? { pageSize: page.sizePreset } : {}),
    },
    chapters,
    resources: { total: book.resources.length, ...kinds },
    fonts: families,
    files: book.files.size,
  });
  if (reporter.json) return;
  const out: string[] = [];
  out.push(`${style.bold(book.name)}${book.description ? ` — ${book.description}` : ''}`);
  out.push(`  ${book.kind}, id ${book.id}, locale ${book.locale}${book.locales ? ` (also ${book.locales.filter((l) => l !== book.locale).join(', ')})` : ''}`);
  if (layout) out.push(`  ${layout.pageCount} pages`);
  out.push('', style.bold(`Chapters (${chapters.length})`));
  for (const c of chapters) out.push(`  ${String(c.index).padStart(3)}  ${c.title}${style.dim(`  ${c.words} words${c.pages !== undefined ? `, ${c.pages} pages` : ''}${c.file ? `  ${c.file}` : ''}`)}`);
  out.push('', style.bold(`Resources (${book.resources.length})`) + (book.resources.length ? `  ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}` : ''));
  out.push('', style.bold('Fonts'));
  for (const f of families) {
    const tag = f.source.includes('fallback') ? style.yellow(f.source) : style.dim(f.source);
    out.push(`  ${f.family.padEnd(28)} ${tag}  ${style.dim(f.variants.join(' '))}`);
  }
  process.stdout.write(`${out.join('\n')}\n`);
}
