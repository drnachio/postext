"""Running the executable: the arguments every book command shares, the
run itself and the report or the error that comes back."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any, List, Mapping, Optional, Sequence, Type, TypeVar, Union

from ._args import (
    BOOK_KEYS,
    STDOUT,
    Books,
    PathLike,
    Temp,
    chapters_arg,
    many,
    opt,
    parts_arg,
    settings_args,
    split_stdout,
    stderr_error,
)
from ._binary import find_binary
from ._errors import PostextError, ProblemsFound, UsageError
from ._report import Report

R = TypeVar("R", bound=Report)


class Runner:
    """Runs one postext executable (the commands are in :class:`Postext`)."""

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

    def _book_args(self, opts: Mapping[str, Any], temp: Temp) -> List[str]:
        unknown = set(opts) - set(BOOK_KEYS)
        if unknown:
            raise TypeError(f"unexpected option(s): {', '.join(sorted(unknown))}")
        args: List[str] = []
        args += opt("locale", opts.get("locale"))
        if opts.get("chapters") is not None:
            args += ["--chapters", chapters_arg(opts["chapters"])]
        for s in settings_args(opts.get("set") or {}):
            args += ["--set", s]
        design = opts.get("design")
        if design is not None:
            args += ["--design", temp.file(design, "design.postext")]
        if opts.get("design_parts") is not None:
            args += ["--design-parts", parts_arg(opts["design_parts"])]
        if opts.get("composition") is not None:
            args += ["--composition", str(opts["composition"])]
        config = opts.get("config")
        if isinstance(config, Mapping):
            config = temp.write("config.json", json.dumps(config, ensure_ascii=False).encode("utf-8"))
        args += opt("config", config)
        args += opt("resources", opts.get("resources"))
        args += opt("fonts", opts.get("fonts"))
        args += opt("name", opts.get("name"))
        font_dirs = opts.get("font_dirs", self.font_dirs)
        for d in many(font_dirs):
            args += ["--font-dir", d]
        offline = opts.get("offline", self.offline)
        if offline:
            args += ["--offline"]
        args += opt("cache-dir", opts.get("cache_dir"))
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
        data, payload = split_stdout(proc.stdout, content)
        report = report_type.from_json(data, content=payload, stderr=stderr) if data is not None else None
        code = proc.returncode
        if code == 0:
            if report is None:
                raise PostextError(f"postext {command} printed no report", exit_code=0, stderr=stderr)
            return report
        message = (report.error if report and report.error else None) or stderr_error(stderr)
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
        with Temp() as temp:
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
