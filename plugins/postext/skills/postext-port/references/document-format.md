# Postext document (Markdown) format

What a chapter file may contain, exactly as the Postext parser reads it
(postext 1.2). Postext Markdown looks like Markdown but is **not CommonMark**:
many habits from GitHub/pandoc Markdown print literally or change meaning.
Where the online docs disagree, this file is right (§14).

---

## 0. Mental model (read this first)

- Postext does **not** use remark or micromark and is **not** CommonMark. It is a hand-written, line-based tokenizer plus regular-expression inline passes.
- The parser emits a **flat** list of `ContentBlock`s. There are 9 block types: `heading`, `paragraph`, `blockquote`, `listItem`, `mathDisplay`, `resourceBlock`, `directive`, `containerStart`, `containerEnd`. Containers are start/end marker pairs, not trees.
- Constructs the parser does not recognise are **never dropped silently**. They become literal paragraph text, except that inline images are removed and link URLs are discarded.
- Figures, images, SVGs and tables are **not written in Markdown**. They are `Resource` objects (JSON) kept outside the text and cited by id (§9).
- Visual styling lives in the config and is selected by id: callout `type`, paragraph-container `style`, heading `style`, chip `style`, palette ids. An unknown id falls back to a default and triggers a sandbox warning (§13).
- Blank lines separate blocks. **Consecutive non-blank lines join into one paragraph with a single space.** No hard line break syntax exists (§3.3).

Block-level dispatch order for each non-blank line:
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

A heading's inline content goes through `stripInlineFormatting`:
- `**bold**`, `*italic*`, `__…__`, `_…_`, `` `code` ``, `^sup^` and `~sub~` are **reduced to plain text**. The markers are removed and no emphasis is kept. The heading's look comes only from the level/style config.
- Links become their text. Images are removed.
- Escapes `\* \_ \^ \~ \`` produce the literal character.
- **Kept as live spans:** `:ref{…}`, `:swatch{…}` (`:326`) and inline `$math$` (`:327`).
- **`:chip[…]` is NOT processed in headings.** It stays literal text.

### 2.2 Heading attributes: trailing `{…}`

**Regex:** `\s+\{([^{}]*)\}\s*$`. The block must be the **last thing on the line** and preceded by whitespace. It contains no nested braces, so a value cannot contain `{` or `}`.

The blob is parsed with the shared attribute grammar (§8). If it yields **at least one key**, the whole `{…}` is removed from the title and stored in `block.attrs`. Otherwise it stays in the text.
- `# Title {}` keeps `{}` in the title.
- `# Chapter {1}` keeps `{1}`, because a key must start with a letter or `_`.
- **Gotcha:** `# The set {a, b}` becomes the title `The set` with attrs `{a:"", b:""}`. The braces are eaten. To keep literal trailing braces in a title, end the line with something after them, or put the braces inside `$…$` math.
- **Gotcha:** `# Title {note="a}b"}` does not parse (a `}` inside the value). The whole blob stays in the text.

**Attributes with engine meaning:**

| attr | values | effect | source |
|---|---|---|---|
| `style` | id of a `headingStyles[]` entry | Merges the style's level overrides and opens a *styled section* (running heads, geometry, body typography, palette) up to the next heading of the same or higher level, or the next part. The style's `numbered: false` makes the heading unnumbered (no counter advance, no number, `{chapterNumber}` empty). An unknown id is ignored. | , 54-72`;  |
| `toc` | `false`/`no`/`0` or `true`/`yes`/`1` | Overrides whether `:::toc` lists this heading. Default: the style's `toc`, else `true`. |  |

- There is **no** `numbered` heading attribute. `{numbered=false}` is only stored as a free attr; use a heading style with `numbered: false` instead.
- There is **no** `id` or anchor attribute. Headings have no ids and cannot be cross-referenced; `:ref` targets resources only.

**Free attributes** (any key: `author`, `lead`, `kicker`, `standfirst`, `source`, `date`, …) are stored as strings and surface in design slots as `{attr.<key>}`:
- In the heading's own advanced-design slot, the heading's attrs are used.
- In headers and footers, the attrs of the current chapter's H1 are used.
- A missing key resolves to `''`.
- Sources: ; .

`toc.subtitle.attr` (config) chooses the attr printed as the TOC subtitle line, e.g. `author`.

Real presets use: `{style="…" toc="false" series="…" publisher="…"}`, `{lead="…" catlabel="…" cat="…" tombstone="…"}`, `{style="…" kicker="…" standfirst="…"}`, `{author="…"}`.

### 2.3 Forced line break in titles: `\\`

`\\` inside a heading (optionally surrounded by spaces/tabs) becomes U+2028.
- Opener designs (`{titleText}`) break the line there.
- The in-column heading, running heads, `{chapterTitle}`, the outline, the TOC and the PDF outline show a space.
- The same `\\` works inside `:::part{title="…"}`.
- In body paragraphs `\\` is a literal backslash.

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
- any `:::…` fence line: known or unknown directive/container, or a bare `:::`.

**The paragraph does NOT stop at the following. They are swallowed into the paragraph as literal text:**
- ordered list lines. `Intro\n1. first\n2. second` gives one paragraph `Intro 1. first 2. second`. **Always put a blank line before an ordered list.**
- `::resource{id="…"}`. **Always put blank lines around `::resource`.**
- the `$$` display-math fences. **Always put blank lines around display math.**

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

- **No hard line break.** Trailing two spaces are trimmed away, and a trailing `\` stays as a literal backslash. Each verse line or address line must be **its own paragraph** (blank line between), usually inside a `:::paragraphs{style="verse"}` container (§6.2). This is how the Don Quijote preset sets verse.
- Leading and trailing whitespace of every line is trimmed. Internal runs of spaces survive in the text but are measured as spaces.
- **Non-breaking spaces:** the measurer splits on `/\S+|\s+/`. JS `\s` matches U+00A0 and U+202F, so a typed NBSP is treated as an ordinary **breakable, stretchable** space. No engine code special-cases U+00A0 (verified by searching the source). Plain text has no reliable "glue" character. A `:chip` and a `:ref` label are the only atomic inline units.
- **Soft hyphen U+00AD** is honoured as a discretionary break, with a hyphen added at the break (; `knuthPlass/`).
- A **hard hyphen between two letters** (`enseñanza-aprendizaje`) is a break opportunity; the line ends on the existing hyphen.
- Automatic hyphenation follows the config locale.
- URL-like tokens (`http(s)://`, `ftp://`, `www.`, DOIs `10.xxxx/`) get URL break points and no hyphen.
- **HTML is not interpreted.** `<b>x</b>` and `&amp;` / `&nbsp;` appear literally. Write the Unicode characters themselves (`&`, U+00A0, `…`).
- Tabs count as one character of indentation (so they don't nest lists).

---

## 4. Inline formatting (paragraphs, list items, blockquotes)

Pipeline order per block:
1. `extractInlineChips`
2. `extractInlineRefs`
3. `extractInlineSwatches`
4. `extractInlineMath`
5. `parseInlineFormatting` (links, images and code stripped, then bold, italic and scripts)

Earlier passes shield their content from later ones. Math is extracted before emphasis, so `*` inside `$…$` is safe.

| Markup | Syntax | Result / notes | Source |
|---|---|---|---|
| Bold | `**x**` or `__x__` | bold span |  |
| Italic | `*x*` or `_x_` | italic span | `:323-344` |
| Bold italic | `***x***` or `___x___` | both | `:355` |
| Italic inside bold | `**a *b* c**` | works | |
| Bold inside italic | `*a **b** c*` | **does not work.** The outer `*` stay literal; only `b` is bold | |
| Superscript | `^x^` | smaller and raised. Content must start and end with a non-space; no newline; no inner `^` | `:289-308` |
| Subscript | `~x~` | smaller and lowered. Same rules | `:289-308` |
| Inline code | `` `x` `` | **backticks removed, rendered as plain body text.** The content is still parsed for emphasis, math and refs: `` `a*b*c` `` gives italic "b", and `` `echo $HOME` `` can open math. Escape inside it too. | `:313-318` |
| Link | `[text](url)` | text kept, URL discarded. Regex `\[([^\]]+)\]\([^)]+\)`: a URL containing `)` breaks it. `[Wiki](…/A_(b))` gives `Wiki) end` | `:316` |
| Image | `![alt](src)` | **removed** from the text | `:315` |
| Escapes | `\*` `\_` `\^` `\~` `` \` `` | the literal character (body, captions, cells, notes) | `:261-273` |
| Dollar | `\$` | literal `$`; otherwise `$` opens inline math |  |

**Emphasis gotchas:**
- **Intraword underscores italicise:** `snake_case_name` gives `snake` + *case* + `name`, and `http://a.com/x_y_z` italicises `y`. Write `\_` in identifiers, URLs and file names.
- Lone asterisks pair up across a paragraph: `x * y * z` gives an italic ` y `. Write `\*` or use `×` / `·`.
- `~` pairs: `~~strike~~` has **no strikethrough**. It gives a subscript `~strike` plus literal tildes. A span is `~X~` / `^X^` where X starts and ends with a non-space and has no inner marker or newline. `from ~5 to ~10` stays literal only because the text before the second `~` ends in a space. `about ~5km~ish` would subscript. When in doubt, write `\~` (or `\^`).
- Patterns are non-greedy and can span what were separate source lines (lines are joined first).
- Emphasis does not cross block boundaries.

**Not supported:** strikethrough, underline, small caps markup, inline HTML, reference links `[a][b]`, autolinks `<http://…>`, footnote markers `[^1]`, emoji shortcodes, inline language spans. The PDF tagging `Lang` comes only from config. No per-span `lang` exists in the Markdown.

---

## 5. Lists (, 361-447`; numbering )

| Kind | Regex (on the raw line) | Notes |
|---|---|---|
| Task | `^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$` | `checked = mark !== ' '`. Only `[ ]`, `[x]`, `[X]`. |
| Ordered | `^(\s*)(\d+)([.)])\s+(.*)$` | Digits only. **No `a.`, `i.` or `A)` markers.** They are paragraph text. |
| Unordered | `^(\s*)([-*+])\s+(.*)$` | |

- **Depth** = `min(5, floor(leadingWhitespaceChars / 2) + 1)`. Use **2 spaces per level**. A tab counts as 1 char, so it is depth 1. Four spaces give depth 3, so `    - deep` is depth 3.
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
- Use it for simple quotes. For epigraphs, attributions or multi-paragraph quotes, prefer `:::paragraphs{style="…"}` (§7.2) with a configured paragraph style.

---

## 7. Fenced containers `:::name{attrs}` … `:::`

**Opening fence regex:** `^:::\s*([a-z][a-z0-9-]*)\s*(?:\{([^}]*)\})?\s*$` on the trimmed line.
- The name is **lowercase** (`:::Callout` is literal text).
- Space is allowed after `:::` (`::: callout`).
- The attribute blob cannot contain `}`.
- Nothing may follow on the line. `:::pagebreak now` is literal.

**Close:** a bare `:::` line closes the **innermost** open container (`:21, 216-236`). A stray `:::` with nothing open is a literal paragraph.

**Known containers:** `callout`, `paragraphs`, `part`, `columns`.

**Unknown names** such as `:::verse`, `:::note`, `:::figure` or `:::aside` are **not** containers. The fence line becomes paragraph text, the content parses normally, and the closing `:::` becomes a literal paragraph too. The sandbox raises `unknownDirective`.

- Fences end a running paragraph, list or quote without a blank line, but blank lines around fences are still recommended.
- An unclosed container is auto-closed at the end of the document, with an `unclosedContainer` issue.
- Containers can hold any blocks: headings, lists, quotes, math, `::resource`, other containers.
- **Single-line directives inside a callout are ignored**.

### 7.1 `:::callout` (boxed content)

Plan: , 299-318`. Placement: .

| attr | values | default | notes |
|---|---|---|---|
| `type` | id of a `calloutStyles[]` entry | the **first** configured style | An unknown or missing type falls back to the first style, with an `unknownCalloutType` warning. The built-in default has one style, `note`. |
| `title` | text | the style's `title` (default `''`) | **Plain text only.** `**…**` is not parsed and shows literally. Cannot contain `}` or the quote character used. The style may uppercase it. Dropped on continuation fragments. |
| `label` | text | `''` | Printed in the label tab, **only if the style configures `label`**. E.g. `label="BOX 1-1"`. |
| `span` | `column` \| `page` \| `side` | the style's `span` (default `column`) | `page`: full-width band cutting the columns. `side`: into the float-only side column of a one-and-a-half layout (`layout.sideColumnRole:'floats'`), otherwise acts as `column`. Invalid values are ignored. |
| `placement` | `here` \| `auto` \| `top` \| `bottom` \| `fixed` | the style's `placement` (default `here`) | `here`: inline in the flow. `auto`/`top`/`bottom`: floated to the first free band after its position while the text continues. `fixed`: pinned to page coordinates by the style's `fixed.anchor/offset`. Invalid values are ignored. |

- Style-level only (not attributes): `icon`, `marker`, `stripe`, `border`, `background`, `width: fill|auto`, `keepTogether` (default `true`), `splitMinLines` (default 2), `floatBarrier`, `snapToGrid`, `columnGap`, and the body/list typography. **There is no per-instance `icon` or `keepTogether` attribute.** To vary them, define another style and select it with `type`.
- **Nesting:** a `:::callout` inside a callout is its own box with its own style, at the parent's inner width. Its `span`/`placement` are ignored. Each `:::` closes the innermost box.
- **Splitting:** a box keeps together unless the style has `keepTogether:false`, or it is taller than a column. A split happens between children, or between lines with at least `splitMinLines` lines per side. Continuations drop the title and icon.
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
| `style` | id of a `paragraphStyles[]` entry | **Required.** Missing or unknown: the paragraphs render as body text, with an `unknownParagraphStyle` warning. |

- The style applies **only to `paragraph` blocks** inside the container. Lists, quotes and headings inside keep their normal styles.
- The container's `marginTop` is applied on entry and `marginBottom` after the last paragraph. Negative margins pull the flow up.
- Works inside callouts too.
- This is **the** way to do verse, epigraphs, colophons, dedications, small print, lead-ins, signatures, code-like text (with a mono style) and centred lines. **Each line of a poem is its own paragraph (blank line between)**:

```md
:::paragraphs{style="verso"}
Nunca fuera caballero

de damas tan bien servido

como fuera don Quijote
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

### 7.4 `:::columns{count=N breaks="…"}` (multi-column group, callouts only)

Source: ; .
- **Only inside a `:::callout`.** Elsewhere the fences are ignored and the blocks flow normally.
- `count`: integer, default 2.
- `breaks`: a comma list of **1-based block indices** within the group where columns 2, 3, … start. Values must be > 1. Without `breaks`, the columns are balanced, and a cut may fall inside a paragraph or list item. With `breaks`, there is no mid-paragraph cut.
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

---

## 8. Attribute grammar (shared by fences, directives, heading attrs, `:ref`, `:swatch`, `:chip{…}`)

. Token regex: `([A-Za-z_][A-Za-z0-9_-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?`
- Forms: `key="v"`, `key='v'`, `key=bare`, and a bare `key` (becomes `""`).
- Any order. A repeated key keeps the last value. Values are always strings.
- **No escapes.** A value cannot contain its own quote. Use the other quote style: `title='He said "hi"'` works.
- For fences, directives and `:ref`/`:swatch`, the blob ends at the first `}`, so **values can never contain `}`**. `:ref{id="a" text="x}y"}` breaks.
- Unknown keys are kept but ignored.

---

## 9. Resources: figures, images, SVGs, tables

Resources are JSON records in `PostextContent.resources` (in a preset: `preset.json → resources[]` plus the files). They are not Markdown. Main fields:
- `id`, `typeId` (e.g. `figure`, `table`), `kind: bitmap|svg|table`, `caption`, `note`, `altText`, `placement`
- the payload (`bitmap{fileId,…}`, `svg{fileId, pdfFileId?}`, `table{model, styleId?}`)

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
- Floats of one type never overtake each other.
- Floats are flushed at chapter openers (`breakBefore`), `:::part`, `floatBarrier` callouts, and the end of the document. `:::pagebreak` sends pending floats to the next page.

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

`placement: { position: auto|top|bottom|here, span: column|page|side, rotate?: ccw|cw, width?: 0..1, align?: left|center|right, captionSide?: bool }`.
- A resource's own placement falls back to its type's `defaultPlacement`, then to `auto`/`column`.

### 9.5 Tables

**GFM pipe tables are NOT parsed.** They become one literal paragraph.

Tables are `kind:"table"` resources with a `TableModel`:
- `rows: TableCell[][]`, `headerRowCount`, `columnWidths` (relative weights).
- Per cell: `content` (inline snippet), `colSpan`, `rowSpan`, `isHeader`, `align`, `verticalAlign`, `background` (ColorValue), `image {resourceId, width}`, `hiddenBy` (a cell covered by a merge).
- `table.styleId` names a `tableStyles` entry.

**Snippet syntax** (cell content, caption, note), from :
- Recognised: `**bold**`, `*italic*`, `^sup^`, `~sub~`, escapes, `:ref{…}`, `:swatch{…}` and `:chip[…]`.
- **Inline `$math$` is NOT supported in snippets.** The `$` stays literal.
- In **cells**, `\n` separates paragraphs. A paragraph starting with a marker is a hanging list item: `•·◦○▪‣-*–—` or `1.`/`1)` (up to 3 digits) followed by whitespace. Two leading spaces per nesting level.

---

## 10. Other inline directives

### 10.1 `:chip[text]{style="…"}` (boxed, unbreakable run)

**Regex:** `:chip\[((?:\\.|[^\]\\\n])+)\](?:\{([^}\n]*)\})?`.
- The text is non-empty and on one line in the source. Paragraph lines are pre-joined, so a chip may straddle source lines inside a paragraph. Whitespace collapses to a single space. `\]` gives a literal `]`.
- `{…}` must follow `]` immediately. **Only `style` is read.** Missing or unknown: the first `chipStyles` entry (built-in id `chip`), with an `unknownChipStyle` warning.
- The chip text takes its own emphasis and scripts (`:chip[**bold** x^2^]`). Refs, swatches and math inside a chip stay literal. Surrounding emphasis applies (`**:chip[a]**`).
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

---

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
  - **Needs a blank line before it** when it follows a paragraph line. Otherwise the fences are swallowed into the paragraph.
- Display math is centred and grid-snapped with `math.marginTop/Bottom`. There is no equation numbering syntax; use `\tag{…}` in TeX if needed.
- Invalid TeX produces an `invalidMath` warning and a red placeholder.

```md
The identity $e^{i\pi}+1=0$ is famous.

$$
\int_0^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$
```

---

## 12. Single-line directives `:::name{attrs}`

Known directives: `pagebreak`, `numbering`, `columnbreak`, `toc`. Execution: . They must be alone on their line (same fence regex as §7).

| Directive | Attributes | Effect |
|---|---|---|
| `:::pagebreak` | `parity`: `odd` \| `even` \| `always-odd` \| `always-even`. Anything else (incl. `any`) means no parity; the sandbox warns `pagebreakInvalidParity`. | Next block on a new page. `odd`/`even` add a blank page if needed. `always-*` forces at least one separator blank, which belongs to the previous content. Pending floats go to the new page. Skipped while the first page is still empty. |
| `:::columnbreak` | none | Ends the current column; continues in the next column, or on the next page from the last column. A no-op in an empty column. The column keeps its gap (balancing skips it). |
| `:::numbering` | `format`: `decimal` \| `lower-roman` \| `upper-roman` \| `lower-alpha` \| `upper-alpha`. `startAt`: integer ≥ 1. Both optional; invalid values are ignored, with `numberingInvalidFormat`/`numberingInvalidStartAt` warnings. | Switches the page-number format and/or restarts the counter **at the next page boundary** (or at the current page if it has no numbered content yet). Canonical form: `:::pagebreak{parity="odd"}` followed by `:::numbering{format="decimal" startAt=1}` before chapter 1. |
| `:::toc` | none | Expands, before layout, into one entry per listed heading (levels in `toc.levels`, default level 1) and one row per part. Page labels converge over passes. In the sandbox the book outline is supplied, so chapter files work. Exclude the contents heading itself with `{toc="false"}`. |

**Directives inside a `:::callout` are ignored.** An unknown `:::word` is literal text (`unknownDirective`).

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
| `{titleText}` `{number}` `{numberDecimal}` `{numberRoman}` `{numberRomanLower}` `{numberAlpha}` `{numberAlphaLower}` | heading/part designs only |
| `{attr.<key>}` | anywhere; the Markdown supplies it through heading attributes (§2.2) |

The Markdown's only role is to provide values:
- frontmatter keys: `title`, `subtitle`, `author`, `publishDate`
- heading text: `titleText`, `chapterTitle`
- heading attrs: `attr.*`
- part attrs: `partTitle`, `partNumber`

`{{` and `}}` escape braces in templates.

**Sandbox warnings tied to the document format**:
- `unknownDirective`, `unclosedContainer`, `unclosedMath`, `invalidMath`
- `unknownParagraphStyle`, `unknownCalloutType`, `unknownChipStyle`, `chipOverlap`
- `numberingInvalidFormat`, `numberingInvalidStartAt`, `pagebreakInvalidParity`
- `unknownResourceId` (embed or ref), `duplicateResourceId`, `danglingTypeRef`
- `headingHierarchy`, `consecutiveHeadings`, `listAfterHeading`
- `chapterFrontmatterIgnored`, `calloutOverflow`

---

## 14. Discrepancies: docs (`docs/document-format-en.mdx`) vs code

1. **Containers:** the docs table says "Three container names" (callout, paragraphs, part). The code has **four**, including `columns`. The docs do describe `:::columns` in a later section.
2. **Callout `placement`:** the docs list `here|top|bottom|fixed`. The code also accepts **`auto`**, which floats to the first free band, top or bottom.
3. **"Inline markup is recognised inside any text block (headings…)":** wrong for headings. Bold, italic, sup/sub, code and links are stripped to plain text there. Only refs, swatches and math survive.
4. **Ordered list start:** the docs imply the start number is kept and the list counts from it. In fact **every item prints its own literal number**.
5. **List termination:** "two or more blank lines terminate the list". The parser does split the run, but numbering and indentation runs only close at a non-list block, so the render continues the list.
6. **Worked example is invalid:** the nested items `   a. Tighter…` / `   b. Looser…` are not list syntax. They become a paragraph that also swallows the following `3. Contrast…` line.
7. **Inline code:** the docs say it is "rendered as plain text". True, but its content is still parsed for emphasis, math and refs. Backticks do not protect.
8. **Strikethrough:** the docs say it is not recognised. It is worse: `~~x~~` turns into a subscript with stray tildes.
9. **Intraword `_`** italicises. The docs do not mention it.
10. **Links:** a URL containing `)` breaks the pattern and leaks text. Not documented.
11. **Footnotes:** the docs say footnotes "ride on `PostextContent.notes` and are referenced by id". `PostextNote` exists in , but **nothing in the engine consumes `notes`**. Footnotes are unimplemented, and there is no reference syntax.
12. **`:::pagebreak{parity="any"}`:** documented as the default value. It is accepted by being ignored (the same as no parity), and the sandbox may flag it.
13. **Heading attrs eat any trailing `{word …}`** (e.g. `{a, b}`). Undocumented.
14. **Display math and `::resource` glued under a paragraph** are swallowed. The docs say a fence "does not need a blank line before it", which is true only for `:::` fences, not for `$$` or `::resource`.
15. **Captions, cells and notes do not support inline math.** The docs only say they share the "inline formatting and `:ref` marks".
16. **NBSP:** there is no mention that U+00A0 is treated as a normal breakable space.
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
| Verse / poetry / address / signature | `:::paragraphs{style="verse"}`, one paragraph per line with blank lines between. Stanza gaps come from the style's margins, or from separate containers. |
| Epigraph, dedication, colophon, lead-in | `:::paragraphs{style="…"}`, with the style defined in config. |
| Block quotation | `> …` (single block), or `:::paragraphs{style="quote"}` for multiple paragraphs. |
| Bulleted/numbered list | One line per item. 2 spaces per nesting level. Type the real numbers. Letter or roman item labels are set by the config `numberFormat`, not the source. |
| List item with several paragraphs | Not possible. Merge into one line, or follow the item with a plain paragraph. |
| Sidebar / box / "Key points" / exercise | `:::callout{type="…" title="…" label="…"}`. Two columns inside use `:::columns`. Answer boxes use a nested callout. |
| Figure / photo / diagram | A resource plus `:ref{id="…"}` in the sentence that first cites it (auto float). For an unnumbered ornament or a fixed spot: `placement.position:"here"` plus `::resource{id="…"}` on its own line. |
| Table | A table resource (`TableModel` JSON). Cite it with `:ref`. Math inside cells is impossible; use `^ ^`/`~ ~`/Unicode. |
| Cross-reference "see Fig. 3.2" | `see :ref{id="fig-x"}`. For "Figure 3.2" use `style="full"`; for "figure 3.2" add `case="lower"`; for a bare number use `style="number"`. |
| Cross-reference to a section or page | **Unsupported.** Write the text literally. |
| Footnote | **Unsupported.** Options: an inline superscript marker `^1^` plus the notes gathered in a `:::paragraphs{style="notes"}` or callout at the end of the section or chapter. |
| Superscript / subscript / chemistry | `x^2^`, `H~2~O`, or `$\ce{H2O}$` (mhchem is available). |
| Formula | `$…$` inline, `$$ … $$` display on its own lines with blank lines around. Escape currency `$` as `\$`. |
| Code listing | No code blocks. Use `:::paragraphs{style="code"}` with a mono style, one paragraph per line. Escape `* _ ^ ~ $` inside it. |
| Horizontal rule / ornament / asterism | No `---`. Use a centred `:::paragraphs{style="asterism"}` with `⁂` or `* * *` (escape as `\* \* \*`), or an ornament resource with `::resource`. |
| Forced page / column break | `:::pagebreak{parity="odd"}` / `:::columnbreak`. |
| Front-matter roman page numbers | `:::numbering{format="lower-roman" startAt=1}` at the start, then `:::pagebreak{parity="odd"}` + `:::numbering{format="decimal" startAt=1}` before chapter 1. |
| Table of contents | `# Contents {style="…" toc="false"}` then `:::toc`. |
| Part divider | `:::part{number="I" title="…" palette="band=#hex"}` … `:::` at the top of the part's first chapter file. |
| Keyboard keys, tags, word bank | `:chip[…]{style="…"}`. |
| Colour legend | `:swatch{color="…"}`. |
| Links | `[text](url)` keeps only the text (the URL is lost). Put important URLs in the text itself; they get URL-aware line breaking. |
| Small caps, underline, strikethrough, colour spans, language spans | **Unsupported inline.** Use a chip style or a paragraph style, or accept plain text. |
| HTML entities | Use the literal Unicode characters. |

---

## 16. Pre-flight checklist for a generated chapter

1. Blank line before and after every heading, list, quote, `$$` block, `::resource`, and `:::` fence.
2. No paragraph line starts with `- `, `* `, `+ `, `> `, `# `, or `<digits>. ` / `<digits>) ` unless that construct is intended.
3. Every list item is on one line. Nesting uses 2 spaces per level. Ordered items carry their real numbers.
4. Escape stray `*`, `_` (including inside words and URLs), `^`, `~` and `$` with a backslash.
5. Attribute values contain no `}`. Quotes don't clash. `::resource` uses exactly `{id="…"}`.
6. Every `type=`, `style=` and `:chip{style}` id exists in the config. Every `:ref` / `::resource` id exists in `resources`.
7. Every opened `:::callout|paragraphs|part|columns` has its closing `:::`. `:::columns` appears only inside a callout.
8. No headings end in brace text unless it is meant as attributes. No `:chip` in headings.
9. Frontmatter appears only in the book's first chapter.
10. No GFM tables, code fences, footnotes, HTML, or `---` rules remain.
