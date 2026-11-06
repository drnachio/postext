# postext for Python

Typeset books from Python with [Postext](https://postext.dev/): a print-ready
PDF, HTML pages, an EPUB, page images or a Word document from a `.postext`
book, a book folder or loose Markdown files.

```bash
pip install postext
```

```python
import postext

report = postext.pdf("book.postext", out="book.pdf", set={"page.dpi": 300})
print(report.output.pages, "pages")
for warning in report.warnings:
    print(warning)            # warning missingFont (chapters/02.md:14): …

pdf = postext.pdf_bytes(open("book.postext", "rb").read())   # bytes in, bytes out
```

The package drives the self-contained `postext` command line, the same
executable as `brew install drnachio/postext/postext` or `npx postext-cli`:
the layout is the Sandbox's, and the same book breaks into the same pages.
The wheel is pure Python with no dependencies. The executable of your
system (185 to 230 MB, too large for a wheel) is downloaded on first use
from the GitHub Release of the package's version, checked against the
release's `SHA256SUMS` and kept in the cache:

| System | Executable |
| --- | --- |
| macOS, Apple silicon / Intel | `postext-macos-arm64` / `postext-macos-x64` |
| Linux x86-64 / ARM64 (glibc) | `postext-linux-x64` / `postext-linux-arm64` |
| Linux x86-64, musl (Alpine) | `postext-linux-x64-musl` |
| Windows x64 (and ARM, emulated) | `postext-windows-x64.exe` |

| Environment variable | Effect |
| --- | --- |
| `POSTEXT_BIN` | Run this executable instead (Homebrew, Scoop, a local build); nothing is downloaded |
| `POSTEXT_CACHE_DIR` | Cache folder (default `~/.cache/postext`, `%LOCALAPPDATA%\postext\cache` on Windows); executables go in `bin/<version>/`, downloaded fonts in `fonts/` |
| `POSTEXT_RELEASE_URL` | Download from a mirror: a URL with `{version}` where the release's files are |

`python -m postext pdf book.postext -o book.pdf` runs the command line
itself.

## Commands

Every command of the command line is a function. Each runs the command with
`--json` and returns its report.

| Function | Command | Returns |
| --- | --- | --- |
| `pdf(book, out=…, pdfx=…, profile=…, color_space=…)` | `postext pdf` | `Report` |
| `html(book, out=…, mode=…, assets=…)` | `postext html` | `Report` |
| `epub(book, out=…, layout=…, cover=…)` | `postext epub` | `Report` |
| `image(book, page="#1", out=…, dpi=…, format=…)` | `postext image` | `ImageReport` |
| `images(book, out="pages/", pages=…, pattern=…)` | `postext images` | `Report` |
| `docx(book, out=…, variant=…)` | `postext docx` | `Report` |
| `import_docx(docx, book=None, out=…, dry_run=…)` | `postext import-docx` | `ImportDocxReport` |
| `pack(book, out=…)` / `unpack(bundle, out=…)` | `postext pack` / `unpack` | `Report` / `UnpackReport` |
| `info(book, pages=True)` | `postext info` | `InfoReport` |
| `check(book, strict=True)` | `postext check` | `CheckReport` |
| `build(book, pdf=…, html=…, epub=…, images=…, docx=…)` | `postext build` | `Report` |

`book` is a path (a `.postext` file, a book folder, a Markdown file), a list
of Markdown files (the chapters, in order), or the bytes of a `.postext`
bundle. The commands that read a book take the book options:

```python
postext.pdf(
    ["01.md", "02.md"],
    out="notes.pdf",
    name="Notes",                      # --name
    config={"page": {"sizePreset": "A5"}},   # --config (a dict or a file)
    set={"bodyText.fontSize.value": 11},     # --set, one per key
    locale="es",                       # --locale
    chapters=range(1, 3),              # --chapters 1-2 (also 3, "1,3-5", [1, 3])
    resources="img/", fonts="fonts/",  # --resources, --fonts
    font_dirs=["~/Fonts"],             # --font-dir
    offline=True,                      # --offline: never download fonts
)
```

### Reports and warnings

A `Report` has `ok`, `command`, `version`, `exit_code`, `pages`, `book`
(name, id, locale, chapters), `outputs` (`Output`: kind, path, size,
pages), `warnings` (`Diagnostic`: kind, message, severity, at, page, data),
`timings` and `raw`, the whole JSON object. `InfoReport` adds `chapters`,
`resources` and `fonts`; `CheckReport` adds `passed`, `error_count`,
`warning_count`, `contrast`, `reflow` and `preflight`.

### Bytes out

`out="-"` (or `postext.STDOUT`) writes to stdout and returns the bytes in
`report.content`; `pdf_bytes`, `html_bytes`, `epub_bytes`, `image_bytes`,
`docx_bytes` and `pack_bytes` return them directly. A book given as bytes
with no `out` comes back as bytes.

### Errors

| Exception | When |
| --- | --- |
| `PostextError` | The command failed (exit code 1); `err.report` and `err.stderr` say why |
| `UsageError` | A wrong option or value (exit code 2) |
| `ProblemsFound` | `check` found an error (any warning with `strict`), or `import_docx` could not apply an edit (exit code 3); `raise_on_problems=False` returns the report instead |
| `BinaryNotFound` | No executable for this system, a failed download or checksum, or a `POSTEXT_BIN` that is not a file |

### One executable, many runs

`postext.Postext(binary=None, cwd=None, env=None, timeout=None, offline=None, font_dirs=None)`
has the same methods with its own executable, folder, environment and
timeout. `Postext().run(["build", "book/", "--pdf", "b.pdf", "--watch"], capture=False)`
runs any command as typed.

Each call starts the executable again. A mode that keeps one engine
running between calls is planned.

## Docs

- Command line: https://postext.dev/en/docs/command-line#python
- Source: https://github.com/drnachio/postext/tree/main/packages/postext-python

MIT licence.
