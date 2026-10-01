import { Fragment, type ReactNode } from "react";
import { abbreviationPattern, abbreviationsFor } from "@/lib/glossary/abbreviations";

/**
 * Plain message text with the first occurrence of the listed abbreviations
 * (by dictionary id: "pdf", "html") wrapped in `<abbr title="…">` (WCAG
 * 3.1.4), for the pages whose prose comes from the messages. Pass one `seen`
 * set to every call of a component so a repeated abbreviation is expanded
 * once. Server or client.
 */
export function abbreviate(text: string, locale: string, ids: readonly string[], seen: Set<string> = new Set()): ReactNode {
  const entries = abbreviationsFor(locale);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(abbreviationPattern(locale))) {
    const entry = entries.get(match[0]);
    if (!entry || !ids.includes(entry.id) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    parts.push(text.slice(last, match.index));
    parts.push(
      <abbr key={match.index} title={entry.title}>
        {match[0]}
      </abbr>,
    );
    last = match.index + match[0].length;
  }
  if (parts.length === 0) return text;
  parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}
