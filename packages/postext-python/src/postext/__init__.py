"""Postext from Python.

Typesets books with the self-contained ``postext`` command line: PDF, HTML,
EPUB, page images, Word and InDesign (IDML) from a ``.postext`` book, a book
folder or loose Markdown. The executable of this system is downloaded from the GitHub
Release of this package's version on first use, checked against its SHA256
and cached; ``POSTEXT_BIN`` points at one already installed.

    import postext

    report = postext.pdf("book.postext", out="book.pdf", set={"page.dpi": 300})
    print(report.output.pages, [str(w) for w in report.warnings])

    pdf = postext.pdf_bytes(open("book.postext", "rb").read())

Every function runs the command with ``--json`` and returns its report
(:class:`Report` and kin). A failure raises :class:`PostextError`
(:class:`UsageError` for a wrong call, :class:`ProblemsFound` when ``check``
finds problems). :class:`Postext` runs a given executable, in a given folder
or with a timeout.
"""

from ._binary import cache_dir, cached_binary, download_binary, find_binary, platform_file
from ._client import STDOUT, BookInput, Books, Postext
from ._errors import BinaryNotFound, PostextError, ProblemsFound, UsageError
from ._report import (
    BookSummary,
    ChapterInfo,
    CheckReport,
    DesignReport,
    Diagnostic,
    FontInfo,
    ImageReport,
    ImportDocxReport,
    ImportIdmlReport,
    InfoReport,
    Output,
    PageRef,
    Report,
    UnpackReport,
)
from ._version import __version__

_default = Postext()

pdf = _default.pdf
html = _default.html
epub = _default.epub
image = _default.image
images = _default.images
docx = _default.docx
idml = _default.idml
import_docx = _default.import_docx
import_idml = _default.import_idml
pack = _default.pack
design = _default.design
unpack = _default.unpack
info = _default.info
check = _default.check
build = _default.build

pdf_bytes = _default.pdf_bytes
html_bytes = _default.html_bytes
epub_bytes = _default.epub_bytes
image_bytes = _default.image_bytes
docx_bytes = _default.docx_bytes
idml_bytes = _default.idml_bytes
pack_bytes = _default.pack_bytes
design_bytes = _default.design_bytes

run = _default.run


def binary() -> str:
    """The path of the executable the functions run (downloaded on first call)."""
    return str(find_binary())


__all__ = [
    "__version__",
    "Postext",
    "STDOUT",
    "BookInput",
    "Books",
    # commands
    "pdf",
    "html",
    "epub",
    "image",
    "images",
    "docx",
    "idml",
    "import_docx",
    "import_idml",
    "pack",
    "design",
    "unpack",
    "info",
    "check",
    "build",
    "pdf_bytes",
    "html_bytes",
    "epub_bytes",
    "image_bytes",
    "docx_bytes",
    "idml_bytes",
    "pack_bytes",
    "design_bytes",
    "run",
    # executable
    "binary",
    "find_binary",
    "download_binary",
    "platform_file",
    "cache_dir",
    "cached_binary",
    # reports
    "Report",
    "InfoReport",
    "CheckReport",
    "ImageReport",
    "ImportDocxReport",
    "ImportIdmlReport",
    "UnpackReport",
    "DesignReport",
    "Output",
    "Diagnostic",
    "BookSummary",
    "ChapterInfo",
    "FontInfo",
    "PageRef",
    # errors
    "PostextError",
    "UsageError",
    "ProblemsFound",
    "BinaryNotFound",
]
