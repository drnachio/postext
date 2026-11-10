# Music notation (postext ≥ 1.54)

Postext sets music as part of a book: examples in a harmony textbook, a
method or a musicology study, melodies with lyrics in a songbook or hymnal.
The notation is written as text in a fence or kept as a resource file; the
engine engraves it with [Verovio](https://www.verovio.org) at the width of
the column and breaks it into **systems** (one line of staves each). Every
system is a block the layout places, so a long score runs on over columns
and pages and only breaks between systems. The look comes from `scoreStyle`
(configuration.md §18b), never from the Markdown.

A whole edition of a score (orchestral score, parts, page turns planned bar
by bar) is out of scope: that is the work of notation software. Port the
book around the music, and bring the music in as MusicXML, MEI or ABC.

## 1. Formats

| Fence / extension | Format | Use it for | Notes |
|---|---|---|---|
| ```` ```abc ```` / `.abc` | ABC 2.1 | one-voice examples, melodies with lyrics (`w:`), folk tunes | compact, easy to write by hand. Verovio's ABC reader takes **one voice**: `V:` voices and `%%score` are not read; use MusicXML, MEI or Humdrum for parts |
| ```` ```musicxml ```` / `.musicxml` | MusicXML 4.0 | anything exported from Dorico, Sibelius, Finale, MuseScore | the exchange format publishers already have. Long: keep it in a resource file. Compressed `.mxl` must be unzipped first |
| ```` ```mei ```` / `.mei` | MEI 5 | critical and scholarly editions, early music | the richest encoding; the engraver's native format |
| ```` ```humdrum ```` / ```` ```kern ```` / `.krn` | Humdrum `**kern` | chorales, analysis examples, four-part harmony | one spine per voice, tab-separated, bass first |

A fence with `{listing}` stays a code listing (```` ```abc {listing} ```` to
show ABC source in a tutorial). `scoreStyle.enabled: false` keeps every
notation fence a listing. A plain ```` ```xml ```` fence is always code.

## 2. In the text: a fence

````markdown
The perfect authentic cadence closes on the tonic in the soprano:

```humdrum {alt="Chorale phrase in G major ending on a perfect authentic cadence"}
**kern	**kern	**kern	**kern
*clefF4	*clefGv2	*clefG2	*clefG2
*k[f#]	*k[f#]	*k[f#]	*k[f#]
*M4/4	*M4/4	*M4/4	*M4/4
4GG	4B	4d	4b
4D	4d	4f#	4a
=	=	=	=
1GG	1B	1d	1g
==	==	==	==
*-	*-	*-	*-
```

The half cadence stops on the dominant instead.
````

Attributes: `alt="…"` (text for screen readers and the tagged PDF; default:
the title and composer read from the notation), `style="…"` (a named
`scoreStyles` entry). A fence score is not numbered or captioned: it sits in
the text like a display formula. Use a resource for "Example 2.3".

## 3. Numbered examples: a `score` resource

```json
{
  "id": "ex-cadence",
  "typeId": "example",
  "kind": "score",
  "caption": "Perfect authentic cadence in G major",
  "score": { "format": "musicxml", "source": "<?xml …", "styleId": "small" }
}
```

- `typeId: "example"` gives the built-in **Example** type in the document
  language (Example, Ejemplo, Exemple, Notenbeispiel, Esempio, Exemplo,
  谱例, 譜例, مثال), numbered `{h1}.{n}` like figures; it is added to a book's
  `resourceTypes` when a resource uses it. Define your own type for another
  name ("Music example", "Ex.").
- Cite and place it like a figure: `:ref{id="ex-cadence"}` in the text,
  `::resource{id="ex-cadence"}` to set it where it stands; placement,
  captions and notes as in document-format.md §9.
- A resource score is kept whole (it floats as one block). A score too long
  for one page belongs in a fence, which breaks between systems.
- CLI: `postext pdf chapters/ --resources res/` reads `.abc`, `.musicxml`,
  `.mei` and `.krn` files in the folder as `example` resources named by the
  file (`res/ex-cadence.musicxml` → `id: "ex-cadence"`).

## 4. Design: `scoreStyle`

```json
"scoreStyle": {
  "staffSize": { "value": 6, "unit": "mm" },
  "musicFont": "Bravura",
  "spacing": 1,
  "barNumbers": "system",
  "systemGap": { "value": 3, "unit": "mm" },
  "marginTop": { "value": 6, "unit": "pt" },
  "marginBottom": { "value": 6, "unit": "pt" },
  "minSystemsAtBreak": 2
},
"scoreStyles": [
  { "id": "small", "name": "Small examples", "staffSize": { "value": 4.5, "unit": "mm" }, "barNumbers": "none" }
]
```

Mapping a source's design:

- **Staff size** (rastral): measure the distance from the bottom to the top
  line of a five-line staff in the source. School books 6–7 mm, textbooks
  and methods 5–6 mm, examples inside running text 4–5 mm, pocket hymnals
  4 mm.
- **Music font**: Bravura (Steinberg, the SMuFL reference, traditional
  plate look), Leland (MuseScore, lighter), Petaluma (handwritten jazz
  look), Leipzig and Gootville (Verovio's own). Match the weight of the
  noteheads and the shape of the treble clef.
- **Text font** (lyrics, tempo, directions): defaults to the body face. Set
  `textFont` when the source sets lyrics in another face.
- **spacing** above 1 spreads the notes (fewer bars per system); below 1
  packs them.
- **minSystemsAtBreak**: fewest systems a score leaves at a column foot or
  carries over; a score with fewer than twice this moves whole.
- **color** defaults to the body text colour; spot-colour books set the ink
  here.

## 5. Porting checklist

1. Find the music in the source: engraved examples (images or vector
   art in a PDF), embedded fonts named Bravura, Maestro, Opus, Petrucci or
   Sonata, chord symbols over lyrics.
2. Get the notation as text. Best: the publisher's MusicXML or MEI files.
   Next: re-enter short examples in ABC or Humdrum. Scans: optical music
   recognition (Audiveris, MuseScore's import, Soundslice) is a manual step;
   proof every bar against the source.
3. One fence per unnumbered example in the text; one resource per numbered
   example, its caption from the source, `typeId: "example"`.
4. Measure the staff size and pick the music font; set `scoreStyle`. Small
   examples in the margin or in boxes get a named style.
5. Render the chapter and compare page breaks with the source
   (verification.md). Bars per system follow `spacing`, the staff size and
   the column width, not the source's system breaks (breaks written in the
   notation are not kept yet): tune `spacing` and `staffSize` until the
   systems hold about as many bars as the source's.

## 6. Traps

- ABC with several voices sets only the first: write parts in MusicXML,
  MEI or Humdrum.
- A Humdrum fence must keep its tabs; editors that turn tabs into spaces
  break it.
- Titles inside the notation (ABC `T:`, MusicXML `<work-title>`) are not
  printed: they give the alt text. Put the title in a caption or the text.
- The engraver loads only for books with music (about 3.7 MB compressed).
  Until it is ready the preview shows grey placeholder boxes.
- The Word exports (semantic and formatted) keep notation fences verbatim
  in a *Postext Source* content control: Word shows the notation as text
  and edits to it come back on `import-docx`. The page facsimile
  (`--variant facsimile`) shows the engraved score as a picture, which is
  display only.
