"""The commands of the postext command line as Python methods.

Each method builds the command's arguments, runs the executable with
``--json`` and returns the parsed report; a failure raises. Paths may be
``str`` or ``os.PathLike``; a book (or a Word document) may also be given
as ``bytes``, which go to a temporary file for the run.
"""

from __future__ import annotations

import contextlib
import json
import os
import subprocess
import sys
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
    Type,
    TypeVar,
    Union,
)

from ._binary import find_binary
from ._errors import PostextError, ProblemsFound, UsageError
from ._report import CheckReport, ImageReport, ImportDocxReport, InfoReport, Report, UnpackReport
from ._version import __version__

if TYPE_CHECKING:
    from typing_extensions import TypedDict, Unpack

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

R = TypeVar("R", bound=Report)

if TYPE_CHECKING:

    class BookOptions(TypedDict, total=False):
        """Options of every command that reads a book."""

        locale: str
        """Language to read a multilingual book in (``es``, ``en``, ``pt-BR``…)."""
        chapters: Chapters
        """Chapters to lay out, from 1: ``3``, ``"1,3-5"``, ``[1, 3]``, ``range(1, 4)``."""
        set: Settings
        """Settings to change: ``{"page.dpi": 300, "bodyText.fontSize.value": 11}``."""
        config: Union[PathLike, Mapping[str, Any]]
        """Configuration JSON (a file, or a dict) for loose Markdown, or merged over a book's."""
        resources: PathLike
        """Pictures folder for loose Markdown."""
        fonts: PathLike
        """Font files bundled with loose Markdown."""
        name: str
        """Book title for loose Markdown."""
        font_dirs: Union[PathLike, Sequence[PathLike]]
        """Extra folders to look for fonts the book does not carry."""
        offline: bool
        """Never download fonts from Google Fonts."""
        cache_dir: PathLike
        """Where downloaded fonts are kept."""


_BOOK_KEYS = ("locale", "chapters", "set", "config", "resources", "fonts", "name", "font_dirs", "offline", "cache_dir")


def _chapters(value: Chapters) -> str:
    def one(v: Union[int, str, range]) -> str:
        if isinstance(v, range):
            if v.step != 1 or len(v) == 0:
                raise ValueError(f"chapters: {v!r} is not a run of chapters")
            return f"{v.start}-{v.stop - 1}" if len(v) > 1 else str(v.start)
        return str(v)

    if isinstance(value, (int, str, range)):
        return one(value)
    return ",".join(one(v) for v in value)


def _setting(value: Any) -> str:
    """A ``--set`` value: the command line reads it as JSON when it parses
    (numbers, booleans, lists, objects), else as text."""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _settings(value: Settings) -> List[str]:
    if isinstance(value, Mapping):
        return [f"{k}={_setting(v)}" for k, v in value.items()]
    if isinstance(value, str):
        return [value]
    return [str(v) for v in value]


def _flag(name: str, value: Optional[bool]) -> List[str]:
    if value is None:
        return []
    return [f"--{name}" if value else f"--no-{name}"]


def _opt(name: str, value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, bool):
        return _flag(name, value)
    return [f"--{name}", os.fspath(value) if isinstance(value, os.PathLike) else str(value)]


def _many(value: Union[PathLike, Sequence[PathLike], None]) -> List[str]:
    if value is None:
        return []
    if isinstance(value, (str, os.PathLike)):
        return [os.fspath(value)]
    return [os.fspath(v) for v in value]


def _split_stdout(stdout: bytes, want_content: bool) -> Tuple[Optional[Dict[str, Any]], Optional[bytes]]:
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


def _stderr_error(stderr: str) -> str:
    lines = [ln for ln in stderr.splitlines() if ln.strip()]
    errors = [ln[6:] if ln.startswith("error ") else ln for ln in lines if ln.startswith("error")]
    return "; ".join(errors) or (lines[-1] if lines else "postext failed")


class Postext:
    """Runs one postext executable.

    ``binary``: the executable (default: ``POSTEXT_BIN``, else the one of
    this platform, downloaded on first use). ``cwd``, ``env`` and
    ``timeout`` (seconds) apply to every run. ``offline`` and ``font_dirs``
    are the defaults of the book options of the same names.

    The module-level functions (``postext.pdf`` …) use a default instance.
    """

    def __init__(
        self,
        binary: Optional[PathLike] = None,
        *,
        cwd: Optional[PathLike] = None,
        env: Optional[Mapping[str, str]] = None,
        timeout: Optional[float] = None,
        offline: Optional[bool] = None,
        font_dirs: Union[PathLike, Sequence[PathLike], None] = None,
    ) -> None:
        self._binary = Path(os.fspath(binary)) if binary is not None else None
        self.cwd = cwd
        self.env = dict(env) if env is not None else None
        self.timeout = timeout
        self.offline = offline
        self.font_dirs = font_dirs

    # ------------------------------------------------------------------
    # Running

    @property
    def binary(self) -> Path:
        """The executable (found, or downloaded, on first use)."""
        if self._binary is None:
            self._binary = find_binary()
        return self._binary

    def version(self) -> str:
        """The executable's version line: ``postext 1.70.4 (engine 1.70.4, darwin-arm64)``."""
        return self.run(["--version"], capture=True).stdout.decode().strip()

    def run(self, args: Sequence[PathLike], *, capture: bool = True, check: bool = False) -> "subprocess.CompletedProcess[bytes]":
        """Run the executable with ``args`` as given, nothing added.

        ``capture=False`` leaves stdout and stderr on the terminal (for
        ``build --watch`` and the like). ``check=True`` raises
        :class:`subprocess.CalledProcessError` on a non-zero exit code.
        """
        env = None
        if self.env is not None:
            env = {**os.environ, **self.env}
        return subprocess.run(
            [str(self.binary), *[os.fspath(a) for a in args]],
            cwd=os.fspath(self.cwd) if self.cwd is not None else None,
            env=env,
            stdin=subprocess.DEVNULL,
            capture_output=capture,
            timeout=self.timeout,
            check=check,
        )

    def _book_args(self, opts: Mapping[str, Any], temp: "_Temp") -> List[str]:
        unknown = set(opts) - set(_BOOK_KEYS)
        if unknown:
            raise TypeError(f"unexpected option(s): {', '.join(sorted(unknown))}")
        args: List[str] = []
        args += _opt("locale", opts.get("locale"))
        if opts.get("chapters") is not None:
            args += ["--chapters", _chapters(opts["chapters"])]
        for s in _settings(opts.get("set") or {}):
            args += ["--set", s]
        config = opts.get("config")
        if isinstance(config, Mapping):
            config = temp.write("config.json", json.dumps(config, ensure_ascii=False).encode("utf-8"))
        args += _opt("config", config)
        args += _opt("resources", opts.get("resources"))
        args += _opt("fonts", opts.get("fonts"))
        args += _opt("name", opts.get("name"))
        font_dirs = opts.get("font_dirs", self.font_dirs)
        for d in _many(font_dirs):
            args += ["--font-dir", d]
        offline = opts.get("offline", self.offline)
        if offline:
            args += ["--offline"]
        args += _opt("cache-dir", opts.get("cache_dir"))
        return args

    def _execute(
        self,
        command: str,
        args: List[str],
        report_type: Type[R],
        *,
        content: bool = False,
        raise_on_problems: bool = True,
    ) -> R:
        proc = self.run([command, *args, "--json", "--no-color"], capture=True)
        stderr = proc.stderr.decode("utf-8", "replace")
        data, payload = _split_stdout(proc.stdout, content)
        report = report_type.from_json(data, content=payload, stderr=stderr) if data is not None else None
        code = proc.returncode
        if code == 0:
            if report is None:
                raise PostextError(f"postext {command} printed no report", exit_code=0, stderr=stderr)
            return report
        message = (report.error if report and report.error else None) or _stderr_error(stderr)
        if code == 2:
            raise UsageError(message, exit_code=code, report=report, stderr=stderr)
        if code == 3 and report is not None:
            if not raise_on_problems:
                return report
            found = ", ".join(str(w) for w in report.warnings[:3]) or message
            raise ProblemsFound(f"postext {command}: {found}", exit_code=code, report=report, stderr=stderr)
        raise PostextError(message, exit_code=code, report=report, stderr=stderr)

    def _book_command(
        self,
        command: str,
        books: Books,
        own: List[str],
        opts: Mapping[str, Any],
        report_type: Type[R],
        *,
        out: Optional[PathLike] = None,
        single_file: bool = True,
        raise_on_problems: bool = True,
        suffix: str = ".postext",
        takes_out: bool = True,
    ) -> R:
        with _Temp() as temp:
            inputs = temp.inputs(books, suffix)
            if takes_out and out is None and temp.used:
                if not single_file:
                    raise ValueError(f"{command}: give out= when the book is bytes (it is read from a temporary file)")
                out = STDOUT
            args = list(inputs)
            if takes_out and out is not None:
                args += ["--out", os.fspath(out)]
            args += own + self._book_args(opts, temp)
            return self._execute(
                command,
                args,
                report_type,
                content=out is not None and os.fspath(out) == STDOUT,
                raise_on_problems=raise_on_problems,
            )

    # ------------------------------------------------------------------
    # Commands

    def pdf(
        self,
        book: Books,
        *,
        out: Optional[PathLike] = None,
        accessible: Optional[bool] = None,
        color_space: Optional[str] = None,
        pdfx: Optional[str] = None,
        profile: Optional[PathLike] = None,
        outlines: Optional[bool] = None,
        page_negative: Optional[bool] = None,
        **options: "Unpack[BookOptions]",
    ) -> Report:
        """Typeset the book into a PDF (``out``, default: beside the book;
        ``"-"`` returns its bytes in ``Report.content``).

        ``color_space``: ``rgb``, ``cmyk`` or ``grayscale``; ``pdfx``:
        ``none``, ``x1a`` or ``x4``; ``profile``: ``fogra39``, ``fogra51``,
        ``swop5``, ``gracol2006``… or an ``.icc`` file.
        """
        own = _flag("accessible", accessible) + _opt("color-space", color_space) + _opt("pdfx", pdfx)
        own += _opt("profile", profile) + _flag("outlines", outlines) + _flag("page-negative", page_negative)
        return self._book_command("pdf", book, own, options, Report, out=out)

    def html(
        self,
        book: Books,
        *,
        out: Optional[PathLike] = None,
        mode: Optional[str] = None,
        assets: Optional[str] = None,
        **options: "Unpack[BookOptions]",
    ) -> Report:
        """The laid-out pages as HTML: a path ending in ``.html`` (or ``"-"``)
        gets one self-contained file, any other path a folder.

        ``mode``: ``single`` (one column) or ``multi`` (side by side);
        ``assets``: ``embed`` or ``folder``.
        """
        own = _opt("mode", mode) + _opt("assets", assets)
        return self._book_command("html", book, own, options, Report, out=out)

    def epub(
        self,
        book: Books,
        *,
        out: Optional[PathLike] = None,
        layout: Optional[str] = None,
        cover: Optional[PathLike] = None,
        **options: "Unpack[BookOptions]",
    ) -> Report:
        """An EPUB 3 book. ``layout``: ``fixed`` (default) or ``reflowable``."""
        own = _opt("layout", layout) + _opt("cover", cover)
        return self._book_command("epub", book, own, options, Report, out=out)

    def image(
        self,
        book: Books,
        *,
        page: Union[int, str],
        out: Optional[PathLike] = None,
        format: Optional[str] = None,
        dpi: Optional[float] = None,
        quality: Optional[int] = None,
        print_preview: Optional[bool] = None,
        **options: "Unpack[BookOptions]",
    ) -> ImageReport:
        """One page as an image. ``page``: as printed (``"12"``, ``"iv"``) or
        by position (``"#1"``; an ``int`` is a printed number).
        ``format``: ``png``, ``jpeg`` or ``webp``."""
        own = ["--page", str(page)] + _opt("format", format) + _opt("dpi", dpi) + _opt("quality", quality)
        own += _flag("print-preview", print_preview)
        return self._book_command("image", book, own, options, ImageReport, out=out)

    def images(
        self,
        book: Books,
        *,
        out: Optional[PathLike] = None,
        pages: Optional[str] = None,
        pattern: Optional[str] = None,
        jobs: Optional[int] = None,
        format: Optional[str] = None,
        dpi: Optional[float] = None,
        quality: Optional[int] = None,
        print_preview: Optional[bool] = None,
        **options: "Unpack[BookOptions]",
    ) -> Report:
        """Every page (or ``pages``: ``"1-10"``, ``"#1-#20"``) as images in the
        folder ``out``. ``Report.outputs`` lists the files."""
        own = _opt("pages", pages) + _opt("pattern", pattern) + _opt("jobs", jobs) + _opt("format", format)
        own += _opt("dpi", dpi) + _opt("quality", quality) + _flag("print-preview", print_preview)
        return self._book_command("images", book, own, options, Report, out=out, single_file=False)

    def docx(
        self,
        book: Books,
        *,
        out: Optional[PathLike] = None,
        variant: Optional[str] = None,
        embed_fonts: Optional[bool] = None,
        **options: "Unpack[BookOptions]",
    ) -> Report:
        """A Word document. ``variant``: ``semantic`` (native Word structures,
        default) or ``formatted`` (the PDF's pages)."""
        own = _opt("variant", variant) + _flag("embed-fonts", embed_fonts)
        return self._book_command("docx", book, own, options, Report, out=out)

    def import_docx(
        self,
        docx: BookInput,
        book: Optional[Books] = None,
        *,
        out: Optional[PathLike] = None,
        dry_run: Optional[bool] = None,
        resources: Optional[PathLike] = None,
        template: Optional[PathLike] = None,
        split: Optional[bool] = None,
        locale: Optional[str] = None,
        config: Union[PathLike, Mapping[str, Any], None] = None,
        name: Optional[str] = None,
        quality_report: Optional[bool] = None,
        auto_thumbnail: Optional[bool] = None,
        raise_on_problems: bool = True,
    ) -> ImportDocxReport:
        """With ``book``: merge the edits made in Word to a file ``docx``
        exported back into the book (``dry_run`` only reports them). Without:
        turn any Word document into a new book at ``out`` (a folder or a
        ``.postext`` file).

        An edit that could not be applied raises :class:`ProblemsFound`
        unless ``raise_on_problems=False``.
        """
        with _Temp() as temp:
            args = temp.inputs(docx, ".docx")
            if book is not None:
                if isinstance(book, (bytes, bytearray)):
                    raise ValueError("import_docx: the book to merge into must be a path (its files are changed)")
                args += _many(book)  # type: ignore[arg-type]
            elif out is None and temp.used:
                raise ValueError("import_docx: give out= when the document is bytes")
            args += _opt("out", out) + _flag("dry-run", dry_run) + _opt("resources", resources)
            args += _opt("template", template) + _flag("split", split) + _opt("locale", locale)
            if isinstance(config, Mapping):
                config = temp.write("config.json", json.dumps(config, ensure_ascii=False).encode("utf-8"))
            args += _opt("config", config) + _opt("name", name) + _flag("report", quality_report)
            args += _flag("auto-thumbnail", auto_thumbnail)
            return self._execute("import-docx", args, ImportDocxReport, raise_on_problems=raise_on_problems)

    def pack(
        self,
        book: Books,
        *,
        out: Optional[PathLike] = None,
        id: Optional[str] = None,
        description: Optional[str] = None,
        thumbnail: Optional[PathLike] = None,
        auto_thumbnail: Optional[bool] = None,
        **options: "Unpack[BookOptions]",
    ) -> Report:
        """Pack a book folder, or loose Markdown files (the chapters, in
        order), into a ``.postext`` bundle."""
        own = _opt("id", id) + _opt("description", description) + _opt("thumbnail", thumbnail)
        own += _flag("auto-thumbnail", auto_thumbnail)
        return self._book_command("pack", book, own, options, Report, out=out)

    def unpack(self, bundle: BookInput, *, out: Optional[PathLike] = None, force: Optional[bool] = None) -> UnpackReport:
        """Extract a ``.postext`` bundle into the folder ``out``."""
        with _Temp() as temp:
            args = temp.inputs(bundle, ".postext")
            if out is None and temp.used:
                raise ValueError("unpack: give out= when the bundle is bytes")
            args += _opt("out", out) + _flag("force", force)
            return self._execute("unpack", args, UnpackReport)

    def info(self, book: Books, *, pages: Optional[bool] = None, **options: "Unpack[BookOptions]") -> InfoReport:
        """Describe the book: chapters, resources, fonts, locales (``pages=True``
        lays it out to count its pages)."""
        return self._book_command("info", book, _flag("pages", pages), options, InfoReport, takes_out=False)

    def check(
        self,
        book: Books,
        *,
        strict: Optional[bool] = None,
        preflight: Optional[bool] = None,
        raise_on_problems: bool = True,
        **options: "Unpack[BookOptions]",
    ) -> CheckReport:
        """Lay the book out and report its problems. When it finds an error
        (any warning with ``strict``) it raises :class:`ProblemsFound`, whose
        ``report`` lists them; ``raise_on_problems=False`` returns the
        report instead (``report.passed`` is then ``False``)."""
        own = _flag("strict", strict) + _flag("preflight", preflight)
        return self._book_command("check", book, own, options, CheckReport, takes_out=False, raise_on_problems=raise_on_problems)

    def build(
        self,
        book: Books,
        *,
        pdf: Optional[PathLike] = None,
        html: Optional[PathLike] = None,
        epub: Optional[PathLike] = None,
        images: Optional[PathLike] = None,
        docx: Optional[PathLike] = None,
        docx_variant: Optional[str] = None,
        docx_fonts: Optional[bool] = None,
        pages: Optional[str] = None,
        pattern: Optional[str] = None,
        jobs: Optional[int] = None,
        accessible: Optional[bool] = None,
        color_space: Optional[str] = None,
        pdfx: Optional[str] = None,
        profile: Optional[PathLike] = None,
        outlines: Optional[bool] = None,
        page_negative: Optional[bool] = None,
        mode: Optional[str] = None,
        assets: Optional[str] = None,
        layout: Optional[str] = None,
        cover: Optional[PathLike] = None,
        format: Optional[str] = None,
        dpi: Optional[float] = None,
        quality: Optional[int] = None,
        print_preview: Optional[bool] = None,
        **options: "Unpack[BookOptions]",
    ) -> Report:
        """Lay the book out once and write several outputs (``pdf``, ``html``,
        ``epub``, ``images``, ``docx`` paths). For ``--watch``, run the
        executable yourself: ``Postext().run(["build", …, "--watch"], capture=False)``."""
        own = _opt("pdf", pdf) + _opt("html", html) + _opt("epub", epub) + _opt("images", images) + _opt("docx", docx)
        own += _opt("docx-variant", docx_variant) + _flag("docx-fonts", docx_fonts)
        own += _opt("pages", pages) + _opt("pattern", pattern) + _opt("jobs", jobs)
        own += _flag("accessible", accessible) + _opt("color-space", color_space) + _opt("pdfx", pdfx)
        own += _opt("profile", profile) + _flag("outlines", outlines) + _flag("page-negative", page_negative)
        own += _opt("mode", mode) + _opt("assets", assets) + _opt("layout", layout) + _opt("cover", cover)
        own += _opt("format", format) + _opt("dpi", dpi) + _opt("quality", quality) + _flag("print-preview", print_preview)
        return self._book_command("build", book, own, options, Report, takes_out=False, single_file=False)

    # ------------------------------------------------------------------
    # Bytes out

    def pdf_bytes(self, book: Books, **kwargs: Any) -> bytes:
        """The PDF's bytes (``pdf(book, out="-", …).content``)."""
        return _content(self.pdf(book, out=STDOUT, **kwargs))

    def html_bytes(self, book: Books, **kwargs: Any) -> bytes:
        """The self-contained HTML file's bytes."""
        return _content(self.html(book, out=STDOUT, **kwargs))

    def epub_bytes(self, book: Books, **kwargs: Any) -> bytes:
        """The EPUB's bytes."""
        return _content(self.epub(book, out=STDOUT, **kwargs))

    def image_bytes(self, book: Books, *, page: Union[int, str], **kwargs: Any) -> bytes:
        """One page's image bytes (PNG unless ``format`` says otherwise)."""
        return _content(self.image(book, page=page, out=STDOUT, **kwargs))

    def docx_bytes(self, book: Books, **kwargs: Any) -> bytes:
        """The Word document's bytes."""
        return _content(self.docx(book, out=STDOUT, **kwargs))

    def pack_bytes(self, book: Books, **kwargs: Any) -> bytes:
        """The ``.postext`` bundle's bytes."""
        return _content(self.pack(book, out=STDOUT, **kwargs))


def _content(report: Report) -> bytes:
    return report.content or b""


class _Temp(contextlib.AbstractContextManager):  # type: ignore[type-arg]
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


def _main(argv: Optional[Sequence[str]] = None) -> int:
    """``python -m postext …``: the command line itself."""
    args = list(sys.argv[1:] if argv is None else argv)
    try:
        return Postext().run(args, capture=False).returncode
    except PostextError as err:
        print(f"postext: {err}", file=sys.stderr)
        return 1


__all__ = ["Postext", "STDOUT", "BookInput", "Books", "__version__"]
