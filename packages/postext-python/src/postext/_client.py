"""The commands of the postext command line as Python methods.

Each method builds the command's arguments, runs the executable with
``--json`` and returns the parsed report; a failure raises. Paths may be
``str`` or ``os.PathLike``; a book (or a Word document) may also be given
as ``bytes``, which go to a temporary file for the run.
"""

from __future__ import annotations

import json
import sys
from typing import TYPE_CHECKING, Any, Mapping, Optional, Sequence, Union

from ._args import STDOUT, BookInput, Books, PathLike, Temp, content, flag, many, opt
from ._design_idml import DesignIdmlCommands
from ._errors import PostextError
from ._report import CheckReport, ImageReport, ImportDocxReport, InfoReport, Report, UnpackReport
from ._version import __version__

if TYPE_CHECKING:
    from typing_extensions import Unpack

    from ._args import BookOptions


class Postext(DesignIdmlCommands):
    """Runs one postext executable.

    ``binary``: the executable (default: ``POSTEXT_BIN``, else the one of
    this platform, downloaded on first use). ``cwd``, ``env`` and
    ``timeout`` (seconds) apply to every run. ``offline`` and ``font_dirs``
    are the defaults of the book options of the same names.

    The module-level functions (``postext.pdf`` …) use a default instance.
    """

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
        own = flag("accessible", accessible) + opt("color-space", color_space) + opt("pdfx", pdfx)
        own += opt("profile", profile) + flag("outlines", outlines) + flag("page-negative", page_negative)
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
        own = opt("mode", mode) + opt("assets", assets)
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
        own = opt("layout", layout) + opt("cover", cover)
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
        own = ["--page", str(page)] + opt("format", format) + opt("dpi", dpi) + opt("quality", quality)
        own += flag("print-preview", print_preview)
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
        own = opt("pages", pages) + opt("pattern", pattern) + opt("jobs", jobs) + opt("format", format)
        own += opt("dpi", dpi) + opt("quality", quality) + flag("print-preview", print_preview)
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
        """A Word document. ``variant``: ``semantic`` (content only, in plain
        styles), ``formatted`` (the book's design, the default) or
        ``facsimile`` (the PDF's pages in text boxes, lays the book out).
        ``embed_fonts`` (formatted, facsimile): embed the book's faces
        (default on; ``False`` names them only)."""
        own = opt("variant", variant) + flag("embed-fonts", embed_fonts)
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
        with Temp() as temp:
            args = temp.inputs(docx, ".docx")
            if book is not None:
                if isinstance(book, (bytes, bytearray)):
                    raise ValueError("import_docx: the book to merge into must be a path (its files are changed)")
                args += many(book)  # type: ignore[arg-type]
            elif out is None and temp.used:
                raise ValueError("import_docx: give out= when the document is bytes")
            args += opt("out", out) + flag("dry-run", dry_run) + opt("resources", resources)
            args += opt("template", template) + flag("split", split) + opt("locale", locale)
            if isinstance(config, Mapping):
                config = temp.write("config.json", json.dumps(config, ensure_ascii=False).encode("utf-8"))
            args += opt("config", config) + opt("name", name) + flag("report", quality_report)
            args += flag("auto-thumbnail", auto_thumbnail)
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
        own = opt("id", id) + opt("description", description) + opt("thumbnail", thumbnail)
        own += flag("auto-thumbnail", auto_thumbnail)
        return self._book_command("pack", book, own, options, Report, out=out)

    def unpack(self, bundle: BookInput, *, out: Optional[PathLike] = None, force: Optional[bool] = None) -> UnpackReport:
        """Extract a ``.postext`` bundle into the folder ``out``."""
        with Temp() as temp:
            args = temp.inputs(bundle, ".postext")
            if out is None and temp.used:
                raise ValueError("unpack: give out= when the bundle is bytes")
            args += opt("out", out) + flag("force", force)
            return self._execute("unpack", args, UnpackReport)

    def info(self, book: Books, *, pages: Optional[bool] = None, **options: "Unpack[BookOptions]") -> InfoReport:
        """Describe the book: chapters, resources, fonts, locales (``pages=True``
        lays it out to count its pages)."""
        return self._book_command("info", book, flag("pages", pages), options, InfoReport, takes_out=False)

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
        own = flag("strict", strict) + flag("preflight", preflight)
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
        idml: Optional[PathLike] = None,
        idml_images: Optional[str] = None,
        idml_lines: Optional[str] = None,
        idml_spreads: Optional[str] = None,
        idml_fonts: Optional[bool] = None,
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
        ``epub``, ``images``, ``docx``, ``idml`` paths). ``docx_variant``:
        ``semantic``, ``formatted`` (the default) or ``facsimile``, as in
        :meth:`docx`; ``idml_images``, ``idml_lines``, ``idml_spreads`` and
        ``idml_fonts`` as ``images``, ``lines``, ``spreads`` and ``fonts`` in
        :meth:`idml`. For ``--watch``, run the executable yourself:
        ``Postext().run(["build", …, "--watch"], capture=False)``."""
        own = opt("pdf", pdf) + opt("html", html) + opt("epub", epub) + opt("images", images) + opt("docx", docx)
        own += opt("docx-variant", docx_variant) + flag("docx-fonts", docx_fonts)
        own += opt("idml", idml) + opt("idml-images", idml_images) + opt("idml-lines", idml_lines)
        own += opt("idml-spreads", idml_spreads) + flag("idml-fonts", idml_fonts)
        own += opt("pages", pages) + opt("pattern", pattern) + opt("jobs", jobs)
        own += flag("accessible", accessible) + opt("color-space", color_space) + opt("pdfx", pdfx)
        own += opt("profile", profile) + flag("outlines", outlines) + flag("page-negative", page_negative)
        own += opt("mode", mode) + opt("assets", assets) + opt("layout", layout) + opt("cover", cover)
        own += opt("format", format) + opt("dpi", dpi) + opt("quality", quality) + flag("print-preview", print_preview)
        return self._book_command("build", book, own, options, Report, takes_out=False, single_file=False)

    # ------------------------------------------------------------------
    # Bytes out

    def pdf_bytes(self, book: Books, **kwargs: Any) -> bytes:
        """The PDF's bytes (``pdf(book, out="-", …).content``)."""
        return content(self.pdf(book, out=STDOUT, **kwargs))

    def html_bytes(self, book: Books, **kwargs: Any) -> bytes:
        """The self-contained HTML file's bytes."""
        return content(self.html(book, out=STDOUT, **kwargs))

    def epub_bytes(self, book: Books, **kwargs: Any) -> bytes:
        """The EPUB's bytes."""
        return content(self.epub(book, out=STDOUT, **kwargs))

    def image_bytes(self, book: Books, *, page: Union[int, str], **kwargs: Any) -> bytes:
        """One page's image bytes (PNG unless ``format`` says otherwise)."""
        return content(self.image(book, page=page, out=STDOUT, **kwargs))

    def docx_bytes(self, book: Books, **kwargs: Any) -> bytes:
        """The Word document's bytes."""
        return content(self.docx(book, out=STDOUT, **kwargs))

    def pack_bytes(self, book: Books, **kwargs: Any) -> bytes:
        """The ``.postext`` bundle's bytes."""
        return content(self.pack(book, out=STDOUT, **kwargs))


def _main(argv: Optional[Sequence[str]] = None) -> int:
    """``python -m postext …``: the command line itself."""
    args = list(sys.argv[1:] if argv is None else argv)
    try:
        return Postext().run(args, capture=False).returncode
    except PostextError as err:
        print(f"postext: {err}", file=sys.stderr)
        return 1


__all__ = ["Postext", "STDOUT", "BookInput", "Books", "__version__"]
