"""The ``--json`` report of a command, as Python objects.

Every command prints one JSON object: ``ok``, ``command``, ``version``,
``outputs``, ``warnings``, ``timings``, ``exitCode`` (and ``error`` when it
failed), plus fields of its own (``pages`` and ``book`` for the commands
that lay a book out, ``chapters`` and ``fonts`` for ``info``, ``check`` for
``check``…). ``Report.raw`` keeps the whole object, so a field this package
does not name yet is still there.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Type, TypeVar


def _int(value: Any) -> Optional[int]:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _str(value: Any) -> Optional[str]:
    return value if isinstance(value, str) else None


def _dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


@dataclass(frozen=True)
class Diagnostic:
    """A warning, error or note the command reported.

    ``kind`` names the problem (``missingFont``, ``unknownConfigKey``,
    ``frameOverflow``, ``preflight.lowResolution``…); ``at`` is where in the
    sources (``chapters/02.md:14``) and ``page`` the page label, when known.
    """

    kind: str
    message: str
    severity: str = "warning"
    at: Optional[str] = None
    page: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

    @property
    def is_error(self) -> bool:
        return self.severity == "error"

    @classmethod
    def from_json(cls, d: Mapping[str, Any]) -> "Diagnostic":
        page = d.get("page")
        return cls(
            kind=str(d.get("kind", "")),
            message=str(d.get("message", "")),
            severity=str(d.get("severity", "warning")),
            at=_str(d.get("at")),
            page=str(page) if page is not None else None,
            data=d.get("data") if isinstance(d.get("data"), dict) else None,
        )

    def __str__(self) -> str:
        where = ", ".join(x for x in (self.at, f"page {self.page}" if self.page else None) if x)
        return f"{self.severity} {self.kind}{f' ({where})' if where else ''}: {self.message}"


@dataclass(frozen=True)
class Output:
    """A file or folder the command wrote (``path`` is ``"-"`` for stdout)."""

    kind: str
    path: str
    size: Optional[int] = None
    pages: Optional[int] = None

    @classmethod
    def from_json(cls, d: Mapping[str, Any]) -> "Output":
        return cls(kind=str(d.get("kind", "")), path=str(d.get("path", "")), size=_int(d.get("bytes")), pages=_int(d.get("pages")))


@dataclass(frozen=True)
class BookSummary:
    """The book a command read. ``chapters`` is the number of chapters laid
    out (``info`` lists them in :attr:`InfoReport.chapters` instead)."""

    name: str
    id: str
    locale: Optional[str] = None
    kind: Optional[str] = None
    chapters: Optional[int] = None
    description: Optional[str] = None
    locales: Optional[List[str]] = None
    page_size: Optional[str] = None

    @classmethod
    def from_json(cls, d: Mapping[str, Any]) -> "BookSummary":
        locales = d.get("locales")
        return cls(
            name=str(d.get("name", "")),
            id=str(d.get("id", "")),
            locale=_str(d.get("locale")),
            kind=_str(d.get("kind")),
            chapters=_int(d.get("chapters")),
            description=_str(d.get("description")),
            locales=[str(x) for x in locales] if isinstance(locales, list) else None,
            page_size=_str(d.get("pageSize")),
        )


R = TypeVar("R", bound="Report")


@dataclass(frozen=True)
class Report:
    """What a command did: its outputs, warnings, timings and page count.

    ``content`` holds the bytes the command wrote to stdout (``out="-"``),
    ``stderr`` its terminal log and ``raw`` the whole JSON object.
    """

    ok: bool
    command: str
    version: str
    exit_code: int
    outputs: List[Output] = field(default_factory=list)
    warnings: List[Diagnostic] = field(default_factory=list)
    timings: Dict[str, float] = field(default_factory=dict)
    error: Optional[str] = None
    pages: Optional[int] = None
    book: Optional[BookSummary] = None
    raw: Dict[str, Any] = field(default_factory=dict, repr=False)
    content: Optional[bytes] = field(default=None, repr=False)
    stderr: str = field(default="", repr=False)

    @property
    def output(self) -> Optional[Output]:
        """The first output, for the commands that write one file."""
        return self.outputs[0] if self.outputs else None

    @property
    def errors(self) -> List[Diagnostic]:
        """The warnings of severity ``error``."""
        return [w for w in self.warnings if w.is_error]

    @classmethod
    def _extra(cls, d: Mapping[str, Any]) -> Dict[str, Any]:
        return {}

    @classmethod
    def from_json(cls: Type[R], d: Mapping[str, Any], *, content: Optional[bytes] = None, stderr: str = "") -> R:
        timings = _dict(d.get("timings"))
        book = d.get("book")
        return cls(
            ok=bool(d.get("ok")),
            command=str(d.get("command", "")),
            version=str(d.get("version", "")),
            exit_code=_int(d.get("exitCode")) or 0,
            outputs=[Output.from_json(o) for o in d.get("outputs") or [] if isinstance(o, dict)],
            warnings=[Diagnostic.from_json(w) for w in d.get("warnings") or [] if isinstance(w, dict)],
            timings={k: float(v) for k, v in timings.items() if isinstance(v, (int, float))},
            error=_str(d.get("error")),
            pages=_int(d.get("pages")),
            book=BookSummary.from_json(book) if isinstance(book, dict) else None,
            raw=dict(d),
            content=content,
            stderr=stderr,
            **cls._extra(d),
        )


@dataclass(frozen=True)
class ChapterInfo:
    index: int
    title: str
    words: int
    file: Optional[str] = None
    pages: Optional[int] = None


@dataclass(frozen=True)
class FontInfo:
    """A font family the book uses: where its faces come from (``embedded``,
    ``book``, ``font-dir``, ``google``, ``missing``…) and its variants
    (``400``, ``400i``, ``700``…)."""

    family: str
    source: str
    variants: List[str]


@dataclass(frozen=True)
class InfoReport(Report):
    """``info``: the book's chapters, resources by kind and fonts."""

    chapters: List[ChapterInfo] = field(default_factory=list)
    resources: Dict[str, int] = field(default_factory=dict)
    fonts: List[FontInfo] = field(default_factory=list)
    files: Optional[int] = None

    @classmethod
    def _extra(cls, d: Mapping[str, Any]) -> Dict[str, Any]:
        resources = _dict(d.get("resources"))
        return {
            "chapters": [
                ChapterInfo(
                    index=_int(c.get("index")) or 0,
                    title=str(c.get("title", "")),
                    words=_int(c.get("words")) or 0,
                    file=_str(c.get("file")),
                    pages=_int(c.get("pages")),
                )
                for c in d.get("chapters") or []
                if isinstance(c, dict)
            ],
            "resources": {k: v for k, v in resources.items() if isinstance(v, int)},
            "fonts": [
                FontInfo(
                    family=str(f.get("family", "")), source=str(f.get("source", "")), variants=[str(v) for v in f.get("variants") or []]
                )
                for f in d.get("fonts") or []
                if isinstance(f, dict)
            ],
            "files": _int(d.get("files")),
        }


@dataclass(frozen=True)
class CheckReport(Report):
    """``check``: whether the book passed, its error and warning counts,
    and the contrast, reflow and preflight results as the command gives them."""

    passed: bool = False
    error_count: int = 0
    warning_count: int = 0
    contrast: Optional[Dict[str, Any]] = None
    reflow: List[Any] = field(default_factory=list)
    preflight: Optional[Dict[str, Any]] = None

    @classmethod
    def _extra(cls, d: Mapping[str, Any]) -> Dict[str, Any]:
        check = _dict(d.get("check"))
        return {
            "passed": bool(check.get("passed", d.get("ok"))),
            "error_count": _int(check.get("errors")) or 0,
            "warning_count": _int(check.get("warnings")) or 0,
            "contrast": d.get("contrast") if isinstance(d.get("contrast"), dict) else None,
            "reflow": d.get("reflow") if isinstance(d.get("reflow"), list) else [],
            "preflight": d.get("preflight") if isinstance(d.get("preflight"), dict) else None,
        }


@dataclass(frozen=True)
class PageRef:
    """A page: its printed label (``"iv"``, ``"12"``), its position from 1
    and its chapter."""

    label: str
    position: int
    chapter: Optional[int] = None


@dataclass(frozen=True)
class ImageReport(Report):
    """``image``: the page that was rendered."""

    page: Optional[PageRef] = None

    @classmethod
    def _extra(cls, d: Mapping[str, Any]) -> Dict[str, Any]:
        p = d.get("page")
        if not isinstance(p, dict):
            return {}
        return {"page": PageRef(label=str(p.get("label", "")), position=_int(p.get("position")) or 0, chapter=_int(p.get("chapter")))}


@dataclass(frozen=True)
class ImportDocxReport(Report):
    """``import_docx``. Into a book: the ``edits`` applied, in conflict or
    rejected, the ``comments``, the ``files`` changed and the unified
    ``diff``. As a new book: the number of ``chapters`` and the document's
    ``quality`` report."""

    chapters: Optional[int] = None
    variant: Optional[str] = None
    export_id: Optional[str] = None
    edits: List[Dict[str, Any]] = field(default_factory=list)
    comments: List[Dict[str, Any]] = field(default_factory=list)
    files: List[Any] = field(default_factory=list)
    diff: Optional[str] = None
    quality: Optional[Dict[str, Any]] = None

    @classmethod
    def _extra(cls, d: Mapping[str, Any]) -> Dict[str, Any]:
        def dicts(key: str) -> List[Dict[str, Any]]:
            v = d.get(key)
            return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []

        return {
            "chapters": _int(d.get("chapters")),
            "variant": _str(d.get("variant")),
            "export_id": _str(d.get("exportId")),
            "edits": dicts("edits"),
            "comments": dicts("comments"),
            "files": list(_list(d.get("files"))),
            "diff": _str(d.get("diff")),
            "quality": d.get("report") if isinstance(d.get("report"), dict) else None,
        }


@dataclass(frozen=True)
class UnpackReport(Report):
    """``unpack``: how many files the bundle held."""

    files: Optional[int] = None

    @classmethod
    def _extra(cls, d: Mapping[str, Any]) -> Dict[str, Any]:
        return {"files": _int(d.get("files"))}


@dataclass(frozen=True)
class DesignReport(Report):
    """``design``: the design file's ``name`` and the ``parts`` it took
    (``page``, ``text``, ``headings``…)."""

    name: Optional[str] = None
    parts: List[str] = field(default_factory=list)

    @classmethod
    def _extra(cls, d: Mapping[str, Any]) -> Dict[str, Any]:
        design = _dict(d.get("design"))
        return {"name": _str(design.get("name")), "parts": [str(p) for p in _list(design.get("parts"))]}


@dataclass(frozen=True)
class ImportIdmlReport(Report):
    """``import_idml``: whether the book was set as composed pages or as a
    flowing book (``layout``: ``pages`` or ``flow``) and why (``reason``),
    the number of ``chapters``, the importer's ``quality`` report (its
    counts, findings and how each paragraph style was read), the ``fonts``
    the document names, the linked pictures not found (``missing_links``:
    ``name``, ``uri``, ``uses``) and, for a zipped InDesign package,
    ``package`` (the document taken, the pictures and font files read from
    it)."""

    layout: Optional[str] = None
    reason: Optional[str] = None
    chapters: Optional[int] = None
    quality: Optional[Dict[str, Any]] = None
    fonts: List[Dict[str, Any]] = field(default_factory=list)
    missing_links: List[Dict[str, Any]] = field(default_factory=list)
    package: Optional[Dict[str, Any]] = None

    @classmethod
    def _extra(cls, d: Mapping[str, Any]) -> Dict[str, Any]:
        def dicts(key: str) -> List[Dict[str, Any]]:
            return [x for x in _list(d.get(key)) if isinstance(x, dict)]

        return {
            "layout": _str(d.get("layout")),
            "reason": _str(d.get("reason")),
            "chapters": _int(d.get("chapters")),
            "quality": d.get("report") if isinstance(d.get("report"), dict) else None,
            "fonts": dicts("fonts"),
            "missing_links": dicts("missingLinks"),
            "package": d.get("package") if isinstance(d.get("package"), dict) else None,
        }
