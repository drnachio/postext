#!/bin/sh
# Rebuild icc/fogra51.icc and icc/fogra52.icc from Fogra's characterization
# data (https://www.color.org/chardata/FOGRA51.txt, FOGRA52.txt, converted to
# Argyll's CTI3 format in this folder) with ArgyllCMS (`brew install
# argyll-cms`). The black generation matches colord's FOGRA profiles.
set -e
cd "$(dirname "$0")"
for n in FOGRA51 FOGRA52; do
  attrs=""
  [ "$n" = FOGRA52 ] && attrs="-Z m"
  colprof -v0 -qm $attrs -kp 0.0 0.3 0.94 0.94 0.48 -l300 -A "postext" \
    -D "$n (postext, CC0)" -C "This profile is free of known copyright restrictions" "$n"
  lower=$(echo "$n" | tr '[:upper:]' '[:lower:]')
  mv "$n.icc" "../../icc/$lower.icc"
done
cp ../../icc/*.icc ../../../../apps/web/public/icc/
