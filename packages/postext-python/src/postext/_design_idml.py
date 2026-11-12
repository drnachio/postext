"""The commands ``design``, ``idml`` and ``import-idml``."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional, Sequence, Union

from ._args import STDOUT, BookInput, Books, PathLike, Temp, content, flag, many, opt, parts_arg
from ._report import DesignReport, ImportIdmlReport, Report
from ._runner import Runner

if TYPE_CHECKING:
    from typing_extensions import Unpack

    from ._args import BookOptions, IdmlOptions


class DesignIdmlCommands(Runner):
    def design(
        self,
        book: Books,
        *,
        out: Optional[PathLike] = None,
        parts: Union[str, Sequence[str], None] = None,
        design_name: Optional[str] = None,
        id: Optional[str] = None,
        description: Optional[str] = None,
        **options: "Unpack[BookOptions]",
    ) -> DesignReport:
        """Take the book's design into a design file (``out``, default:
        ``<book>.design.postext``; ``"-"`` returns its bytes): a ``.postext``
        with no chapters, holding the settings of the ``parts`` asked for
        (``"page,text,headings"`` or a list; default: all) and the font
        files and colour profile they name. Give it to any book with
        ``design=``."""
        own = opt("parts", parts_arg(parts) if parts is not None else None) + opt("design-name", design_name)
        own += opt("id", id) + opt("description", description)
        return self._book_command("design", book, own, options, DesignReport, out=out)

    def idml(
        self,
        book: Books,
        *,
        out: Optional[PathLike] = None,
        images: Optional[str] = None,
        lines: Optional[str] = None,
        spreads: Optional[str] = None,
        fonts: Optional[bool] = None,
        **options: "Unpack[IdmlOptions]",
    ) -> Report:
        """The laid-out pages as an InDesign Markup package (``out``,
        default: beside the book; ``"-"`` returns its bytes).

        ``images``: ``embed`` (inside the file, default) or ``link`` (beside
        it in ``Links/``); ``lines``: ``keep`` (lines as Postext broke them,
        default) or ``reflow`` (left to InDesign's composer); ``spreads``:
        ``facing`` or ``single`` (default: facing for mirrored margins);
        ``fonts=True`` writes the font files beside the package, in
        ``Document fonts/``. Linked pictures and fonts need a file ``out``.
        """
        own = opt("images", images) + opt("lines", lines) + opt("spreads", spreads) + flag("fonts", fonts)
        return self._book_command("idml", book, own, options, Report, out=out)

    def import_idml(
        self,
        idml: BookInput,
        *,
        out: Optional[PathLike] = None,
        document: Optional[str] = None,
        layout: Optional[str] = None,
        links: Optional[PathLike] = None,
        name: Optional[str] = None,
        locale: Optional[str] = None,
        hidden: Optional[bool] = None,
        pasteboard: Optional[bool] = None,
        non_printing: Optional[bool] = None,
        conditions: Optional[str] = None,
        changes: Optional[str] = None,
        masters: Optional[bool] = None,
        quality_report: Optional[bool] = None,
        auto_thumbnail: Optional[bool] = None,
        font_dirs: Union[PathLike, Sequence[PathLike], None] = None,
        offline: Optional[bool] = None,
        cache_dir: Optional[PathLike] = None,
    ) -> ImportIdmlReport:
        """Turn an InDesign document (``.idml``), or a zipped InDesign
        package that holds one, into a new book at ``out`` (a folder or a
        ``.postext`` file). The executable tells the two apart by their
        contents, so bytes of either work; ``out`` is then required, and
        linked pictures are found only through ``links``.

        ``document``: in a package with several IDML documents, the one to
        import (``Book/Book.idml``). ``layout``: ``pages`` (composed pages
        as in the document), ``flow`` (a flowing book) or ``auto``
        (default). ``conditions``: ``visible`` (default) or ``all``;
        ``changes``: ``accept`` (default) or ``reject``. ``hidden``,
        ``pasteboard`` and ``non_printing`` read those objects too;
        ``masters=False`` leaves master-page items out. ``font_dirs``:
        where the cover finds the document's fonts; for a package, faces
        found there are carried instead of the package's.
        """
        with Temp() as temp:
            if isinstance(idml, (bytes, bytearray)) and out is None:
                raise ValueError("import_idml: give out= when the document is bytes")
            args = [temp.file(idml, "document.idml")]
            args += opt("out", out) + opt("document", document) + opt("layout", layout) + opt("links", links)
            args += opt("name", name) + opt("locale", locale) + flag("hidden", hidden) + flag("pasteboard", pasteboard)
            args += flag("non-printing", non_printing) + opt("conditions", conditions) + opt("changes", changes)
            args += flag("masters", masters) + flag("report", quality_report) + flag("auto-thumbnail", auto_thumbnail)
            for d in many(font_dirs if font_dirs is not None else self.font_dirs):
                args += ["--font-dir", d]
            if offline if offline is not None else self.offline:
                args += ["--offline"]
            args += opt("cache-dir", cache_dir)
            return self._execute("import-idml", args, ImportIdmlReport)

    def design_bytes(self, book: Books, **kwargs: Any) -> bytes:
        """The design file's bytes."""
        return content(self.design(book, out=STDOUT, **kwargs))

    def idml_bytes(self, book: Books, **kwargs: Any) -> bytes:
        """The IDML package's bytes (pictures embedded)."""
        return content(self.idml(book, out=STDOUT, **kwargs))
