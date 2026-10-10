# Postext document (Markdown) format

What a chapter file may contain, exactly as the Postext parser reads it
(postext 1.2). Postext Markdown looks like Markdown but is **not CommonMark**:
many habits from GitHub/pandoc Markdown print literally or change meaning.
Where the online docs disagree, this file is right (§14).

---

## 0. Mental model (read this first)

- Postext does **not** use remark or micromark and is **not** CommonMark. It is a hand-written, line-based tokenizer plus regular-expression inline passes.
- The parser emits a **flat** list of `ContentBlock`s. There are 10 block types: `heading`, `paragraph`, `blockquote`, `listItem`, `mathDisplay`, `resourceBlock`, `directive`, `containerStart`, `containerEnd` and `code` (a listing, postext ≥ 1.23). Containers are start/end marker pairs, not trees.
- Constructs the parser does not recognise are **never dropped silently**. They become literal paragraph text, except that inline images are removed. A link `[text](url)` is recognised: its text is set in the flow and its URL becomes a live link in the HTML and PDF output (§4).
- Figures, images, SVGs and tables are **not written in Markdown**. They are `Resource` objects (JSON) kept outside the text and cited by id (§9).
- Visual styling lives in the config and is selected by id: callout `type`, paragraph-container `style`, heading `style`, chip `style`, palette ids. An unknown id falls back to a default and triggers a sandbox warning (§13).
- Blank lines separate blocks. **Consecutive non-blank lines join into one paragraph with a single space.** A backslash at the end of a line, or `\\` before a space, forces a line break inside the paragraph (§3.3, postext ≥ 1.23); a poem keeps its lines in `:::verse` (§12).

Block-level dispatch order for each non-blank line:
0. a code fence: 3+ backticks or tildes, up to 3 spaces in (postext ≥ 1.23, §3.4); indented code only under `codeStyle.indentedCode`
1. single-line display math `$$…$$`
2. multi-line display-math fence `$$`
3. `::resource{id="…"}`
4. bare `:::` (only while a container is open)
5. `:::name{…}` for a known container
6. `:::name{…}` for a known directive
7. ATX heading
8. list item (task, then ordered, then unordered)
9. blockquote `>`
10. paragraph (the fallback)

Every line is `trim`med before the tests in steps 3–7 and 9. Indentation is therefore irrelevant for those constructs; it matters only for list depth.

---

## 1. Frontmatter

- **Syntax:** an optional YAML block at the very start of the file, between `---` lines. It is parsed with `gray-matter`.
- **Keys Postext uses:** `title`, `subtitle`, `author`, `publishDate`. They feed the `{title}`, `{subtitle}`, `{author}` and `{publishDate}` design placeholders. Other keys are kept on `doc.metadata` but no built-in placeholder reads them.
- **Books / multi-chapter projects:** only the **first chapter's** frontmatter counts. The frontmatter of every later chapter is blanked (length-preserving) and never parsed, and the sandbox raises `chapterFrontmatterIgnored`. Put book metadata in chapter 1 only.
- Chapters are joined with `\n\n`. No page break is inserted between chapters; a chapter opens on a new page only through its H1's `breakBefore` config.

```md
---
title: "Pintura española"
subtitle: "Catorce obras maestras"
author: "Anon"
---

# Pintura española {style="portada" toc="false"}
```

---

## 2. Headings

**Regex:** `^(#{1,6})\s+(.+)$`, tested on the trimmed line.

- Levels 1 to 6. `#######` (7 or more) or `#Title` (no space) is plain paragraph text.
- Leading indentation is allowed (the line is trimmed).
- Closing hashes are **not** stripped: `## Title ##` has the text `Title ##`.
- Setext headings (`===` / `---` underlines) are not supported.
- A heading ends a running paragraph even when glued to it with no blank line.
- A heading is always one line.

### 2.1 Inline content inside headings (differs from paragraphs)

A heading's inline content is read like a paragraph's while `headings.inlineMarks` is on (the default since `configVersion` 6):
- `**bold**`, `*italic*`, `__…__`, `_…_`, `^sup^`, `~sub~`, `:smallcaps[…]` and links become runs. An italic run flips the heading's slant (upright in an italic heading); bold takes `bodyText.boldFontWeight`, or the heading's weight when heavier. The contents rows keep bold and italic; running heads, `{chapterTitle}`, the PDF outline and design `{titleText}` stay plain.
- With `headings.inlineMarks: false` (and in a preset without `configVersion` 6 whose headings carry marks) they are **reduced to plain text**: the markers are removed and the heading's look comes only from the level/style config.
- `` `code` `` becomes its text. Images are removed.
- Escapes `\* \_ \^ \~ \`` produce the literal character.
- **Kept as live spans:** `:ref{…}`, `:swatch{…}` (`:326`) and inline `$math$` (`:327`).
- **`:chip[…]` is NOT processed in headings.** It stays literal text.

### 2.2 Heading attributes: trailing `{…}`

**Regex:** `\s+\{([^{}]*)\}\s*$`. The block must be the **last thing on the line** and preceded by whitespace, or (postext ≥ 1.9) glued to a Chinese or Japanese character: `# 回目{style="x"}`. It contains no nested braces, so a value cannot contain `{` or `}`.

The blob is parsed with the shared attribute grammar (§8). Since 1.9 it is taken only when the grammar reads **all** of it (tokens separated by spaces); otherwise it stays in the text.
- `# Title {}` keeps `{}` in the title.
- `# Chapter {1}` keeps `{1}`, because a key must start with a letter or `_`.
- `# The set {a, b}`, Pandoc's `{.class}` and `{a="1", b="2"}` stay in the title (1.8 and earlier ate them). Pandoc's `{#id}` is read since 1.12: it is `id="…"`, the heading's anchor (§10.6). Flags alone are read after a space (`# Title {draft}`) but not glued to a title (`# 第一回{draft}` stays text).
- A key in another script (`作者=曹雪芹`) is dropped with an `attributeKeyInvalid` warning; the block's other keys apply.
- A title ending in a compact ruby (`# 紅樓夢 {紅樓|hóng|lóu}`) keeps it as a ruby.
- **Gotcha:** `# Title {note="a}b"}` does not parse (a `}` inside the value). The whole blob stays in the text.

**Attributes with engine meaning:**

| attr | values | effect | source |
|---|---|---|---|
| `style` | id of a `headingStyles[]` entry | Merges the style's level overrides and opens a *styled section* (running heads, geometry, body typography, palette) up to the next heading of the same or higher level, or the next part. The style's `numbered: false` makes the heading unnumbered (no counter advance, no number, `{chapterNumber}` empty). An unknown id is ignored. | , 54-72`;  |
| `toc` | `false`/`no`/`0` or `true`/`yes`/`1` | Overrides whether `:::toc` lists this heading. Default: the style's `toc`, else `true`. |  |
| `jidori` | number (≥ 1.16) | 字取り: a one-line heading narrower than N of its own ems is spaced evenly to that width (`# 序章 {jidori=3}` → 序　章); `0` turns its level's `jidori` off. |  |
| `dropcap` | bare, `false`/`no`/`0`, or a number of lines (≥ 1.23) | The drop cap of the first body paragraph after this heading (configuration.md §4b): `{dropcap=false}` leaves this chapter without its level's or style's, `{dropcap=2}` sets it over 2 lines, a bare `{dropcap}` gives one (3 lines) where the level sets none. |  |
| `indent` | length; a bare number is **body** ems (≥ 1.16) | 字下げ of this heading: `## 一 {indent=5}` sets it 5 body characters from the line start (the top of a vertical line), over its level's or heading style's `indent`; `em` counts body ems too, `pt`/`mm` work; `0` sets it at the line start. A value that is no length is ignored. Same in vertical and horizontal text. |  |
| `firstLineIndent` | length; a bare number is **body** ems (≥ 1.24) | The first line of this heading only, over its level's or heading style's `firstLineIndent`; its other lines start at `indent` (GB/T 9704: `## 关于加强管理的通知 {firstLineIndent=2}`). Reads lengths as `indent`; `0` clears the level's. |  |

- A heading's 字下げ is usually the same for a whole level: set it once as the level's (or a heading style's) `indent` (configuration.md §5.1) and use `{indent=N}` for the heading that differs. `aozora.py` writes `{indent="5"}` from the source's ［＃５字下げ］ on every heading; it takes effect as written (before 1.16 it was a free attribute and did nothing).
- There is **no** `numbered` heading attribute. `{numbered=false}` is only stored as a free attr; use a heading style with `numbered: false` instead.
- `id` (or `{#id}`, postext ≥ 1.12) names the heading for cross-references: `:ref{id="…"}` prints *section 3.2* / its title / its page and links to it (§10.6). Before 1.12 headings had no ids.

**Free attributes** (any key: `author`, `lead`, `kicker`, `standfirst`, `source`, `date`, …) are stored as strings and surface in design slots as `{attr.<key>}`:
- In the heading's own advanced-design slot, the heading's attrs are used.
- In headers and footers, the attrs of the current chapter's H1 are used.
- A missing key resolves to `''`.
- Sources: ; .

`toc.subtitle.attr` (config) chooses the attr printed as the TOC subtitle line, e.g. `author`.

Real presets use: `{style="…" toc="false" series="…" publisher="…"}`, `{lead="…" catlabel="…" cat="…" tombstone="…"}`, `{style="…" kicker="…" standfirst="…"}`, `{author="…"}`.

**A chapter's first sentences are text, not an attribute** (postext ≥ 1.23): when the source opens a chapter with a drop cap or a raised initial, keep the opening paragraph in the body and give the heading level (or style) a `dropCap` (configuration.md §4b), not `{lead="…"}` drawn by a design text with its own `dropCap`. A `lead` attribute is for a standfirst set apart from the text (a summary above the chapter), never for the first words of the chapter.

### 2.3 Forced line break in titles: `\\`

`\\` inside a heading (optionally surrounded by spaces/tabs) becomes U+2028.
- Opener designs (`{titleText}`) break the line there.
- The in-column heading, running heads, `{chapterTitle}`, the outline, the TOC and the PDF outline show a space.
- The same `\\` works inside `:::part{title="…"}`.
- In body paragraphs, quotes and list items `\\` before a space is a forced line break too (§3.3, postext ≥ 1.23); up to 1.22 it printed.

```md
# Concepts of health and illness. \\ Community health {author="I. Zango Martín"}
```

### 2.4 Numbering, page breaks, span

These are all config (`headings.levels[n]`), not Markdown:
- `numberingTemplate` uses `{1}`..`{6}` with optional `:I`/`:i`/`:A`/`:a`/`:01` styles.
- Other level fields: `breakBefore {enabled, parity}`, `span: column|page`, `advancedDesign`, `textTransform`.
- `{chapterNumber}` falls back to the chapter ordinal when level 1 has no template.

Sandbox hints: `headingHierarchy` (a skipped level), `consecutiveHeadings`, `listAfterHeading`.

---

## 3. Paragraphs and text

### 3.1 Paragraph collection

The first line is always taken. Subsequent lines are appended (trimmed, joined with **one space**) until one of the following occurs:
- a blank line;
- a heading line (`# …`);
- a line starting with `>` (after trim);
- an **unordered** list line (`^\s*[-*+]\s+`), which includes task items;
- any `:::…` fence line: known or unknown directive/container, or a bare `:::`;
- a whole display formula (postext ≥ 1.5): a `$$…$$` line, or a `$$` fence closed before the next blank line. The text right under the closing `$$` continues the paragraph, flush (§11). Up to 1.4 these lines were swallowed as text.
- a code fence (postext ≥ 1.23, §3.4). The text right under its closing fence is a new paragraph.

**Chinese and Japanese line ends** (postext ≥ 1.9): between two East Asian wide characters (Han, kana, full-width punctuation, and curly quotes, dashes or an ellipsis beside them) the joining space is dropped, as CSS does, so a Chinese source may be wrapped anywhere. Korean keeps its space. A space typed inside a line stays.

**The paragraph does NOT stop at the following. They are swallowed into the paragraph as literal text:**
- ordered list lines. `Intro\n1. first\n2. second` gives one paragraph `Intro 1. first 2. second`. **Always put a blank line before an ordered list.**
- `::resource{id="…"}`. **Always put blank lines around `::resource`.**

### 3.2 Line-start traps (apply to the FIRST line of any block)

| A paragraph starting with… | is parsed as | workaround |
|---|---|---|
| `1998. Fue un año…` (digits + `.` or `)` + space) | an **ordered list item** numbered 1998 | Prefix a WORD JOINER U+2060 (`⁠1998. …`). Or rephrase. A backslash does NOT escape it: `1998\.` keeps the backslash. |
| `- Dijo él…` (a hyphen used as a dialogue dash) | an **unordered list item** | Use a real em dash `—` (U+2014), which is fine. |
| `* ` or `+ ` + space | an unordered list item | Rephrase, or use U+2060 first. |
| `> …` | a blockquote | U+2060 first. |
| `# ` + text | a heading | U+2060 first. |
| `:::word` | a directive/container, or literal text if the name is unknown | — |

The same triggers also end a running paragraph mid-way (§3.1): a continuation line starting with `- `, `* `, `+ `, `> ` or `# ` starts a new block.

### 3.3 Line breaks, whitespace, special characters

- **Forced line break in a paragraph (postext ≥ 1.23).** A backslash at the end of a source line, or `\\` followed by a space, ends the line inside the paragraph (CommonMark's hard break): the line before is set at its natural width (never justified), the text after starts a new line of the same paragraph with no first-line indent (a hanging indent hangs it). Paragraphs, quotes (`> a\` over `> b`), footnotes and list items (one source line: use `\\ `) take it. **No break:** a backslash ending the paragraph (prints), `\\` glued to the next character (`\\*`, `C:\\Temp` print), backslashes in inline code or maths, **two trailing spaces** (trimmed). Two breaks in a row are one: for an empty line start a new paragraph or write `:::space`. Use it for addresses, a letter's greeting, signature blocks, dedications, the lines of a title page set as text. A preset stamped below `configVersion` 9 whose chapters end a line with a backslash reads with `bodyText.hardLineBreaks: false` (backslashes print): write `"configVersion": 9`. Up to 1.22 there was no break: each such line had to be its own paragraph inside a `:::paragraphs{style="…"}` container (§6.2).
- **Verse goes in `:::verse`** (postext ≥ 1.23, §12): one line of verse a line, blank lines between stanzas, leading spaces as indents, turnovers hung. No backslash on every line.
- Leading and trailing whitespace of every line is trimmed. Internal runs of spaces survive in the text but are measured as spaces.
- **Tabs (postext ≥ 1.23, §10.9).** `:tab` is always a tab. A tab character (U+0009) inside a line is a tab **only in a paragraph whose resolved style has `tabStops` or `tabInterval`** (body text, paragraph style or callout body); everywhere else it is a word space, as up to 1.22. A tab character at the start of a source line is trimmed with the line: start a line at a stop with `:tab`. Headings, captions and table cells keep their own meaning of tabs.
- **Non-breaking spaces (postext ≥ 1.5):** U+00A0, the narrow U+202F and the figure space U+2007 **glue** the words on either side, on every breaker (plain and rich text, Knuth–Plass, captions, cells, boxes, design text): a number and its unit (37 °C, with U+202F), a group of thousands (225 000, with U+00A0), a label and its number. Each keeps its own width; justification stretches only the word spaces. The word joiner U+2060 glues with no width. Type the character itself, not `&nbsp;` (HTML is not interpreted). A glued group wider than the whole line breaks at its last no-break space. The atomic inline units are therefore NBSP-glued groups, text that touches with no space (`**word**.`, `(:ref{…})`), a `:chip` and a `:ref` label. Up to 1.4 a paragraph with inline formatting or a `:ref` could break at a NBSP, and the port scripts replaced it with a plain space; they keep it now.
- **Soft hyphen U+00AD** is honoured as a discretionary break, with a hyphen added at the break (; `knuthPlass/`).
- A **hard hyphen between two letters** (`enseñanza-aprendizaje`) is a break opportunity; the line ends on the existing hyphen.
- Automatic hyphenation follows the config locale.
- URL-like tokens (`http(s)://`, `ftp://`, `www.`, DOIs `10.xxxx/`) get URL break points and no hyphen.
- **HTML is not interpreted.** `<b>x</b>` and `&amp;` / `&nbsp;` appear literally. Write the Unicode characters themselves (`&`, U+00A0, `…`).
- Tabs count as one character of indentation (so they don't nest lists).
- **Ideographic spaces (U+3000) that open a paragraph are dropped.** Chinese paragraph indents come from `bodyText.firstLineIndent: {value: 2, unit: 'em'}`, Japanese ones from `{value: 1, unit: 'em'}`. Inside a line U+3000 is a character one em wide (a line may break after it, never before). In Japanese text a U+3000 typed after ？ or ！ is kept as that mark's one-em space (`cjk.spaceAfterQuestion`, which adds it where it is missing).
- **Japanese paragraph starts** (≥ 1.16): a paragraph opening with 「 needs no typed space; `cjk.paragraphStartBracket` (auto `half` in Japanese) sets the bracket in the indent. A paragraph that must stay flush (Aozora's paragraphs with neither U+3000 nor 「) goes in a `:::paragraphs` style with `firstLineIndent: 0`.
- **Full-width markup is text**: `：：：`, `＃ `, `［＾1］`, `｛…｝` after a fence or heading, `＊＊…＊＊` typed with an input method print literally and raise `fullwidthMarkup`. Write the ASCII forms.

### 3.4 Code listings: ```` ``` ```` and `~~~` fences (postext ≥ 1.23)

- **Syntax:** an opening line of 3+ backticks or 3+ tildes (up to 3 spaces in), an info string, the lines, and a closing fence of the same character at least as long. A backtick fence's info string holds no backtick. The fence's indentation comes off each line.
- **Literal:** every character, space, tab and blank line is kept; nothing inside is Markdown (no emphasis, `:ref`, maths, chips, directives, `#` headings, list items, index marks or anchors). Nothing needs escaping. A listing that shows a ```` ``` ```` fence goes in a longer fence or in tildes.
- **Info string:** first word = language (`js`, `ts`, `python`, `bash`, `console`, `json`, `css`, `html`, `xml`, `markdown`, `sql` are coloured by the built-in tokenizer; any other is set plain); then attributes in the §8 grammar, braced or bare: `title="…"`, `label="…"`, `lineNumbers` / `lineNumbers=false`, `start=N`, `highlight="3,5-7"`, `span=page`. A bare rest is the title: `` ```console Terminal ``.
- **Placement:** a fence interrupts a paragraph; one left open runs to the end of the text (`unclosedCodeBlock`). Inside `:::callout` it is a nested box; inside `:::paragraphs` it keeps `codeStyle`. A fence after a list item closes the list (no list continuation).
- **Layout:** one line per source line in the code face, in a box (`codeStyle`, configuration.md §12b): never hyphenated or justified, spaces at full width, tabs to the next `tabSize` stop, overlong lines wrapped / shrunk / clipped (`codeOverflow`), numbers in a gutter (not copied), split between lines across columns and pages.
- **Indented code** (4 spaces / a tab after a blank line) is a listing only under `codeStyle.indentedCode: true`.
- **Stored presets:** a manifest below `configVersion` 9 whose chapters hold a fence reads them as Markdown (`codeStyle.blocks: false`). Write `"configVersion": 9`.

---

## 4. Inline formatting (paragraphs, list items, blockquotes)

Pipeline order per block:
1. `extractInlineChips`
2. `extractInlineRefs`
3. `extractInlineSwatches`
4. `extractInlineMath`
5. `parseInlineFormatting` (link syntax reduced to its text, with the URL kept as a range on the span; images and code stripped; then bold, italic and scripts)

Earlier passes shield their content from later ones. Math is extracted before emphasis, so `*` inside `$…$` is safe. Tabs (`:tab`, tab characters, §10.9) are taken out after the maths, outside inline code, link destinations and directive attributes.

| Markup | Syntax | Result / notes | Source |
|---|---|---|---|
| Bold | `**x**` or `__x__` | bold span |  |
| Italic | `*x*` or `_x_` | italic span | `:323-344` |
| Bold italic | `***x***` or `___x___` | both | `:355` |
| Italic inside bold | `**a *b* c**` | works | |
| Bold inside italic | `*a **b** c*` | **does not work.** The outer `*` stay literal; only `b` is bold | |
| Superscript | `^x^` | 58% of the size, raised 1/3 em. Content must start and end with a non-space; no newline; no inner `^` | `:289-308` |
| Subscript | `~x~` | 58% of the size, lowered 0.15 em. Same rules. A subscript and a superscript that touch (`T~0~^2^`, either order) are stacked, the subscript 0.25 em down; a space, a letter or a word joiner (U+2060) between them sets them one after the other. A stacked pair never parts at a line break (a word too wide for the line breaks before it) | `:289-308` |
| Tab (≥ 1.23) | `:tab`, `:tab{at=… align=… leader=…}` | goes to the paragraph's next tab stop, or to the one-off stop of its attributes; see §10.9 | |
| Small caps | `:smallcaps[x]` | lowercase letters as capitals at 70% of the size (synthesised, identical on every backend). Takes marks inside and around it; `\]` for a literal `]`; empty or unclosed stays literal. Headings strip the markup. See §10.3 | |
| Inline code | `` `x` `` | **backticks removed, rendered literally**: emphasis markers, `$`, links, `:ref{…}` and chips inside it print as written (the way to show syntax). Set in the body face, or with `codeStyle.inline` (≥ 1.23, configuration.md §12b) in a code face as one unbreakable unit, optionally on a fill. | `:313-318` |
| Link | `[text](url)` | text kept and set exactly as without the link. The URL becomes a live link in HTML (`<a>`) and PDF (a URI annotation), not on canvas. Only `http`, `https`, `mailto`, `tel`, `ftp` and relative URLs are linked; any other scheme keeps the text only. The destination takes **balanced parentheses** as in CommonMark (`[Wiki](…/A_(b))` links the whole URL); an unbalanced one ends at the first `)` and the text is set with no link. A `"title"` is ignored; `<…>` may hold spaces. Works in paragraphs, lists, quotes, callouts, captions, notes and cells, not in headings or chips | `replaceLinkSyntax`, `linkHref` |
| Image | `![alt](src)` | **removed** from the text | `:315` |
| Escapes | `\*` `\_` `\^` `\~` `` \` `` | the literal character (body, captions, cells, notes) | `:261-273` |
| Emphasis dots (≥ 1.9) | `:dots[不可]`, `{style="dot\|circle\|sesame" fill="open" pos="over\|under"}` | 着重号: under each character (right in vertical text), none on punctuation. `*…*` on Chinese characters does the same under `cjk.emphasis: 'dots'` (default in a Chinese document). Japanese (≥ 1.16): 傍点 are sesame ﹅ over the text (right in vertical text) by default (`cjk.emphasisMark`); `fill="open"` = 白ゴマ, `style="circle" fill="filled"` = 丸傍点 (a circle is open by default: 白丸); dots skip punctuation and go outside a ruby reading | |
| Side line (≥ 1.16) | `:sideline[注意]{style="solid\|double\|wavy\|dotted" pos="over\|under"}` | 傍線: a line along the run (under in horizontal text, right in vertical text), through its punctuation; Aozora 鎖線 → `dotted`; 破線 has no shape (falls back to solid) | |
| Proper-name line (≥ 1.9) | `:name[賈寶玉]` | 专名号: straight line under (left in vertical); adjacent names keep a gap | |
| Book title (≥ 1.9) | `:book[石頭記]` | 书名号 per `cjk.bookTitleMark`: 《》 inserted (mainland default), wavy line (Taiwan/HK), or bare; 『』 in Japanese (「」 for a title inside one, `cjk.bookTitleBrackets`, ≥ 1.16). If the source already TYPES the brackets, keep them as text instead | |
| Ruby (≥ 1.9) | `:ruby[紅樓]{rt="hóng lóu"}`, `{rt="hónglóu" group}`, `pos="over\|under\|right"`; compact `{紅樓\|hóng\|lóu}`; `mode="mono\|group\|jukugo"`, `align="center\|jis\|start"` (≥ 1.16) | one reading per character when the counts match (line may break between), else one group reading. Zhuyin (bopomofo) goes right of each character. Compact form only when the base holds Han/kana/bopomofo; `\{紅\|hóng}` is text. Japanese (`locale: ja`): a reading per character of a word (`{東京\|とう\|きょう}`) is jukugo ruby (`mode=mono` keeps it mono); one reading (`{東京\|とうきょう}`, the Aozora 《》) is group ruby | |
| Warichu (≥ 1.9) | `:warichu[note]{open="〔" close="〕"}` | 双行夹注 / 割注: two half-size rows inside the line, breaking across lines and pages; （） by default in Japanese | |
| Kanbun marks (≥ 1.16) | `:kunten[學]{okuri="ビテ" kaeri="レ" tate}` | 返り点 (`kaeri`: レ 一 二 三 上 中 下 甲 乙 天 地 人, 一レ 上レ…; ㆑–㆟ read as those) small at the lower left of the character (the last one when the brackets hold several), 送り仮名 (`okuri`; Aozora's （ヲ） brackets dropped) small at its right from mid-character (over and after it in horizontal text), `tate` = 竪点 joining it to the next character. The text is not reordered; copy and screen readers get 學ビテ. Nested ruby works (`:kunten[:ruby[未]{rt="ザル" pos=under}]{kaeri="レ" okuri="ダ"}`). Size and placement: `cjk.kunten`; `kuntenExceedsLeading` when the gap is short | |
| Tate-chu-yoko (≥ 1.9) | `:tcy[12]` | vertical text: one upright cell. In Japanese (≥ 1.16) `!!` `!?` `?!` `??` (and ！？ pairs) get it automatically too. Numbers of ≤ `cjk.uprightDigits` (2) digits get it automatically, except inside a Latin sentence (a Latin word on both sides: `chapters 49 and 32`, `(7) of`, `pages 3–5 of`), where they run sideways with the words; postext 1.9.0 and 1.9.1 stand those upright too (`:sideways[49]` there). No effect horizontally | |
| Upright / sideways (≥ 1.9) | `:upright[GDP]`, `:sideways[12]` | vertical text: each character upright in its own cell / the run turned | |
| Dollar | `\$` | literal `$`; otherwise `$` opens inline math. Captions, cells and notes set inline maths too (postext ≥ 1.19), by Pandoc's rule: no space after the opening `$`, none before the closing one, no digit right after it ("$5 to $10" stays text); up to 1.18 `$` was literal there. Chip texts have no maths. `\$` gives `$` everywhere (postext ≥ 1.5; 1.4 printed `\$` in snippets). In an attribute value (`:ref{text="…"}`) a backslash is ordinary: `\$` stays `\$` |  |

**Emphasis gotchas:**
- (≥ 1.9) Han, kana and hangul do not block `_` flanking: `中文_斜体_中文` is italic. A `~` with a digit on both sides (`3~5天`) or between two Chinese words (`周一~周五`) is literal; `^_^` is always text.
- **Intraword underscores are text** (since the engine follows CommonMark here): `snake_case_name` and `http://a.com/x_y_z` keep their underscores; only `_emphasis_` at word boundaries italicises. For emphasis inside a word, use `*`. (Older engines italicised between two intraword underscores: write `\_` there if a document must also lay out on them.)
- Lone asterisks pair up across a paragraph: `x * y * z` gives an italic ` y `. Write `\*` or use `×` / `·`.
- `~` pairs: `~~strike~~` has **no strikethrough**. It gives a subscript `~strike` plus literal tildes. A span is `~X~` / `^X^` where X starts and ends with a non-space and has no inner marker or newline. `from ~5 to ~10` stays literal only because the text before the second `~` ends in a space. `about ~5km~ish` would subscript. When in doubt, write `\~` (or `\^`).
- Patterns are non-greedy and can span what were separate source lines (lines are joined first).
- Emphasis does not cross block boundaries.

**Footnotes:** `[^id]` markers (paragraphs, list items, blockquotes, callouts) and `[^id]:` definitions, §10.4.

**Not supported:** strikethrough, underline, inline HTML, reference links `[a][b]`, autolinks `<http://…>`, emoji shortcodes, inline language spans. The PDF tagging `Lang` comes only from config. No per-span `lang` exists in the Markdown.

---

## 5. Lists (, 361-447`; numbering )

| Kind | Regex (on the raw line) | Notes |
|---|---|---|
| Task | `^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$` | `checked = mark !== ' '`. Only `[ ]`, `[x]`, `[X]`. |
| Ordered | `^(\s*)(\d+)([.)])\s+(.*)$` | Digits only. **No `a.`, `i.` or `A)` markers.** They are paragraph text. |
| Unordered | `^(\s*)([-*+])\s+(.*)$` | |

- **Depth** follows the items above (≥ 1.16, #465): an item nests under the nearest open item whose marker sits at least 2 columns to its left, and its depth is the number of items it is nested in plus one, capped at 5. Indent to the text of the item above: 2 spaces under `- `, 3 under `1. `, 4 under `10. ` (2 under `1.` nest too). One space nests nothing, a level is never skipped (`- a` / `    - b` is depth 2), a tab reaches the next multiple of 4 columns, and a list's first item is depth 1 however far it is indented. Any other block between items restarts the nesting; blank lines do not. Up to 1.15 the depth was `min(5, floor(leadingSpaces / 2) + 1)`, which put `      1.` under `   1.` at depth 4.
- **Every item is exactly one line.** There is no lazy continuation. `- item\n  continued` gives a list item `item` **plus a separate paragraph** `continued`. A multi-paragraph item, or a list item containing a blockquote, code or math block, is impossible. Put the whole item on one line (its inline text may be long).
- **Ordered numbers are literal.** Each item prints the number typed in the source: `1. 1. 1.` renders 1, 1, 1. This is unlike CommonMark. Type the real numbers. The printed format (decimal, roman, alpha) and separator come from `orderedLists.levels[depth-1]` (`numberFormat`, `separator`). `1)` vs `1.` in the source doesn't matter.
- Kinds can mix at the same depth. A kind change at a depth closes the numbering run there.
- A single blank line between items keeps the run. With 2+ blank lines the parser starts a new run of list blocks, but the pipeline only closes runs at a **non-list** block, so the rendered list effectively continues. To really separate two lists, put a paragraph (or another block) between them.
- A list ends at the first non-list, non-(blank + list) line. A paragraph glued under a list item becomes a separate paragraph.
- Inside list items the full inline set works: chips, refs, swatches, math, emphasis, scripts.
- Rendering of task checkboxes uses `taskCheckboxChar` / `taskCheckedChar` (config).

---

## 6. Blockquotes

- Consecutive lines whose trimmed form starts with `>` form **one** blockquote block. `^>\s?` is removed from each line, and the lines are joined with spaces.
- `>` blank lines do **not** split paragraphs. `> a\n>\n> b` gives the single block `a b`. Two quotes need a blank (non-`>`) line between them.
- No nesting (`>>` leaves a `>` in the text), and no lists or headings inside (`> - item` gives the text `- item`).
- Full inline set (chips, refs, swatches, math, emphasis).
- A blockquote glued under a paragraph line ends the paragraph.
- Its look is `bodyText.blockquote`: `color` (default #666666), `italic` (default true; `*…*` inside flips back to upright), `indent` (every line, default 0) and `firstLineIndent` (counted from `indent`, default the body's). Family, size, leading and alignment are the body's.
- Use it for simple quotes. For epigraphs, attributions or multi-paragraph quotes, prefer `:::paragraphs{style="…"}` (§7.2) with a configured paragraph style.

---

## 7. Fenced containers `:::name{attrs}` … `:::`

**Opening fence regex:** `^:::\s*([a-z][a-z0-9-]*)\s*(?:\{([^}]*)\})?\s*$` on the trimmed line.
- The name is **lowercase** (`:::Callout` is literal text).
- Space is allowed after `:::` (`::: callout`).
- The attribute blob cannot contain `}`.
- Nothing may follow on the line. `:::pagebreak now` is literal.

**Close:** a bare `:::` line closes the **innermost** open container (`:21, 216-236`). A stray `:::` with nothing open is a literal paragraph.

**Known containers:** `callout`, `paragraphs`, `part`, `columns`, `paper`.

**Unknown names** such as `:::note`, `:::figure` or `:::aside` are **not** containers (`:::verse` is a raw-body block, §12, not a container either). The fence line becomes paragraph text, the content parses normally, and the closing `:::` becomes a literal paragraph too. The sandbox raises `unknownDirective`.

- Fences end a running paragraph, list or quote without a blank line, but blank lines around fences are still recommended.
- An unclosed container is auto-closed at the end of the document, with an `unclosedContainer` issue.
- Containers can hold any blocks: headings, lists, quotes, math, `::resource`, other containers.
- **Single-line directives inside a callout are ignored**.

### 7.1 `:::callout` (boxed content)

Plan: , 299-318`. Placement: .

| attr | values | default | notes |
|---|---|---|---|
| `type` | id of a `calloutStyles[]` entry | the **first** configured style | An unknown or missing type falls back to the first style, with an `unknownCalloutType` warning. The built-in default has one style, `note`. |
| `title` | text | the style's `title` (default `''`) | **Plain text only.** `**…**` is not parsed and shows literally. Cannot contain `}` or the quote character used. The style may uppercase it. Dropped on continuation fragments, unless the style has `repeatTitle` (then repeated with `continuedSuffix`). |
| `label` | text | `''` | Printed in the label tab, **only if the style configures `label`**. E.g. `label="BOX 1-1"`. |
| `span` | `column` \| `page` \| `side` | the style's `span` (default `column`) | `page`: full-width band cutting the columns. `side`: into the float-only side column of a one-and-a-half layout (`layout.sideColumnRole:'floats'`), otherwise acts as `column`. Invalid values are ignored. |
| `placement` | `here` \| `auto` \| `top` \| `bottom` \| `fixed` | the style's `placement` (default `here`) | `here`: inline in the flow. `auto`/`top`/`bottom`: floated to the first free band after its position while the text continues. `fixed`: pinned to page coordinates by the style's `fixed.anchor/offset`. Invalid values are ignored. |
| `wrap`, `width`, `wrapGap` | `left` \| `right` \| `start` \| `end`; 0..1; a length (`6pt`) | none | postext ≥ 1.24. Text wrap: a `here` box sits at that side of its column, `width` of it (else `layout.wrap.defaultWidth`), and the text after it runs beside it (a pull quote, a sidebar); with `placement="top\|bottom\|auto"` it floats to the head/foot of one column with the column's lines beside it. Never splits. `span="page\|side"` and `fixed` boxes ignore it. |
| `columns` | whole number ≥ 1 | the style's `columns` (default 1) | postext ≥ 1.18. A floated (`auto`/`top`/`bottom`) `span="column"` box across this many adjacent columns: the head of a run of empty level columns, or the foot of the current column and the empty ones after it. ≥ the page's column count = page-wide. Ignored for in-flow (`here`), `fixed`, `page` and `side` boxes. |

- Style-level only (not attributes): `icon`, `marker`, `stripe`, `border`, `background`, `width: fill|auto`, `keepTogether` (default `true`), `splitMinLines` (default 2), the continuation marks (`repeatTitle`, `continuedSuffix`, `continuesMarkerEnabled`, `continuesMarker`, `continuesMarkerAlign`, `continuesMarkerItalic`), `floatBarrier`, `snapToGrid`, `columnGap`, and the body/list typography. **There is no per-instance `icon` or `keepTogether` attribute.** To vary them, define another style and select it with `type`.
- **Nesting:** a `:::callout` inside a callout is its own box with its own style, at the parent's inner width. Its `span`/`placement` are ignored. Each `:::` closes the innermost box.
- **Splitting:** a box keeps together unless the style has `keepTogether:false`, or it is taller than a column. A split happens between children, or between lines with at least `splitMinLines` lines per side; a cut inside a paragraph or list item also leaves at least `layout.boxChildSplitMinLines` (2) of its lines on each side (`splitMinLines` when lower). Continuations drop the icon (their text keeps its column, empty), and the title unless the style has `repeatTitle` ("Key points (cont.)"); `continuesMarkerEnabled` sets `continuesMarker` ("Continued" / "Continúa", or a script's "(MORE)") under every part that goes on. Both marks are artifacts in a tagged PDF.
- **`floatBarrier` style:** every pending float referenced before the box is placed before it (typical for the chapter-closing "key points" box).

```md
:::callout{type="objectives" title="What you will learn" span="page" placement="top"}
- Name the parts of the lantern.
- Trim the wick without touching the glass.
:::

:::callout{type="card"}
The statement of the exercise.

:::callout{type="answer"}
Answer box.
:::
:::
```

### 7.2 `:::paragraphs{style="…"}` (named paragraph style)

; applied at .

| attr | values | notes |
|---|---|---|
| `style` | id of a `paragraphStyles[]` entry | Required unless the fence sets `align`/`indent`/`endIndent`. Unknown: the paragraphs render as body text, with an `unknownParagraphStyle` warning. |
| `align` (≥ 1.16) | `start` \| `end` \| `left` \| `right` \| `center` \| `justify` | overrides the style's (or, without `style`, the enclosing text's) alignment: 地付き = `{align=end}` |
| `indent` / `endIndent` (≥ 1.16) | length; a bare number is ems (`indent=2` = 2字下げ) | every line from the start / from the end (right of a horizontal line, foot of a vertical one): 地から1字上げ = `{align=end endIndent=1}` |
| `dropcap` (≥ 1.23) | bare, `false`, or a number of lines | the group's first paragraph (every one when the style's `dropCap.each`) opens with a drop cap: the style's (configuration.md §4b), switched off by `false`, set over N lines by a number, or a default one (3 lines) where the style has none |

- The style applies **only to `paragraph` blocks** inside the container. Lists, quotes and headings inside keep their normal styles.
- The container's `marginTop` is applied on entry and `marginBottom` after the last paragraph. Negative margins pull the flow up.
- Works inside callouts too (nested boxes included). Unset fields inherit the document's `bodyText`, not the box's `body`.
- A style may set `fontWeight` / `boldFontWeight`, `italic: true` (stage directions; `*…*` runs turn upright) and `smallCaps: true` (a cast list).
- This is **the** way to do epigraphs, colophons, dedications, small print, lead-ins, signatures and centred lines. **Code is not**: a listing goes in a ```` ``` ```` fence (§3.4). **Verse is not**: a poem goes in `:::verse{style="verso"}` (§12), which keeps its lines, indents and stanzas; the same paragraph style gives it face, size, leading and margins:

```md
:::verse{style="verso"}
Nunca fuera caballero
de damas tan bien servido
  como fuera don Quijote
  cuando de su aldea vino
:::
```

### 7.3 `:::part{number="…" title="…" palette="…"}` (part/section divider)

Sources: ; .

| attr | values | notes |
|---|---|---|
| `number` | any text (`I`, `IV`, `3`) | Printed as written (`{partNumber}`). Also parsed as decimal or roman for `{numberDecimal}`/`{numberRoman}` etc. in the part design. Optional. |
| `title` | text | `{partTitle}`, on the opener. `\\` is a forced break. Optional. |
| `palette` | `id=#hex` pairs separated by `,`, `;` or whitespace, joined with `=` or `:`, the `#` optional, 3/6/8 hex digits | Recolours palette-linked design colours, and the text colours sharing their base value, from this part until the next part. Example: `palette="band=#9bcdbf, band-grey:#fadec7"`. Malformed pairs are skipped. |

- The part opens its own page: a break of `parts.breakBefore.parity` before it, the opener design over a single-column page, and another break after it (`parts.breakAfter`, default enabled, parity `any`).
- The body (often the list of the part's chapters, or nothing) is set with `parts.bodyStyle`.
- With config `parts.page:false`, the part opens no page and its body is not set. It only switches running heads and palette from the next content onward.
- A part nested in a part is flattened into the outer one.
- Parts are listed in `:::toc` as part rows.
- A part is also a float barrier: pending floats are placed before it.
- **Book tip:** put the `:::part` at the top of the first chapter file of that part, before its `# H1`. The part's palette carries across later chapters through the continuation.

```md
:::part{number="I" title="Foundations" palette="band=#9bcdbf"}
:::

# The lantern and its parts
```

### 7.4 `:::columns{count=N breaks="…"}` (multi-column group)

Source: ; .
- **In a `:::callout`, or (postext ≥ 1.25, `layout.flowColumns`) in the running text.** In a box the columns share its inner width, `columnGap` apart, in the box typography. In the text they share the text column, a body line apart, in the text's own typography; `span="page"` on a page of several columns cuts the page into a band, like a page-span box (columns above close level, text resumes in every column below). Headings inside keep their style, number and TOC entry; footnotes go to the column foot. Up to 1.24 (and with `flowColumns: false`) the fences are ignored outside a box.
- Use a main-flow group for column bands in the text (newspaper briefs, a poster's three columns, an index-like list) instead of a frameless page-span callout that only holds a group.
- `count`: integer 2–6, default 2. `gap`: a length (`12pt`, `1em`); default `columnGap` in a box, a body line in the column, `layout.gutterWidth` across the page. `rule`: a rule down each gap (`layout.columnRule` colour/width).
- **Splitting (≥ 1.25).** A group that does not fit (the rest of its column, or a box that splits) is cut and goes on in the next column/page. `flow="snake"` (default without `breaks`): one galley, columns filled in turn, cut between blocks or lines (≥ `layout.boxChildSplitMinLines` per side), the last part balanced. `flow="parallel"` (default with `breaks`): each `breaks` run is a stream kept in its own column, every stream going on in the same column of the next part: a poem and its translation stay level. A nested box in a group stays whole; a group inside a nested box is never cut. Groups that fit lay out as before. Warnings `columnsFlowUnknown`, `columnsTooNarrow`.
- `breaks`: a comma list of **1-based block indices** within the group where columns 2, 3, … start. Values must be > 1. Without `breaks`, the columns are balanced, and a cut may fall inside a paragraph or list item. With `breaks`, there is no mid-paragraph cut.
- `breaks` counts blocks only: paragraphs, list items (one each), display formulas, figures, tables; a nested callout counts as **one**. Directives (`:::space`) are **not** counted. A value past the last block or not after the previous break is ignored.
- `:::space` inside the group separates blocks, but is **dropped at the top of the group and at each column head** (so equal stanza gaps line up across columns). Put space before the `:::columns` fence to push the group down.
- Every column shares the box's `body`/`lists` typography; a group has no style of its own.
- The gap between columns is the callout style's `columnGap`.

```md
:::callout{type="summary"}
:::columns{count=2}
- Every element is one kind of atom.
- Electrons live in orbitals.
- A bond shares or transfers electrons.
:::
:::
```

### 7.5 `:::paper{type=… grammage=…}` (a run of pages on another paper stock)

- The content starts on a new page, and whatever follows the closing `:::` starts on a new page too (a stock covers whole sheets). A run that ends the document leaves no blank page.
- Every page set from inside the run carries `page.paper` (the attributes as written) in the VDT. Only the Folio 3D viewer reads it (the look, thickness and stiffness of those leaves); canvas, PDF and HTML output ignore it.
- Attributes (all optional; unset ones follow `config.folio.paper`): `type` (`uncoated`, `bookWove`, `coatedMatte`, `coatedSilk`, `coatedGloss`, `bible`, `newsprint`, `cardStock`, `board`), `grammage` (g/m², > 0), `bulk` (cm³/g, > 0), `finish` (`auto`, `uncoated`, `matte`, `silk`, `gloss`), `texture` (`auto`, `smooth`, `vellum`, `wove`, `laid`, `linen`, `felt`), `textureStrength` (0 to 2), `shade` (`#rgb`, `#rrggbb` or a `colorPalette` id), `showThrough` (`true` / `false`). An invalid value is dropped with a `paperAttributeInvalid` warning.
- Nested `:::paper`: the inner fence's attributes override the outer one's, and it breaks pages on both sides as well.
- Inside a `:::callout` the fences are ignored.

```md
:::paper{type=coatedGloss grammage=130}
## Plates
::resource{id="plate-1"}
:::
```

---

## 8. Attribute grammar (shared by fences, directives, heading attrs, `:ref`, `:swatch`, `:chip{…}`, `:tab{…}`)

. Token regex: `([A-Za-z_][A-Za-z0-9_-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?`
- Forms: `key="v"`, `key='v'`, `key=bare`, and a bare `key` (becomes `""`).
- Any order. A repeated key keeps the last value. Values are always strings.
- **No escapes.** A value cannot contain its own quote. Use the other quote style: `title='He said "hi"'` works.
- For fences, directives and `:ref`/`:swatch`, the blob ends at the first `}`, so **values can never contain `}`**. `:ref{id="a" text="x}y"}` breaks.
- Unknown keys are kept but ignored.
- (≥ 1.9) A value may be quoted with the curly `“…”` or corner `「…」` an input method types (spaces included), and `＝` works as `=`. Keys stay ASCII: a key in another script is dropped with `attributeKeyInvalid`.

---

## 9. Resources: figures, images, SVGs, tables

Resources are JSON records in `PostextContent.resources` (in a preset: `preset.json → resources[]` plus the files). They are not Markdown. Main fields:
- `id`, `typeId` (e.g. `figure`, `table`), `kind: bitmap|svg|table`, `caption`, `note`, `altText`, `placement`
- the payload (`bitmap{fileId, format, width, height, resolution?, fileResolution?}`, `svg{fileId, pdfFileId?, inlineFonts?}` (`inlineFonts: false` keeps the SVG's markup as stored; by default the faces its text names are embedded when it is shown, ≥ 1.25), `table{model, styleId?}`)
- a bitmap's natural size: its pixels at `page.dpi`, or (≥ 1.24) `width × page.dpi / resolution` when it has a `resolution` (its own, or `layout.bitmapResolution`: a ppi, or `'file'` for the file's stated one, 72/96 counting as unset); the slot caps it and a smaller picture is never enlarged; `placement.width` narrows the slot
- `safeArea` (bitmap/svg only, optional): `{x, y, width, height}` in fractions of the picture, top-left origin; the part always shown. With it the engine may crop outside it to make the figure taller or shorter (fit the room left, `fitFiguresToPage`, `placement.shrink` before it scales, column balancing lever `flexFigure`); without it the picture is always whole

The Markdown only cites them.

### 9.1 Inline reference `:ref{…}` (primary form: cites and places)

**Regex:** `:ref\{([^}]*)\}`. **Only the brace form exists.** `:ref[…]` is not a thing.

| attr | values | notes |
|---|---|---|
| `id` | resource id | Required. `:ref{}` without an id stays literal text. |
| `style` | `default` \| `number` \| `full` | default gives `Fig. 1.7` (the type's `shortLabel` + NBSP + number); `number` gives `1.7`; `full` gives `Figure 1.7` (the type's `name`). An invalid value is ignored. |
| `case` | `lower` \| `upper` \| `capitalize` | Recases the label word only, never the number. Ignored when `text` is set. |
| `text` | any text (no `}`) | Verbatim override of the whole label. An empty `text=""` falls back to the computed label. |

- The label is resolved in . It renders as **one atomic unbreakable box**.
- An unknown id renders `?`, with an `unknownResourceId` warning.
- Recognised in paragraphs, list items, blockquotes, **headings**, callouts, and in resource captions, notes and table cells.
- **Not recognised inside `:chip[…]`** (stays literal).
- **The first mention places the resource.** A floated resource (`placement.position` `auto`/`top`/`bottom`) goes into the first free slot **after** its first reference: the bottom of the current column, the top of the next, or a band of the next page. You do NOT embed it again.
- **Head of the citing page** (≥ 1.25): `placement.citingPage: true` (or `layout.floatsAtCitingPage`) lets a `top`/`auto` float head the page (column) where its citing line lands instead; the text above the reference moves down under it. Cite where the text wants the reference, not earlier to pull a figure forward.
- Floats of one type never overtake each other.
- Floats are flushed at chapter openers (`breakBefore`), `:::part`, `floatBarrier` callouts, and the end of the document. `:::pagebreak` sends pending floats to the next page.
- **Under a page-span opener** (≥ 1.25, `layout.floatsUnderOpener`): on a page of 2+ text columns, a `top`/`auto` float embedded with `::resource` right after the `span: 'page'` heading (or a `placement="top"` box fenced there) takes the head of column 1 under the opener; with `columns` it runs across k columns from column 1. Up to 1.24 it landed from column 2.
- **Side boxes at the end of a chapter** (≥ 1.25): `span="side"` boxes still waiting for the side column when the text ends each take the side column of a page after the text, in fence order, with an `afterText` warning per box (≤ 1.24 dropped all but the first page of them). Treat `afterText` as a layout fault to fix: fence the box earlier or shorten it.

### 9.2 Block embed `::resource{id="…"}` (inline placement)

**Regex (strict):** `^::resource\s*\{id="([^"]+)"\}\s*$` on the trimmed line. It takes **exactly** the one attribute `id`, in **double quotes**, and nothing else. `id='x'` or any extra attribute makes it literal paragraph text. Leading indentation is fine.
- Renders the resource inline **only if** its resolved placement is `position: "here"`. For floated resources it counts as just another reference.
- A `here` resource that is only `:ref`'d, never `::resource`'d, is numbered but **never placed**.
- **Needs blank lines around it.** A glued line is swallowed into the previous paragraph (§3.1).
- Typical use: ornaments, headpieces, a figure that must sit exactly at a point, or one inside a callout.

```md
Here is the floor plan.

::resource{id="lighthouse-diagram"}

The keeper's quarters occupy the eastern wing.
```

### 9.3 Numbering

Source: , 259-263`.
- Assigned in **order of first reference** (a `:ref` or `::resource` in a body block), per resource type.
- Template `ResourceType.numberingTemplate` with `{n}` and `{h1}`..`{h6}` (default `{h1}.{n}`), `resetOn` (default `h1`) and `counterFormat` (decimal, roman-lower/upper, alpha-lower/upper).
- Defaults: `figure` gives Figure/Fig. in English and Figura/Fig. in Spanish; `table` gives Table/Tab. in English and Tabla/Tabla in Spanish.
- `:ref`s inside captions, cells or notes do **not** count as first references. Only body blocks, including callout children, count.
- The caption is `captionPrefix` + NBSP + number + `.` + the caption text.

### 9.4 Placement (resource JSON, not Markdown)

`placement: { position: auto|top|bottom|here, span: column|page|side, rotate?: ccw|cw, width?: 0..1, align?: left|center|right, captionSide?: bool, columns?: int, wrap?: none|left|right|start|end, wrapGap?: Dimension }`.
- `wrap` (≥ 1.24): text beside a picture narrower than its column. With `position: here` the text after the `::resource` line runs beside it and then under it (a paragraph may start beside it and end under it); on a one-column float at the head or foot of a column, the column's first or last lines. Headings, display maths, figures, tables, boxes and poems go under it. `width` defaults to `layout.wrap.defaultWidth` (0.45); `wrapGap` to one body line. This replaces a `:::columns{count=2 breaks=…}` group holding the text and the picture.
- `columns` (≥ 1.18): a `span: column` float across that many adjacent columns (a newspaper picture across 2 of 5 columns); as many as the page has = page-wide; ignored for page/side spans, rotated resources and `here` embeds; `captionSide` only on 1-column floats.
- A resource's own placement falls back to its type's `defaultPlacement`, then to `auto`/`column`.

### 9.5 Tables

**GFM pipe tables are NOT parsed.** They become one literal paragraph.

Tables are `kind:"table"` resources with a `TableModel`:
- `rows: TableCell[][]`, `headerRowCount`, `columnWidths` (relative weights).
- Per cell: `content` (inline snippet), `colSpan`, `rowSpan`, `isHeader`, `align`, `verticalAlign`, `background` (ColorValue), `image {resourceId, width}`, `hiddenBy` (a cell covered by a merge).
- `table.styleId` names a `tableStyles` entry.

**Snippet syntax** (cell content, caption, note), from :
- Recognised: `**bold**`, `*italic*`, `^sup^`, `~sub~`, escapes, `:ref{…}`, `:swatch{…}`, `:chip[…]` and `:smallcaps[…]`.
- **Inline `$math$` is NOT supported in snippets.** The `$` stays literal.
- In **cells**, `\n` separates paragraphs. A paragraph starting with a marker is a hanging list item: `•·◦○▪‣-*–—` or `1.`/`1)` (up to 3 digits) followed by whitespace. Two leading spaces per nesting level.
- A cell paragraph of ordinary spaces sets nothing; one holding a U+00A0 sets a line (postext ≥ 1.5), and a trailing U+00A0 keeps its width, so `'760\u00A0'` right-aligned over `'(231)'` ends a space short of the edge and sets the 0 close to the 1 (exactly under it only if the space is as wide as `)`, which it rarely is). 1.4 dropped both (there, a word joiner U+2060 after the no-break space keeps it).
- **Line breaks** (postext ≥ 1.5): `\\`, or a backslash ending a line, breaks the line in a caption or a note (`¹ At 20 °C. \\ ² Mean of three runs.`); in a cell it opens a new paragraph, as `\n` does. A plain newline in a caption or note is a space. The two backslashes stay literal only in inline code, link destinations and directive attributes, and read as a space inside a chip label.

---

## 10. Other inline directives

### 10.1 `:chip[text]{style="…"}` (boxed, unbreakable run)

**Regex:** `:chip\[((?:\\.|[^\]\\\n])+)\](?:\{([^}\n]*)\})?`.
- The text is non-empty and on one line in the source. Paragraph lines are pre-joined, so a chip may straddle source lines inside a paragraph. Whitespace collapses to a single space. `\]` gives a literal `]`.
- `{…}` must follow `]` immediately. **Only `style` is read.** Missing or unknown: the first `chipStyles` entry (built-in id `chip`), with an `unknownChipStyle` warning.
- The chip text takes its own emphasis and scripts (`:chip[**bold** x^2^]`). Refs, swatches and math inside a chip stay literal; `\$` gives `$` (postext ≥ 1.5; 1.4 printed `\$`). Surrounding emphasis applies (`**:chip[a]**`).
- Works in paragraphs, list items, blockquotes, callouts, cells, captions and notes. **Not in headings** (literal). Not in callout `title` attributes.
- Never broken or hyphenated. Line breaks happen at the spaces around it.

```md
Press :chip[Ctrl]{style="key"} + :chip[C]{style="key"} to copy.
Classify: :chip[battery] :chip[cable] :chip[switch]
```

### 10.2 `:swatch{color="…"}` (colour key square)

**Regex:** `:swatch\{([^}]*)\}`.
- `color` is required (no colour: literal text). Values: `#rgb` or `#rrggbb`, **or a palette entry id** (e.g. `color="table-compatible"`). An unresolved value draws an empty outline.
- Allowed in every text block including headings, and in snippets.

```md
:swatch{color="ok"}: compatible; :swatch{color="#e5adb8"}: incompatible
```

### 10.3 `:smallcaps[text]` (small capitals)

**Regex:** `:smallcaps\[((?:\\.|[^\]\\\n])+)\]`, after chips are taken out (so `:smallcaps[:chip[key]]` works).
- Lowercase letters are set as capitals at 70% of the size; capitals, digits and punctuation keep the full size. **Synthesised** from the face's capitals (no OpenType `smcp`), identical in canvas, HTML and PDF. For real small caps, use a small-caps family ("… SC") in a paragraph style.
- Takes its own marks (`:smallcaps[**Ophelia**]`) and the surrounding emphasis (`*:smallcaps[Act I]*`). Refs and chips inside are set in small caps too (a ref stays one link in HTML and PDF); math is not. Write `\]` for a literal `]`. Empty (`:smallcaps[]`) or unclosed stays literal.
- Works in paragraphs, list items, blockquotes, callouts, cells, captions and notes, and in headings while `headings.inlineMarks` is on (the default); with it off, headings strip the markup.
- Words still hyphenate (read in their own case). Copy/extraction yields the capitals ("HAMLET").
- Whole paragraphs: `paragraphStyles[].smallCaps: true` or `calloutStyles[].body.smallCaps: true`.

```md
Enter :smallcaps[Hamlet] and :smallcaps[Horatio], reading.
```

### 10.4 Footnotes `[^id]` … `[^id]: text` (postext ≥ 1.6)

**Regexes:** marker `\[\^([\p{L}\p{N}_.:-]+)\]` (body text); definition `^\[\^([\p{L}\p{N}_.:-]+)\]:[ \t]*` at the start of a paragraph.
- **Marker** `[^id]` prints the note's number as a superscript glued to the word before it: write it after the punctuation (`evening.[^steps]`). Read in **paragraphs, list items, blockquotes and callouts only**. In headings, captions and table cells it prints as written.
- **Definition** = a paragraph starting `[^id]:`. Its text runs to the next blank line and takes the usual inline marks (bold, italics, links, `:ref`, maths, chips). A definition line glued under a paragraph starts a paragraph of its own. Definitions leave the flow wherever they are written: under the citing paragraph or all at the chapter's end. First definition of an id wins.
- **Numbers** follow first citation, restarting at each chapter (a level-1 heading, and each document of a book); a note cited twice keeps its first number and is set once. `footnotes.numbering: 'document'` runs on through the book.
- **Placement** (config `footnotes`, configuration.md §19a): by default at the foot of the column holding the citing line, under a short rule; the line and its note always share a column (a line whose note does not fit moves on with it). One-column layout = foot of the page. `placement: 'chapterEnd'` sets all of a chapter's notes after its last block. A note cited in a callout goes to the foot of the column where the text after the box goes on.
- **Never split:** a note taller than a column overflows it. Keep notes short; move long ones into a callout.
- **Japanese** (≥ 1.16): write the marker before a sentence-final 。 (`先生[^1]。`): it never parts from the character before it, and 。 never opens a line. A vertical Japanese book sets its notes after the chapter with （1） beside the line by default; `footnotes.markerPosition: 'side'` sets a small interlinear marker (合印), `placement: 'spread'` spread sidenotes (傍注) (configuration.md §19a).
- **Warnings:** `undefinedFootnote` (marker, no definition: the number prints over an empty note), `unusedFootnote` (definition no marker cites: not set).

```md
The keeper climbed the tower every evening.[^steps] The wind put out his candle.

[^steps]: The cast-iron staircase has 112 steps; the tower was built in 1861.
```

### 10.5 Back-of-book index: `:index[…]`, `:index{…}` (postext ≥ 1.7)

**Regex:** `(?<![:\\]):index(?:\[((?:\\.|[^\]\\\n])*)\])?(?:\{([^}\n]*)\})?`. Marks are taken out of the Markdown before parsing, so they never change spans, line breaks or layout.
- **`:index[text]`** prints `text` and indexes it under its own words (inline marks print, and are dropped from the entry). `:index[iron deficiency]{term="Anaemia!iron-deficiency"}` files it elsewhere.
- **`:index{term="…"}`** prints nothing. It takes the page of the word **just before it on its line** (or, opening a line, the word after it). Glue it to the word: `valves:index{term="Heart!valves"}`. A line holding only marks is removed, so a marks-only line never splits a paragraph or adds space.
- **Not after a colon:** `word::index{…}` is not read (the lookbehind guards `:::index`); write `word:index{…}:`.
- **Where:** paragraphs, headings, list items, blockquotes, callouts, footnote definitions. In captions, table cells and design elements a mark prints as written; inside inline code, and after `\`, it is text.
- **Attributes:** `term` levels split at `!` (`term="Heart!valves!mitral"`; a level may carry `*italics*`, sorted without them) · `sub` = one more level · `sort` = sort key of the last level (`sort="Saint Kilda"`) · `yomi` (alias `reading`) = the kana reading of the last level, which a Japanese index files by (`:index[東京]{yomi="とうきょう"}`; a visible mark whose text carries kana ruby, `:index[{東京|とう|きょう}]`, reads itself; order yomi → ruby → sort) · `main` flag = principal page, set bold · `range="start"` / `range="end"` with the same term = `34–37` · `see="Target!level"` = cross-reference instead of a page (adds no page) · `seealso="…"` = after the pages (the mark's page counts) · `index="names"` = a separate index.
- **Warnings:** `indexMarkInvalid` (no term), `indexRangeUnclosed` (start without end or vice versa: prints its one page), `indexSeeUnknown` (target is no entry), `indexReadingMissing` (Japanese index: an entry with a kanji and no reading files after the kana, headless; give every kanji entry a `yomi`).
- **Printing:** `:::index` (main) / `:::index{index="names"}` where the index goes, usually a chapter of its own under a heading whose style sets a two-column `layout`. It expands into ordinary blocks: letter groups in the `locale`'s alphabetical order (accents file with the base letter, Spanish ñ after n), symbols then digits first, page labels (roman front matter included), consecutive pages joined (`12–14`), bold main pages kept apart, PDF links. It converges like `:::toc`; in a book laid out chapter by chapter the index chapter receives every chapter's marks. Styling: config `index` (configuration.md §19b).
- **See marks with no text of their own:** put them on lines under the index heading, above `:::index`. A file or block of marks alone, with no text block to attach to, is dropped.

```md
Iron-deficiency :index[anaemia] is the most common kind.
The pulse is taken at the wrist.:index{term="Pulse!radial" main}
Heart failure:index{term="Heart!failure" range="start"} … :index{term="Heart!failure" range="end"}

# Index {style="index"}

:index{term="Cardiac insufficiency" see="Heart!failure"}
:::index
```

---

### 10.6 Cross-references and anchors (postext ≥ 1.12)

- **Anchors:** a heading `## Method {#sec-method}` (or `id="…"`), a container `:::callout{#box title="…"}`, an invisible `:anchor{#key}`, or `[words]{#key}` (the words stay). Like index marks, inline anchors are taken out before parsing and never change the layout. Ids: letters, digits, `-_.:`; unique in the book (`duplicateAnchor`).
- **References:** `:ref{id="sec-method"}` → *section 1.1* (a level-1 heading: *chapter 1*; an unnumbered heading: its title; an anchor: its text). `style=number` (*1.1*), `title`, `page` (*p. 12*), `pageNumber` (*12*); `text=`, `case=` as for resources. Words follow `locale` (*sección*, *第1.1节*) and config `crossRefs` (configuration.md). Page references converge over layout rounds like `:::toc`; a chapter's references reach anchors in other chapters of the book.
- **pandoc-crossref:** `@sec:id`, `[@fig:id]`, `[-@tbl:id]` (number only), `@Sec:id` (capitalised). The prefix may be part of the id or left off it. An `@` glued to a word stays text.
- **Links:** PDF link annotations + named destinations (`file.pdf#nameddest=id`), HTML `<a href="#pt-a-id">`, clickable in the Sandbox.
- **Porting:** turn LaTeX `\label{sec:x}` / `\ref{sec:x}` / `\pageref{x}` into `{#sec:x}` / `:ref{id="sec:x" style=number}` / `:ref{id="x" style=page}`; Word cross-reference fields and InDesign text anchors likewise. Keep the source's words ("see section", "véase el capítulo") outside the reference when the reference prints the number only.

### 10.7 Citations and bibliography (postext ≥ 1.12)

- **Syntax (Pandoc):** `[@key]`, `[@a, p. 33; @b]`, `[see @a, chap. 2, emphasis added]`, `[-@a]` (author left out), narrative `@a` and `@a [p. 33]`. Locator labels: p./pp./pág./页, chap./cap./章, sec./§, fig., vol., n., l., para.; a bare number is a page. An `@` after a letter/digit (e-mail), in code, or `\@` is text. A citation whose key the book does not define prints as written (`unknownCitationKey` warns for bracketed ones).
- **References:** front matter `references:` (CSL-YAML list; `author: ["García, Ana"]` or `[{family, given}]`, `issued: 2020`) and/or `:::references{format=bibtex|csl-json|csl-yaml}` … `:::` (raw body, prints nothing). `nocite: "@a, @b"` / `"@*"`. References in any chapter count for the whole book.
- **Bibliography:** `:::bibliography{title="…" scope=book|chapter}` where it goes; without it, after the last chapter (title in the document language; `title=""` none). Entries are anchors `ref-<key>`; `[text](#ref-key)` links to one.
- **Style:** config `citations.style` (configuration.md §19a3): bundled `apa`, `chicago-author-date`, `chicago-notes-bibliography`, `modern-language-association`, `harvard-cite-them-right`, `ieee`, `elsevier-vancouver`, `american-medical-association`, `nature`, `iso690-*`, `oscola`, `china-national-standard-gb-t-7714-{2025,2015}-{numeric,author-date,note}`; or `'custom'` + `customStyle` (CSL XML). Note styles turn each citation into a footnote (or 夹注 with `citations.notes: 'warichu'`).
- **Engine:** `import 'postext-citeproc/register'` before building (render.mjs and Node scripts too); the Sandbox loads it itself. Without it citations print as written (`citationsUnavailable`).
- **Porting:** LaTeX `\cite{a,b}` → `[@a; @b]`, `\cite[p.~33]{a}` → `[@a, p. 33]`, `\textcite{a}` → `@a`, `\parencite[see][12]{a}` → `[see @a, p. 12]`, `\nocite{*}` → `nocite: "@*"`; keep the `.bib` as a `:::references{format=bibtex}` block (or convert to front matter). Word/Zotero field citations: export the library as CSL-JSON or BibTeX and rewrite each field as `[@key]`. A printed book's hand-made bibliography can stay as text under `:::paragraphs{style=…}` when its sources are not worth re-keying.

### 10.8 Text direction: `{dir}`, `:ltr[…]`, `:rtl[…]` (postext ≥ 1.15)

- **Document:** config `direction` (`auto` from the `locale` script; `ar` → right to left). Nothing in the Markdown.
- **Block:** `{dir=ltr}` / `{dir=rtl}` on a heading's trailing attributes or a `:::` fence (`paragraphs`, `callout`, `columns`, `part`, `paper`, `verse`). Every block inside a container inherits it, down to a nested one that sets another. A plain paragraph, list item or `> quote` has **no attribute syntax**: wrap it in `:::paragraphs{dir=ltr}`. Other values are silently ignored; there is no `dir=auto`; `:::toc{dir}` does nothing.
- **Inline:** `:ltr[…]` / `:rtl[…]` with optional `{lang=en}`: a bidi isolate (LRI/RLI…PDI). Use it for a Latin title ending in a neutral (`.` `)` `?`) inside Arabic, or a run starting with a digit. Notes, `:ref`, maths inside belong to it; isolates nest. Bare Unicode controls U+2066–2069, U+202A–202E, LRM/RLM, ALM U+061C also work.
- **Trap:** an English paragraph in an Arabic book without `{dir=ltr}` prints its final full stop on the left (the stop is a neutral of the RTL paragraph). Wrap quoted English in `:::paragraphs{dir=ltr}`.
- **Brackets:** type `(…)`, `«…»` in logical order (opening first); renderers mirror them. Quranic ﴿…﴾: type U+FD3F ﴿ first, U+FD3E ﴾ last; never mirrored. Use ؟ ، ؛ (U+061F, U+060C, U+061B), not ASCII `?` `,` `;`, in Arabic text.
- **Digits:** keep the source's typed digits (the engine never rewrites them); a list item `٣.` starts at 3; `{startAt=٥}` reads 5. Generated numbers follow config `numerals`.
- **Notes:** write `[^id]` markers before a following punctuation mark (`الكتاب[^1]،`); never type «(١)» — `footnotes.markerTemplate: '({n})'` prints it.
- **Verse:** classical poems → `:::verse` (§12); Wikisource `{{أبيات|ṣadr \\ ʿajuz …}}` maps line by line. Free verse (no `||`) is the same fence, set line by line; a Latin poem in an Arabic book takes `{dir=ltr lang=en}` on it.

### 10.9 Tabs and tab stops: `:tab`, `:tab{…}` (postext ≥ 1.23)

Text aligned at positions inside a paragraph: a menu's price flush right
after the dish, a cast list's actor after a dot leader, an exam question's
marks at the margin, a form's blank, a price column on its decimal point.
The stops belong to the paragraph's style (`tabStops`, configuration.md §4a);
the text says where each tab is.

- `:tab` is always a tab, in any paragraph, list item, quotation, callout or
  `:::paragraphs` group. The spaces around it are taken into it: write
  `Soup :tab 8.50`. A bare `:tab` followed by a letter is text (`3:table`);
  inside inline code, maths, link destinations and directive attributes it
  is text.
- `:tab{at=120mm align=end leader="." gap=2pt decimal=","}` sets a one-off
  stop for that tab only, with no style needed. `at` takes a length (a bare
  number is pt), `end` or a percentage (`at=50%`); `align` is `start`
  (default), `end`, `center` or `decimal`; `leader` as in the config (`"."`,
  `". "`, `"·"`, `"_"`, `"-"`, `rule`); `gap` is the leader gap (default
  0.5em). Without a valid `at` the tab takes the paragraph's stops.
- A tab character (U+0009) inside a line is a tab only where the paragraph's
  style has stops (§3.3). Tab characters in a row (spaces between them aside)
  are one character of the text that goes on that many stops. Prefer `:tab`
  in chapters you write: it reads the same in every paragraph and survives
  editors that turn tabs into spaces.
- A tab goes to the first stop past the text before it, among the stops after
  the one the line's previous tab took. Past the last stop: the next
  `tabInterval`, else a word space.
- **Overrun:** text too long for its stop. An `end`, `center` or `decimal`
  stop takes the last word before the tab down to the next line with the
  text at the stop (a dish name that runs long keeps its price on its last
  line); a `start` stop breaks the line before the tab, and the text after it
  starts the next line at the stop.
- The leader sits flush with the end of its room, `gap` clear of the text on
  either side (no gap before it when the tab opens the line, none after when
  nothing follows: a form's blank `Name :tab` with an end stop and
  `leader: 'rule'` runs to the margin).
- A paragraph with a tab is set line by line (never Knuth–Plass); justified
  lines stretch only the spaces after their last tab. Vertical text: a word
  space and the warning `tabInVerticalText`.
- Plain text, copy, search and the Word export read `\t` at each tab and
  never the leader; tagged PDF reads a space. The Sandbox's Word import turns
  a Word tab in body text into `:tab` (with the stop Word set for it as
  `:tab{at=… align=… leader=…}`, or bare `:tab` when the paragraph maps to a
  style with stops).

```md
:::paragraphs{style="menu"}
Leek and potato soup :tab 8.50

Grilled sea bream, fennel and orange :tab 21.00
:::

:::paragraphs{style="cast"}
Hamlet, Prince of Denmark :tab Ana Ruiz

Ophelia :tab Marta Gil
:::

1. In which year did the Battle of Gettysburg take place? :tab :chip[1 mark]{style="marks"}
```

With `menu` and `cast` styles holding one stop `{position: 'end', align:
'end', leader: '. '}` (or `'.'`), and the exam's list items taking a body
stop `bodyText.tabStops: [{position: 'end', align: 'end'}]` (or, with no
style at all, `:tab{at=end align=end}`).

## 11. Math (MathJax TeX, `AllPackages`, so amsmath, mhchem etc.; )

- **Inline `$…$`**:
  - Must close within the same block. `$$` inside running text is left literal. `\$` inside or outside gives a literal `$`.
  - An unmatched `$` produces an `unclosedMath` warning, and the rest of the block stays literal.
  - `$a$$b$` gives two formulas.
  - **Every bare `$` in prose opens math.** `costs $5 and $10` turns `5 and ` into a formula. Escape currency as `\$`.
  - Allowed in paragraphs, list items, blockquotes and headings. **Not** in captions, cells, notes or chips.
  - Rendered as one atomic box, scaled down if taller than the line.
- **Display, single line:** the whole line is `$$…$$` (regex `^\s*\$\$([\s\S]+?)\$\$\s*$`, , 140-156`). Text after it (`$$x$$ and more`) makes it an ordinary paragraph.
- **Display, multi-line:** a `$$` line, the TeX lines, then a `$$` line. Unclosed: runs to the end of the document, with an `unclosedMathBlock` warning.
  - **No blank line is needed before it** (postext ≥ 1.5). Written under a paragraph line, a whole display (fence closed before the next blank line) interrupts the paragraph. Up to 1.4 the fences were swallowed into the paragraph.
- **Text after a display:** text written right under the closing `$$` of a display that interrupted a paragraph continues that paragraph, flush, as TeX sets the "where …". Leave a blank line after the display to start a new, indented paragraph. A display with a blank line above it interrupts nothing: the text after it is a new paragraph, indented unless `math.indentAfterDisplay: false`. `math.keepWithLeadIn: true` keeps the formula in the column of its lead-in line.
- Display math is centred and grid-snapped with `math.marginTop/Bottom`. Equation numbers: `\label{eq:x}` numbers a display formula, or each labelled row of `align`/`gather`/`alignat`/`flalign`/`eqnarray` unless the row has `\nonumber`/`\notag`, in reading order with `math.equationNumbering` (postext ≥ 1.19; before, only `\tag` numbered). `\tag{…}` (`\tag*{…}` without parentheses) prints as written and is not counted — the formula spans its measure, number flush right (postext ≥ 1.5; 1.4 dropped a tagged formula). Unlabelled formulas have no number. References: `\eqref{eq:x}` → "(3)", `\ref{x}` → "3" (any target), `:ref{id="eq:x"}` / `@eq:x` → "(3)", linked; `Eq.~\eqref{…}` ties with a no-break space; inside a formula they print the number. Theorem-like boxes: callout styles with `numbering` (configuration.md, callout styles) print "**Theorem 2** (title)**.**" and are referred to as "Theorem 2".
- Invalid TeX produces an `invalidMath` warning and a red placeholder.

```md
The identity $e^{i\pi}+1=0$ is famous.

$$
\int_0^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$
```

---

## 12. Single-line directives `:::name{attrs}`

Known directives: `pagebreak`, `numbering`, `columnbreak`, `space`, `toc`, `index`; the raw-body blocks `:::references`, `:::verse`, `:::page` and `:::strip` (comics, below). Execution: . They must be alone on their line (same fence regex as §7).

| Directive | Attributes | Effect |
|---|---|---|
| `:::pagebreak` | `parity`: `odd` \| `even` \| `always-odd` \| `always-even`. Anything else (incl. `any`) means no parity; the sandbox warns `pagebreakInvalidParity`. `center` flag (≥ 1.16; `center=false` off). | Next block on a new page. `odd`/`even` add a blank page if needed. `always-*` forces at least one separator blank, which belongs to the previous content. Pending floats go to the new page. Skipped while the first page is still empty. With `center`, the text of the page it opens is centred between the head and foot of the type area (across the page in vertical text: ページの左右中央, a dedication, a part title); end that page with another `:::pagebreak`. |
| `:::columnbreak` | none | Ends the current column; continues in the next column, or on the next page from the last column. A no-op in an empty column. The column keeps its gap (balancing skips it). |
| `:::space` | `lines`: body lines (baseline grid), default `1`; fractions allowed; > 0 and ≤ 20, else one line and the sandbox warns `spaceInvalidLines`. | Vertical space between two blocks, **added** to their margin (not collapsed into a heading's top margin); repeated lines add up. Dropped at a column/page top; one that does not fit ends the column without carrying over. A paragraph right after it loses its first-line indent when `indentAfterHeading` is off. Keep-with-next counts it. The only directive honoured inside a `:::callout`/`:::columns` (measured in the box's body lines). Before a box's first block it is dropped, **except** right under the title or in a box holding nothing else (answer box sized in lines: `:::callout{type="answer" title="Q1"}` + `:::space{lines=4}` + `:::`). Always dropped at the top of a `:::columns` group, at each of its column heads, and at the top of a split box's continuation. Works inside `:::paragraphs`. Extra blank lines in the Markdown never add space. |
| `:::numbering` | `format`: `decimal` \| `lower-roman` \| `upper-roman` \| `lower-alpha` \| `upper-alpha`. `startAt`: integer ≥ 1. Both optional; invalid values are ignored, with `numberingInvalidFormat`/`numberingInvalidStartAt` warnings. `lines`: whole number ≥ 0 (postext ≥ 1.23; line numbers, configuration.md §19f). | `format`/`startAt` switch the page-number format and/or restart the counter **at the next page boundary** (or at the current page if it has no numbered content yet). Canonical form: `:::pagebreak{parity="odd"}` followed by `:::numbering{format="decimal" startAt=1}` before chapter 1. `lines=N`: the next counted line is numbered N (the count restarts there; with `lineNumbers` off it does nothing). |
| `:::toc` | none | Expands, before layout, into one entry per listed heading (levels in `toc.levels`, default level 1) and one row per part. Page labels converge over passes. In the sandbox the book outline is supplied, so chapter files work. Exclude the contents heading itself with `{toc="false"}`. |
| `:::verse` … `:::` (line layout, postext ≥ 1.23) | `layout` (`auto` default \| `lines` \| `bayt`), `indentStep` (default `0.5em`: two spaces = 1 em), `turnover` (`hang` default \| `right`), `hang` (default the style's `hangingIndent`, else `2em`), `turnoverMark` (default `[`), `stanzaSpace` (bare number = lines of the poem's leading, default 1; or a length), `keepStanzas` (N: stanzas of ≤ N lines stay whole; haiku 3, tanka 5), `keepSpaces` (flag: runs of ≥ 2 spaces inside a line keep their width), `tighten` (≥ 1.24, default `true`; `false` turns every overlong line over), `align` (`center` on the longest line, default; `start`, default in vertical text), `style`, `dir`, `lang`. Defaults in config `bodyText.verse`. Line numbers (≥ 1.23, config `lineNumbers`): `numbered=false` (the poem takes no numbers and is not counted), `lineStart=N` (its first line is N; restarts the count in any mode), `interval=N` (the poem's own interval). | A poem with no `||` (or `layout=lines`): every non-blank line is a line of verse (inline Markdown per line), a run of blank lines one stanza break, leading spaces the indent (tab = 4, U+3000 = 2), `+ ` opens a stepped line that starts where the line above ended (`\\+` for a literal plus). Each stanza is a block: pages break between stanzas, inside one by orphan/widow rules; a line never parts from its turnover. A line a little wider than the measure tightens its word spaces down to `bodyText.minWordSpacing` and stays on one line (≥ 1.24; no tracking); a line still too wide turns over at word spaces (no hyphenation unless the style sets `hyphenation: true` itself). Do not shorten or re-break a source line that is only a few points too long. Copy, EPUB and tagged PDF read it line by line. |
| `:::verse` … `:::` (bayt layout) | `gap` (default `2em`; bare number = em), `width` (fixed hemistich width), `align` (`center` default \| `start`), `ornament` (mark printed mid-gap, not text), `style` (paragraph style id), `dir`; `numbered`, `lineStart`, `interval` as above (one number per bayt). | Classical Arabic poem (#378), chosen when any line carries `||` (or `layout=bayt`): one bayt per line, hemistichs split at `||` (or a spaced `\\`); a line without one is a single centred hemistich. Every hemistich justified to one common width (widest, ≤ half the measure less the gap), kashida first (2× `kashidaMaxLength`) then spaces; ṣadr on the start side, ʿajuz on the end side; poem centred. Too wide even at `minWordSpacing` → staggered (ṣadr flush start, ʿajuz flush end on the next line). A bayt never splits between columns; paragraph orphan/widow rules apply; the paragraph before it (the introducer, «فأنشد يقول:») keeps its last line with the poem. Vocalised verse: give it a `style` with more leading. Map Wikisource `{{أبيات}}` blocks to it. |
| `:::index` | `index`: name of a separate index (default: the main one) | Expands into the back-of-book index: every `:index` mark of the book (all chapters in the sandbox and `buildBundle`), sorted in the `locale`'s alphabetical order, grouped by first letter, with its page labels, which converge like `:::toc`. Put it under a heading style with a two-column `layout`. Styling: config `index`. |

### 12.1 Comic pages and strips: `:::page`, `:::strip` (postext ≥ 1.20)

A raw-body block read whole up to the first bare `:::` line: a `split`
expression cuts the frame into panels, `::panel{art=…}` lines start the
panels, and one script line per balloon (`speaker{style attrs}: text`,
reserved keys `caption`, `sfx`, `note`) holds the lettering, which the
engine typesets.

```md
:::page{split="30 [55 | *] / *" gutter=4mm}
::panel{art=p1-wide}
caption: Lyon, 1943.
ana: Did you hear that?
::panel{art=p1-door focus="70% 40%"}
sfx{at="62% 40%" rotate=-8}: KRAK
::panel{art=p1-ana}
ana{thought}: Nothing, he says…
:::
```

A `:::page` owns a whole page (the text after it starts a new page);
`:::page{spread}` takes two facing pages; a `:::strip` is a block in the
text flow (newspaper strips). Inside the block nothing is a paragraph,
heading or list. Grammar, every attribute, the `comics` config, the
pictures' speaker anchors and the warnings: [comics.md](comics.md).

**Directives inside a `:::callout` are ignored** (except `:::space`). An unknown `:::word` is literal text (`unknownDirective`).

```md
# Contents {style="front-matter" toc="false"}

:::toc

:::pagebreak{parity="odd"}
:::numbering{format="decimal" startAt=1}

# Chapter 1
```

---

## 13. Placeholders (config design slots, NOT Markdown)

`{…}` placeholders are **only** resolved in config design slots: headers/footers, heading/part opener designs and TOC part designs. Writing `{chapterNumber}` in the Markdown body prints it literally.

| Placeholder | Available in |
|---|---|
| `{pageNumber}` `{totalPages}` `{title}` `{subtitle}` `{author}` `{publishDate}` `{chapterTitle}` `{chapterNumber}` `{partTitle}` `{partNumber}` | header/footer and heading/part designs |
| `{chapterTitleAtTop}` `{chapterNumberAtTop}` `{firstMark.<key>}` `{lastMark.<key>}` | header/footer only |
| `{titleText}` `{number}` `{numberDecimal}` `{numberRoman}` `{numberRomanLower}` `{numberAlpha}` `{numberAlphaLower}` | heading/part designs only |
| `{attr.<key>}` | anywhere; the Markdown supplies it through heading attributes (§2.2) |

The Markdown's only role is to provide values:
- frontmatter keys: `title`, `subtitle`, `author`, `publishDate`
- heading text: `titleText`, `chapterTitle`
- heading attrs: `attr.*`
- part attrs: `partTitle`, `partNumber`

`{{` and `}}` escape braces in templates.

**Sandbox warnings tied to the document format** (the engine reports the unknown ids, directives,
styles, malformed embeds and ragged table grids itself, in `doc.contentWarnings` / `collectContentWarnings`):
- `unknownDirective`, `malformedEmbed`, `unclosedContainer`, `unclosedMath`, `invalidMath`
- `unknownParagraphStyle`, `unknownCalloutType`, `unknownChipStyle`, `unknownHeadingStyle`, `unknownTableStyle`, `chipOverlap`
- `raggedTableGrid` (a merged grid that is not rectangular), `missingImage` (an image with nothing to draw)
- `numberingInvalidFormat`, `numberingInvalidStartAt`, `pagebreakInvalidParity`
- `unknownResourceId` (embed or ref), `duplicateResourceId`, `danglingTypeRef`
- `headingHierarchy`, `consecutiveHeadings`, `listAfterHeading`
- `chapterFrontmatterIgnored`, `calloutOverflow` (also a `span="side"` box taller than an empty side column, ≥ 1.25)
- `afterText` (≥ 1.25: a side box or side figure set on a page with no text, after its chapter's text ended) and `unplaced` (≥ 1.25: a box or float on no page)
- `unclosedCodeBlock` (≥ 1.23: a code fence with no closing fence; the rest of the chapter is code) and `codeOverflow` (a listing's line wider than its box, turned over, shrunk or cut, per `codeStyle.overflow`)
- `tabInVerticalText` (≥ 1.23: a `:tab` in vertical text, set as a word space), and the config warnings `unknownConfigKey` / `unknownConfigValue` for a tab stop's unknown key, `align` or position (configuration.md §4a)
- `lineNumberOverlap` (≥ 1.23: a line number in the side column falls on a side box, side caption or float; painted anyway), and the config warning `lineNumbersUnsupported` (`lineNumbers.enabled` on a vertical document, which gets no numbers)
- `textWrap` (≥ 1.24: a resource or box with `wrap` kept its band whole: `tooNarrow` (text beside it under `layout.wrap.minTextWidth`), `fewLines` (shorter than `minLinesBeside`), `verticalText`; or `moved`: an inline one too tall for the room left moved to the next column with its anchor), and the config warning `wrapUnsupported` (a type's `defaultPlacement.wrap` in vertical text)
- `dropCap` (≥ 1.23: a paragraph a drop cap opens could not take it as configured; `reason` `shortParagraph` (with `handling` reserve/shrink/skip), `split`, `joiningScript`, `verticalText`, `noLetter`), and the config warnings `unknownConfigKey` / `unknownConfigValue` for a drop cap's unknown key, `punctuation`, `shortParagraph`, `lines`, `sink` or `characters` (configuration.md §4b)
- `fontFallback` (≥ 1.25, browser and worker builds: a face the text was set in that was not loaded, `missing`, or that the browser drew from another weight or slant, `synthesized`; load it with `prepareFonts` / `buildDocumentWithFonts`)
- `fullwidthMarkup` (`：：：`, `＃`, `［＾…］`, `｛…｝`, `＊＊` typed with a Chinese input method: set as text), `attributeKeyInvalid` (a key outside ASCII, `作者=曹雪芹`: dropped, the block's other keys still apply)

---

## 14. Discrepancies: docs (`docs/document-format-en.mdx`) vs code

1. **Containers:** older docs said `:::columns` works only inside a callout. Since postext 1.25 it also runs in the main flow (`layout.flowColumns`, pinned off for presets below configVersion 11 that hold a group).
2. **Callout `placement`:** the docs list `here|top|bottom|fixed`. The code also accepts **`auto`**, which floats to the first free band, top or bottom.
3. **"Inline markup is recognised inside any text block (headings…)":** true for headings only with `headings.inlineMarks` on, the default since `configVersion` 6. A preset without it whose headings carry marks reads `inlineMarks: false`, and its headings stay plain (only refs, swatches and math survive).
4. **Ordered list start:** the docs imply the start number is kept and the list counts from it. In fact **every item prints its own literal number**.
5. **List termination:** "two or more blank lines terminate the list". The parser does split the run, but numbering and indentation runs only close at a non-list block, so the render continues the list.
6. **Worked example is invalid:** the nested items `   a. Tighter…` / `   b. Looser…` are not list syntax. They become a paragraph that also swallows the following `3. Contrast…` line.
7. **Inline code:** (Fixed) its content is literal now: emphasis, math, links and refs inside backticks print as written. Older engines parsed them.
8. **Strikethrough:** the docs say it is not recognised. It is worse: `~~x~~` turns into a subscript with stray tildes.
9. **Intraword `_`:** (Fixed) an underscore between two letters or digits is text now (CommonMark), so URLs and `snake_case` keep theirs. Older engines italicised between two of them.
10. **Links:** resolved. A URL with balanced parentheses is read whole, an unbalanced one sets the text with no link, and the docs describe both (`document-format` › Links).
11. **Footnotes:** (Fixed in 1.6) `[^id]` markers and `[^id]:` definitions, set at the column foot (§10.4). Engines before 1.6 printed `[^1]` literally; `PostextContent.notes` / `PostextNote` in the types are not the mechanism.
12. **`:::pagebreak{parity="any"}`:** documented as the default value. It is accepted by being ignored (the same as no parity), and the sandbox may flag it.
13. **Heading attrs eat any trailing `{word …}`** (e.g. `{a, b}`). Undocumented.
14. **`::resource` glued under a paragraph** is swallowed, like an ordered-list line. The docs say a fence "does not need a blank line before it", which is true only for `:::` fences, not for `::resource`. (Fixed in 1.5 for display maths: a whole `$$` display under a paragraph line interrupts it, and the text right under its closing `$$` continues the paragraph flush, §11.)
15. **Captions, cells and notes do not support inline math.** The docs only say they share the "inline formatting and `:ref` marks".
16. **NBSP:** (Fixed in 1.5) U+00A0, U+202F and U+2007 glue their neighbours, and the docs say so (`document-format` › No-break space, `justification` › Where a Line Never Breaks). Older engines could break at them in text with inline formatting or a `:ref`.
17. The **Spanish** doc (`docs/document-format-es.mdx`) was not diffed separately. Assume it has the same gaps.

---

## 15. Porting cookbook (source-book construct → Postext)

| Source construct | Postext |
|---|---|
| Chapter title | `# Title {author="…" …}`. Chapter opening pages, running heads and numbering come from config. Front matter (preface, contents, dedication) uses `{style="<unnumbered style>" toc="false"}`. |
| Section/subsection | `##`…`######`, one line each, blank lines around. |
| Title with a manual break | `\\` in the heading. |
| Paragraph | Lines separated by blank lines. Watch §3.2 line-start traps (`- ` dialogue, `1998.` openings). |
| Dialogue dash | `—` (U+2014), never `- `. |
| Verse / poetry / song lyrics | `:::verse` (postext ≥ 1.23): one line of verse a line, a blank line between stanzas, leading spaces for indents; `{style="verse"}` for the face and margins, `turnover=right` for bracketed turnovers, `keepStanzas=N` for short forms. A classical Arabic poem (two hemistichs a line) is the same fence with `ṣadr || ʿajuz` per line. |
| Line numbers in the margin (critical editions, poetry, statutes, line-referenced texts) | config `lineNumbers` (postext ≥ 1.23, configuration.md §19f): `count:'verse'` for poems, `'all'` for prose; `:::verse{lineStart=37}` for a poem resumed mid-way, `numbered=false` to leave one out, `:::numbering{lines=1}` to restart; a paragraph style with `lineNumbers: true` counts prose under `'verse'` and boxed text. Delete the source's typed numbers from the text; never rebuild them with side boxes. |
| Menu, price list, wine list (dish … price) | Paragraphs in a style with an `end` stop (`tabStops: [{position: 'end', align: 'end', leader: '. '}]`, or no leader): `Soup :tab 8.50` (§10.9, configuration.md §4a). A dish and its translation on two lines of one paragraph: end the first with a backslash. A `decimal` stop lines prices up on their point. Not a two-column table. |
| Cast list, dramatis personae (role … actor) | A paragraph style with an `end` stop and a dot leader: `Ophelia :tab Marta Gil`. |
| Marks or points flush right (exam papers, worksheets) | A body or list stop `{position: 'end', align: 'end'}` and `… question? :tab :chip[2 marks]{style="marks"}`, or `:tab{at=end align=end}` in the line itself. |
| Form with blanks to fill (Name ______) | A style with an `end` stop and `leader: 'rule'` (`Name :tab`); a label column first with a `start` stop at a length (`Name :tab :tab`). Answer lines of a set height are still `:::space` in a box. |
| Run-in index or list of entries with page numbers at the margin (a list of figures, a price catalogue) | A style with an `end` stop and a `.` leader: `Coleridge, S. T. :tab 12, 48`. The generated contents and index have their own leaders (`toc.leader`, `:::index`). |
| Columns of figures inside running text (a small account, two aligned values) | A style with two or more stops (`start` at lengths, `decimal` for amounts). A real grid with a header row, rules or merged cells stays a table resource. |
| Address / signature | One paragraph whose lines end in a backslash (postext ≥ 1.23, §3.3), inside `:::paragraphs{style="…"}` for its style; up to 1.22 one paragraph per line with blank lines between. |
| Arabic text in a Latin book, Latin in an Arabic one | Block: `:::paragraphs{dir=ltr}` / `{dir=rtl}`; phrase: `:ltr[…]{lang=en}` / `:rtl[…]{lang=ar}` (§10.8). |
| Epigraph, dedication, colophon, lead-in | `:::paragraphs{style="…"}`, with the style defined in config. |
| Drop cap or raised initial opening a chapter or a section | Keep the paragraph in the text; the heading level's (or heading style's) `dropCap` (configuration.md §4b): `{ lines: 3 }`, a raised initial `{ lines: 1, fontSize: … }` or `{ lines: 3, sink: 1 }`, small capitals after it with `leadIn: { words: 3 }`. A chapter without one: `# Title {dropcap=false}`. Never `{lead="…"}` + a design text `dropCap`. |
| Catalogue, dictionary or glossary entries each opening with an initial | `:::paragraphs{style="entry"}` with `dropCap: { lines: 2, each: true }` in the style. |
| Block quotation | `> …` (single block), or `:::paragraphs{style="quote"}` for multiple paragraphs. |
| Bulleted/numbered list | One line per item. 2 spaces per nesting level. Type the real numbers. Letter or roman item labels are set by the config `numberFormat`, not the source. |
| List item with several paragraphs | Not possible. Merge into one line, or follow the item with a plain paragraph. |
| Sidebar / box / "Key points" / exercise | `:::callout{type="…" title="…" label="…"}`. Two columns inside use `:::columns`. Answer boxes use a nested callout. |
| Column bands in the running text (briefs in three columns, a poster's columns across a two-column page, a bilingual poem side by side) | `:::columns{count=3 span="page" rule}` … `:::` in the text (≥ 1.25); `breaks` + the default `flow="parallel"` for side-by-side streams that must stay level across pages. No frameless box needed. |
| Figure / photo / diagram | A resource plus `:ref{id="…"}` in the sentence that first cites it (auto float). For an unnumbered ornament or a fixed spot: `placement.position:"here"` plus `::resource{id="…"}` on its own line. |
| Table | A table resource (`TableModel` JSON). Cite it with `:ref`. Math inside cells is impossible; use `^ ^`/`~ ~`/Unicode. Text the source aligned with tab stops (a menu, a cast list, marks at the margin, a form) is not a table: paragraphs with tab stops (rows above). |
| Cross-reference "see Fig. 3.2" | `see :ref{id="fig-x"}`. For "Figure 3.2" use `style="full"`; for "figure 3.2" add `case="lower"`; for a bare number use `style="number"`. |
| Cross-reference to a section or page | **Unsupported.** Write the text literally. |
| Footnote | Convert each to a `[^n]` marker after the cited word or punctuation plus a `[^n]: text` definition paragraph in the same chapter (under the paragraph, or all at the chapter's end). Numbers come from the order of citation, not the source. A note cited in a heading, caption or table cell: move the marker into the text, or set the note in the caption/cell itself. Endnotes: `footnotes.placement: 'chapterEnd'` (§10.4). |
| Superscript / subscript / chemistry | `x^2^`, `H~2~O`, or `$\ce{H2O}$` (mhchem is available). |
| Formula | `$…$` inline, `$$ … $$` display on its own lines with blank lines around; glue it under its lead-in line when the text after it continues the sentence ("where …", §11). Escape currency `$` as `\$`. |
| Code listing | A ```` ``` ```` or `~~~` fence with the language and title on its info string (`` ```bash backup.sh ``), lines copied as written, nothing escaped (postext ≥ 1.23, §3.4). Its look comes from `codeStyle` (configuration.md §12b); a terminal session is `console`. Up to 1.22: one paragraph per line in `:::paragraphs{style="code"}`, word joiners and no-break spaces, everything escaped. |
| Horizontal rule / ornament / asterism | No `---`. Use a centred `:::paragraphs{style="asterism"}` with `⁂` or `* * *` (escape as `\* \* \*`), or an ornament resource with `::resource`. |
| Forced page / column break | `:::pagebreak{parity="odd"}` / `:::columnbreak`. |
| Extra vertical space (scene break, room above a signature) | `:::space` or `:::space{lines=2}` on its own line. Extra blank lines do nothing. |
| Front-matter roman page numbers | `:::numbering{format="lower-roman" startAt=1}` at the start, then `:::pagebreak{parity="odd"}` + `:::numbering{format="decimal" startAt=1}` before chapter 1. |
| Table of contents | `# Contents {style="…" toc="false"}` then `:::toc`. |
| Back-of-book index | Mark each indexed passage: `:index[word]` (prints the word, indexes it) or `:index{term="Main!sub"}` right after the word it refers to (prints nothing); `main` bolds the principal page, `range="start"`/`range="end"` span pages, `see="…"`/`seealso="…"` cross-refer, `index="names"` files a separate index. Then `# Index {style="…"}` and `:::index` (`:::index{index="names"}`). Never retype the source's page numbers. Word XE fields and LaTeX `\index` convert automatically; IDML page references too; a printed index is rebuilt with `index_marks.py` (playbooks A10). |
| Part divider | `:::part{number="I" title="…" palette="band=#hex"}` … `:::` at the top of the part's first chapter file. |
| Keyboard keys, tags, word bank | `:chip[…]{style="…"}`. |
| Colour legend | `:swatch{color="…"}`. |
| Links | `[text](url)`: the text is set as usual and the URL is a live link in the HTML and PDF output. Print cannot follow it, so for a printed book also put important URLs in the text itself; they get URL-aware line breaking. |
| Small caps | `:smallcaps[…]` inline; `smallCaps: true` on a paragraph style or a callout body for whole paragraphs. |
| Underline, strikethrough, colour spans, language spans | **Unsupported inline.** Use a chip style or a paragraph style, or accept plain text. |
| HTML entities | Use the literal Unicode characters. |
| Chinese emphasis dots (着重号) | `:dots[…]`, or `*…*` in a Chinese document (dots by default). |
| Proper-name line (专名号) | `:name[…]`. |
| Book-title mark (书名号) | Keep typed 《》 as text. A classical/Taiwan edition with wavy lines: `:book[…]` (prints what `cjk.bookTitleMark` says). |
| Sense or item numbers ① ② in a dictionary or a list run into the text (≥ 1.25) | Type them as they are (`**①**天也`): a circled number stays with the text after it and takes no Han–Latin space (`cjk.circledNumbers`). No word joiner after it, no excerpt cut to move a break off a title (`cjk.titleMinChars` keeps 《說文》 whole). |
| Ruby: pinyin or zhuyin over/beside characters | `{字|zì}` / `:ruby[漢字]{rt="hàn zì"}`; HTML `<ruby>紅<rt>hóng</rt></ruby>` → `{紅|hóng}`. |
| Inline two-line commentary (双行夹注, 割注) | `:warichu[…]`; a one-line note in brackets stays as text in （）. |
| Numbers upright in vertical text (纵中横) | Nothing for ≤ 2 digits (automatic, `cjk.uprightDigits`); `:tcy[…]` for 3–4 characters or `A+`; `:upright[…]` for an acronym read letter by letter. A short number inside a Latin sentence runs sideways with it by itself; one that opens or ends a Latin paragraph (`49 copies…`, `…page 7.`) stands: `:sideways[…]` turns it. |
| 回目 couplet / two-line chapter title | `# 甄士隱夢幻識通靈 \\ 賈雨村風塵懷閨秀`; the number from `numberingTemplate: '第{1:一}回'`, never typed. |
| Paragraph indent of two ideographic spaces | Delete them; `bodyText.firstLineIndent: 2em`. |
| Lesson or chapter number before a title that opens with ruby or a mark (`第十二課　{寓言\|ㄩˋ\|ㄧㄢˊ}…`) | `numberingTemplate` (`'第{1:一}課'`, `numberSeparator: '　'`), never typed: from 1.25 the number stays a span of its own, outside a ruby base, emphasis dots, a name or title line, a warichu, a tcy cell or a language tag (on ≤ 1.24 the reading centred over the number and the first character). |
| Heads two cells in, turnover at the margin (GB/T 9704 公文) | `headings.levels[n].firstLineIndent: {value: 2, unit: 'em'}` (≥ 1.24); delete U+3000 typed in front of a head or in its `numberingTemplate`. |
| A grid page whose columns end where their lines end (GB/T 9704 公文, 原稿用紙, 版心 counted in lines) | `cjk.grid` alone: from 1.25 balancing is off on a grid unless `headings.balancing.enabled: true`, and when on it keeps characters in their cells (`gridLines: 'off'` adds no rows). On ≤ 1.24 set `headings.balancing.enabled: false`. |
| Japanese furigana (≥ 1.16) | One reading over the word `{麦藁帽\|むぎわらぼう}` (group; Aozora 《》, InDesign group ruby); one per character `{東京\|とう\|きょう}` (jukugo, may break between characters); `:ruby[東京]{rt="とう\|きょう" mode=mono}` keeps per-character mono ruby. Aozora `X《よみ》`, `｜X《よみ》` never stay in the text (`aozora.py`). |
| 傍点 / 傍線 | `*…*` or `:dots[…]` (sesame in Japanese) / `:sideline[…]{style=…}`. |
| 地付き, 地からN字上げ (a letter's date, a signature) | `:::paragraphs{align=end}` / `:::paragraphs{align=end endIndent=N}`. |
| 字下げ block (N字下げ, 折り返してM字下げ) | A paragraph style with `indent` (and `hangingIndent`), or `:::paragraphs{indent=N}`. |
| 改ページ / 改丁 / 改見開き / ページの左右中央 | `:::pagebreak` / `{parity="odd"}` / `{parity="even"}` / `{center}`. |
| 中見出し 3行取り, ５字下げ | Level config `lineSpan: 3`, `indent: {value: 5, unit: 'em'}`; one heading lowered otherwise: `## 一 {indent=3}`. |
| 返り点・送り仮名 (kanbun) | `:kunten[字]{kaeri="レ" okuri="ヲ"}`. |
| くの字点 ／＼ | 〳〵 (〴〵 voiced), vertical text only. |
| A letter quoted over several paragraphs (each opens with 「, one 」 at the end) | Keep it so; never add or remove brackets. |

---

## 16. Pre-flight checklist for a generated chapter

1. Blank line before and after every heading, list, quote, `::resource`, and `:::` fence. A `$$` block gets them too, unless it sits inside a sentence: glued under a paragraph line it interrupts it, and text right under its closing `$$` continues that paragraph flush (§11).
2. No paragraph line starts with `- `, `* `, `+ `, `> `, `# `, or `<digits>. ` / `<digits>) ` unless that construct is intended.
3. Every list item is on one line. Nesting uses 2 spaces per level. Ordered items carry their real numbers.
4. Escape stray `*`, `_` (including inside words and URLs), `^`, `~` and `$` with a backslash.
5. Attribute values contain no `}`. Quotes don't clash. `::resource` uses exactly `{id="…"}`.
6. Every `type=`, `style=` and `:chip{style}` id exists in the config. Every `:ref` / `::resource` id exists in `resources`.
7. Every opened `:::callout|paragraphs|part|columns` has its closing `:::`. A `:::columns` outside a callout needs postext ≥ 1.25 (`layout.flowColumns`; below `configVersion` 11 it is ignored).
8. No headings end in brace text unless it is meant as attributes. No `:chip` in headings.
9. Frontmatter appears only in the book's first chapter.
10. No GFM tables, code fences, HTML, or `---` rules remain. Every `[^id]` marker has one `[^id]:` definition in its chapter, and none sits in a heading, caption or cell.
11. Index marks sit in running text (not captions or cells), never right after a colon; ranges are paired; every `see`/`seealso` target is an entry; each index that has marks has its `:::index`.
12. Chinese text: no U+3000 opening a paragraph, no full-width markup (`：：：`, `＃`), 《》 kept as typed, readings as `:ruby`/`{字|zì}`, and `config.locale` names the script (`zh-Hans`/`zh-Hant`).
13. Japanese text: `config.locale: 'ja'`; no Aozora notation left (`《》` readings, `｜`, `［＃…］`, ／＼); every kanji index entry has a `yomi`; full-width Latin and digits as the source types them (never NFKC); unbalanced 「 kept.
