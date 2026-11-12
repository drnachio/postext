"""The arguments of the command line, built from Python values, and the
reading of what the executable prints back."""

from __future__ import annotations

import contextlib
import json
import os
import tempfile
from pathlib import Path
from typing import (
    TYPE_CHECKING,
    Any,
    Dict,
    Iterable,
    List,
    Mapping,
    Optional,
    Sequence,
    Tuple,
    Union,
)

if TYPE_CHECKING:
    from typing_extensions import TypedDict

    from ._report import Report

PathLike = Union[str, "os.PathLike[str]"]
#: A book: a ``.postext`` file, a book folder, a Markdown file, or the
#: bytes of a ``.postext`` bundle.
BookInput = Union[PathLike, bytes]
Books = Union[BookInput, Sequence[BookInput]]
Chapters = Union[int, str, range, Sequence[Union[int, str, range]]]
Settings = Union[Mapping[str, Any], Sequence[str]]

#: ``out="-"`` (or ``STDOUT``): the command writes to stdout and the bytes
#: come back in ``Report.content``.
STDOUT = "-"

if TYPE_CHECKING:

    class IdmlOptions(TypedDict, total=False):
        """The book options but ``fonts``, which ``idml`` takes as a switch of its own."""

        locale: str
        """Language to read a multilingual book in (``es``, ``en``, ``pt-BR``…)."""
        chapters: Chapters
        """Chapters to lay out, from 1: ``3``, ``"1,3-5"``, ``[1, 3]``, ``range(1, 4)``."""
        set: Settings
        """Settings to change: ``{"page.dpi": 300, "bodyText.fontSize.value": 11}``."""
        design: BookInput
        """A design file (``.postext`` from ``design`` or the Sandbox), or another book, whose design the book is set in."""
        design_parts: Union[str, Sequence[str]]
        """With ``design``: only these parts, ``"page,text,headings"`` or ``["page", "text"]``."""
        config: Union[PathLike, Mapping[str, Any]]
        """Configuration JSON (a file, or a dict) for loose Markdown, or merged over a book's."""
        resources: PathLike
        """Pictures folder for loose Markdown."""
        name: str
        """Book title for loose Markdown."""
        font_dirs: Union[PathLike, Sequence[PathLike]]
        """Extra folders to look for fonts the book does not carry."""
        offline: bool
        """Never download fonts from Google Fonts."""
        cache_dir: PathLike
        """Where downloaded fonts are kept."""

    class BookOptions(IdmlOptions, total=False):
        """Options of every command that reads a book."""

        fonts: PathLike
        """Font files bundled with loose Markdown."""


BOOK_KEYS = (
    "locale",
    "chapters",
    "set",
    "design",
    "design_parts",
    "config",
    "resources",
    "fonts",
    "name",
    "font_dirs",
    "offline",
    "cache_dir",
)


def chapters_arg(value: Chapters) -> str:
    def one(v: Union[int, str, range]) -> str:
        if isinstance(v, range):
            if v.step != 1 or len(v) == 0:
                raise ValueError(f"chapters: {v!r} is not a run of chapters")
            return f"{v.start}-{v.stop - 1}" if len(v) > 1 else str(v.start)
        return str(v)

    if isinstance(value, (int, str, range)):
        return one(value)
    return ",".join(one(v) for v in value)


def parts_arg(value: Union[str, Sequence[str]]) -> str:
    """Design parts: ``"page,text"`` as given, a list joined with commas."""
    return value if isinstance(value, str) else ",".join(value)


def setting_arg(value: Any) -> str:
    """A ``--set`` value: the command line reads it as JSON when it parses
    (numbers, booleans, lists, objects), else as text."""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def settings_args(value: Settings) -> List[str]:
    if isinstance(value, Mapping):
        return [f"{k}={setting_arg(v)}" for k, v in value.items()]
    if isinstance(value, str):
        return [value]
    return [str(v) for v in value]


def flag(name: str, value: Optional[bool]) -> List[str]:
    if value is None:
        return []
    return [f"--{name}" if value else f"--no-{name}"]


def opt(name: str, value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, bool):
        return flag(name, value)
    return [f"--{name}", os.fspath(value) if isinstance(value, os.PathLike) else str(value)]


def many(value: Union[PathLike, Sequence[PathLike], None]) -> List[str]:
    if value is None:
        return []
    if isinstance(value, (str, os.PathLike)):
        return [os.fspath(value)]
    return [os.fspath(v) for v in value]


def split_stdout(stdout: bytes, want_content: bool) -> Tuple[Optional[Dict[str, Any]], Optional[bytes]]:
    """The JSON report and, with ``-o -``, the bytes before it. The report is
    the last thing on stdout and opens with ``{\\n  "ok": ``; no nested key
    sits at that indentation, so its last occurrence is the report's start."""
    start = stdout.rfind(b'{\n  "ok": ') if want_content else 0
    if want_content and start == -1:
        return None, stdout
    text = stdout[start:].decode("utf-8", "replace").strip()
    if not text:
        return None, stdout[:start] if want_content else None
    try:
        report = json.loads(text)
    except ValueError:
        return None, stdout if want_content else None
    return (report if isinstance(report, dict) else None), (stdout[:start] if want_content else None)


def stderr_error(stderr: str) -> str:
    lines = [ln for ln in stderr.splitlines() if ln.strip()]
    errors = [ln[6:] if ln.startswith("error ") else ln for ln in lines if ln.startswith("error")]
    return "; ".join(errors) or (lines[-1] if lines else "postext failed")


def content(report: "Report") -> bytes:
    return report.content or b""


class Temp(contextlib.AbstractContextManager):  # type: ignore[type-arg]
    """A temporary folder for the books given as bytes and the settings
    given as dicts, removed after the run."""

    def __init__(self) -> None:
        self._dir: "Optional[tempfile.TemporaryDirectory[str]]" = None
        self._count = 0
        self.used = False

    def write(self, name: str, data: bytes) -> str:
        if self._dir is None:
            self._dir = tempfile.TemporaryDirectory(prefix="postext-")
        self._count += 1
        path = Path(self._dir.name) / f"{self._count}-{name}"
        path.write_bytes(data)
        return str(path)

    def file(self, value: Union[PathLike, bytes], name: str) -> str:
        """A path as given, or bytes written to a file called ``name``
        (which does not count as a book given as bytes)."""
        if isinstance(value, (bytes, bytearray)):
            return self.write(name, bytes(value))
        return os.fspath(value)

    def inputs(self, books: Books, suffix: str) -> List[str]:
        items: Iterable[BookInput]
        if isinstance(books, (str, bytes, bytearray, os.PathLike)):
            items = [books]
        else:
            items = books
        out: List[str] = []
        for item in items:
            if isinstance(item, (bytes, bytearray)):
                self.used = True
                out.append(self.write(f"book{suffix}", bytes(item)))
            else:
                out.append(os.fspath(item))
        if not out:
            raise ValueError("no book given")
        return out

    def __exit__(self, *exc: Any) -> None:
        if self._dir is not None:
            self._dir.cleanup()
