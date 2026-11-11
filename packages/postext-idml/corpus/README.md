# The importer's stress corpus

One ExtendScript generator per feature family. Each builds a document in
InDesign, exports it as IDML and as PDF, and closes it without saving.

    osascript -e 'tell application "Adobe InDesign 2026" to do script (POSIX file "/path/to/corpus/book-flow.jsx") language javascript with arguments {"/path/to/out"}'

The one argument is the output folder; it must hold a copy of
`pictures/` (`sea.png`, `lamp.png`). Run a script from this folder: it
includes `lib.jsxinc`, which is looked up beside it. Run one script at a
time.

The scripts are ASCII: text in other scripts is written as `\uXXXX`
escapes. They name no built-in style, swatch, variable or cross-reference
format, because those names follow the language of the application; each
document makes its own. A face is named with its style (`Georgia`,
`Arial`, `Hiragino Mincho ProN`, `Geeza Pro` must be installed).

Every step runs in a try/catch. A script returns `ok`, the page count,
the steps that failed (`name: error`) and the number of overset frames,
for example `ok 15 pages | overset 0`. The only step expected to fail is
`orientation` in `cjk-rtl.jsx`, on an InDesign without the Japanese
feature set.

| Script | What it holds |
|---|---|
| `book-flow.jsx` | 15 facing pages. A master with a running head and an automatic page number on both pages. A title page and a dedication without the master, then one story through a frame per page, threaded in page order: a preface, and three chapters that each start on a new page (the chapter title style starts on the next page). The front matter is numbered in roman, and a section starts the first chapter at 1. H1 and H2, first-line indents, three footnotes, a bulleted and a numbered list made with list settings, a quotation, character styles, two pictures anchored in paragraphs of their own (one inline, one above the line) each followed by a caption paragraph, a table with a header row, and on the last page an index generated from page-reference marks, with a subtopic and a "See" cross-reference |
| `magazine-pages.jsx` | 4 facing pages. A three-column article threaded from page 1 to the top of page 2 and on to page 4 under a "continued" line, its last frame with balanced columns; a pull quote with text wrap over the columns; a rotated frame; a box over a gradient ground; a spot-colour rule; grouped shapes; a picture with a caption frame, a second story, a rotated picture with its caption |
| `tables.jsx` | 1 page. A table with a header and a footer row, cells merged across and down, a filled cell, bottom and centre vertical alignment, a turned cell, a diagonal line, a graphic cell, right-aligned and centred cells, column widths and row heights, a table style and a cell style; a second table with a nested table, a cell of two paragraphs and a footnote in a cell |
| `links-notes.jsx` | 3 pages. Links to a URL, an e-mail address, a text anchor, a page and a `file:` URL; a cross-reference to a paragraph in a format of the document's own; a footnote (lettered, restarting on each page), an endnote (InDesign adds its page), an editorial note; a hidden and a shown condition; text variables (modification date, custom text, last page number); a tracked insertion and a tracked deletion; two bookmarks |
| `cjk-rtl.jsx` | 2 pages. A Japanese story with per-character and group ruby, tate-chu-yoko and kenten (vertical where InDesign has the Japanese feature set, horizontal otherwise); an Arabic right-to-left story set with the World-Ready composer, its Latin word and digits in a Latin face; a left-to-right line that quotes Arabic and Japanese |
| `anchored.jsx` | 2 pages, one story through both. An inline swatch and an inline picture, a picture above the line, a margin note in custom position, a boxed frame above the line that holds a table, and a group nested in a group |
| `styles.jsx` | 1 page. Based-on chains five deep, a paragraph style group and a character style group, a nested style, a GREP style and a line style, local paragraph overrides, character styles and local character formatting |

The modification-date variable in `links-notes.jsx` is the only text that
changes from one run to the next.

After a run, copy each IDML into `src/__fixtures__/corpus/` with its
`file:` links rewritten to `file:/Volumes/Work/corpus/<name>` and check
that no entry of the package (the XMP packet in `META-INF/metadata.xml`
included) names a local path.
