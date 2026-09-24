'use client';

import { useMemo, type ReactNode } from 'react';
import { useSettingsSearch } from '../sidebar/search/SearchContext';
import { MatchScopeProvider, useScopeVisible } from '../sidebar/search/MatchScope';
import { normalizeText } from '../sidebar/search/normalize';
import { HighlightedText } from '../ui/highlight';

interface FieldGroupProps {
  title: string;
  /** One line under the title saying what the fields decide. */
  description?: string;
  children: ReactNode;
}

/** A titled, always-open cluster of fields inside a section (e.g. "Size",
 *  "Margins"). A `fieldset` so assistive tech announces the title when
 *  focus enters the group. Takes part in the settings search like a
 *  section: hidden when nothing inside matches, everything shown when its
 *  own title does. */
export function FieldGroup(props: FieldGroupProps) {
  const search = useSettingsSearch();
  const normalized = useMemo(() => normalizeText(props.title), [props.title]);
  const titleMatch = search.matcher.tokens.length > 0 && search.matcher.test(normalized);
  return (
    <MatchScopeProvider titleMatch={titleMatch}>
      <FieldGroupBody {...props} titleMatch={titleMatch} />
    </MatchScopeProvider>
  );
}

function FieldGroupBody({ title, description, children, titleMatch }: FieldGroupProps & { titleMatch: boolean }) {
  const search = useSettingsSearch();
  const visible = useScopeVisible(titleMatch);
  return (
    <fieldset className="@container m-0 mb-3 min-w-0 border-0 p-0 last:mb-0" style={visible ? undefined : { display: 'none' }}>
      <legend className="mb-1.5 p-0 text-[0.6rem] font-semibold tracking-[0.12em] text-(--slate) uppercase">
        <HighlightedText text={title} tokens={search.matcher.tokens} />
      </legend>
      {description && (
        <p className="-mt-1 mb-2 text-[0.66rem] leading-[1.35] text-(--slate) [text-wrap:pretty]">{description}</p>
      )}
      {children}
    </fieldset>
  );
}
