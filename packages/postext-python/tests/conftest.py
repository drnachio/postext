"""The tests run the real executable: ``POSTEXT_BIN`` when set, else the
release of this package's version, downloaded once into the cache
(``POSTEXT_CACHE_DIR`` moves it)."""

from pathlib import Path

import pytest

import postext


@pytest.fixture(scope="session")
def client() -> postext.Postext:
    exe = postext.find_binary()
    return postext.Postext(exe, offline=True)


@pytest.fixture()
def book(tmp_path: Path) -> Path:
    folder = tmp_path / "book"
    folder.mkdir()
    (folder / "01.md").write_text("---\ntitle: Smoke test\n---\n\n# One\n\nSome *text* and a formula $x^2$.\n", encoding="utf-8")
    (folder / "02.md").write_text("# Two\n\nMore text.\n", encoding="utf-8")
    return folder


@pytest.fixture()
def bundle(client: postext.Postext, book: Path, tmp_path: Path) -> Path:
    out = tmp_path / "book.postext"
    client.pack(book, out=out, auto_thumbnail=False)
    return out
