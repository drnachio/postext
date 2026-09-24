'use client';

import { useEffect } from 'react';
import { resolveBodyTextConfig, resolveHeadingsConfig } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../context/SandboxContext';
import { getConfigFontFamilies, isCustomFontFamily, loadFont } from '../controls/fontLoader';
import { RowTag } from '../ui';

/** "Typefaces in this book": every family the design uses, set in itself,
 *  with where it is used and where it comes from. Answers the first thing an
 *  editor asks of a fonts panel before any file is uploaded. */
export function BookFonts() {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const body = resolveBodyTextConfig(config.bodyText).fontFamily;
  const headings = resolveHeadingsConfig(config.headings);
  const headingFamilies = new Set([headings.fontFamily, ...headings.levels.map((l) => l.fontFamily)]);
  const families = getConfigFontFamilies(config);
  // Body first, then headings, then the rest alphabetically.
  const rank = (f: string) => (f === body ? 0 : headingFamilies.has(f) ? 1 : 2);
  const ordered = [...new Set(families)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  useEffect(() => { for (const f of ordered) loadFont(f); }, [ordered.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-labelledby="book-fonts-title" className="mb-4">
      <h3 id="book-fonts-title" className="mb-1 text-[0.6rem] font-semibold tracking-[0.12em] text-(--slate) uppercase">
        {labels.bookFontsTitle}
      </h3>
      <p className="mb-2 text-[0.68rem] leading-[1.4] text-(--slate)">{labels.bookFontsDescription}</p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {ordered.map((family) => {
          const roles: string[] = [];
          if (family === body) roles.push(labels.bookFontsRoleBody);
          if (headingFamilies.has(family)) roles.push(labels.bookFontsRoleHeadings);
          if (roles.length === 0) roles.push(labels.bookFontsRoleOther);
          const custom = isCustomFontFamily(family);
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
                  <RowTag>{custom ? labels.bookFontsSourceCustom : labels.bookFontsSourceGoogle}</RowTag>
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
