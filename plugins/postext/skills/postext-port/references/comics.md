# Comics, manga, BD, webtoons and newspaper strips (postext ≥ 1.20)

Postext sets comic pages from Markdown: the page is cut into panels by a
split expression, each panel shows a picture resource cropped to its cell,
and the lettering (balloons, captions, sound effects) is typeset by the
engine around the text of each language. Read this file before porting
any comic, manga, bande dessinée, tebeo, webtoon episode, yonkoma or
newspaper strip.

Contents: 1 Model · 2 A complete example · 3 `:::page` · 4 The split ·
5 `::panel` · 6 Script lines · 7 `:::strip` · 8 Spreads · 9 Pictures:
anchors, avoid zones, safe areas · 10 The `comics` config · 11 Reading
direction · 12 Editions in several languages · 13 Output · 14 Warnings ·
15 Measuring pages (`comic_panels.py`) · 16 Porting playbooks P1–P6 ·
17 Limits.

## 1. Model

- **Geometry is the same in every language, text is per language.** The
  split, the panels, the pictures, their crops, the speaker anchors and the
  avoid zones are written once; each language's Markdown carries only the
  words. Balloons are rebuilt around the measured text of each edition.
- **The art carries no lettering.** Pictures must be text-free (or have
  their balloons emptied): the engine draws every balloon, caption and
  sound effect. Text that belongs to the drawing (a shop sign, a letter in
  a hand) may stay in the art, or be re-lettered as `sfx` so it translates.
- **One lettering size per book.** Text is never shrunk to fit. A balloon
  that does not fit changes shape, moves, crosses the border when allowed,
  or raises `comicBalloonOverflow`.
- **Deterministic.** The same source lays out the same page every time;
  hand-drawn wobble and burst spikes are seeded from the balloon.
- A comic page (`:::page`) is a page of its own: it starts on a fresh page,
  owns the whole page and the text after it starts a new page. Comic pages
  print no running heads (set `comics.runningHeads: true` to keep them);
  their folios still count.
- Opt-in: a book without `:::page`/`:::strip` lays out exactly as before.

## 2. A complete example

Chapter `chapters/en/01-storm.md`:

```md
# The Storm {style="episode" toc="false"}

:::page{split="30 [55 | *] / 35 / * [40~55 | *]"}
::panel{art=st-cliff}
caption: Porthcove, the night of the storm.
maya: Grandpa! The light's gone out!
::panel{art=st-radio focus="30% 40%"}
tomas: I see it. Get the spare bulbs.
tomas: The big box, under the stairs.
::panel{art=st-stairs}
sfx{at="70% 30%" rotate=-8}: KRAK
maya{whisper}: Biscuit? Is that you?
::panel{art=st-lamp}
biscuit{thought}: Obviously.
::panel{art=st-beam bleed="bottom end"}
caption{at=bottom-end}: By midnight the light was turning again.
:::
```

Resources in `preset.json` (fractions of each picture, top-left origin):

```jsonc
{ "id": "st-radio", "typeId": "figure", "kind": "bitmap", "file": "resources/st-radio.jpg",
  "width": 1400, "height": 933,
  "altText": "The keeper bends over a valve radio in the lamp room.",
  "safeArea": { "x": 0.05, "y": 0.2, "width": 0.6, "height": 0.75 },
  "anchors": [
    { "id": "tomas", "x": 0.34, "y": 0.52, "head": { "x": 0.36, "y": 0.42 },
      "face": { "x": 0.28, "y": 0.38, "width": 0.15, "height": 0.2 } } ],
  "avoid": [ { "x": 0.0, "y": 0.45, "width": 0.2, "height": 0.25 } ] }
```

Config (`config.comics`, every key optional):

```jsonc
"comics": {
  "gutter": { "horizontal": { "value": 4, "unit": "mm" }, "vertical": { "value": 2, "unit": "mm" } },
  "lettering": { "fontFamily": "Comic Neue", "fontSize": { "value": 9, "unit": "pt" } },
  "cast": [ { "id": "maya", "name": "Maya" }, { "id": "tomas", "name": "Tomás" },
            { "id": "biscuit", "name": "Biscuit", "balloonStyle": "thought" } ]
}
```

Comic panels are resources like figures, but they are never cited with
`:ref` or `::resource`: `art=` places them. They need no caption. Give
them `altText` (tagged PDF, HTML and EPUB read it).

## 3. `:::page`: a comic page

```md
:::page{split="…" gutter=4mm style=clean bleed direction=rtl spread}
::panel{…}
script lines
::panel{…}
:::
```

- The block is read raw up to the first bare `:::` line (like
  `:::verse`): nothing inside is a paragraph, list or heading.
- `<!-- comments -->` inside are ignored (several lines too).
- Text before the first `::panel` is lettered as a caption of panel 1 and
  raises `comicStrayText`.

| Attribute | Value | Effect |
|---|---|---|
| `split` | split expression (§4) | how the frame is cut into panels. Absent: the panels stack in equal tiers (`* / * / …`) |
| `gutter` | `4mm` or `"5mm 2mm"` | room between tiers (first value) and between panels side by side (second); a bare number is mm. Default `comics.gutter` |
| `style` | panel style id | the style of every panel of the page (`comics.panelStyles`) |
| `bleed` | flag | every panel touching the frame runs to the trim and into the bleed |
| `direction` (or `dir`) | `ltr` \| `rtl` | reading direction of this page (§11) |
| `spread` | flag | one split across two facing pages (§8) |

The frame is the page's content area (its margins) unless
`comics.frame.margins` gives the comic pages their own. A comic book
usually sets `page.margins` to the frame and keeps the text pages on the
same margins.

## 4. The split expression

```
list := item (SEP item)*      SEP: '/' rows, stacked top to bottom
                                   '|' columns, side by side from the start side
item := size [ '[' list ']' ]  a bracketed list cuts that cell on the OTHER axis
size := number['%'] ['~' number['%']] | '*' | (empty)
```

- A **size** is the cell's extent along its list's axis, in percent of
  the parent cell. The split lines sit at the running sums, so
  `30 / 35 / *` puts lines at 30 % and 65 % of the frame height.
- `*` (or an empty size) takes an equal share of what the numbers leave.
  The last item always runs to 100 % whatever it says: write `*` there.
- A bracketed list cuts its cell on the other axis: `30 [55 | *]` is a
  tier 30 % high cut into two panels, 55 % and 45 % wide.
- A list uses one separator. `30 / 20 | *` is an error
  (`comicSplitSyntax`); bracket one side. A bracketed list on its parent's
  own axis (`30 [10 / 20] / *`) is an error too.
- Sizes past 100 % are scaled down so every `*` keeps 5 %
  (`comicSplitOverflow`).
- **Slants**: `40~55` = this cell's far edge runs from 40 % at the start of
  the cross axis to 55 % at its other end. For columns the start is the
  top; for rows it is the start side (left, or right on an `rtl` page).
  Several slants in a list add up per end. Slanted cells get straight
  corners.
- The gutter straddles each line (half on each side), so a line at 30 %
  sits exactly at 30 % of the cell measured from gutter middle to gutter
  middle. Measure panels from the middles of their gutters.
- Reading order is tree order: rows top to bottom; within a row, the start
  side first. On an `rtl` page the same source mirrors its columns and
  slants by itself; never reverse a split by hand.

| Layout | `split` |
|---|---|
| splash page | `*` (or no split, one panel) |
| three tiers | `33 / 33 / *` or `* / * / *` |
| 2 + 3 grid | `50 [* \| *] / 50 [* \| * \| *]` |
| wide top, three below | `30 [30 \| 20 \| *] / *` (the bottom tier holds the rest) |
| big left column, right column split | `60 \| * [50 / *]` |
| action tier with a slanted gutter | `* [40~55 \| *] / 35` |
| two slanted tiers | `24 / 18 / * [40~55 \| *] / 24 [58~64 \| *]` |
| yonkoma, two strips side by side | `* [* / * / * / *] \| * [* / * / * / *]` |
| one-tier daily strip (in `:::strip`) | `* \| * \| * \| *` |

Panels fill the cells in reading order. More panels than cells: the extra
ones are not set; fewer: the last cells stay empty. Both raise
`comicPanelCount` when a `split` is written.

Layouts a guillotine cut cannot make (a pinwheel, a panel spanning two
tiers on one side only): use an `inset` panel over a bigger one, or cut
the panels differently and accept the gap.

## 5. `::panel`: one panel

A `::panel{…}` line starts a panel; it runs to the next `::panel` or the
closing `:::`.

| Attribute | Value | Effect |
|---|---|---|
| `art` | resource id | the picture (bitmap or SVG). Absent: an empty panel in its background (a text-only panel) |
| `fit` | `cover` \| `contain` | `cover` (default) crops to fill the cell, never into the safe area; `contain` shows the whole picture on the panel background |
| `focus` | `"x% y%"` | point of the picture kept centred when the safe area leaves room |
| `style` | panel style id | this panel's style |
| `border` | `none` or a dimension (`0.5mm`, `1pt`) | border of this panel |
| `bg` | `#rrggbb`, palette id, `none` | panel background (shows in letterbox bands and empty panels) |
| `bleed` | flag, or sides `"top start"` | run the sides that touch the frame to the trim; sides `top bottom start end left right` |
| `mirror` | flag / `mirror=false` | flip the picture; `mirror=false` keeps a picture with text or handedness unflipped under `comics.mirrorArt` |
| `pop` | resource id | a transparent cut-out drawn over the border with the same crop (a figure breaking out of its panel). Same pixel size as `art` |
| `inset` | `"x y w h"` (percent of the previous panel's box) | a panel laid over the previous panel; it takes no cell |
| `pad` | 1–4 values, dimension or % of the cell (`"0 12%"`) | insets the panel inside its cell, CSS order top, end, bottom, start (a panel narrower than its tier) |
| `alt` | text | alt text (else the resource's `altText`) |
| `#id` (or `id=`) | name | the panel's id in the layout (the Sandbox and the HTML output use it); not a `:ref` target |

## 6. Script lines: the lettering

One balloon per line, `key{attributes}: text`.

```md
caption: Lyon, 1943.
ana: Did you hear that?
ben{whisper}: It's nothing. Go back to sleep.
ben: Really.
  This indented line continues the balloon above.
sfx{at="62% 40%" rotate=-8 size=1.6}: KRAK
note{at=bottom-end}: See issue 12. —Ed.
ana{thought}: First line,\
  second line of the same balloon.
```

- `key` is a **speaker id** (letters, digits, `_ . -`), the same in every
  translation; it matches the pictures' anchors and `comics.cast`.
  Reserved keys: `caption` (narration box), `sfx` (sound effect, no
  balloon), `note` (editor's note).
- The colon may be full-width `：`, as a CJK input method types it.
- A line indented by two spaces or a tab continues the balloon above (a
  space joins the lines; none between CJK characters). A backslash at the
  end of a line forces a line break inside the balloon.
- A line that is neither a script line nor a continuation is lettered as a
  caption and raises `comicStrayText`.
- The text is inline Markdown: `*italic*`, `**bold**` (emphasis prints
  bold italic, bold only in Arabic and CJK), `:tcy[12]`. `:ruby[…]`,
  `:ltr[…]`/`:rtl[…]` print as plain text inside balloons; footnotes,
  `:ref` and maths are not read there.
- Consecutive lines of one speaker in one panel with the same style are
  joined into one outline (`comics.lettering.joinSameSpeaker`, `butt` by
  default; the tail only on the first). Two separate balloons of the same
  speaker: `join=false` on the second.

| Attribute | Value | Effect |
|---|---|---|
| bare flag (`{whisper}`) or `style=` | balloon style id | the kind: `speech`, `thought`, `whisper`, `shout`, `radio`, `caption`, `inner`, `note`, `sfx`, or a style of the config. Unknown: `comicUnknownBalloonStyle`, the key's default style is used |
| `at` | `"x% y%"` | pins the balloon's centre, in fractions of the panel's **picture** (so it survives crops, splitter drags and other page sizes); of the cell when the panel has no picture |
| `at` | `top-start` `top-end` `bottom-start` `bottom-end` `top` `bottom` | a corner or edge of the panel, butted to the border for captions |
| `to` | `"x% y%"` | where the tail points (picture fractions) |
| `tail` | `none` \| `auto` \| `top` \| `bottom` \| `start` \| `end` | no tail, or a speaker off the panel on that side |
| `join` / `join=false` | flag | force or forbid joining with the speaker's previous balloon |
| `break` | flag | the balloon may cross the panel border |
| `rotate` | degrees, clockwise | sound effects |
| `size` | factor (`1.6`) | scales the text of this line (sound effects) |
| `color` | `#hex` or palette id | text colour of this line |
| `font` | family | face of this line (bundle it) |

Without `at` the lettering places each balloon: high in the panel, near
its speaker's mouth, in reading order (a later balloon does not sit above
an earlier one unless it is further along the reading direction), off the
faces and avoid zones, tails not crossing. A speaker with no anchor in
the panel gets a tail toward the nearest border (an off-panel voice).
Use `at` only where the placement is wrong or the source's position
matters (§16 P2).

## 7. `:::strip`: panels in the text flow

A strip has the body of a page (`split`, `::panel`, script lines) but is
laid out as one block in the text: a newspaper daily, a comic inside a
prose book, a webtoon run.

```md
:::strip{split="* | * | * | *" span=page aspect=4/1.15 placement=top}
::panel{art=po1}
pip: Morning, Otto!
::panel{art=po2}
::panel{art=po3}
::panel{art=po4}
sfx: CHOMP
:::
```

| Attribute | Value | Effect |
|---|---|---|
| `split` | split expression | absent: the panels side by side (`* \| * \| …`) |
| `span` | `column` (default) \| `page` | the column's measure, or the content width across columns |
| `placement` | `here` (default) \| `top` \| `bottom` \| `auto` | in the flow where written, or floated like a figure (first free slot after this point; strips never overtake each other). `span=page` + `here` on a multi-column page floats (`auto`) |
| `height` | dimension (bare number = mm) | the strip's extent across the flow |
| `aspect` | `3`, `4/1`, `4:1` | width over height; default: cells across over cells down (square panels) |
| `gutter`, `style`, `bleed`, `direction` | as on a page | nothing bleeds out of a strip |

A strip is never split: it moves whole to the next column or page (a
heading just above travels with it) and is clamped to a column's height.
The flow snaps back to the grid after it, with the float gap
(`layout.inlineResourceGap`) around it.

## 8. Spreads

`:::page{spread split="55 / * [25 | 25 | *]"}` lays one split across two
facing pages: the frame runs from the outer margin of the left page to the
outer margin of the right page (inner margins dropped), and a panel may
cross the spine (its picture spans both pages).

- A spread opens on a verso (an even page). A blank page is added before
  it when needed, also at the very start of a book (page 1 is a lone
  recto, so a spread first in a book takes pages 2–3).
- The verso is the left page in a left-bound book and the right page in a
  right-bound one (`page.binding`; right by default for Arabic and vertical
  books). Bind a manga edition on the right (`page.binding: 'right'`), or
  its panel 1 lands on the second page.
- Balloons stay clear of an 8 mm band about the spine. Draw spread art with
  no face or key object in its middle.

## 9. Pictures: anchors, avoid zones, safe areas

All in fractions (0–1) of the stored picture, top-left origin, the same
in every edition.

```jsonc
"safeArea": { "x": 0.1, "y": 0.18, "width": 0.85, "height": 0.64 },
"anchors": [
  { "id": "maya", "x": 0.53, "y": 0.47,                  // mouth: speech tails point here
    "head": { "x": 0.52, "y": 0.33 },                    // thought bubbles point here (else the mouth)
    "face": { "x": 0.41, "y": 0.3, "width": 0.19, "height": 0.22 } },  // never covered
  { "id": "sfx", "x": 0.8, "y": 0.2 }                    // where an `sfx` line without `at` goes
],
"avoid": [ { "x": 0.0, "y": 0.72, "width": 0.4, "height": 0.1 } ]       // hands, key objects
```

- **Anchors**: one per speaker the picture shows, `id` = the script key.
  An anchor outside 0–1 is a speaker outside the picture (the tail points
  that way). A speaker with no `face` gets a guard box above its mouth
  (about 3 × 3 em), so give `face` rectangles in close-ups where the face
  is bigger than that.
- **Avoid zones**: regions balloons do not cover (they may cover them as a
  last resort; never a face). Tails may cross them.
- **Safe area**: what every crop keeps. A panel cell can show the safe area
  whole only when its aspect ratio (width/height) lies within
  `[sw·W/H, W/(sh·H)]` (W×H the picture in px, sw×sh the safe area in
  fractions). Outside that range the picture is shown whole with
  background bands (`comicPanelLetterbox`). Choose the safe area as the
  smallest box holding the faces, the anchors and the action, then check
  the narrowest and widest cells it will fill. Keep every anchor inside it
  (`comicAnchorOutsideSafeArea`).
- No safe area: the crop is centred (or on `focus`).
- Read the fractions off a grid: `scripts/comic_panels.py grid PICTURE…
  --out work/grid` writes the picture under a labelled 10 % grid; check
  with `comic_panels.py check preset.json --out work/check`. In the
  Sandbox, the picture editor (Resources → a picture → Speakers & avoid
  zones) places them by hand.
- Pixel to fraction: `x = (px − cut_x0) / cut_width`, with `cut` the box
  the panel picture was cut from (panels.json from `comic_panels.py`
  records it).

## 10. The `comics` config

Every key is optional; a document with comic pages and no `comics` section
uses the defaults of its language. Lengths below in em of the balloon text
(`padding`, `tailWidth`, balloon `letterSpacing`, `halo`, `strokeWidth`)
take em; `lettering.fontSize`, `lettering.inset`, `gutter.*`,
`frame.margins.*`, panel `borderWidth` and `borderRadius` must be mm or pt
(em throws).

| Key | Default | Notes |
|---|---|---|
| `readingDirection` | `'auto'` | `'ltr'`, `'rtl'`; §11 |
| `artDirection` | `'ltr'` | the direction the art was drawn for: `'rtl'` for manga |
| `mirrorArt` | `false` | flip pictures on pages read against `artDirection` |
| `frame.margins` | page margins | `{top, bottom, left, right, mirror}` for comic pages only |
| `gutter.horizontal` | `4mm` | between tiers |
| `gutter.vertical` | `2mm` | between panels side by side |
| `panel` | 1 pt black solid border, white, `cover` | `borderWidth`, `borderColor`, `borderRadius`, `borderStyle` (`solid` \| `none` \| `rough`), `background`, `fit`, `bleed` |
| `panelStyles[]` | none | `{id, name?, …panel keys}`; unset keys follow `panel` |
| `lettering.fontFamily` | by language: `Comic Neue`; ja `Zen Antique`; zh-Hans `Noto Sans SC`; zh-Hant `LXGW WenKai TC`; Arabic script `Playpen Sans Arabic` | bundle it (§13) |
| `lettering.fontSize` | `7.5pt` | one size per book; comic books 7–9 pt, A4 albums 9–10 pt |
| `lettering.lineHeight` | `1.15` | left at 1.15, vertical/CJK lettering uses 1.5 and Arabic 1.45 |
| `lettering.color`, `bold`, `italic`, `letterSpacing` | black, no, no, 0 | italics never apply to CJK or Arabic |
| `lettering.writingMode` | `'auto'` | vertical for Japanese and Traditional Chinese (or a `vertical-rl` document); `'horizontal'`, `'vertical'` |
| `lettering.textTransform` | `'none'` | `'uppercase'` (Western comics lettering); scripts without case keep theirs |
| `lettering.dropFinalStop` | `'auto'` | drops a balloon's final `。` in ja/zh |
| `lettering.doubleDash` | `false` | `—` → `--` (US lettering) |
| `lettering.inset` | `1.5mm` | room between balloons and the panel border |
| `lettering.joinSameSpeaker` | `'butt'` | `'connector'` (a neck between bodies), `'none'` |
| `lettering.maxColumnChars` | `8` | vertical columns, characters at most |
| `balloonStyles[]` | the nine built-ins | an entry with a built-in id changes it; another id adds a style (over `speech`) |
| `cast[]` | none | `{id, name?, balloonStyle?, color?, fill?, fontFamily?}`: a speaker's default style (speech lines only), text colour, balloon fill, face; `name` is printed in the reflowable EPUB and read in the HTML |
| `runningHeads` | `false` | running heads and folios on comic pages |

Built-in balloon styles (keys of a `balloonStyles` entry: `shape`, `fill`,
`stroke`, `strokeWidth`, `dash`, `double`, `wobble` 0–1, `roundness`,
`burstPoints`, `burstDepth`, `padding`, `aspect`, `tail`, `tailWidth`,
`tailReach`, `target` `mouth|head`, `position`, `butt`, `fontFamily`,
`fontScale`, `bold`, `italic`, `color`, `textTransform`, `letterSpacing`,
`align` `center|start`, `halo`, `haloColor`, `rotate`):

| id | Look |
|---|---|
| `speech` | oval (superellipse 2.2), white, 0.6 pt outline, curved tail to the mouth |
| `thought` | cloud, bubbles to the head |
| `whisper` | dashed oval, text × 0.9 |
| `shout` | burst, wedge tail, bold, × 1.15 |
| `radio` | electric (zig-zag) outline and tail |
| `caption` | pale yellow rectangle, top-start corner, butted, start-aligned |
| `inner` | grey rounded box, italic, no tail |
| `note` | rectangle, bottom-end, × 0.8 |
| `sfx` | no balloon, × 2.4, bold, white halo, the language's SFX face (`Bangers`; ja `Dela Gothic One`; zh-Hans `ZCOOL KuaiLe`; zh-Hant `LXGW WenKai TC`; Arabic `Lalezar`) |

Shapes: `oval`, `rounded`, `rectangle`, `cloud`, `burst`, `wavy`,
`electric`, `none` (text with a halo: sound effects, writing on the art).
Tails: `curved`, `wedge`, `bubbles`, `zigzag`, `none`. Positions: `auto`,
`top-start`, `top-end`, `bottom-start`, `bottom-end`, `top`, `bottom`.
Colours are `ColorValue`s (palette links allowed).

A style for text drawn on the art (a letter, a sign) that translates:

```jsonc
{ "id": "writing", "shape": "none", "tail": "none", "fontFamily": "Kalam", "fontScale": 0.8,
  "color": { "hex": "#3b2a1e", "model": "hex" } }
```
used as `sfx{writing at="34% 87%" rotate=13}: Invitation`.

## 11. Reading direction

- `comics.readingDirection: 'auto'` (default) = `rtl` in a right-to-left
  document (an Arabic edition mirrors its pages), else `artDirection`
  (default `ltr`). So a Japanese edition of a Western comic stays left to
  right, and a manga (`artDirection: 'rtl'`) reads right to left in any
  language.
- A page's `direction=ltr|rtl` overrides both.
- `rtl` mirrors only the order of side-by-side cells, slants and logical
  sides (`bleed` start/end, `pad`, `at=top-start`). Tiers stay top to
  bottom; pictures, safe areas and anchors never mirror, unless
  `comics.mirrorArt` flips the pictures of pages read against
  `artDirection` (`mirror=false` on panels with text or handedness in the
  art, a clock, a right-handed swordsman).
- Mirroring Western art for an Arabic edition is a choice: unmirrored art
  read right to left puts the first speaker on the left, so its balloon
  comes second; `mirrorArt` or `at=` pins fix the panels where that reads
  badly.

## 12. Editions in several languages

- One Markdown file per language (`chapters/<lang>/…`), each with the same
  `:::page` blocks, `split`, `::panel` lines and `art=` ids, in the same
  order. Only the text after each `key:` changes. `lint_project.py`
  compares the editions and warns where a split or the panel pictures
  differ.
- Speaker ids are the same in every language (`maya`, not `Maya`/`Maite`);
  the character's localized name goes in `cast[].name` through
  `localized.<lang>.config` when it differs.
- `localized.<lang>.config.comics` replaces the whole `comics` section for
  that language: repeat the shared keys (gutters, styles, cast) and change
  only the lettering face, size or `writingMode`.
- Japanese and Traditional Chinese balloons are set vertically by default;
  Simplified Chinese horizontally. A Japanese edition of a Western comic:
  `lettering.writingMode: 'horizontal'` when the source's balloons are
  horizontal and narrow. Vertical columns hold `maxColumnChars` characters
  (8); a long sentence makes a wide balloon: break it with `\` where the
  source breaks it.
- Write each language's lines in that language's reading order inside the
  panel (an Arabic edition lists two balloons of a tier right to left).
- Keep the source's house rules in the text: French spaces before `! ?`
  (U+202F), Japanese `……` and `！？`; the lettering drops a final `。` and
  turns `!?` into one upright cell in vertical columns.
- Sound effects: translate them as a new `sfx` line, or keep the drawn
  original in the art and add a small translated `sfx{size=0.5}` under it
  (manga practice).

## 13. Output

- **Canvas** (Sandbox, `render.mjs --jpeg`): panels, art, borders,
  balloons, sound effects. **PDF**: the same, tagged (a `Div` per page, a
  `Figure` per panel with its alt text, a `P` per balloon after its panel,
  sound effects as `Span` with `/ActualText`). **HTML** viewer: a
  `<figure>` per panel followed by its balloons as text. **EPUB**:
  fixed layout with region-based panel navigation (and Kindle Panel View
  on request); reflowable editions print each panel picture followed by
  its dialogue (`Speaker: words`, names from `cast`).
- **Fonts**: the lettering face, the SFX face and every face a style, cast
  entry or `font=` names must be in the manifest's `fonts` for headless
  renders and the PDF (the browser alone can fetch Google Fonts).
  `lint_project.py` lists the default faces of the book's language that
  are missing. The built-in styles ask for bold (`shout`, `sfx`) and
  italic (`inner`): bundle 400, 700 and italic variants, or list a
  single-weight face's file again under weight 700 (and style `italic`) so
  no renderer fakes a bold.
- Comic pages are counted and numbered; their running heads are hidden
  unless `comics.runningHeads`.

## 14. Warnings

| Warning | Meaning | Fix |
|---|---|---|
| `comicSplitSyntax` | the split cannot be read as written | one separator per list; bracket the other axis; numbers only (`40~55`, `30%`, `*`) |
| `comicSplitOverflow` | sizes add up past 100 % | lower the numbers, or make the last cell `*` |
| `comicPanelCount` | panels ≠ cells | add or remove `::panel` lines or cells (`inset` panels take none) |
| `comicStrayText` | a line is not `key: text`, or text sits before the first `::panel` | add the key (`caption:`); move the text after `::panel`; indent continuations by two spaces |
| `comicUnknownBalloonStyle` | `{flag}` names no balloon style | fix the flag, or declare the style in `comics.balloonStyles` |
| `comicUnknownArt` | `art=`/`pop=` names no bitmap or SVG resource | add the resource; check the id |
| `comicPanelLetterbox` | the cell's shape cannot hold the safe area under a crop: the picture shows whole with bands | widen/heighten the cell in the split, shrink the safe area, or set `fit=contain` and a `bg` on purpose |
| `comicBalloonOverflow` | a balloon does not fit cleanly (`face`, `balloon`, `outside`, `avoid`, `anchor`; with the fallbacks tried) | shorten or break the line, give the panel more room, mark the face/avoid zones tighter, allow `break`, or pin it with `at=` |
| `comicUnknownSpeaker` (info) | a speaker no picture of the page marks and no cast entry names: its tail points off the panel | add the anchor to the picture, add a `cast` entry, or fix a renamed key |
| `comicAnchorOutsideSafeArea` | an anchor lies outside its picture's safe area: a crop may cut the speaker | grow the safe area over the mouth |

## 15. Measuring pages: `comic_panels.py`

`scripts/comic_panels.py` (Pillow + NumPy) turns page images into the
geometry of a port.

```bash
python3 scripts/comic_panels.py detect src/pages/p*.jpg --out work/panels \
    --page-mm 170x240 --prefix ep01p [--direction rtl] [--tolerance 0.03]
```

- Finds the panels by a recursive cut along the paper between them (rows,
  then columns, then rows inside each part) and slanted gutters when no
  straight one exists.
- Writes `work/panels/panels.json` (per page: the split, the panel boxes
  in page px in reading order, their cells, bleed sides, corner radius;
  the gutters and the frame in px and mm), the panels cut out
  (`ep01p03-2.jpg`: page 3, panel 2, ready to be `art=ep01p03-2`), and a
  sheet per page (`ep01p03-sheet.jpg`: panels green and numbered in
  reading order, cells yellow, frame blue). **Look at every sheet.**
- Prints a `:::page{split=… gutter=…}` skeleton per page with its
  `::panel{art=…}` lines (`style=rounded` where corners are rounded,
  `bleed=` where a panel touches the image edge).
- Several pages at once share one frame: the median of each page's panel
  box. Use the frame for `page.margins` (or `comics.frame.margins`) and the
  median gutters for `comics.gutter`.
- `--direction rtl` lists columns from the right and writes the split for
  a right-to-left page (manga).
- Lettered pages: balloons crossing a gutter put ink in it; raise
  `--tolerance` (0.02–0.05) until the sheet shows every panel. Dark paper:
  `--paper '#000000'`. A page whose art fades into the paper gives a short
  panel: fix its cell with the frame (`--frame x0,y0,x1,y1`) or edit the
  number.
- The cut of a slanted panel is its bounding box, so it holds a sliver of
  the neighbour; the engine clips the picture to the panel's outline, so it
  never shows.
- Other subcommands: `grid` (labelled 10 % grid over pictures, to read
  anchors and safe areas), `check` (draws safe areas, mouths, heads, faces
  and avoid zones from a preset.json or art manifest), `contact` (a sheet
  of many images: panel cuts, rendered pages, source pages side by side).

Measuring by hand: in a page image W px wide with the frame from x0 to x1,
a vertical gutter centred at x is at `100·(x − x0)/(x1 − x0)` % of the
frame; a size is the difference between two such lines (or the line and
the cell's edge), in percent of the **parent cell**, not of the page.
Gutter mm = gutter px × trim width mm / W.

## 16. Porting playbooks

### P1. Text-free art plus translations (Pepper&Carrot)

The source ships the art without lettering (a "gfx-only" page, a layered
file with the text and balloon layers off) and the text per language (SVG
text layers, transcripts, a translation spreadsheet).

1. Licence: keep the credit lines the licence asks for (CC BY: the
   artist, the translators, a note that the work was re-lettered) in a
   credits chapter or colophon of every edition.
2. `comic_panels.py detect` on the text-free pages → splits, gutters,
   frame, panel cuts. Check the sheets. Rounded corners → a panel style
   with `borderRadius`; no border in the source → `comics.panel.borderStyle:
   'none'` (or `borderWidth` 0).
3. Speaker anchors from the original balloon tails (a vector source):
   each tail's tip points at its speaker but stops short; extend the line
   from the balloon body through the tip by about 0.6 tail lengths, or take
   the crossing of two tails of the same speaker. Convert to fractions of
   the panel cut. Check every anchor on `comic_panels.py check` and move
   the ones off the mouth by eye. Sound effects and drawn writing give an
   `sfx` anchor or an `at=` position with their rotation.
4. Script lines from the transcripts, in reading order: the speaker names
   become ids (`Pepper` → `pepper`), narration → `caption`, sounds → `sfx`.
   Match each language's text to the English balloons by geometry (the
   balloon body that holds it), not by element ids: translators rename,
   split and swap balloons.
5. Balloon kinds from the original shapes: a spiky outline → `{shout}`, a
   balloon leaving its panel → `break`, two bodies linked by a neck →
   `join`, two separate balloons of one speaker → `join=false` on the
   second; a cloud → `{thought}`.
6. One `chapters/<lang>/` file per language from the same generator.
   Safe areas per panel: the anchors and faces plus a margin.
7. Reference generator: `scripts/presets/showcase/pepper-carrot/` in the
   Postext repository (`panels.py`, `slots.py`, `anchors.py`, `text.py`,
   `manifest.py`).

### P2. Lettered art (scans, PDFs of printed comics)

The pictures carry the original language's balloons. Choose one:

- **Blank the balloons** (cleaning): fill each balloon's interior with its
  paper colour (flood fill from the text, or a mask of the white balloon
  bodies minus the art), keep or erase the outline and tail. Postext then
  draws its own balloons over the blank ones: set the line's `at=` at the
  old balloon's centre (fractions of the panel cut) and give the style
  `fill` the paper colour so the new outline covers the old. Cheap, keeps
  the original look; translations that need a bigger balloon do not fit
  the old shape (`comicBalloonOverflow`).
- **Inpaint** the balloons and their text away (an image model's edit with
  a mask, or careful clone work) and let Postext place new balloons. Best
  for translations; check every panel for invented details.
- **Redraw or regenerate** the art (P3) when the rights holder has clean
  files: ask for them first, they usually exist (`gfx-only`, flattened art
  without the text layer).

Text: OCR the balloons per panel (`ocrmypdf` or `tesseract --psm 6` on
each balloon crop; manga: `jpn_vert`), then read it against the page,
fix the reading order, mark emphasis (`**…**` where the source letters bold)
and line breaks only where they matter (`\`). Keep the original
positions as pins when they matter (a balloon over a door, a caption in
a corner): `at="x% y%"` = the balloon centre in fractions of the panel
picture; corner captions as `at=top-start`. Leave the others unpinned.

Measure with `comic_panels.py detect --tolerance 0.03` (balloons cross
gutters). Speakers: anchors at the mouths the old tails point to.

### P3. A script only, art generated

The user has a script (or a prose story) and no art. Generate clean
panels with an image model and letter them in Postext. The Postext
Cookbook used GPT Image 2.5 through fal.ai (`openai/gpt-image-2.5/sunburst/text-to-image`
for reference sheets, `/sunburst/edit` with `image_urls` for panels);
`scripts/presets/comics/generate.py` in the Postext repository is a
working queue client (`FAL_KEY` from the environment).

1. Write the page plan first: the split, the panels, the lines. Pick each
   panel's shape from its cell (a 30 % tier of a 170×240 mm page is about
   3.5:1).
2. One reference sheet per cast on plain white (full-body figures, wide
   gaps between them), plus location sheets. Cut one character per
   reference image.
3. Each panel: `edit` with 1–4 single-character references; prompt =
   the style line + "draw a NEW comic panel in exactly the style of the
   reference images; keep each character's face, hair, clothes, colours
   and proportions; do not copy the white background or the poses" + the
   scene + **"keep the top third quiet and uncluttered (sky, wall) so speech
   balloons can be lettered there"** + "the only characters in the picture
   are …" + "no text, no letters, no speech balloons, no captions, no
   sound-effect lettering, no signature, no panel border; the picture runs
   to the edges".
4. Size the picture to its cell's aspect (multiples of 16 px, ≤ 3840 px a
   side), then shrink for the bundle (JPEG, long side 1100–1600 px).
   Transparent cut-outs for `pop`: `background: transparent`.
5. Anchors and safe areas from `comic_panels.py grid`, checked with
   `check`. Credit the pictures as the user wants ("Generated With
   Diffusion Models" in the Postext Cookbook).
6. Generations have no seed: keep every accepted picture; regenerate one
   panel at a time.

### P4. Manga, right to left, vertical lettering

```jsonc
"locale": "ja",
"page": { "binding": "right" },
"comics": { "artDirection": "rtl",
  "lettering": { "fontSize": { "value": 8, "unit": "pt" } } }   // Zen Antique, vertical, by default
```

- `comic_panels.py detect --direction rtl`: the split lists columns from
  the right. Never mirror the split by hand.
- Balloons are vertical by default (`writingMode: 'auto'` for ja and
  zh-Hant); kinsoku, `……`, upright `！？`, `:tcy[12]` for two-digit numbers.
  Write the text as the source letters it; `dropFinalStop` removes the
  balloon-final `。`.
- Sound effects drawn in the art stay in the art; translated editions add
  a small `sfx{size=0.5 at=…}` subtitle beside them.
- An English or Spanish edition of a manga keeps `artDirection: 'rtl'`
  (it still reads right to left) with horizontal lettering, unless the
  publisher flips the art (`mirrorArt: true`, `mirror=false` on panels
  with text or handedness).
- Yonkoma: `split="* [* / * / * / *] | * [* / * / * / *]"`, the right
  strip read first; wider gutter between the strips (`gutter="3mm 8mm"`).

### P5. Arabic editions

- `locale: 'ar'` turns the book right to left: comic pages read right to
  left by themselves (`readingDirection: 'auto'`), the binding is on the
  right, the lettering face is `Playpen Sans Arabic` (bundle its arabic
  subset), SFX `Lalezar`. Arabic is never italic or letter-spaced.
- The split stays the source's; the engine mirrors the columns.
- Western art read right to left: the speaker drawn on the left now speaks
  second. List the lines in Arabic reading order (right balloon first in a
  tier) and pin where the order reads badly, or mirror the art
  (`mirrorArt: true`, `mirror=false` where the art holds text).
- Latin words inside Arabic balloons print as plain text (no `:ltr`
  isolate inside balloons yet): keep them short.

### P6. Newspaper strips

- A daily strip in a page of text: `:::strip{span=page placement=top
  aspect=4/1.15}` (four square-ish panels across a broadsheet), or
  `span=column` inside a column. A Sunday page: a taller strip with its own
  split (`48 / * [45 | *]`) and `height=120mm`.
- A whole page of strips: one `:::page` with the strips as tiers
  (`25 / 25 / 25 / *` with each tier split in panels).
- Strip panels are often borderless with a title panel: `border=none`,
  `bg=` for a flat title cell, `caption{at=top-start}` for the title.
- Folded newspaper object: `config.folio.binding.type: 'folded'`,
  `paper.type: 'newsprint'` (playbooks A11).

## 17. Limits

- Only guillotine splits (each cut runs across its cell); `inset` and
  `pop` cover insets and broken borders.
- Balloons do not cross panels unless `break`; no balloon spans two
  panels.
- Ruby, `:ltr`/`:rtl` isolates and emphasis dots print as plain text in
  balloons; footnotes and `:ref` are not read there.
- Webtoons (one long vertical strip) have no scroll layout: set each
  screen as a `:::page` of a tall custom page size, or as a run of
  `:::strip{span=page}` blocks in a single-column book.
- Tails are placed, not routed around other balloons; check crowded
  panels on the rendered page.
