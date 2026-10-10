postext command line 1.25.2
===========================

One self-contained executable per system: no installation, no runtime and
no libraries. The postext engine, the PDF, EPUB, HTML and Word writers,
the page painter (Skia), the default fonts (EB Garamond, Open Sans) and the
print colour profiles are all inside.

Executables (115 to 140 MB each)
--------------------------------

  postext-macos-arm64          macOS, Apple silicon (M1 and later)
  postext-macos-x64            macOS, Intel
  postext-linux-x64            Linux x86-64 (glibc: Debian, Ubuntu, Fedora…)
  postext-linux-arm64          Linux ARM64 (glibc: Raspberry Pi OS 64-bit, Graviton…)
  postext-linux-x64-musl       Linux x86-64, musl (Alpine)
  postext-windows-x64.exe      Windows x64

Download the latest (every release of postext publishes them):

  https://github.com/drnachio/postext/releases/latest/download/<file>

  e.g. https://github.com/drnachio/postext/releases/latest/download/postext-linux-x64

or a given version: https://github.com/drnachio/postext/releases/tag/v1.25.2
SHA256SUMS lists the checksum of each file.

Install
-------

Linux and macOS:

  curl -fL -o postext https://github.com/drnachio/postext/releases/latest/download/postext-linux-x64
  chmod +x postext
  ./postext                       # prints the help
  sudo mv postext /usr/local/bin  # optional: run it from anywhere

Linux builds need only the C library every distribution has (glibc 2.27
or later; musl for Alpine, which also needs `apk add libstdc++ libgcc`).

macOS: a file downloaded with a browser is quarantined; clear the flag once:

  xattr -d com.apple.quarantine postext-macos-arm64

Windows (PowerShell):

  Invoke-WebRequest https://github.com/drnachio/postext/releases/latest/download/postext-windows-x64.exe -OutFile postext.exe
  .\postext.exe

With Node.js installed, `npx postext-cli` downloads and runs the right one.

Use
---

  postext                                   help
  postext help <command>                    options of a command
  postext pdf book.postext -o book.pdf      PDF
  postext html book.postext -o book.html    HTML (one self-contained file)
  postext epub book.postext -o book.epub    EPUB 3
  postext image book.postext --page 1 -o p1.png        one page as an image
  postext images book.postext -o pages/ --dpi 100      every page
  postext docx book.postext -o book.docx    Word
  postext import-docx draft.docx -o draft/  Word to a postext book
  postext pack book/ -o book.postext        folder (or Markdown files) to a bundle
  postext unpack book.postext -o book/      bundle to a folder
  postext info book.postext                 chapters, fonts, resources
  postext check book.postext --json         problems, as JSON for scripts and agents
  postext build book/ --pdf b.pdf --html b.html --watch   several outputs, rebuild on change

A book is a .postext file, an unpacked folder with its preset.json, or loose
Markdown files (one chapter each) with --config, --resources and --fonts.
Fonts the book does not carry are looked up in --font-dir folders, then
downloaded once from Google Fonts into ~/.cache/postext (--offline never
downloads).

Exit codes: 0 done, 1 failed, 2 wrong usage, 3 check found problems.

Docs: https://postext.dev/docs · Source: https://github.com/drnachio/postext
