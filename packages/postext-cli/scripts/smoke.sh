#!/bin/sh
# Smoke test of a built executable, on the system it was built for (the
# release workflow runs it on Linux, macOS, Windows and Alpine runners):
# help, a PDF, a page image, a bundle round trip and a Word export, with
# nothing but the executable.
#
#   sh scripts/smoke.sh path/to/postext
set -eu
BIN=$1
WORK=$(mktemp -d)
case "$BIN" in
  *.exe) P="$WORK/postext.exe" ;;
  *) P="$WORK/postext" ;;
esac
cp "$BIN" "$P"
chmod +x "$P"
cd "$WORK"
export POSTEXT_CACHE_DIR="$WORK/.cache"

"$P" --version
"$P" > help.txt
grep -q "Usage" help.txt

mkdir -p book
printf -- '---\ntitle: Smoke test\n---\n\n# One\n\nSome *text* and a formula $x^2$.\n' > book/01.md
printf '# Two\n\nMore text.\n' > book/02.md

"$P" pdf book -o book.pdf --offline
head -c 5 book.pdf | grep -q '%PDF-'
"$P" image book --page "#1" -o p1.png --dpi 40 --offline
[ -s p1.png ]
"$P" html book -o book.html --offline -q
grep -q '<!doctype html>' book.html
"$P" pack book -o book.postext -q
"$P" unpack book.postext -o unpacked -q
[ -f unpacked/preset.json ]
"$P" docx book.postext -o book.docx -q
[ -s book.docx ]
"$P" check book --offline --json > check.json
grep -q '"ok": true' check.json
echo "smoke test passed: $(uname -s 2>/dev/null || echo windows) $("$P" --version)"
