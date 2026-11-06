"""Finding and downloading the executable, against a local server."""

import hashlib
import http.server
import os
import shutil
import ssl
import sys
import threading
import urllib.error
import urllib.request

import pytest

import postext
from postext import _binary


def test_platform_file():
    assert postext.platform_file("darwin", "arm64") == "postext-macos-arm64"
    assert postext.platform_file("darwin", "x86_64") == "postext-macos-x64"
    assert postext.platform_file("linux", "x86_64", musl=False) == "postext-linux-x64"
    assert postext.platform_file("linux", "aarch64", musl=False) == "postext-linux-arm64"
    assert postext.platform_file("linux", "x86_64", musl=True) == "postext-linux-x64-musl"
    assert postext.platform_file("win32", "AMD64") == "postext-windows-x64.exe"
    assert postext.platform_file("win32", "ARM64") == "postext-windows-x64.exe"
    with pytest.raises(postext.BinaryNotFound):
        postext.platform_file("linux", "aarch64", musl=True)
    with pytest.raises(postext.BinaryNotFound):
        postext.platform_file("freebsd14", "amd64")
    # this machine has one
    assert postext.platform_file() in _binary.FILES


def test_cache_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("POSTEXT_CACHE_DIR", str(tmp_path))
    assert postext.cache_dir() == tmp_path
    exe = "postext.exe" if sys.platform == "win32" else "postext"
    assert postext.cached_binary("9.9.9") == tmp_path / "bin" / "9.9.9" / exe


def test_parse_sums():
    text = "aa11  postext-linux-x64\nBB22 *postext-windows-x64.exe\n\n"
    assert _binary.parse_sums(text) == {"postext-linux-x64": "aa11", "postext-windows-x64.exe": "bb22"}


@pytest.fixture()
def release(tmp_path):
    """A release folder served over HTTP: ``v1.2.3/<file>`` and ``SHA256SUMS``."""
    root = tmp_path / "srv"
    folder = root / "v1.2.3"
    folder.mkdir(parents=True)
    body = b"#!/bin/sh\necho fake postext\n" * 1000
    (folder / "postext-test").write_bytes(body)
    (folder / "postext-bad").write_bytes(body)
    good = hashlib.sha256(body).hexdigest()
    (folder / "SHA256SUMS").write_text(f"{good}  postext-test\n{'0' * 64}  postext-bad\n")

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(root), **kw)

        def log_message(self, *a):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}/v{{version}}", body
    server.shutdown()


def test_download_checks_the_sum(release, tmp_path):
    url, body = release
    dest = tmp_path / "cache" / "postext"
    path = postext.download_binary("1.2.3", dest=dest, file="postext-test", base_url=url, quiet=True)
    assert path == dest and dest.read_bytes() == body
    if sys.platform != "win32":
        assert os.access(dest, os.X_OK)
    with pytest.raises(postext.BinaryNotFound, match="checksum"):
        postext.download_binary("1.2.3", dest=tmp_path / "bad" / "postext", file="postext-bad", base_url=url, quiet=True)
    assert not (tmp_path / "bad" / "postext").exists()
    assert list((tmp_path / "bad").iterdir()) == []  # no partial download left
    with pytest.raises(postext.BinaryNotFound, match="lists no"):
        postext.download_binary("1.2.3", dest=tmp_path / "x", file="postext-missing", base_url=url, quiet=True)
    with pytest.raises(postext.BinaryNotFound, match="HTTP 404"):
        postext.download_binary("9.9.9", dest=tmp_path / "y", file="postext-test", base_url=url, quiet=True)


def test_find_binary_uses_the_cache_then_downloads(release, tmp_path, monkeypatch):
    url, body = release
    monkeypatch.delenv("POSTEXT_BIN", raising=False)
    monkeypatch.setenv("POSTEXT_CACHE_DIR", str(tmp_path / "c"))
    monkeypatch.setenv("POSTEXT_RELEASE_URL", url)
    monkeypatch.setattr(_binary, "platform_file", lambda: "postext-test")
    with pytest.raises(postext.BinaryNotFound, match="not downloaded"):
        postext.find_binary("1.2.3", download=False)
    path = postext.find_binary("1.2.3", quiet=True)
    assert path == postext.cached_binary("1.2.3") and path.read_bytes() == body
    assert postext.find_binary("1.2.3", download=False) == path


def test_postext_bin(monkeypatch, tmp_path):
    exe = tmp_path / "my-postext"
    exe.write_bytes(b"")
    monkeypatch.setenv("POSTEXT_BIN", str(exe))
    assert postext.find_binary() == exe
    monkeypatch.setenv("POSTEXT_BIN", str(tmp_path / "nothing"))
    with pytest.raises(postext.BinaryNotFound, match="POSTEXT_BIN"):
        postext.find_binary()


@pytest.mark.skipif(shutil.which("curl") is None, reason="no curl")
def test_curl_when_python_cannot_verify_tls(release, tmp_path, monkeypatch):
    url, body = release

    def no_certificates(*a, **kw):
        raise urllib.error.URLError(ssl.SSLCertVerificationError("unable to get local issuer certificate"))

    monkeypatch.setattr(urllib.request, "urlopen", no_certificates)
    monkeypatch.setitem(sys.modules, "certifi", None)  # not installed
    path = postext.download_binary("1.2.3", dest=tmp_path / "p", file="postext-test", base_url=url, quiet=True)
    assert path.read_bytes() == body
    with pytest.raises(postext.BinaryNotFound, match="curl exit code"):
        postext.download_binary("9.9.9", dest=tmp_path / "q", file="postext-test", base_url=url, quiet=True)
