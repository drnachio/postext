"""Display formulas that are wider than their measure, broken into lines.

OpenStax sets its worked examples on a wide page; here a box in the main
column is about 105 mm wide and a long chain of equalities runs past its
edge (Postext does not break a display formula). `wide_formulas.json`
lists those formulas, by language, as the hash of their TeX with the
ratio of measure to width that a layout of the book measured. This module
breaks each of them where a textbook would: after the left-hand side, at
its relation signs (=, ≈, ⇒), lining the continuation rows up on the
sign, and inside a long right-hand side at its plus and minus signs. A
formula with nothing to break at (a line of text set in maths) is set a
size smaller instead.

To refresh the list after a change of design: lay the book out (the
postext-port skill's render.mjs) and list the `mathDisplay` blocks whose
`mathRender.widthPx` exceeds their `bbox.width`; key each by `key(tex)`.
"""
from __future__ import annotations

import hashlib
import re

RELATIONS = ("=", "\\approx", "\\Rightarrow")
SUMS = ("+", "-", "−")


def key(tex: str) -> str:
    return hashlib.sha1(tex.strip().encode("utf-8")).hexdigest()[:12]


# --- reading TeX ----------------------------------------------------------------

def _tokens(s: str) -> list[str]:
    """Commands (\\name, \\{ \\\\ …), single characters."""
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c == "\\":
            m = re.match(r"\\([A-Za-z]+|.)", s[i:])
            tok = m.group(0) if m else c
            out.append(tok)
            i += len(tok)
        else:
            out.append(c)
            i += 1
    return out


def _split(s: str, ops: tuple[str, ...], *, sums: bool = False) -> list[tuple[str, str]]:
    """`s` cut at the operators `ops` that stand at its top level (outside
    braces, environments, \\left…\\right and brackets): [(op, piece), …],
    the first op empty. A sign right after another operator, an opening
    bracket or at the start is a unary sign, not a cut."""
    parts: list[tuple[str, str]] = [("", "")]
    depth = 0
    prev = ""
    for tok in _tokens(s):
        if tok in ("{", "\\left", "\\begin", "(", "["):
            depth += 1
        elif tok in ("}", "\\right", "\\end", ")", "]"):
            depth -= 1
        if depth == 0 and tok in ops:
            unary = sums and (parts[-1][1].strip() == "" or prev in RELATIONS + SUMS + ("(", "[", "{", "&", "\\times", "\\cdot"))
            if not unary:
                parts.append((tok, ""))
                prev = tok
                continue
        op, piece = parts[-1]
        parts[-1] = (op, piece + tok)
        if tok.strip() and tok not in ("\\,", "\\;", "\\ "):
            prev = tok
    return parts


def _group(s: str, i: int) -> tuple[str, int]:
    """The braced group (or single token) starting at s[i]."""
    while i < len(s) and s[i] == " ":
        i += 1
    if i < len(s) and s[i] == "{":
        depth = 0
        for j in range(i, len(s)):
            if s[j] == "\\":
                continue
            if s[j] == "{" and (j == 0 or s[j - 1] != "\\"):
                depth += 1
            elif s[j] == "}" and s[j - 1] != "\\":
                depth -= 1
                if depth == 0:
                    return s[i + 1:j], j + 1
        return s[i + 1:], len(s)
    if i < len(s) and s[i] == "\\":
        m = re.match(r"\\([A-Za-z]+|.)", s[i:])
        return m.group(0), i + len(m.group(0))
    return s[i:i + 1], i + 1


ZERO = {"\\left", "\\right", "\\begin", "\\end", "\\displaystyle", "\\cancel", "\\vec", "\\hat", "\\mathbf", "\\mathrm", "\\text", "\\unicode"}
WIDE = {"\\times": 1.6, "\\cdot": 1.2, "\\approx": 1.8, "\\Rightarrow": 2.2, "\\sum": 1.6, "\\quad": 1.0, "\\,": 0.2, "\\;": 0.3, "\\ ": 0.3}


def width(s: str) -> float:
    """A rough width of TeX in letter widths: enough to share a measured
    width out among the pieces of one formula."""
    w, i = 0.0, 0
    while i < len(s):
        c = s[i]
        if c == "\\":
            m = re.match(r"\\([A-Za-z]+|.)", s[i:])
            cmd = m.group(0)
            i += len(cmd)
            if cmd == "\\frac":
                a, i = _group(s, i)
                b, i = _group(s, i)
                w += max(width(a), width(b)) + 0.6
            elif cmd == "\\sqrt":
                a, i = _group(s, i)
                w += width(a) + 1.2
            elif cmd in ("\\begin", "\\end"):
                _, i = _group(s, i)
                if cmd == "\\begin" and i < len(s) and s[i] == "{":
                    _, i = _group(s, i)  # column spec
            elif cmd == "\\unicode":
                _, i = _group(s, i)
                w += 1
            elif cmd in ZERO:
                continue
            elif cmd in WIDE:
                w += WIDE[cmd]
            elif cmd == "\\\\":
                continue
            else:
                w += 1
        elif c in "^_":
            a, i = _group(s, i + 1)
            w += 0.6 * width(a)
        elif c == "{":
            a, i = _group(s, i)
            w += width(a)
        elif c in "=":
            w += 1.8
            i += 1
        elif c in "+-−":
            w += 1.6
            i += 1
        elif c in " &}":
            i += 1
        elif c == ",":
            w += 0.3
            i += 1
        else:
            w += 1
            i += 1
    return w


# --- breaking -------------------------------------------------------------------

def _chain_rows(parts: list[tuple[str, str]], indent: float, budget: float, first_room: float) -> list[list[tuple[str, str]]]:
    """Pack (op, piece) parts into rows: the first row has `first_room`, the
    others `budget - indent`. A part too wide for a row of its own is cut
    at its plus and minus signs; its turnovers are marked op '+cont'."""
    rows: list[list[tuple[str, str]]] = [[]]
    room = first_room
    used = 0.0
    for op, piece in parts:
        pw = width(op) + width(piece) if op else width(piece)
        # A conclusion (⇒) starts a row of its own.
        if rows[-1] and (used + pw > room or op == "\\Rightarrow"):
            rows.append([])
            room, used = budget - indent, 0.0
        if pw > room and op:
            subs = _split(piece, SUMS, sums=True)
            first = True
            for sop, sp in subs:
                sw = width(sop) + width(sp) + (1.0 if not first else 0)
                if not first and used + sw > room:
                    rows.append([])
                    room, used = budget - indent, 1.0
                    rows[-1].append(("+cont", sop + " " + sp))
                else:
                    rows[-1].append((op if first else "", (sop + " " if sop else "") + sp))
                used += sw
                first = False
            continue
        rows[-1].append((op, piece))
        used += pw
    return [r for r in rows if r]


def _row_tex(row: list[tuple[str, str]], cols: int) -> str:
    """One output row after the left-hand side: the first relation goes
    into its alignment cell (aligned: `&=`; array lll: `& = &`)."""
    out = ""
    for k, (op, piece) in enumerate(row):
        if op == "+cont":
            out += ("& & \\quad " if cols == 3 else "&\\quad ") + piece
        elif k == 0:
            out += (f"& {op} & " if cols == 3 else f"&{op} ") + piece
        else:
            out += (f"{op} " if op else "") + piece
    return out


def _fit_chain(tex: str, ratio: float) -> str | None:
    parts = _split(tex, RELATIONS)
    if len(parts) < 3:
        return None
    lhs = parts[0][1]
    total = width(tex)
    budget = total * ratio * 0.95
    rows = _chain_rows(parts[1:], width(lhs), budget, budget - width(lhs))
    if len(rows) < 2:
        return None
    lines = [lhs + " " + _row_tex(rows[0], 2)] + [_row_tex(r, 2) for r in rows[1:]]
    return "\\begin{aligned}" + " \\\\ ".join(lines) + "\\end{aligned}"


ARRAY_RE = re.compile(r"^(?P<pre>\\\{)?\\begin\{array\}\{(?P<spec>l{1,3})\}(?P<body>.*)\\end\{array\}(?P<post>.*)$", re.S)


def _split_rows(body: str) -> list[str]:
    rows, depth, cur = [], 0, ""
    for tok in _tokens(body):
        if tok in ("{", "\\begin"):
            depth += 1
        elif tok in ("}", "\\end"):
            depth -= 1
        if tok == "\\\\" and depth == 0:
            rows.append(cur)
            cur = ""
        else:
            cur += tok
    rows.append(cur)
    return [r.strip() for r in rows]


def _cells(row: str) -> list[str]:
    cells, depth, cur = [], 0, ""
    for tok in _tokens(row):
        if tok in ("{", "\\begin"):
            depth += 1
        elif tok in ("}", "\\end"):
            depth -= 1
        if tok == "&" and depth == 0:
            cells.append(cur)
            cur = ""
        else:
            cur += tok
    cells.append(cur)
    return [c.strip() for c in cells]


def _fit_array(tex: str, ratio: float) -> str | None:
    m = ARRAY_RE.match(tex.strip())
    if not m:
        return None
    pre, spec, body, post = m.group("pre") or "", m.group("spec"), m.group("body"), m.group("post")
    rows = [_cells(r) for r in _split_rows(body)]
    post_s = post.strip()
    # A conclusion after a system of equations (⇒ (x, y) = …) goes onto a
    # line of its own under it.
    tail = None
    if pre and re.match(r"^(\\,)*\s*\\Rightarrow", post_s):
        tail, post_s = post_s, ""
    if spec == "l":
        # A system, one equation a row: x = a = b becomes x & = a \\ & = b.
        split_rows = [_split(r[0], RELATIONS) for r in rows]
        if any(len(p) < 2 for p in split_rows):
            return None
        lhs_w = max(width(p[0][1]) for p in split_rows)
        total = max(width(r[0]) for r in rows) + width(pre) + width(post)
        budget = total * ratio * 0.95
        out_rows = []
        for parts in split_rows:
            if len(parts) < 2:
                out_rows.append(parts[0][1])
                continue
            packed = _chain_rows(parts[1:], lhs_w, budget - width(pre), budget - width(pre) - lhs_w)
            out_rows.append(parts[0][1] + " " + _row_tex(packed[0], 2))
            out_rows += [_row_tex(r, 2) for r in packed[1:]]
        inner = pre + "\\begin{array}{ll} " + " \\\\ ".join(out_rows) + " \\end{array}" + (" " + post_s if post_s else "")
    else:
        cols = len(spec)
        lhs_w = max(width(r[0]) for r in rows)
        total = max(width("".join(r)) for r in rows) + width(pre) + width(post)
        budget = total * ratio * 0.95
        out_rows = []
        for r in rows:
            r = r + [""] * (cols - len(r))
            rest = r[1] if cols == 2 else (r[1] + r[2])
            parts = _split(rest, RELATIONS)
            if not parts[0][1].strip() and len(parts) > 1:
                parts = parts[1:]
            if cols == 3 and not r[1].strip():
                # a turnover row of a sum, "& & + …": cut at its signs
                subs = [(op, p) for op, p in _split(r[2], SUMS, sums=True) if op or p.strip()]
                packed = _chain_rows(subs, lhs_w, budget, budget - lhs_w)
                out_rows += [(r[0] if k == 0 else "") + " & & " + ("\\quad " if k else "") + " ".join(f"{op} {p}" if op != "+cont" else p for op, p in row) for k, row in enumerate(packed)]
                continue
            packed = _chain_rows(parts, lhs_w, budget, budget - lhs_w)
            out_rows.append(r[0] + " " + _row_tex(packed[0], cols))
            out_rows += [_row_tex(p, cols) for p in packed[1:]]
        inner = pre + f"\\begin{{array}}{{{spec}}} " + " \\\\ ".join(out_rows) + " \\end{array}" + (" " + post_s if post_s else "")
    if tail is not None:
        return "\\begin{gathered}" + inner + " \\\\ " + tail + "\\end{gathered}"
    return inner


def fit(tex: str, ratio: float, small: bool = False) -> str:
    out = _fit_array(tex, ratio) or _fit_chain(tex, ratio)
    if out is None or small:
        # Nothing to break at, or still too wide once broken: a size smaller.
        return "{\\small " + (out or tex) + "}"
    return out
