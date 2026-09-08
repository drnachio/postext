#!/usr/bin/env bash
# Dump the text of a reference PDF preserving the physical layout, so the
# markdown can be reconstructed by hand (headings, lists, captions...).
#
# usage: dump_text.sh <pdf> <out.txt> [first-page] [last-page]
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $(basename "$0") <pdf> <out.txt> [first-page] [last-page]" >&2
  exit 1
fi

pdf=$1
out=$2
first=${3:-}
last=${4:-}

if ! command -v pdftotext >/dev/null 2>&1; then
  echo "pdftotext not found (brew install poppler)" >&2
  exit 2
fi

args=(-layout)
[[ -n $first ]] && args+=(-f "$first")
[[ -n $last ]] && args+=(-l "$last")

mkdir -p "$(dirname "$out")"
pdftotext "${args[@]}" "$pdf" "$out"
echo "wrote $out ($(wc -l <"$out" | tr -d ' ') lines)"
