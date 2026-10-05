'use client';

import { Fragment, useEffect, type CSSProperties } from 'react';
import { chineseScriptOf, defaultCjkEmphasis, isJapaneseLanguage, resolveCjkConfig, resolveColorValue, resolveLayoutConfig, resolvePageConfig } from 'postext';
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

/** The sample of a Japanese document: the opening of 夏目漱石『吾輩は猫で
 *  ある』 (1905), kanji, hiragana and katakana (ニャーニャー), with a bold
 *  run, an emphasised one (傍点), and the author and title in rōmaji, whose
 *  macrons (ō) not every Japanese face carries. */
const JAPANESE_SAMPLE = '**吾輩は猫である**。名前はまだ無い。どこで生れたか*とんと*見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。（Natsume Sōseki, *Wagahai wa neko de aru*）';

/** A short paragraph set with the body text settings — typeface, size,
 *  leading, weight, alignment, indent, colours — at true size on the page
 *  colour, in the document's language: a line of 紅樓夢 for a Chinese book,
 *  of 吾輩は猫である for a Japanese one, set top to bottom when its lines
 *  are vertical. The browser sets it, so line breaks are only indicative;
 *  the caption says so. */
export function TypeSample({ body, lang }: TypeSampleProps) {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const palette = config.colorPalette;
  const page = resolvePageConfig(config.page);
  const vertical = resolveLayoutConfig(config.layout).writingMode === 'vertical-rl';
  useEffect(() => { loadFont(body.fontFamily); }, [body.fontFamily]);

  const script = chineseScriptOf(lang);
  const japanese = isJapaneseLanguage(lang);
  const text = script ? CHINESE_SAMPLE[script] : japanese ? JAPANESE_SAMPLE : labels.bodyTypeSample;
  // `*…*` in Chinese and Japanese text prints what `cjk.emphasis` resolves
  // to (#193): emphasis marks unless the document asks for italics, in the
  // shape and on the side `cjk.emphasisMark` gives (the dot under Chinese
  // text, the sesame over Japanese text; right of a vertical line).
  const emphasisSetting = config.cjk?.emphasis ?? 'auto';
  const dots = (script !== undefined || japanese) && (emphasisSetting === 'auto' ? defaultCjkEmphasis(lang) : emphasisSetting) === 'dots';
  const resolvedMark = dots ? resolveCjkConfig(config.cjk, lang).emphasisMark : null;
  const mark: EmphasisMark | null = resolvedMark && {
    side: vertical ? (resolvedMark.position === 'under' ? 'left' : 'right') : resolvedMark.position === 'over' ? 'over' : 'under',
    shape: resolvedMark.style,
    open: resolvedMark.fill === 'open' || (resolvedMark.fill === 'auto' && resolvedMark.style === 'circle'),
  };

  const hex = (c: ResolvedBodyTextConfig['color'] | undefined, fallback: string) =>
    resolveColorValue(c, palette, { hex: fallback, model: 'hex' }).hex;
  const ink = hex(body.color, '#000000');
  const paper = page.backgroundColor.hex && page.backgroundColor.hex !== 'transparent' ? page.backgroundColor.hex : '#ffffff';
  const sizePt = toPt(body.fontSize);
  const leadPt = toPt(body.lineHeight);
  const indentPt = toPt(body.firstLineIndent);
  // True size (1 pt = 4/3 px), capped so a display size still fits.
  const sizePx = Math.min(sizePt * (4 / 3), 22);

  const emphasis: CSSProperties = { fontStyle: dots ? 'normal' : 'italic', color: hex(body.italicColor, ink) };

  return (
    <figure className="mb-3 overflow-hidden rounded-md border border-(--rule)">
      <div
        lang={lang}
        dir="auto"
        aria-hidden="true"
        className="px-3 py-2.5"
        style={{
          backgroundColor: paper,
          color: ink,
          fontFamily: `"${body.fontFamily}", serif`,
          fontWeight: body.fontWeight,
          fontSize: `${sizePx}px`,
          lineHeight: sizePt > 0 ? leadPt / sizePt : 1.3,
          textAlign: body.textAlign === 'justify' ? 'justify' : 'start',
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
        }, mark)}
      </div>
      <figcaption className="border-t border-(--rule) bg-(--surface) px-2 py-1 text-[0.62rem] text-(--slate)">
        {labels.bodyTypeSampleCaption}
      </figcaption>
    </figure>
  );
}

/** An emphasis mark as the sample draws it: the side of the character
 *  (on the page: over and under a horizontal line, right and left of a
 *  vertical one), the shape, and whether it is an outline. */
interface EmphasisMark {
  side: 'under' | 'over' | 'right' | 'left';
  shape: 'dot' | 'circle' | 'sesame';
  open: boolean;
}

/** `**bold**` and `*italic*` runs of the sample text; `mark` sets the
 *  italic runs of East Asian characters with emphasis marks instead (Latin
 *  letters in them keep their italics, as on the page). */
function renderSample(text: string, styles: { bold: CSSProperties; italic: CSSProperties }, mark: EmphasisMark | null) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**')) return <strong key={i} style={styles.bold}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*') && p.length > 1) {
      const run = p.slice(1, -1);
      const marked = mark !== null && !/\p{Script=Latin}/u.test(run);
      return <em key={i} style={marked ? styles.italic : { ...styles.italic, fontStyle: 'italic' }}>{marked ? dotted(run, mark) : run}</em>;
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

const DOT: CSSProperties = {
  position: 'absolute',
  width: '0.18em',
  height: '0.18em',
  borderRadius: '50%',
  backgroundColor: 'currentColor',
};

/** The mark's box: a dot, a circle, or the sesame ﹅, a lens whose points
 *  run from top left to bottom right, as the glyph leans (the same on a
 *  vertical page, JLReq §3.3.9); an outline for the open marks (﹆, ○). */
function markStyle(mark: EmphasisMark): CSSProperties {
  const shape: CSSProperties = mark.shape === 'sesame'
    ? { ...DOT, width: '0.2em', height: '0.2em', borderRadius: '0 100%' }
    : mark.shape === 'circle' ? { ...DOT, width: '0.22em', height: '0.22em' } : DOT;
  return mark.open
    ? { ...shape, backgroundColor: 'transparent', border: '0.035em solid currentColor', boxSizing: 'border-box' }
    : shape;
}

/** Emphasis marks (着重号, 傍点), one per character and none on
 *  punctuation. Drawn apart from the text, so they take no room: CSS
 *  `text-emphasis` would open the line they sit on (the sample would
 *  misstate the leading), and its dot comes out a speck in the Noto faces.
 *  Under or over the character a mark hangs from the baseline (a box of no
 *  size set just before the character, which the line cannot break from),
 *  clear of the ideographic em box that runs from 0.88 em above the
 *  baseline to 0.12 em below it; right or left of it in a vertical line,
 *  it sits past the em box from the middle of the character, which is the
 *  middle of its line there. */
function dotted(run: string, mark: EmphasisMark) {
  const box = markStyle(mark);
  return Array.from(run).map((ch, i) => {
    if (!/[\p{L}\p{N}]/u.test(ch)) return <Fragment key={i}>{ch}</Fragment>;
    if (mark.side === 'right' || mark.side === 'left') {
      const left = mark.side === 'right' ? 'calc(50% + 0.68em)' : 'calc(50% - 0.68em)';
      return (
        <span key={i} style={{ position: 'relative' }}>
          {ch}
          <span style={{ ...box, top: '50%', left, transform: 'translate(-50%, -50%)' }} />
        </span>
      );
    }
    const top = mark.side === 'under' ? '0.24em' : `calc(-0.94em - ${String(box.height)})`;
    return (
      <span key={i} style={{ whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-block', width: 0, height: 0, position: 'relative' }}>
          <span style={{ ...box, left: '0.5em', top, transform: 'translateX(-50%)' }} />
        </span>
        {ch}
      </span>
    );
  });
}
