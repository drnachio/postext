import type { ColorValue, Dimension } from './page.js';

/** The conventions CJK text follows. Chinese, after the regions clreq
 *  describes: `mainland` (China and Singapore: simplified characters,
 *  GB/T 15834—2011), `taiwan` and `hongkong` (traditional characters).
 *  Japanese: `japan` (JIS X 4051, W3C JLReq), which every `ja` tag
 *  resolves to. */
export type CjkRegion = 'mainland' | 'taiwan' | 'hongkong' | 'japan';

/** How strictly lines of CJK text avoid starting or ending with a mark.
 *  The Chinese levels (clreq §6.1.1):
 *  - `none`: a line may break between any two characters (Taiwan and Hong
 *    Kong newspapers);
 *  - `basic`: no line starts with a pause or stop mark (、，；：。！？), a
 *    closing bracket or quote, a connector (– ～, a single —), an
 *    interpunct (·) or an iteration mark (々), and none ends with an
 *    opening bracket or quote;
 *  - `gb`: `basic`, and the solidus (/ ／) at neither end (GB/T
 *    15834—2011 §5.1.9);
 *  - `strict`: `gb`, and no line starts with a two-em dash (——) or an
 *    ellipsis (……).
 *  The Japanese levels (kinsoku shori, JLReq §3.1.7–§3.1.10 and Appendix
 *  C.3, JIS X 4051). At each no line starts with a closing bracket or
 *  quote, 、，。． or a closing warichu bracket, and none ends with an
 *  opening one; a line may start with ―― or …… (never break inside them,
 *  nor inside ‥‥ or 〳〵); the solidus has no rule:
 *  - `ja-very-strict` (JIS X 4051's default): no line starts with a small
 *    kana (ぁ っ ゃ ァ ッ ョ ㇰ…), the prolonged sound mark ー, an iteration
 *    mark (々 ゝ ゞ ヽ ヾ 〻), a hyphen (‐ ゠ 〜 ～ –), ？！ or a middle dot
 *    (・ ： ；);
 *  - `ja-strict`: `ja-very-strict`, but a small kana, ー and 々 may start a
 *    line (JLReq's convention for general books);
 *  - `ja-loose` (newspapers): only the marks named first stay off the line
 *    start; hyphens, ？！, middle dots and every iteration mark may open a
 *    line, and a currency sign or a unit may stand at a line end or start
 *    away from a number.
 *  At every level —— and …… never split, a number keeps its signs and its
 *  unit (¥5,999, 50%), a Latin word stays whole unless it is wider than the
 *  line, and a footnote marker stays with the character it follows. */
export type CjkLineBreak = 'none' | 'basic' | 'gb' | 'strict' | 'ja-very-strict' | 'ja-strict' | 'ja-loose';

/** East Asian typography: how Chinese, Japanese and Korean text is
 *  composed. Every field is optional; `'auto'` follows the region of the
 *  document language (`locale`). A paragraph is composed this way when it
 *  holds more CJK characters than word spaces; a Latin paragraph quoting a
 *  few characters keeps Knuth–Plass, with a break allowed next to them. */
export interface CjkConfig {
  /** The regional conventions to follow. `'auto'` (the default) reads them
   *  from `locale`: `zh`, `zh-Hans`, `zh-CN` and `zh-SG` → `mainland`;
   *  `zh-Hant` and `zh-TW` → `taiwan`; `zh-HK` and `zh-MO` → `hongkong`;
   *  `ja` and every `ja-*` tag → `japan`; any other language →
   *  `mainland`. */
  region?: 'auto' | CjkRegion;
  /** Where lines may break (see {@link CjkLineBreak}). `'auto'` (the
   *  default): `gb` for the mainland, `basic` for Taiwan and Hong Kong,
   *  `ja-very-strict` for Japan. */
  lineBreak?: 'auto' | CjkLineBreak;
  /** How wide the full-width marks are set (see
   *  {@link CjkPunctuationWidth}). `'auto'` (the default): `kaiming` for
   *  the mainland, `fullwidth` for Taiwan, Hong Kong and Japan (JLReq
   *  §3.1.2: 、。 inside a Japanese line keep their whole em). Japanese
   *  full-width text follows JLReq throughout: ・：； take a quarter em
   *  on each side, ？！ none, 、 and ・ between kanji numerals none
   *  (二、三日, 三・一四); a line that takes one more character gives up
   *  the half em at its end first, then the blank of 、・「」 inside it,
   *  never the half em after a 。 (JLReq §3.8.3); a justified line is
   *  never spread inside a bracket or next to 、。・？！. */
  punctuationWidth?: 'auto' | CjkPunctuationWidth;
  /** Two marks that meet (`。」`, `》（`, `：“`) give up the half em of
   *  blank between them, so the pair takes 1.5 em instead of 2 (clreq
   *  §6.3.2.2, JLReq §3.1.4). `'auto'` (the default): on for the
   *  mainland, Hong Kong and Japan, off for Taiwan. */
  compressAdjacent?: 'auto' | boolean;
  /** An opening bracket or quote that starts a line gives up its leading
   *  half em, so its ink lines up with the text edge, and a closing one
   *  that ends a line its trailing half (clreq §6.3.2.3, JLReq §3.1.5).
   *  Japanese full-width text keeps the half em after a closing mark at
   *  the end of a line: it is the first blank the line gives up, all of
   *  it, when it takes in one more character (JLReq §3.8.3). `'auto'` (the
   *  default): on for the mainland, Hong Kong and Japan, off for
   *  Taiwan. */
  trimLineStart?: 'auto' | boolean;
  /** Whether a pause or stop mark may hang past the end of the line
   *  (clreq §6.1.3; ぶら下げ, JLReq §2.5.1, §3.8.2). `'none'`: never.
   *  `'allow'`: one of 、，。． (on the mainland also ；：？！) hangs when it
   *  would otherwise open the next line and compressing the line cannot
   *  take it in; never in horizontal Taiwan and Hong Kong text (Japan:
   *  、，。． only, in both writing modes). `'force'`: such a mark hangs
   *  whenever it ends a line (but the paragraph's last). Never after or
   *  before another mark. `'auto'` (the default): `'allow'` for Japan,
   *  where many books hang 、。 (bunko in particular), `'none'` for the
   *  Chinese regions. */
  hangingPunctuation?: 'auto' | CjkHangingPunctuation;
  /** The full-width space after ？ and ！ (JLReq §3.1.6): one em of blank
   *  after a ？ or ！ that ends a sentence inside a paragraph, none when a
   *  closing bracket or another ？！ follows it, at the end of the
   *  paragraph or at the end of a line (it does not carry over to the next
   *  line). A space the author typed after the mark (U+3000 or a word
   *  space) is replaced, not added to. The space neither stretches nor
   *  shrinks when the line is justified. `'auto'` (the default): on for
   *  Japan, off for the Chinese regions, whose ？！ take no space. */
  spaceAfterQuestion?: 'auto' | boolean;
  /** Where an opening bracket that starts a paragraph is set (JLReq
   *  §3.1.5, 起こしの括弧), see {@link CjkParagraphStartBracket}. Applies
   *  to a paragraph with a first-line indent (`bodyText.firstLineIndent`)
   *  that opens with 「『（〔 and the other opening brackets and quotes.
   *  `'auto'` (the default): `'half'` for Japan (pattern ③, the
   *  convention of literary books), and for the Chinese regions the
   *  bracket is set as at any line start (`trimLineStart`). */
  paragraphStartBracket?: 'auto' | CjkParagraphStartBracket;
  /** Where a line of CJK text may break between characters (see
   *  {@link CjkWordBreak}): `'keep-all'` breaks only at the spaces between
   *  phrases, for kana text written with spaces (分かち書き: primers,
   *  picture books) and Korean. Default `'normal'`. A paragraph style may
   *  set its own (`ParagraphStyleConfig.wordBreak`). */
  wordBreak?: CjkWordBreak;
  /** Book titles kept from one-character breaks (#637): a line breaks
   *  inside a `《…》` or `〈…〉` title (and inside a `:book[…]` title) only
   *  where at least this many of its characters stand on either side of
   *  the break, so a title of up to twice this less one never breaks.
   *  When no other break fits the line, the line breaks inside the title
   *  anyway, as the level allows, rather than run past the measure.
   *  Default `2`; `1` lets a line break anywhere the level allows (as up
   *  to postext 1.24). */
  titleMinChars?: number;
  /** How the circled, parenthesized and full-stop numbers and letters are
   *  set in a CJK paragraph (①–⑳, ⑴–⒇, ⒈–⒛, ⓐ–ⓩ, ❶–❿, ➀–➓; #637).
   *  `'cjk'` (the default): as Chinese characters, one cell with no
   *  Han–Latin space around them, and a line never ends on one (it labels
   *  the text after it) at the levels that keep a currency sign off a
   *  line end: every one but `none` and `ja-loose`.
   *  `'western'`: as Western letters, as up to postext 1.24: the Han–Latin
   *  space on both sides and a line may end on one. Vertical text sets
   *  them upright either way. */
  circledNumbers?: 'cjk' | 'western';
  /** Whether a design text in Chinese or Japanese (a heading design or an
   *  opener, a running head, a page design, a part page) is set with the
   *  CJK rules of the body (#637): the line-start and line-end rules of
   *  `lineBreak`, the mark widths of `punctuationWidth` and
   *  `compressAdjacent`, `latinSpacing`, `hangingPunctuation` and the title
   *  rule. Default `true`; `false` wraps it at spaces and sets every mark
   *  at the font's own advance, as up to postext 1.24. A text that holds
   *  no CJK, or more word spaces than CJK letters, is wrapped as Latin
   *  text either way. */
  composeDesignText?: boolean;
  /** The space set between a Han character (or kana) and a Latin letter or
   *  a European digit next to it (`用 iPhone 拍照`), in em of the CJK
   *  text's size or any length. Default `{ value: 0.25, unit: 'em' }`; `0`
   *  turns it off. None at a line start or end, none next to a Chinese
   *  mark or inside Chinese brackets; a space the author typed there is
   *  replaced, not added to. On a justified line it grows up to ½ em
   *  before characters are spread, and shrinks down to ⅛ em when the line
   *  takes one more character. */
  latinSpacing?: Dimension;
  /** Which side of a Western word takes `latinSpacing` (#721, see
   *  {@link CjkLatinSpacingEdge}). `'auto'` (the default): `'western'` in
   *  the Japan region, `'letters'` elsewhere. An unknown value reads as
   *  `'auto'`. */
  latinSpacingEdge?: 'auto' | CjkLatinSpacingEdge;
  /** Tate-chu-yoko (縱中橫) in vertical text: a number of at most this many
   *  ASCII digits is set side by side in one upright cell (`2026年9月28日`:
   *  `9` and `28` upright, `2026` sideways). `0` turns it off; default
   *  `2`. The whole number or none of it: under `2` a three-digit number
   *  stays sideways. A number touching a Latin letter (`A4`, `mp3`) or
   *  written with a decimal point or digit grouping (`3.14`, `10,000`)
   *  stays sideways. `:tcy[…]`, `:upright[…]` and `:sideways[…]` set a
   *  run apart by hand. No effect in horizontal text. */
  uprightDigits?: 0 | 2 | 3 | 4;
  /** The character grid (字格): a type area authored in characters per line
   *  and lines per page (see {@link CjkGridConfig}). Off by default. */
  grid?: CjkGridConfig;
  /** What Markdown emphasis (`*…*`) does to Chinese characters: `'dots'`
   *  sets emphasis dots (着重号) under them, as `:dots[…]` does, and Latin
   *  letters inside the same emphasis keep their italics; `'italic'` slants
   *  them as any text (a CJK face has no italic, so the slant is
   *  synthesised). `'auto'` (the default): `'dots'` when the document
   *  language (`locale`) is Chinese or Japanese (傍点: Japanese has no
   *  italics either), `'italic'` otherwise (#193). */
  emphasis?: 'auto' | CjkEmphasis;
  /** The emphasis mark `:dots[…]` and `*…*` (under `emphasis: 'dots'`)
   *  set when the directive does not say: its shape, fill and side (see
   *  {@link CjkEmphasisMarkConfig}). A `:dots[…]{style fill pos}`
   *  attribute wins over it. */
  emphasisMark?: CjkEmphasisMarkConfig;
  /** What a book title marked `:book[…]` prints (#193): `'brackets'` sets
   *  the brackets of `bookTitleBrackets` around it (《》 on the mainland,
   *  『』 in Japan), as text the lines are broken with; `'wavy'` draws the
   *  wavy book-title line (书名号甲式) under it (left of it in vertical
   *  text); `'none'` prints the bare title. `'auto'` (the default):
   *  brackets for the mainland and Japan, the wavy line for Taiwan and
   *  Hong Kong (`region`). */
  bookTitleMark?: 'auto' | CjkBookTitleMark;
  /** The brackets `bookTitleMark: 'brackets'` sets around a book title:
   *  the outermost title's pair first, then the pair of a title inside it
   *  (a title deeper still takes the last pair). `'auto'` (the default):
   *  《》 then 〈〉 for Chinese (GB/T 15834—2011), 『』 then 「」 for Japan
   *  (『』 for a book, 「」 for an article or a chapter named inside its
   *  title). */
  bookTitleBrackets?: 'auto' | CjkBracketPair[];
  /** Colour of the emphasis dots, of the proper-name and book-title lines
   *  and of side lines (`:sideline[…]`). Unset: the colour of the text
   *  they mark (#193). The default of the ruby and warichu colours too. */
  annotationColor?: ColorValue;
  /** Ruby: how readings (pinyin, zhuyin) set with `:ruby[…]{rt="…"}` or
   *  `{紅樓|hóng|lóu}` look (see {@link CjkRubyConfig}, #194). */
  ruby?: CjkRubyConfig;
  /** Warichu (双行夹注): how the two-row notes of `:warichu[…]` look (see
   *  {@link CjkWarichuConfig}, #195). */
  warichu?: CjkWarichuConfig;
  /** Kanbun reading marks (訓点): how the 返り点 and 送り仮名 of
   *  `:kunten[字]{kaeri okuri tate}` look and where they go (see
   *  {@link CjkKuntenConfig}, #430). */
  kunten?: CjkKuntenConfig;
}

/** See {@link CjkConfig.emphasis}. */
export type CjkEmphasis = 'italic' | 'dots';

/** See {@link CjkConfig.bookTitleMark}. */
export type CjkBookTitleMark = 'brackets' | 'wavy' | 'none';

/** An opening and a closing bracket (`『` `』`), set at the text size. */
export interface CjkBracketPair {
  open: string;
  close: string;
}

/** The shape of an emphasis mark: a dot ●, a circle ○, a sesame ﹅. */
export type CjkEmphasisMarkStyle = 'dot' | 'circle' | 'sesame';

/** `cjk.emphasisMark`: the emphasis mark set on each character (着重号,
 *  傍点). Every field is optional; `'auto'` follows the region. */
export interface CjkEmphasisMarkConfig {
  /** `'auto'` (the default): the sesame ﹅ in Japan, in horizontal and
   *  vertical text alike (JLReq §3.3.9, the Aozora 傍点; CSS keeps a
   *  circle for horizontal `filled`, which literary books do not); the
   *  dot elsewhere (着重号, GB/T 15834—2011). */
  style?: 'auto' | CjkEmphasisMarkStyle;
  /** `'auto'` (the default): filled, open for a circle. */
  fill?: 'auto' | 'filled' | 'open';
  /** Which side of the text, in its flow: `over` is above horizontal
   *  text and right of vertical text, `under` below it and to its left.
   *  `'auto'` (the default): over in Japan (JLReq §3.3.9: right of
   *  vertical text, above horizontal text); for Chinese under horizontal
   *  text and right of vertical text (clreq). */
  position?: 'auto' | 'over' | 'under';
}

/** `cjk.emphasisMark` resolved: the shape, and the fill and side when the
 *  region or the author sets one (`'auto'`: a circle open, anything else
 *  filled; under horizontal text, right of vertical text). */
export interface ResolvedCjkEmphasisMarkConfig {
  style: CjkEmphasisMarkStyle;
  fill: 'auto' | 'filled' | 'open';
  position: 'auto' | 'over' | 'under';
}

/** Where a ruby reading goes: over the base (in vertical text: to its
 *  right), under it (to its left), or right of each character inside the
 *  line (zhuyin in horizontal text; the same as `over` in vertical text). */
export type CjkRubyPosition = 'over' | 'under' | 'right';

/** `cjk.ruby`: the look of ruby readings. Readings live in the line gap,
 *  whose height never changes: a paragraph with readings over or under it
 *  needs a line height of at least its size plus the reading's
 *  (`rubyExceedsLeading` reports one that is tighter). */
export interface CjkRubyConfig {
  /** Face of the readings. Unset: the text's own face. Pinyin often reads
   *  better in a sans face with a single-storey a and g. */
  fontFamily?: string;
  /** Size of the readings, in em of the text they annotate (or any
   *  length). Default `{ value: 0.5, unit: 'em' }`. Zhuyin is set at 60 %
   *  of it (0.3 em by default), as clreq asks. */
  fontSize?: Dimension;
  /** Colour of the readings. Unset: `cjk.annotationColor`, else the text
   *  colour. */
  color?: ColorValue;
  /** Where readings go when `pos` does not say (see
   *  {@link CjkRubyPosition}). `'auto'` (the default): zhuyin (bopomofo)
   *  right of each character, anything else (pinyin) over the base in
   *  horizontal text and right of it in vertical text. */
  position?: 'auto' | CjkRubyPosition;
  /** What a reading longer than its base may run onto (肩掛け, JLReq
   *  §3.3.8) before the base is spread (see {@link CjkRubyOverhang}).
   *  `'auto'` (the default): `kana` in Japan (`region`); elsewhere a
   *  quarter of the ruby em onto any neighbour without a reading
   *  (clreq). */
  overhang?: 'auto' | CjkRubyOverhang;
  /** Where a reading sits on its base (see {@link CjkRubyAlign}).
   *  `'auto'` (the default): `jis` in Japan; elsewhere centred, as
   *  `center`. */
  align?: 'auto' | CjkRubyAlign;
  /** Small kana in readings (ゃゅょっ…): `keep` (the default) paints them
   *  as written, as modern books do; `full` paints them full size
   *  (がつこう for がっこう), as letterpress books did (JLReq §3.3.3
   *  note). The text read and copied keeps the small kana. */
  smallKana?: 'keep' | 'full';
}

/** What a ruby reading longer than its base may run onto, past the
 *  base's edge, before the base is spread (JLReq §3.3.8):
 *  - `none`: nothing; the base is spread to the reading;
 *  - `kana`: up to one ruby character (half an em of the text) onto
 *    hiragana, katakana, small kana and ー, onto the blank of a mark (the
 *    half em after 、。」 before the reading, an ideographic space, a
 *    middle dot's quarter, …… and ――), at most half a ruby character
 *    onto an opening bracket; never onto kanji, Latin text or another
 *    base; two readings never share a kana from both sides (the later one
 *    keeps to its base);
 *  - `any`: up to half a ruby character onto any neighbour without a
 *    reading.
 *  Never past the line's start or end: a reading at a line edge is set
 *  flush with it and its base moves in. */
export type CjkRubyOverhang = 'none' | 'kana' | 'any';

/** Where a ruby reading sits on its base (JIS X 4051 §12, JLReq §3.3.6):
 *  - `center`: centred; a longer reading centred over its base, which is
 *    centred in the box the reading needs;
 *  - `jis`: a shorter reading spread 1:2:1 (half a unit before the first
 *    character and after the last, one between characters; `ruby-align:
 *    space-around`), or flush with both ends of the base (`space-between`)
 *    when the half unit would exceed one ruby character; a longer reading
 *    set solid over a base spread 1:2:1;
 *  - `start`: from the base's start (肩付き, a vertical-text practice). */
export type CjkRubyAlign = 'center' | 'jis' | 'start';

/** `cjk.warichu`: the look of warichu notes (双行夹注). */
export interface CjkWarichuConfig {
  /** Size of the note's characters, in em of the text (or any length);
   *  the two rows together take the line's em. Default
   *  `{ value: 0.5, unit: 'em' }`. */
  fontSize?: Dimension;
  /** Colour of the notes and their brackets (a commentary set in
   *  vermilion). Unset: `cjk.annotationColor`, else the text colour. */
  color?: ColorValue;
  /** Brackets set at the text size before the first row and after the
   *  last one (`〔` `〕`, `（` `）`). Default: none, but `（` `）` for
   *  Japan (`region`; JLReq §3.4.2). An empty string sets none. A note's
   *  own `open` / `close` attributes win. */
  open?: string;
  close?: string;
  /** How many characters of a note a line break leaves on either side of
   *  it at least (#720): a note that runs over a line end never leaves one
   *  of its characters alone at the end of a line or at the head of the
   *  next, so no column or page opens on a single small character and its
   *  stop. A character is a CJK character, a Western word or an inline
   *  box; marks and the note's word spaces do not count. A note of fewer
   *  than twice the number is never divided; a line with no other break
   *  falls back on the breaks the level allows. Default 2; `1` lets a line
   *  break anywhere in a note the level allows, as up to postext 1.27. */
  minChars?: number;
}

/** Where the 返り点 of a kanbun text go (see {@link CjkKuntenConfig}):
 *  - `inline` (JIS X 4051 §5.5): right after their character, in the
 *    left half of a vertical line (the lower half of a horizontal one),
 *    taking their own advance; a 竪点 takes half an em between the two
 *    characters it joins, and 送り仮名 longer than the room beside their
 *    character push the next one on (§5.6.4);
 *  - `interlinear`: in the line gap left of the character's lower half
 *    (under it in horizontal text), taking no advance, as many school
 *    editions set them; the characters keep an even pitch and 送り仮名 run
 *    on beside the next character. */
export type CjkKuntenPlacement = 'inline' | 'interlinear';

/** `cjk.kunten`: the look of kanbun reading marks (`:kunten[…]`). */
export interface CjkKuntenConfig {
  /** Size of the 返り点 and 送り仮名, in em of the text (or any length).
   *  Default `{ value: 0.5, unit: 'em' }` (JIS X 4051 §5.5, §5.6). */
  fontSize?: Dimension;
  /** Colour of the marks. Unset: `cjk.annotationColor`, else the text
   *  colour. */
  color?: ColorValue;
  /** Where the 返り点 go (see {@link CjkKuntenPlacement}). Default
   *  `inline`. */
  placement?: CjkKuntenPlacement;
}

export interface ResolvedCjkKuntenConfig {
  fontSize: Dimension;
  color?: ColorValue;
  placement: CjkKuntenPlacement;
}

export interface ResolvedCjkRubyConfig {
  fontFamily?: string;
  fontSize: Dimension;
  color?: ColorValue;
  position: 'auto' | CjkRubyPosition;
  /** Set only when it is not clreq's quarter em (Japan, or set): absent,
   *  a longer reading passes its base by a quarter of the ruby em onto a
   *  neighbour without a reading. */
  overhang?: CjkRubyOverhang;
  /** Set only when it is not the plain centring (Japan, or set). */
  align?: CjkRubyAlign;
  /** Set only when on. */
  smallKana?: 'full';
}

export interface ResolvedCjkWarichuConfig {
  fontSize: Dimension;
  color?: ColorValue;
  open: string;
  close: string;
  minChars: number;
}

/** Punctuation width styles (clreq §6.3.2.1): each full-width mark is
 *  half a glyph and half an em of blank that may be set or removed.
 *  - `fullwidth` (全角式): every mark one em; only a pair of adjacent marks
 *    (`compressAdjacent`) and a bracket at a line edge (`trimLineStart`)
 *    lose blank;
 *  - `kaiming` (开明式): 。？！ one em (half at a line end), ，、；：,
 *    brackets and quotes half an em;
 *  - `lineEndHalf` (行末半角): one em inside the line, half at its end
 *    (GB/T 15834—2011 §5.1.10 read literally);
 *  - `halfwidth` (半角式): every mark half an em (dictionaries).
 *  Marks set in the middle of their box (Taiwan, Hong Kong: 。，、；：) lose
 *  a quarter em on each side; ？！ stay one em in horizontal Taiwan and
 *  Hong Kong text. */
export type CjkPunctuationWidth = 'fullwidth' | 'kaiming' | 'lineEndHalf' | 'halfwidth';

/** See {@link CjkConfig.hangingPunctuation}. */
export type CjkHangingPunctuation = 'none' | 'allow' | 'force';

/** An opening bracket at the start of an indented paragraph (JLReq
 *  §3.1.5, with an indent of one em):
 *  - `indent` (pattern ①, JIS X 4051's default): the indent, then the
 *    bracket without the half em of blank before its glyph; the text
 *    after it starts at 1.5 em;
 *  - `half` (pattern ③, most literary publishers): the bracket's glyph
 *    sits in the second half of the indent, so the text after it starts
 *    where the indent ends; with a one-em indent it reads as the bracket
 *    filling the indent cell with its half em of blank;
 *  - `flush` (天付き): no indent; the bracket's glyph at the start of the
 *    line.
 *  A bracket that opens a later line of the paragraph follows
 *  `trimLineStart`. */
export type CjkParagraphStartBracket = 'indent' | 'half' | 'flush';

/** Where a line of CJK text may break between two characters (CSS
 *  `word-break`):
 *  - `normal`: between any two characters, as `cjk.lineBreak` allows;
 *  - `keep-all`: only at a space (U+0020, U+3000), at a zero-width space,
 *    and next to punctuation where `cjk.lineBreak` allows it (after 、。」,
 *    before 「); never between two letters (kana, kanji, hangul, Latin).
 *    The text is written with a space between phrases (分かち書き in
 *    picture books and first readers set in kana, Korean 어절), and lines
 *    break only there; kinsoku still applies. A phrase longer than the
 *    line is broken inside it anyway, where `normal` would break it. */
export type CjkWordBreak = 'normal' | 'keep-all';

/** Where a Western word takes the Han–Latin space (`cjk.latinSpacingEdge`):
 *  - `letters` (clreq §6.3.3, CSS `text-autospace`): on a side that ends
 *    in a letter or a digit, so `abc関数` takes it and `normalize()関数`
 *    does not;
 *  - `western` (JLReq §3.2.6: the space stands between Japanese text and
 *    Western characters, the marks of a Western word among them, §3.9.2):
 *    a Western word that holds a letter or a digit takes it on a side that
 *    ends in a bracket or a sign too, so `normalize()関数`, `(abc)関数`,
 *    `A+関数` and `100%関数` are set like `abc関数`. Two sides stay solid,
 *    where the mark binds to what follows or precedes it: after an opening
 *    bracket or a prefix sign that ends the word (`abc(関数`), and before
 *    a closing bracket, a pause, a stop or a postfix sign that opens it
 *    (`関数)abc`). A bracket or a sign with no letter or digit in its word
 *    (`関数(かんすう)は`) stands in Japanese context and takes none. */
export type CjkLatinSpacingEdge = 'letters' | 'western';

/** The character grid of `cjk.grid`: the type area is derived from the
 *  body size, not authored as margins. Each column is `charsPerLine` ems
 *  wide and holds `linesPerPage` lines of the body's line height; with two
 *  columns the gutter is rounded to a whole number of ems (at least one).
 *  The grid is centred inside the configured margins, which act as
 *  minimums; a grid that does not fit is reduced to what fits and reported
 *  (`cjkGridClamped`). In vertical text (`layout.writingMode:
 *  'vertical-rl'`) characters run down the page and lines across it. */
export interface CjkGridConfig {
  /** Default `false`. */
  enabled?: boolean;
  /** Characters per line of one column. Unset: as many as the margins
   *  leave room for. */
  charsPerLine?: number;
  /** Lines per column. Unset: as many as the margins leave room for. */
  linesPerPage?: number;
  /** Draw the grid (稿纸) over the type area on screen. Default `false`. */
  show?: boolean;
  /** Manuscript paper (原稿用紙), where every square of a full line is
   *  written in: a paragraph that is not justified keeps its full lines
   *  full, so the runt rule (`bodyText.avoidRunts`) carries no character
   *  down from a line it cannot spread, and such a paragraph may end on
   *  one character. A justified paragraph still gives the character up,
   *  its line spread to the measure. Default `false`: a paragraph does
   *  not end on a single character (clreq §7.1.2, 孤字不成行; JLReq §3.5.4
   *  takes the same care), and the line above it stands one cell short
   *  when it is not justified (#718). */
  fullLines?: boolean;
}

export interface ResolvedCjkGridConfig {
  enabled: boolean;
  /** The characters per line in use (after the pre-pass: what the
   *  margins leave room for when unset or too many); 0 when off. */
  charsPerLine: number;
  /** The lines per column in use; 0 when off. */
  linesPerPage: number;
  show: boolean;
  /** `false` when the grid is off. */
  fullLines: boolean;
}

export interface ResolvedCjkConfig {
  region: CjkRegion;
  lineBreak: CjkLineBreak;
  punctuationWidth: CjkPunctuationWidth;
  compressAdjacent: boolean;
  trimLineStart: boolean;
  hangingPunctuation: CjkHangingPunctuation;
  /** Set (true) only when on: absent, ？！ take no space after them. */
  spaceAfterQuestion?: true;
  /** Set only when it differs from a line start: absent, a bracket that
   *  opens a paragraph is set as at any line start. */
  paragraphStartBracket?: CjkParagraphStartBracket;
  /** Set only when `'keep-all'`: absent, lines break between any two
   *  characters (`normal`). */
  wordBreak?: 'keep-all';
  /** Characters of a book title kept on either side of a break (1 or
   *  more). */
  titleMinChars: number;
  /** Set only when `'western'`: absent, circled numbers are set as Chinese
   *  characters. */
  circledNumbers?: 'western';
  /** Set (false) only when off: absent, CJK design text is composed. */
  composeDesignText?: false;
  latinSpacing: Dimension;
  latinSpacingEdge: CjkLatinSpacingEdge;
  uprightDigits: 0 | 2 | 3 | 4;
  grid: ResolvedCjkGridConfig;
  emphasis: CjkEmphasis;
  emphasisMark: ResolvedCjkEmphasisMarkConfig;
  bookTitleMark: CjkBookTitleMark;
  /** At least one pair. */
  bookTitleBrackets: CjkBracketPair[];
  annotationColor?: ColorValue;
  ruby: ResolvedCjkRubyConfig;
  warichu: ResolvedCjkWarichuConfig;
  kunten: ResolvedCjkKuntenConfig;
}
