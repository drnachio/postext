#!/usr/bin/env python3
"""The top-level keys of a Postext config, read from the engine's types.

    config_keys.py [--types packages/postext/src/types/config.ts] [--write]

Reads `export interface PostextConfig { … }` in the engine's `types/config.ts` and
prints its keys; `--write` stores them in `config_keys.json` beside this
script, the list `lint_project.py` checks a config's keys against (the
skill ships without the engine, so the list travels with it). Run it with
`--write` in a Postext checkout after a release adds a setting;
`tests/test_config_keys.py` fails while the engine has a key the list
lacks.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEYS_FILE = HERE / "config_keys.json"
# scripts -> postext-port -> skills -> postext -> plugins -> repository
DEFAULT_TYPES = HERE.parents[4] / "packages" / "postext" / "src" / "types" / "config.ts"
_OPEN_RE = re.compile(r"^export interface PostextConfig\s*\{\s*$")
_KEY_RE = re.compile(r"^  ([A-Za-z_][A-Za-z0-9_]*)\??\s*:")


def engine_keys(types_ts: Path = DEFAULT_TYPES) -> list[str]:
    """The keys of PostextConfig, in source order."""
    keys: list[str] = []
    inside = False
    for line in types_ts.read_text(encoding="utf-8").splitlines():
        if not inside:
            inside = bool(_OPEN_RE.match(line))
            continue
        if line.startswith("}"):
            return keys
        m = _KEY_RE.match(line)
        if m and m.group(1) not in keys:
            keys.append(m.group(1))
    raise SystemExit(f"{types_ts}: no `export interface PostextConfig {{ … }}`")


def known_keys() -> set[str]:
    """The stored list (config_keys.json)."""
    return set(json.loads(KEYS_FILE.read_text(encoding="utf-8"))["keys"])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--types", type=Path, default=DEFAULT_TYPES, help="the engine's types/config.ts")
    ap.add_argument("--write", action="store_true", help=f"store the keys in {KEYS_FILE.name}")
    args = ap.parse_args()
    keys = engine_keys(args.types)
    if args.write:
        KEYS_FILE.write_text(json.dumps({"source": "packages/postext/src/types/config.ts PostextConfig", "keys": keys},
                                        indent=1) + "\n", encoding="utf-8")
        print(f"wrote {KEYS_FILE.name}: {len(keys)} keys", file=sys.stderr)
    else:
        print("\n".join(keys))


if __name__ == "__main__":
    main()
