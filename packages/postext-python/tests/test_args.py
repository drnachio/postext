"""Argument building and report parsing, without the executable."""

import json
from pathlib import Path

import pytest

import postext
from postext import _client
from postext._client import _chapters, _settings, _split_stdout


def test_chapters():
    assert _chapters(3) == "3"
    assert _chapters("1,3-5") == "1,3-5"
    assert _chapters([1, 3]) == "1,3"
    assert _chapters(range(2, 5)) == "2-4"
    assert _chapters([range(1, 2), 4, "6-7"]) == "1,4,6-7"
    with pytest.raises(ValueError):
        _chapters(range(1, 6, 2))


def test_settings_are_json_unless_text():
    assert _settings({"page.dpi": 300, "pdf.on": True, "a.b": None, "x": "EB Garamond", "l": [1, "a"]}) == [
        "page.dpi=300",
        "pdf.on=true",
        "a.b=null",
        "x=EB Garamond",
        'l=[1,"a"]',
    ]
    assert _settings(["page.dpi=300"]) == ["page.dpi=300"]
    assert _settings("page.dpi=300") == ["page.dpi=300"]


def test_book_args(tmp_path: Path):
    client = postext.Postext("postext", font_dirs=[tmp_path / "fonts"], offline=True)
    with _client._Temp() as temp:
        args = client._book_args(
            {"locale": "es", "chapters": [1, 2], "set": {"page.dpi": 300}, "config": {"page": {"dpi": 72}}, "name": "Libro"},
            temp,
        )
        config = args[args.index("--config") + 1]
        assert json.loads(Path(config).read_text(encoding="utf-8")) == {"page": {"dpi": 72}}
    assert args[:6] == ["--locale", "es", "--chapters", "1,2", "--set", "page.dpi=300"]
    assert "--offline" in args and ["--font-dir", str(tmp_path / "fonts")] == args[args.index("--font-dir") : args.index("--font-dir") + 2]
    assert args[args.index("--name") + 1] == "Libro"
    with pytest.raises(TypeError):
        client._book_args({"locales": "es"}, temp)


def test_split_stdout_with_content():
    report = {"ok": True, "command": "pdf", "outputs": [{"kind": "pdf", "path": "-", "bytes": 9}], "nested": {"ok": 1}}
    payload = b'%PDF{\n  "ok": x'  # a payload that contains the marker itself
    data, content = _split_stdout(payload + json.dumps(report, indent=2).encode() + b"\n", True)
    assert data == report and content == payload
    data, content = _split_stdout(json.dumps(report, indent=2).encode(), False)
    assert data == report and content is None
    assert _split_stdout(b"", False) == (None, None)


def test_report_from_json():
    raw = {
        "ok": False,
        "command": "check",
        "version": "1.70.4",
        "book": {"name": "book", "id": "book", "locale": "en", "chapters": 2},
        "pages": 3,
        "check": {"errors": 0, "warnings": 1, "passed": False},
        "outputs": [],
        "warnings": [{"kind": "missingFont", "severity": "warning", "message": "no font", "at": "01.md:3", "page": 2}],
        "timings": {"total": 390, "layout": 61.7},
        "exitCode": 3,
    }
    r = postext.CheckReport.from_json(raw, stderr="log")
    assert (r.ok, r.exit_code, r.pages, r.passed, r.warning_count) == (False, 3, 3, False, 1)
    assert r.book == postext.BookSummary(name="book", id="book", locale="en", chapters=2)
    w = r.warnings[0]
    assert (w.kind, w.at, w.page, w.is_error) == ("missingFont", "01.md:3", "2", False)
    assert str(w) == "warning missingFont (01.md:3, page 2): no font"
    assert r.timings == {"total": 390.0, "layout": 61.7}
    assert r.raw["check"]["warnings"] == 1 and r.stderr == "log"


def test_bytes_input_needs_out_for_folders():
    client = postext.Postext("postext")
    with pytest.raises(ValueError):
        client.images(b"PK\x03\x04")
    with pytest.raises(ValueError):
        client.unpack(b"PK\x03\x04")
