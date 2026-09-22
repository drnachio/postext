"""Turn a Wikipedia `extracts` plain-text article into markdown blocks with
a word budget: the lead paragraphs, then whole sections (level-2 headings
become `##`, level-3 `###`) until the budget is spent, skipping the
navigational sections (references, see also, gallery…).
"""
from __future__ import annotations

import re

SKIP = {
    "referencias", "véase también", "vease también", "enlaces externos", "bibliografía", "notas", "notas y referencias",
    "galería", "galería de imágenes", "lecturas adicionales", "lectura adicional",
    "references", "see also", "external links", "further reading", "notes", "gallery", "bibliography", "sources", "citations",
    "notes and references", "explanatory notes", "image gallery", "taxonomy", "taxonomía", "clasificación", "classification",
    "especies", "species", "géneros", "genera", "cladograma", "cladogram", "lista de géneros", "sistemática", "systematics",
    "subórdenes y familias", "familias", "families", "órdenes", "orders", "subfamilias", "subfamilies", "géneros y especies", "lista de especies", "list of species", "phylogeny", "filogenia",
}
HEADING = re.compile(r"^(=+)\s*(.+?)\s*=+$")
ZW = re.compile(r"[​‌‍﻿]")


GREEK = re.compile(r"[\u0370-\u03ff\u1f00-\u1fff]+")


def clean(text: str) -> str:
    text = ZW.sub("", text)
    # The bundle's fonts carry no Greek: drop etymological Greek runs and
    # the punctuation they leave behind ("(del griego , gastér…)").
    text = GREEK.sub("", text)
    text = re.sub(r"\(\s*[,;]\s*", "(", text)
    text = re.sub(r"\s*-\s+-", " -", text)
    text = re.sub(r"\(\s*\)", "", text)
    text = re.sub(r"\[\d+\]", "", text)
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    text = text.replace("*", "\\*").replace("_", "\\_")
    return re.sub(r"[ \t]+", " ", text).strip()


def to_markdown(extract: str, budget: int, *, drop_level3: bool = False) -> tuple[list[str], int]:
    """Returns (markdown blocks, words used)."""
    blocks: list[str] = []
    words = 0
    skipping = False
    section: list[str] = []
    section_words = 0

    def flush() -> bool:
        nonlocal words, section, section_words
        if not section:
            return True
        if words > 0 and words + section_words > budget * 1.15:
            section, section_words = [], 0
            return False
        blocks.extend(section)
        words += section_words
        section, section_words = [], 0
        return True

    for raw in extract.split("\n"):
        line = raw.strip()
        if not line:
            continue
        m = HEADING.match(line)
        if m:
            level = len(m.group(1))
            title = clean(m.group(2))
            if level <= 2:
                if not flush() or words >= budget:
                    break
                skipping = title.lower() in SKIP
                if not skipping:
                    section.append(f"## {title}")
            elif not skipping:
                if drop_level3:
                    continue
                section.append(f"### {title}")
            continue
        if skipping:
            continue
        text = clean(line)
        if len(text.split()) < 4:
            continue
        section.append(text)
        section_words += len(text.split())
    if words < budget:
        flush()
    # A heading left dangling at the end carries nothing: drop it.
    while blocks and blocks[-1].startswith("#"):
        blocks.pop()
    return blocks, words
