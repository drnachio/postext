# postext for Rust

Typeset books from Rust with [Postext](https://postext.dev/): a print-ready
PDF, HTML pages, an EPUB, page images, a Word document or an InDesign package
from a `.postext` book, a book folder or loose Markdown files.

```bash
cargo add postext
```

```rust
let report = postext::pdf("book.postext").out("book.pdf").set("page.dpi", 300).run()?;
println!("{} pages", report.output().and_then(|o| o.pages).unwrap_or(0));
for warning in &report.warnings {
    eprintln!("{warning}"); // warning missingFont (chapters/02.md:14): …
}

let pdf: Vec<u8> = postext::pdf(std::fs::read("book.postext")?).bytes()?; // bytes in, bytes out
```

The crate drives the self-contained `postext` command line, the same
executable as `brew install drnachio/postext/postext`, `npx postext-cli` or
`pip install postext`: the layout is the Sandbox's, and the same book breaks
into the same pages. The executable of your system (185 to 230 MB, too large
for a crate) is downloaded on first use from the GitHub Release of the
crate's version, checked against the release's `SHA256SUMS` and kept in the
cache. Nothing is downloaded at build time, so offline builds and docs.rs
work.

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

The Python package uses the same cache, so the two share one download.
`postext::Download` fetches an executable ahead of time (in a Docker build
step, say). Without the default feature `download`, the crate never
downloads: it runs `POSTEXT_BIN` or an executable already in the cache.

## Commands

Every command of the command line is a builder: a function of the same name
makes it, its options are methods, `.run()` runs it with `--json` and
returns its report, and `.bytes()` returns the file instead.

| Function | Command | Report |
| --- | --- | --- |
| `pdf(book)` `.out` `.pdfx` `.profile` `.color_space` `.accessible` | `postext pdf` | `Report` |
| `html(book)` `.out` `.mode` `.assets` | `postext html` | `Report` |
| `epub(book)` `.out` `.layout` `.cover` | `postext epub` | `Report` |
| `image(book, "#1")` `.out` `.dpi` `.format` `.quality` | `postext image` | `ImageReport` |
| `images(book)` `.out` `.pages` `.pattern` `.dpi` | `postext images` | `Report` |
| `docx(book)` `.out` `.variant` `.embed_fonts` | `postext docx` | `Report` |
| `import_docx(docx)` `.out` `.into_book` `.dry_run` | `postext import-docx` | `ImportDocxReport` |
| `idml(book)` `.out` `.images` `.lines` `.spreads` `.fonts` | `postext idml` | `Report` |
| `import_idml(idml)` `.out` `.layout` `.links` `.document` | `postext import-idml` | `ImportIdmlReport` |
| `pack(book)` `.out` / `unpack(bundle)` `.out` | `postext pack` / `unpack` | `Report` / `UnpackReport` |
| `design(book)` `.out` `.parts` `.design_name` | `postext design` | `DesignReport` |
| `info(book)` `.pages` | `postext info` | `InfoReport` |
| `check(book)` `.strict` `.preflight` `.allow_problems` | `postext check` | `CheckReport` |
| `build(book)` `.pdf` `.html` `.epub` `.images` `.docx` `.idml` | `postext build` | `Report` |

A book is a path (a `.postext` file, a book folder, a Markdown file), a list
of Markdown files (the chapters, in order), or the bytes of a `.postext`
bundle. The commands that read a book take the book options:

```rust
use serde_json::json;

postext::pdf(["01.md", "02.md"])
    .out("notes.pdf")
    .name("Notes")                                       // --name
    .config_json(&json!({"page": {"sizePreset": "A5"}})) // --config (or .config("config.json"))
    .set("bodyText.fontSize.value", 11)                  // --set, one per key
    .locale("es")                                        // --locale
    .chapters(1..=2)                                     // --chapters 1-2 (also 3, "1,3-5", [1, 3])
    .resources("img/")                                   // --resources
    .fonts("fonts/")                                     // --fonts
    .font_dir("/Library/Fonts")                          // --font-dir
    .offline(true)                                       // --offline: never download fonts
    .design("novel.postext")                             // --design: a design file (a path or bytes), or another book
    .design_parts(["page", "text"])                      // --design-parts page,text
    .composition("auto")                                 // --composition: the book's language's rules (or "es", "en-GB"…)
    .run()?;
```

`design(book).out("novel.postext").parts(["page", "text", "headings"])`
takes a book's design into a design file, and `.design(…)` puts it on any
other book. In `idml`, `.fonts(true)` is the switch that writes the font
files beside the package, not the book option.

### Reports and warnings

A `Report` has `ok`, `command`, `version`, `exit_code`, `pages`, `book`
(name, id, locale, chapters), `outputs` (`Output`: kind, path, size, pages),
`warnings` (`Diagnostic`: kind, message, severity, at, page, data),
`timings` and `raw`, the whole JSON object. `InfoReport` adds `chapters`,
`resources` and `fonts`; `CheckReport` adds `passed`, `error_count`,
`warning_count`, `contrast`, `reflow` and `preflight`; `DesignReport` adds
`name` and `parts`; `ImportIdmlReport` adds `layout`, `reason`, `chapters`,
`quality`, `fonts`, `missing_links` and `package`. Each of them dereferences
to `Report`.

### Bytes out

`.out("-")` (or `postext::STDOUT`) writes to stdout and returns the bytes in
`report.content`; `.bytes()` returns them directly (`idml` with linked
pictures or `.fonts(true)` needs a file). A book given as bytes with no
`out` comes back as bytes.

### Errors

| `postext::Error` | When |
| --- | --- |
| `Failed` | The command failed (exit code 1); `err.report()` and the failure's `stderr` say why |
| `Usage` | A wrong option or value (exit code 2) |
| `ProblemsFound` | `check` found an error (any warning with `strict`), or `import_docx` could not apply an edit (exit code 3); `.allow_problems()` returns the report instead |
| `BinaryNotFound` | No executable for this system, a failed download or checksum, or a `POSTEXT_BIN` that is not a file |
| `InvalidArgument` | Found before the run: a book given as bytes to a command that needs `out`, an empty range of chapters |
| `Timeout` | The run took longer than the client's timeout |
| `Io` | Starting the executable or writing a temporary file failed |

### One executable, many runs

`postext::Postext::new()` (or `Postext::with_binary(path)`) has the same
methods with its own executable, folder (`.cwd`), environment (`.env`),
timeout (`.timeout`) and defaults (`.offline`, `.font_dir`).
`Postext::new().run_inherit(["build", "book/", "--pdf", "b.pdf", "--watch"])`
runs any command as typed, its output on the terminal.

Each call starts the executable again.

## Docs

- API: https://docs.rs/postext
- Command line: https://postext.dev/en/docs/command-line#rust
- Source: https://github.com/drnachio/postext/tree/main/packages/postext-rust

MIT licence.
