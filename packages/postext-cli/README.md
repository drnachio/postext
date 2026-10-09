# postext-cli

**The [postext](https://postext.dev/) command line.**

`postext` turns a book written in Markdown into a PDF, HTML, an EPUB, page images or a Word file, from a terminal, a script or an agent. It is one self-contained executable per system: the Bun runtime, the postext engine, the PDF, EPUB, HTML and Word writers, the page painter (Skia), HarfBuzz, the default fonts (EB Garamond, Open Sans) and the ICC print profiles are all inside it. There is nothing to install.

## Get it

Every postext release attaches the executables to its [GitHub Release](https://github.com/drnachio/postext/releases/latest), with `SHA256SUMS` and [`readme.txt`](bin/readme.txt):

| File | System |
|---|---|
| `postext-macos-arm64` | macOS, Apple silicon |
| `postext-macos-x64` | macOS, Intel |
| `postext-linux-x64` | Linux x86-64 (glibc) |
| `postext-linux-arm64` | Linux ARM64 (glibc) |
| `postext-linux-x64-musl` | Linux x86-64, musl (Alpine: `apk add libstdc++ libgcc`) |
| `postext-windows-x64.exe` | Windows x64 |

```bash
curl -fL -o postext https://github.com/drnachio/postext/releases/latest/download/postext-linux-x64
chmod +x postext
./postext
```

With Node.js, `npx postext-cli` downloads the executable of your system from npm and runs it.

## Use

```bash
postext                                        # help
postext help pdf                               # options of a command
postext pdf book.postext -o book.pdf
postext pdf book/ --pdfx x4 --profile fogra51  # print-ready PDF/X-4
postext html book.postext -o book.html         # one self-contained page
postext epub book.postext --layout reflowable
postext image book.postext --page 12 -o p12.png
postext images book.postext --pages 1-10 -o pages/ --dpi 100 -f webp
postext docx book.postext -o book.docx
postext import-docx manuscript.docx -o manuscript/
postext pack book/ -o book.postext
postext unpack book.postext -o book/
postext info book.postext --pages
postext check book.postext --json
postext build book/ --pdf out/book.pdf --html out/book.html --watch
```

A book is any of:

- a `.postext` bundle, the file the [Sandbox](https://postext.dev/en/sandbox) exports and opens;
- an unpacked book folder, with its `preset.json`, chapters, resources and fonts;
- loose Markdown files, one chapter each, in the order given (a folder: its `.md` files by name), with an optional `--config` JSON, a `--resources` folder of pictures (each named by its file name, or described in a `resources.json`) and a `--fonts` folder.

`--set path=value` changes one setting without editing the book (`--set page.dpi=150`, `--set bodyText.fontFamily=Lora`), and `--chapters 2-4` lays out part of it.

### Fonts

A family the book does not carry is looked up in the `--font-dir` folders, then among the faces compiled in (EB Garamond, Open Sans), then in the cache, then downloaded once from Google Fonts into `~/.cache/postext` (`%LOCALAPPDATA%\postext\cache` on Windows; `POSTEXT_CACHE_DIR` or `--cache-dir` moves it). `--offline` never downloads. A family found nowhere is set in EB Garamond, with a warning, so the layout and the PDF still agree.

### Scripts and agents

- `--json` prints one JSON object on stdout: the outputs written, the page count, every warning (with the chapter file and line, and the page), and the time each step took. Messages go to stderr.
- Exit codes: `0` done, `1` failed, `2` wrong usage, `3` `check` found errors (or any warning with `--strict`).
- `-o -` writes a single output to stdout (`postext image book.postext -p 1 -o - | …`).
- `postext build` lays the book out once for several outputs, and `--watch` keeps the engine and the fonts loaded: a change is laid out again in a fraction of a second.

## Develop

```bash
pnpm --filter postext-cli start pdf book.postext      # run from the sources
pnpm --filter postext-cli test                        # bun test (units and end to end)
pnpm --filter postext-cli build:bin                   # every executable into bin/
pnpm --filter postext-cli build:bin --current         # this machine's only
sh scripts/smoke.sh bin/postext-macos-arm64           # smoke test an executable
```

`scripts/build-bin.ts` cross-compiles every target from one machine: it fetches Skia's native addon for each platform from npm and embeds it. The release workflow builds them, runs `scripts/smoke.sh` on Linux (glibc and Alpine), macOS and Windows runners, attaches them to the GitHub Release and publishes the npm packages (`scripts/npm-publish.mjs`).

## License

MIT. The embedded EB Garamond and Open Sans are under the SIL Open Font License ([`fonts/`](fonts/)).
