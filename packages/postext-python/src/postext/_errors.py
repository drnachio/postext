from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ._report import Report


class PostextError(Exception):
    """The command ran and failed (exit code 1, or another non-zero code).

    ``report`` is the parsed ``--json`` report when the command printed one,
    ``stderr`` what it wrote to the terminal.
    """

    def __init__(
        self,
        message: str,
        *,
        exit_code: int = 1,
        report: Optional["Report"] = None,
        stderr: str = "",
    ) -> None:
        super().__init__(message)
        self.message = message
        self.exit_code = exit_code
        self.report = report
        self.stderr = stderr


class UsageError(PostextError):
    """The command was called wrongly: an unknown option, a bad value (exit code 2)."""


class ProblemsFound(PostextError):
    """``check`` found problems, or ``import_docx`` could not apply an edit (exit code 3).

    The report is complete: ``err.report.warnings`` lists what was found.
    """


class BinaryNotFound(PostextError):
    """No postext executable: none for this platform, a download that failed,
    or a ``POSTEXT_BIN`` that does not exist."""
