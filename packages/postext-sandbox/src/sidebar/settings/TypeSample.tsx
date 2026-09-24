'use client';

import { Fragment, useEffect } from 'react';
import { resolveColorValue, resolvePageConfig } from 'postext';
import type { ResolvedBodyTextConfig } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { loadFont } from '../../controls/fontLoader';
import { toPt } from '../../controls/units';

interface TypeSampleProps {
  body: ResolvedBodyTextConfig;
  /** BCP 47 language of the document (drives the browser's hyphenation). */
  lang: string;
}

/** A short paragraph set with the body text settings — typeface, size,
 *  leading, weight, alignment, indent, colours — at true size on the page
 *  colour. The browser sets it, so line breaks are only indicative; the
 *  caption says so. */
export function TypeSample({ body, lang }: TypeSampleProps) {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const palette = config.colorPalette;
  const page = resolvePageConfig(config.page);
  useEffect(() => { loadFont(body.fontFamily); }, [body.fontFamily]);

  const hex = (c: ResolvedBodyTextConfig['color'] | undefined, fallback: string) =>
    resolveColorValue(c, palette, { hex: fallback, model: 'hex' }).hex;
  const ink = hex(body.color, '#000000');
  const paper = page.backgroundColor.hex && page.backgroundColor.hex !== 'transparent' ? page.backgroundColor.hex : '#ffffff';
  const sizePt = toPt(body.fontSize);
  const leadPt = toPt(body.lineHeight);
  const indentPt = toPt(body.firstLineIndent);

  return (
    <figure className="mb-3 overflow-hidden rounded-md border border-(--rule)">
      <div
        lang={lang}
        aria-hidden="true"
        className="px-3 py-2.5"
        style={{
          backgroundColor: paper,
          color: ink,
          fontFamily: `"${body.fontFamily}", serif`,
          fontWeight: body.fontWeight,
          // True size (1 pt = 4/3 px), capped so a display size still fits.
          fontSize: `${Math.min(sizePt * (4 / 3), 22)}px`,
          lineHeight: sizePt > 0 ? leadPt / sizePt : 1.3,
          textAlign: body.textAlign === 'justify' ? 'justify' : 'left',
          hyphens: body.textAlign === 'justify' && body.hyphenation.enabled ? 'auto' : 'manual',
          textIndent: `${indentPt * (4 / 3)}px`,
        }}
      >
        {renderSample(labels.bodyTypeSample, {
          bold: { fontWeight: body.boldFontWeight, color: hex(body.boldColor, ink) },
          italic: { fontStyle: 'italic', color: hex(body.italicColor, ink) },
        })}
      </div>
      <figcaption className="border-t border-(--rule) bg-(--surface) px-2 py-1 text-[0.62rem] text-(--slate)">
        {labels.bodyTypeSampleCaption}
      </figcaption>
    </figure>
  );
}

/** `**bold**` and `*italic*` runs of the sample text. */
function renderSample(text: string, styles: { bold: React.CSSProperties; italic: React.CSSProperties }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**')) return <strong key={i} style={styles.bold}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*') && p.length > 1) return <em key={i} style={styles.italic}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
