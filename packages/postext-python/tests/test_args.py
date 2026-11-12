"""Argument building and report parsing, without the executable."""

import json
from pathlib import Path

import pytest

import postext
from postext import _args
from postext._args import chapters_arg as _chapters
from postext._args import settings_args as _settings
from postext._args import split_stdout as _split_stdout


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
    with _args.Temp() as temp:
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
    with pytest.raises(ValueError):
        client.import_idml(b"PK\x03\x04")


def test_design_book_options(tmp_path: Path):
    client = postext.Postext("postext")
    with _args.Temp() as temp:
        args = client._book_args({"design": tmp_path / "novel.postext", "design_parts": ["page", "text"]}, temp)
        assert args == ["--design", str(tmp_path / "novel.postext"), "--design-parts", "page,text"]
        args = client._book_args({"design": b"PK\x03\x04", "design_parts": "headings"}, temp)
        assert Path(args[1]).read_bytes() == b"PK\x03\x04" and args[1].endswith(".postext")
        assert args[2:] == ["--design-parts", "headings"] and not temp.used


class _Calls:
    """Stands in for ``Postext._execute``: keeps the command and its arguments."""

    def __init__(self, client: postext.Postext):
        self.calls: list = []
        client._execute = self  # type: ignore[method-assign]

    def __call__(self, command, args, report_type, **kwargs):
        self.calls.append((command, list(args), kwargs.get("content", False)))
        return report_type.from_json({"ok": True, "command": command})

    def options(self) -> dict:
        """The last call's options: ``--name value``, or ``True`` for a switch."""
        args = self.calls[-1][1]
        out = {}
        for n, a in enumerate(args):
            if a.startswith("--"):
                value = args[n + 1] if n + 1 < len(args) and not args[n + 1].startswith("--") else True
                out[a] = value
        return out


def test_design_idml_and_build_args():
    client = postext.Postext("postext")
    calls = _Calls(client)
    client.design("book/", out="d.postext", parts=["page", "headings"], design_name="Novel", id="novel", description="Novels")
    assert calls.calls[-1][0] == "design" and calls.calls[-1][1][0] == "book/"
    assert calls.options() == {"--out": "d.postext", "--parts": "page,headings", "--design-name": "Novel", "--id": "novel", "--description": "Novels"}
    client.design_bytes(b"PK\x03\x04", parts="text")
    assert calls.calls[-1][2] is True and calls.options()["--out"] == "-"
    client.idml("book/", out="b.idml", images="link", lines="reflow", spreads="single", fonts=True, design="d.postext")
    assert calls.options() == {
        "--out": "b.idml",
        "--images": "link",
        "--lines": "reflow",
        "--spreads": "single",
        "--fonts": True,
        "--design": "d.postext",
    }
    client.idml_bytes("book/", fonts=False)
    assert calls.calls[-1][2] is True and "--no-fonts" in calls.calls[-1][1]
    client.build("book/", idml="b.idml", idml_images="embed", idml_lines="keep", idml_spreads="facing", idml_fonts=True, docx="b.docx")
    o = calls.options()
    assert (o["--idml"], o["--idml-images"], o["--idml-lines"], o["--idml-spreads"]) == ("b.idml", "embed", "keep", "facing")
    assert o["--idml-fonts"] is True and o["--docx"] == "b.docx"


def test_import_idml_args(tmp_path: Path):
    client = postext.Postext("postext", font_dirs=tmp_path / "fonts", offline=True)
    calls = _Calls(client)
    client.import_idml(
        tmp_path / "pkg.zip",
        out=tmp_path / "book",
        document="Book/Book.idml",
        layout="flow",
        links=tmp_path / "links",
        name="Libro",
        locale="es",
        hidden=True,
        pasteboard=True,
        non_printing=True,
        conditions="all",
        changes="reject",
        masters=False,
        quality_report=True,
        auto_thumbnail=False,
        cache_dir=tmp_path / "cache",
    )
    command, args, _ = calls.calls[-1]
    assert command == "import-idml" and args[0] == str(tmp_path / "pkg.zip")
    assert calls.options() == {
        "--out": str(tmp_path / "book"),
        "--document": "Book/Book.idml",
        "--layout": "flow",
        "--links": str(tmp_path / "links"),
        "--name": "Libro",
        "--locale": "es",
        "--hidden": True,
        "--pasteboard": True,
        "--non-printing": True,
        "--conditions": "all",
        "--changes": "reject",
        "--no-masters": True,
        "--report": True,
        "--no-auto-thumbnail": True,
        "--font-dir": str(tmp_path / "fonts"),
        "--offline": True,
        "--cache-dir": str(tmp_path / "cache"),
    }
    client.import_idml(b"PK\x03\x04", out=tmp_path / "b.postext", offline=False)
    assert calls.calls[-1][1][0].endswith(".idml") and "--offline" not in calls.calls[-1][1]


def test_design_and_import_idml_reports():
    d = postext.DesignReport.from_json({"ok": True, "command": "design", "design": {"name": "Novel", "parts": ["page", "text"]}})
    assert (d.name, d.parts) == ("Novel", ["page", "text"])
    raw = {
        "ok": True,
        "command": "import-idml",
        "layout": "pages",
        "reason": "the text frames are threaded page by page",
        "report": {"verdict": "good", "counts": {"pages": 2}},
        "fonts": [{"family": "Minion Pro", "styles": []}],
        "missingLinks": [{"name": "a.tif", "uri": "file:/a.tif", "uses": 1}],
        "chapters": 1,
        "package": {"document": "Book/Book.idml", "fonts": 2},
    }
    r = postext.ImportIdmlReport.from_json(raw)
    assert (r.layout, r.chapters, r.quality, r.package) == ("pages", 1, raw["report"], raw["package"])
    assert r.reason == raw["reason"] and r.fonts == raw["fonts"] and r.missing_links == raw["missingLinks"]
    assert postext.ImportIdmlReport.from_json({"ok": True}).package is None
