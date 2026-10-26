'use client';

import { useEffect, useReducer } from 'react';
import { baseFontFamily, primaryFontFamily, resolveBodyTextConfig, resolveHeadingsConfig, type PostextConfig } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../context/SandboxContext.js';
import { fontFamilySource, getConfigFontFamilies, loadFont, onCustomFontsChanged, onFontSourceResolved, type FontFamilySource } from '../controls/fonts/fontLoader.js';
import { RowTag } from '../ui/index.js';

/** A family the book is set in, and what it sets. */
export interface BookFontFamily {
  family: string;
  body: boolean;
  headings: boolean;
}

/** Every family the design and the text use, with where it is used: the
 *  body first, then the headings, then the rest alphabetically. `texts`
 *  are the chapters' sources (the text names faces too: comic lettering, a
 *  comic line's own `font=`). */
export function bookFontFamilies(config: PostextConfig, texts: readonly string[]): BookFontFamily[] {
  // Families as the engine sets them: a CSS font stack by its first family,
  // as `getConfigFontFamilies` lists it.
  // A style's figures (#1237) name a feature family (`Lora@onum`): the
  // family is its base family.
  const body = baseFontFamily(primaryFontFamily(resolveBodyTextConfig(config.bodyText).fontFamily));
  const headings = resolveHeadingsConfig(config.headings);
  const headingFamilies = new Set([headings.fontFamily, ...headings.levels.map((l) => l.fontFamily)].map((f) => baseFontFamily(primaryFontFamily(f))));
  const families = getConfigFontFamilies(config, [...texts]);
  // Body first, then headings, then the rest alphabetically.
  const rank = (f: string) => (f === body ? 0 : headingFamilies.has(f) ? 1 : 2);
  return [...new Set(families)]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((family) => ({ family, body: family === body, headings: headingFamilies.has(family) }));
}

/** "Typefaces in this book": every family the design uses, set in itself,
 *  with where it is used and where it comes from. Answers the first thing an
 *  editor asks of a fonts panel before any file is uploaded. */
export function BookFonts() {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  // The text names faces too: comic lettering, a comic line's own `font=`.
  const chapters = useSandboxSelector((s) => s.chapters);
  const used = bookFontFamilies(config, chapters.map((c) => c.markdown));
  const ordered = used.map((u) => u.family);

  useEffect(() => { for (const f of ordered) loadFont(f); }, [ordered.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  // Where a family comes from is known once the loader has its record: the
  // list is drawn again when one arrives, or when a file is added or removed.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offSource = onFontSourceResolved(redraw);
    const offCustom = onCustomFontsChanged(redraw);
    return () => { offSource(); offCustom(); };
  }, []);
  const sourceLabel: Record<FontFamilySource, string> = {
    custom: labels.bookFontsSourceCustom,
    google: labels.bookFontsSourceGoogle,
    fontsource: labels.bookFontsSourceFontsource,
    missing: labels.bookFontsSourceMissing,
  };

  return (
    <section aria-labelledby="book-fonts-title" className="mb-4">
      <h3 id="book-fonts-title" className="mb-1 text-[0.72rem] font-semibold tracking-[0.12em] text-(--slate) pt-caps">
        {labels.bookFontsTitle}
      </h3>
      <p className="mb-2 text-[0.68rem] leading-[1.4] text-(--slate)">{labels.bookFontsDescription}</p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {used.map(({ family, body, headings }) => {
          const roles: string[] = [];
          if (body) roles.push(labels.bookFontsRoleBody);
          if (headings) roles.push(labels.bookFontsRoleHeadings);
          if (roles.length === 0) roles.push(labels.bookFontsRoleOther);
          // No tag while the loader has no answer (#739).
          const source = fontFamilySource(family);
          return (
            <li key={family} className="flex items-center gap-3 rounded-md border border-(--rule) px-2.5 py-2">
              <span
                aria-hidden="true"
                className="w-10 shrink-0 text-center text-2xl leading-none text-(--foreground)"
                style={{ fontFamily: `"${family}", serif` }}
              >
                Aa
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-xs font-medium text-(--foreground)">{family}</span>
                <span className="flex flex-wrap items-center gap-1">
                  {roles.map((r) => <RowTag key={r} accent={r === labels.bookFontsRoleBody}>{r}</RowTag>)}
                  {source && <RowTag>{sourceLabel[source]}</RowTag>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
