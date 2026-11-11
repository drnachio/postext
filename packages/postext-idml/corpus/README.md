# The importer's stress corpus

One ExtendScript generator per feature family. Each builds a document in
InDesign, exports it as IDML and as PDF, and closes it without saving.

    osascript -e 'tell application "Adobe InDesign 2026" to do script (POSIX file "/path/to/corpus/book-flow.jsx") language javascript with arguments {"/path/to/out"}'

The one argument is the output folder; it must hold a copy of
`pictures/` (`sea.png`, `lamp.png`). The scripts are ASCII: text in other
scripts is written as `\uXXXX` escapes. Every step runs in a try/catch and
the script returns `ok` followed by the steps that failed.

| Script | What it holds |
|---|---|
| `book-flow.jsx` | 14 facing pages: a master with running heads and folios, roman front matter, three chapters with H1/H2, first-line indents, footnotes, a bulleted and a numbered list, a quotation, two anchored pictures with captions, a table, an index with marks |
| `magazine-pages.jsx` | a threaded three-column article that jumps pages, a pull quote with text wrap over the columns, a rotated frame, a box over a gradient, a spot-colour rule, grouped shapes, pictures with a caption frame |
| `tables.jsx` | header and footer rows, merged cells both ways, fills, vertical alignment, a turned cell, a diagonal line, a graphic cell, table and cell styles, a nested table, a note in a cell |
| `links-notes.jsx` | links to a URL, an e-mail address, a text anchor, a page and a file; a cross-reference; a footnote, an endnote, an editorial note; conditions, text variables, tracked changes, bookmarks |
| `cjk-rtl.jsx` | a vertical Japanese story with ruby, tate-chu-yoko and kenten; an Arabic right-to-left story; a mixed line |
| `anchored.jsx` | inline, above-line and custom anchored objects, a boxed anchored frame holding a table, nested groups |
| `styles.jsx` | based-on chains five deep, a style group, nested, GREP and line styles, local overrides, character styles |

After a run, copy each IDML into `src/__fixtures__/corpus/` with its
`file:` links rewritten to `file:/Volumes/Work/corpus/<name>` and check
that no entry of the package (the XMP packet in `META-INF/metadata.xml`
included) names a local path.
