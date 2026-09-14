'use client';

import { matchRanges } from '../sidebar/search/normalize';

interface HighlightedTextProps {
  text: string;
  tokens: readonly string[];
}

/** Renders `text` with every search hit wrapped in a gilt-tinted mark. */
export function HighlightedText({ text, tokens }: HighlightedTextProps) {
  if (tokens.length === 0) return <>{text}</>;
  const ranges = matchRanges(text, tokens);
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={i}
        style={{ backgroundColor: 'color-mix(in srgb, var(--gilt) 30%, transparent)', color: 'inherit', borderRadius: 2 }}
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
