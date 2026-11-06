"""Finding the postext executable, and downloading it on first use.

Every release of postext attaches one self-contained executable per system
to its GitHub Release, with their checksums in ``SHA256SUMS``. They are too
large for a wheel (185 to 230 MB), so the package fetches the one of this
system the first time it is needed, checks it and keeps it in the cache:

    <cache>/bin/<version>/postext[.exe]

``<cache>`` is the folder the command line keeps downloaded fonts in:
``POSTEXT_CACHE_DIR``, else ``%LOCALAPPDATA%\\postext\\cache`` on Windows and
``$XDG_CACHE_HOME/postext`` (``~/.cache/postext``) elsewhere.

``POSTEXT_BIN`` names an executable that is already installed (Homebrew,
Scoop, a local build) and skips the download.
"""

from __future__ import annotations

import glob
import hashlib
import os
import platform
import shutil
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from ._errors import BinaryNotFound
from ._version import __version__

ENV_BIN = "POSTEXT_BIN"
ENV_CACHE = "POSTEXT_CACHE_DIR"
ENV_RELEASE_URL = "POSTEXT_RELEASE_URL"
RELEASE_URL = "https://github.com/drnachio/postext/releases/download/v{version}"

_ARCH = {
    "x86_64": "x64",
    "amd64": "x64",
    "x64": "x64",
    "arm64": "arm64",
    "aarch64": "arm64",
    "armv8": "arm64",
    "armv8l": "arm64",
}

# The executables each release publishes.
FILES = (
    "postext-macos-arm64",
    "postext-macos-x64",
    "postext-linux-x64",
    "postext-linux-arm64",
    "postext-linux-x64-musl",
    "postext-windows-x64.exe",
)


def is_musl() -> bool:
    """Whether this Linux runs on musl (Alpine) rather than glibc."""
    if not sys.platform.startswith("linux"):
        return False
    libc, _ = platform.libc_ver()
    if libc == "glibc":
        return False
    return libc == "musl" or bool(glob.glob("/lib/ld-musl-*"))


def platform_file(
    system: Optional[str] = None,
    machine: Optional[str] = None,
    musl: Optional[bool] = None,
) -> str:
    """The name of this system's executable on the GitHub Release.

    Raises :class:`BinaryNotFound` for a system no release builds for.
    """
    system = system or sys.platform
    machine = (machine or platform.machine()).lower()
    arch = _ARCH.get(machine)
    if system == "darwin":
        os_name = "macos"
    elif system.startswith("linux"):
        os_name = "linux"
    elif system in ("win32", "cygwin", "msys"):
        os_name = "windows"
        # Windows on ARM runs the x64 executable under emulation.
        if arch == "arm64":
            arch = "x64"
    else:
        os_name = system
    if musl is None:
        musl = os_name == "linux" and is_musl()
    name = f"postext-{os_name}-{arch}" + ("-musl" if musl else "") + (".exe" if os_name == "windows" else "")
    if arch is None or name not in FILES:
        raise BinaryNotFound(
            f"No postext executable is published for {system} {machine}{' (musl)' if musl else ''}. "
            f"Build one (packages/postext-cli: bun run build:bin) and point {ENV_BIN} at it."
        )
    return name


def cache_dir() -> Path:
    """The folder postext keeps downloads in (fonts, and here the executables)."""
    env = os.environ.get(ENV_CACHE)
    if env:
        return Path(env)
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / "postext" / "cache"
    return Path(os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")) / "postext"


def cached_binary(version: str = __version__) -> Path:
    """Where the executable of ``version`` is kept once downloaded."""
    exe = "postext.exe" if sys.platform == "win32" else "postext"
    return cache_dir() / "bin" / version / exe


class _Stream:
    """A download being read: an HTTP response, or ``curl``'s output."""

    def __init__(self, url: str, response: Any = None, process: "Optional[subprocess.Popen[bytes]]" = None) -> None:
        self.url = url
        self._response = response
        self._process = process
        length = response.headers.get("Content-Length") if response is not None else None
        self.length: Optional[int] = int(length) if length and length.isdigit() else None

    def read(self, n: int = -1) -> bytes:
        if self._response is not None:
            data: bytes = self._response.read(n) if n >= 0 else self._response.read()
            return data
        assert self._process is not None and self._process.stdout is not None
        chunk = self._process.stdout.read(n) if n >= 0 else self._process.stdout.read()
        if not chunk:
            code = self._process.wait()
            if code != 0:
                err = self._process.stderr.read().decode("utf-8", "replace").strip() if self._process.stderr else ""
                raise BinaryNotFound(f"Could not download {self.url}: curl exit code {code} {err}".strip())
        return chunk

    def __enter__(self) -> "_Stream":
        return self

    def __exit__(self, *exc: Any) -> None:
        if self._response is not None:
            self._response.close()
        if self._process is not None:
            if self._process.poll() is None:
                self._process.kill()
            self._process.wait()
            for f in (self._process.stdout, self._process.stderr):
                if f:
                    f.close()


def _fetch(url: str) -> _Stream:
    """Open ``url``. A Python that cannot verify TLS certificates (a
    python.org build on macOS before ``Install Certificates.command``) tries
    ``certifi`` when it is installed, then the system's ``curl``; the
    executable is still checked against ``SHA256SUMS``."""
    headers = {"User-Agent": f"postext-python/{__version__}"}
    contexts: List[Optional[ssl.SSLContext]] = [None]
    try:
        import certifi  # type: ignore[import-not-found]

        contexts.append(ssl.create_default_context(cafile=certifi.where()))
    except ImportError:
        pass
    reason: Any = None
    for context in contexts:
        try:
            return _Stream(url, urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60, context=context))
        except urllib.error.HTTPError as err:
            raise BinaryNotFound(f"Could not download {url}: HTTP {err.code}") from err
        except urllib.error.URLError as err:
            reason = err.reason
            if not isinstance(reason, ssl.SSLError):
                raise BinaryNotFound(f"Could not download {url}: {reason}") from err
    curl = shutil.which("curl")
    if curl:
        process = subprocess.Popen(
            [curl, "-fsSL", "--retry", "2", "-A", headers["User-Agent"], url],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return _Stream(url, process=process)
    raise BinaryNotFound(
        f"Could not download {url}: {reason}. This Python cannot verify TLS certificates: "
        "install certifi (pip install certifi) or, with a python.org build on macOS, run its Install Certificates.command."
    )


def parse_sums(text: str) -> Dict[str, str]:
    """``SHA256SUMS`` (``<hex>  <file>`` per line) as ``{file: hex}``."""
    sums: Dict[str, str] = {}
    for line in text.splitlines():
        parts = line.strip().split()
        if len(parts) == 2:
            digest, name = parts
            sums[name.lstrip("*")] = digest.lower()
    return sums


def download_binary(
    version: str = __version__,
    *,
    dest: Optional[Path] = None,
    file: Optional[str] = None,
    base_url: Optional[str] = None,
    quiet: bool = False,
) -> Path:
    """Download the executable of ``version``, check its SHA256 against the
    release's ``SHA256SUMS`` and move it into place. Returns its path."""
    file = file or platform_file()
    dest = dest or cached_binary(version)
    base = (base_url or os.environ.get(ENV_RELEASE_URL) or RELEASE_URL).format(version=version).rstrip("/")
    with _fetch(f"{base}/SHA256SUMS") as res:
        sums = parse_sums(res.read().decode("utf-8", "replace"))
    expected = sums.get(file)
    if not expected:
        raise BinaryNotFound(f"{base}/SHA256SUMS lists no {file}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = f"{base}/{file}"
    with _fetch(url) as res:
        if not quiet:
            mb = f" ({res.length / 1e6:.0f} MB)" if res.length else ""
            print(f"postext: downloading {file} {version}{mb}, once, into {dest.parent}", file=sys.stderr, flush=True)
        digest = hashlib.sha256()
        fd, tmp_name = tempfile.mkstemp(prefix=".download-", dir=str(dest.parent))
        tmp = Path(tmp_name)
        try:
            with os.fdopen(fd, "wb") as out:
                while True:
                    chunk = res.read(1 << 20)
                    if not chunk:
                        break
                    digest.update(chunk)
                    out.write(chunk)
            if digest.hexdigest() != expected:
                raise BinaryNotFound(
                    f"The checksum of {url} does not match SHA256SUMS ({digest.hexdigest()} instead of {expected}); nothing was installed."
                )
            tmp.chmod(0o755)
            try:
                os.replace(tmp, dest)
            except OSError:
                # Another process put it there first (and Windows does not
                # replace an executable that is running): keep theirs.
                if not dest.exists():
                    raise
        finally:
            if tmp.exists():
                tmp.unlink()
    return dest


def find_binary(version: str = __version__, *, download: bool = True, quiet: bool = False) -> Path:
    """The postext executable to run: ``POSTEXT_BIN``, else the cached
    executable of ``version``, downloaded first if needed."""
    env = os.environ.get(ENV_BIN)
    if env:
        path = Path(env)
        if not path.is_file():
            found = shutil.which(env)
            if not found:
                raise BinaryNotFound(f"{ENV_BIN} is {env}, which is not a file")
            path = Path(found)
        return path
    path = cached_binary(version)
    if path.is_file():
        return path
    if not download:
        raise BinaryNotFound(f"postext {version} is not downloaded yet ({path})")
    return download_binary(version, dest=path, quiet=quiet)
