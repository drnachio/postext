"""Every command, run by the real executable on a small book."""

import zipfile
from pathlib import Path

import pytest

import postext


def test_version(client):
    assert client.version().startswith("postext ")


def test_pdf_to_a_file(client, book, tmp_path):
    out = tmp_path / "out" / "book.pdf"
    r = client.pdf(book, out=out, set={"page.dpi": 300}, chapters=[1, 2], locale="en")
    assert r.ok and r.command == "pdf" and r.exit_code == 0
    # chapter two opens on a recto: page 2 is blank
    assert r.pages == 3 and r.book and r.book.chapters == 2
    assert r.output == postext.Output(kind="pdf", path=str(out), size=out.stat().st_size, pages=3)
    assert out.read_bytes()[:5] == b"%PDF-"
    assert "total" in r.timings and r.warnings == []


def test_pdf_bytes_in_and_out(client, bundle):
    r = client.pdf(bundle.read_bytes())  # bytes in, no out: bytes back
    assert r.content and r.content[:5] == b"%PDF-"
    assert r.output and r.output.path == "-" and r.output.size == len(r.content)
    assert client.pdf_bytes(bundle, chapters=2)[:5] == b"%PDF-"


def test_warnings_are_objects(client, book):
    r = client.pdf(book, out=postext.STDOUT, set={"nonsense.path": 3})
    w = next(w for w in r.warnings if w.kind == "unknownConfigKey")
    assert isinstance(w, postext.Diagnostic) and w.severity == "warning" and "nonsense" in w.message
    assert r.content and r.content[:5] == b"%PDF-"


def test_html_epub_docx_bytes(client, book):
    assert b"<!doctype html>" in client.html_bytes(book)[:200].lower()
    for data in (client.epub_bytes(book), client.docx_bytes(book), client.pack_bytes(book, auto_thumbnail=False)):
        assert data[:2] == b"PK"


def test_image(client, book, tmp_path):
    png = client.image_bytes(book, page="#1", dpi=20)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    r = client.image(book, page="#2", out=tmp_path / "p2.jpg", dpi=20)
    assert r.page == postext.PageRef(label="2", position=2, chapter=2)
    assert (tmp_path / "p2.jpg").read_bytes()[:2] == b"\xff\xd8"


def test_images(client, book, tmp_path):
    r = client.images(book, out=tmp_path / "pages", dpi=20, pattern="p-{n}")
    assert sorted(Path(o.path).name for o in r.outputs) == ["p-1.png", "p-2.png", "p-3.png"]
    assert all(Path(o.path).is_file() for o in r.outputs)


def test_info(client, book):
    r = client.info(book, pages=True)
    assert isinstance(r, postext.InfoReport)
    assert [(c.index, c.title, c.pages) for c in r.chapters] == [(1, "One", 1), (2, "Two", 2)]
    assert {f.family for f in r.fonts} >= {"EB Garamond"}
    assert r.resources.get("total") == 0 and r.pages == 3


def test_check(client, book):
    r = client.check(book)
    assert isinstance(r, postext.CheckReport) and r.passed and r.error_count == 0
    with pytest.raises(postext.ProblemsFound) as err:
        client.check(book, strict=True, set={"bodyText.fontFamily": "Nonexistent Sans"})
    report = err.value.report
    assert err.value.exit_code == 3 and isinstance(report, postext.CheckReport) and not report.passed
    assert any(w.kind == "missingFont" for w in report.warnings)
    quiet = client.check(book, strict=True, set={"bodyText.fontFamily": "Nonexistent Sans"}, raise_on_problems=False)
    assert not quiet.passed and quiet.warning_count >= 1


def test_pack_unpack(client, book, tmp_path):
    bundle = tmp_path / "b.postext"
    client.pack(book, out=bundle, name="Packed", auto_thumbnail=False)
    assert zipfile.is_zipfile(bundle)
    r = client.unpack(bundle.read_bytes(), out=tmp_path / "unpacked")
    assert isinstance(r, postext.UnpackReport) and (r.files or 0) >= 3
    assert (tmp_path / "unpacked" / "preset.json").is_file()


def test_docx_round_trip(client, bundle, tmp_path):
    docx = tmp_path / "b.docx"
    client.docx(bundle, out=docx)
    r = client.import_docx(docx, out=tmp_path / "imported")
    assert isinstance(r, postext.ImportDocxReport) and r.quality is not None
    assert (tmp_path / "imported" / "preset.json").is_file()
    folder = tmp_path / "unpacked"
    client.unpack(bundle, out=folder)
    dry = client.import_docx(docx.read_bytes(), folder, dry_run=True)
    assert dry.ok and dry.edits == [] and dry.export_id


def test_build(client, book, tmp_path):
    r = client.build(book, pdf=tmp_path / "b.pdf", html=tmp_path / "b.html", epub=tmp_path / "b.epub", idml=tmp_path / "b.idml")
    assert sorted(o.kind for o in r.outputs) == ["epub", "html", "idml", "pdf"]
    assert all(Path(o.path).is_file() for o in r.outputs)


def test_design_round_trip(client, book, tmp_path):
    styled = client.pack(book, out=tmp_path / "styled.postext", set={"bodyText.fontSize.value": 14}, auto_thumbnail=False)
    assert styled.ok
    out = tmp_path / "type.postext"
    r = client.design(tmp_path / "styled.postext", out=out, parts=["page", "text"], design_name="Large type")
    assert isinstance(r, postext.DesignReport) and (r.name, r.parts) == ("Large type", ["page", "text"])
    assert zipfile.is_zipfile(out) and r.output and r.output.path == str(out)
    plain = client.pdf(book, out=tmp_path / "plain.pdf")
    large = client.pdf(book, out=tmp_path / "large.pdf", design=out, design_parts="text")
    assert large.ok and (large.pages or 0) >= (plain.pages or 0)
    data = client.design_bytes(tmp_path / "styled.postext", parts="text")
    assert data[:2] == b"PK" and client.pdf_bytes(book, design=data)[:5] == b"%PDF-"
    with pytest.raises(postext.UsageError):
        client.pdf(book, out=postext.STDOUT, design_parts="text")


def test_idml_and_import_idml(client, book, tmp_path):
    out = tmp_path / "b.idml"
    r = client.idml(book, out=out, lines="reflow", spreads="single")
    assert r.ok and r.output and r.output.kind == "idml" and r.output.pages == 3
    assert zipfile.is_zipfile(out)
    assert client.idml_bytes(book)[:2] == b"PK"
    imported = client.import_idml(out.read_bytes(), out=tmp_path / "imported", layout="flow")
    assert isinstance(imported, postext.ImportIdmlReport) and imported.layout == "flow"
    assert (imported.chapters or 0) >= 1 and imported.quality is not None and imported.package is None
    assert (tmp_path / "imported" / "preset.json").is_file()
    bundle = client.import_idml(out, out=tmp_path / "imported.postext", auto_thumbnail=False)
    assert bundle.layout in ("pages", "flow") and zipfile.is_zipfile(tmp_path / "imported.postext")


def test_failures_raise(client, book, tmp_path):
    with pytest.raises(postext.PostextError) as err:
        client.pdf(tmp_path / "nothere.md", out=tmp_path / "x.pdf")
    assert err.value.exit_code == 1 and "nothere.md" in str(err.value)
    assert err.value.report is not None and err.value.report.ok is False
    with pytest.raises(postext.UsageError) as usage:
        client.html(book, out=postext.STDOUT, assets="folder")
    assert usage.value.exit_code == 2


def test_run_and_module_functions(client, book, tmp_path, monkeypatch):
    assert client.run(["--version"]).returncode == 0
    monkeypatch.setenv("POSTEXT_BIN", str(client.binary))
    r = postext.pdf(book, out=tmp_path / "m.pdf", offline=True)
    assert r.ok and (tmp_path / "m.pdf").is_file()
