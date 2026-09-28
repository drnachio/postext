'use client';

import { Fragment, useEffect, type CSSProperties } from 'react';
import { chineseScriptOf, resolveColorValue, resolveLayoutConfig, resolvePageConfig } from 'postext';
import type { ResolvedBodyTextConfig } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { loadFont } from '../../controls/fontLoader';
import { toPt } from '../../controls/units';

interface TypeSampleProps {
  body: ResolvedBodyTextConfig;
  /** BCP 47 language of the document (drives the browser's hyphenation,
   *  the glyph forms of Han characters, and the sample's language). */
  lang: string;
}

/** The sample of a Chinese document: the opening of 紅樓夢 (程乙本), with
 *  a bold run and an emphasised one. Content, not interface text: it
 *  follows the document's script, whatever the interface language. */
const CHINESE_SAMPLE = {
  Hant: '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將*真事隱去*，而借「通靈」之說，撰此**《石頭記》**一書也。',
  Hans: '此开卷第一回也。作者自云：因曾历过一番梦幻之后，故将*真事隐去*，而借“通灵”之说，撰此**《石头记》**一书也。',
} as const;

/** A short paragraph set with the body text settings — typeface, size,
 *  leading, weight, alignment, indent, colours — at true size on the page
 *  colour, in the document's language: a line of 紅樓夢 for a Chinese book,
 *  set top to bottom when its lines are vertical. The browser sets it, so
 *  line breaks are only indicative; the caption says so. */
export function TypeSample({ body, lang }: TypeSampleProps) {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const palette = config.colorPalette;
  const page = resolvePageConfig(config.page);
  const vertical = resolveLayoutConfig(config.layout).writingMode === 'vertical-rl';
  useEffect(() => { loadFont(body.fontFamily); }, [body.fontFamily]);

  const script = chineseScriptOf(lang);
  const text = script ? CHINESE_SAMPLE[script] : labels.bodyTypeSample;
  // `*…*` in Chinese text prints emphasis dots unless `cjk.emphasis` asks
  // for italics (#193).
  const dots = script !== undefined && (config.cjk as { emphasis?: string } | undefined)?.emphasis !== 'italic';

  const hex = (c: ResolvedBodyTextConfig['color'] | undefined, fallback: string) =>
    resolveColorValue(c, palette, { hex: fallback, model: 'hex' }).hex;
  const ink = hex(body.color, '#000000');
  const paper = page.backgroundColor.hex && page.backgroundColor.hex !== 'transparent' ? page.backgroundColor.hex : '#ffffff';
  const sizePt = toPt(body.fontSize);
  const leadPt = toPt(body.lineHeight);
  const indentPt = toPt(body.firstLineIndent);
  // True size (1 pt = 4/3 px), capped so a display size still fits.
  const sizePx = Math.min(sizePt * (4 / 3), 22);

  const emphasis: CSSProperties = dots
    ? {
      fontStyle: 'normal',
      textEmphasis: 'filled dot',
      // Under the characters in horizontal Chinese, to their right in vertical.
      textEmphasisPosition: 'under right',
      color: hex(body.italicColor, ink),
    }
    : { fontStyle: 'italic', color: hex(body.italicColor, ink) };

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
          fontSize: `${sizePx}px`,
          lineHeight: sizePt > 0 ? leadPt / sizePt : 1.3,
          textAlign: body.textAlign === 'justify' ? 'justify' : 'left',
          hyphens: (body.textAlign === 'justify' || body.hyphenation.ragged) && body.hyphenation.enabled ? 'auto' : 'manual',
          textIndent: `${indentPt * (4 / 3)}px`,
          ...(vertical
            ? {
              writingMode: 'vertical-rl',
              // A column about a dozen characters tall; the lines run
              // leftward and the ones past the left edge are cut.
              height: `${Math.round(Math.min(sizePx * 12, 220))}px`,
              width: '100%',
              overflow: 'hidden',
            }
            : {}),
        }}
      >
        {renderSample(text, {
          bold: { fontWeight: body.boldFontWeight, color: hex(body.boldColor, ink) },
          italic: emphasis,
        })}
      </div>
      <figcaption className="border-t border-(--rule) bg-(--surface) px-2 py-1 text-[0.62rem] text-(--slate)">
        {labels.bodyTypeSampleCaption}
      </figcaption>
    </figure>
  );
}

/** `**bold**` and `*italic*` runs of the sample text. */
function renderSample(text: string, styles: { bold: CSSProperties; italic: CSSProperties }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**')) return <strong key={i} style={styles.bold}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*') && p.length > 1) return <em key={i} style={styles.italic}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
