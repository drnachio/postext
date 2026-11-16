//! Every command, run by the real executable on a small book: `POSTEXT_BIN`
//! when set, else the release of the crate's version, downloaded once into
//! the cache (`POSTEXT_CACHE_DIR` moves it).

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use postext::{Error, Output, PageRef, Postext, STDOUT};
use serde_json::json;
use tempfile::TempDir;

fn client() -> &'static Postext {
    static CLIENT: OnceLock<Postext> = OnceLock::new();
    CLIENT.get_or_init(|| {
        let client = Postext::with_binary(postext::find_binary().expect("the postext executable")).offline(true);
        // The first command that sets text copies Skia's addon (and on Windows
        // its icudtl.dat) into the cache. Executables up to 1.87.0 crash when
        // several processes do it at once on Windows (#1597), and the tests
        // run in parallel: place it once first.
        let (_dir, book) = book();
        client.info(&book).pages(true).run().expect("a first run");
        client
    })
}

/// Two chapters; chapter two opens on a recto, so page 2 is blank.
fn book() -> (TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("book");
    std::fs::create_dir(&folder).unwrap();
    std::fs::write(folder.join("01.md"), "---\ntitle: Smoke test\n---\n\n# One\n\nSome *text* and a formula $x^2$.\n")
        .unwrap();
    std::fs::write(folder.join("02.md"), "# Two\n\nMore text.\n").unwrap();
    (dir, folder)
}

fn bundle(dir: &Path, book: &Path) -> PathBuf {
    let out = dir.join("book.postext");
    client().pack(book).out(&out).auto_thumbnail(false).run().unwrap();
    out
}

fn is_zip(data: &[u8]) -> bool {
    data.starts_with(b"PK")
}

#[test]
fn version() {
    assert!(client().version().unwrap().starts_with("postext "));
}

#[test]
fn pdf_to_a_file() {
    let (dir, book) = book();
    let out = dir.path().join("out").join("book.pdf");
    let r = client().pdf(&book).out(&out).set("page.dpi", 300).chapters([1, 2]).locale("en").run().unwrap();
    assert!(r.ok && r.command == "pdf" && r.exit_code == 0);
    assert_eq!(r.pages, Some(3));
    assert_eq!(r.book.as_ref().and_then(|b| b.chapters), Some(2));
    let size = std::fs::metadata(&out).unwrap().len();
    assert_eq!(
        r.output(),
        Some(&Output { kind: "pdf".into(), path: out.display().to_string(), size: Some(size), pages: Some(3) })
    );
    assert!(std::fs::read(&out).unwrap().starts_with(b"%PDF-"));
    assert!(r.timings.contains_key("total") && r.warnings.is_empty());
}

#[test]
fn pdf_bytes_in_and_out() {
    let (dir, book) = book();
    let bundle = bundle(dir.path(), &book);
    // bytes in, no out: bytes back
    let r = client().pdf(std::fs::read(&bundle).unwrap()).run().unwrap();
    let content = r.content.as_deref().unwrap();
    assert!(content.starts_with(b"%PDF-"));
    let out = r.output().unwrap();
    assert_eq!((out.path.as_str(), out.size), ("-", Some(content.len() as u64)));
    assert!(client().pdf(&bundle).chapters(2).bytes().unwrap().starts_with(b"%PDF-"));
}

#[test]
fn warnings_are_values() {
    let (_dir, book) = book();
    let r = client().pdf(&book).out(STDOUT).set("nonsense.path", 3).run().unwrap();
    let w = r.warnings.iter().find(|w| w.kind == "unknownConfigKey").expect("an unknownConfigKey warning");
    assert!(w.severity == "warning" && w.message.contains("nonsense"));
    assert!(r.content.unwrap().starts_with(b"%PDF-"));
}

#[test]
fn html_epub_docx_bytes() {
    let (_dir, book) = book();
    let html = client().html(&book).bytes().unwrap();
    assert!(String::from_utf8_lossy(&html[..200]).to_lowercase().contains("<!doctype html>"));
    assert!(is_zip(&client().epub(&book).bytes().unwrap()));
    assert!(is_zip(&client().docx(&book).bytes().unwrap()));
    assert!(is_zip(&client().pack(&book).auto_thumbnail(false).bytes().unwrap()));
}

#[test]
fn image() {
    let (dir, book) = book();
    let png = client().image(&book, "#1").dpi(20).bytes().unwrap();
    assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
    let out = dir.path().join("p2.jpg");
    let r = client().image(&book, "#2").out(&out).dpi(20).run().unwrap();
    assert_eq!(r.page, Some(PageRef { label: "2".into(), position: 2, chapter: Some(2) }));
    assert!(std::fs::read(&out).unwrap().starts_with(b"\xff\xd8"));
}

#[test]
fn images() {
    let (dir, book) = book();
    let r = client().images(&book).out(dir.path().join("pages")).dpi(20).pattern("p-{n}").run().unwrap();
    let mut names: Vec<String> =
        r.outputs.iter().map(|o| Path::new(&o.path).file_name().unwrap().to_string_lossy().into_owned()).collect();
    names.sort();
    assert_eq!(names, ["p-1.png", "p-2.png", "p-3.png"]);
    assert!(r.outputs.iter().all(|o| Path::new(&o.path).is_file()));
    // a folder cannot come back as bytes
    let bytes = std::fs::read(bundle(dir.path(), &book)).unwrap();
    assert!(matches!(client().images(bytes).run(), Err(Error::InvalidArgument(_))));
}

#[test]
fn info() {
    let (_dir, book) = book();
    let r = client().info(&book).pages(true).run().unwrap();
    let chapters: Vec<(u64, &str, Option<u64>)> =
        r.chapters.iter().map(|c| (c.index, c.title.as_str(), c.pages)).collect();
    assert_eq!(chapters, [(1, "One", Some(1)), (2, "Two", Some(2))]);
    assert!(r.fonts.iter().any(|f| f.family == "EB Garamond"));
    assert_eq!(r.resources.get("total"), Some(&0));
    assert_eq!(r.pages, Some(3));
}

#[test]
fn check() {
    let (_dir, book) = book();
    let r = client().check(&book).run().unwrap();
    assert!(r.passed && r.error_count == 0);
    let err = client().check(&book).strict(true).set("bodyText.fontFamily", "Nonexistent Sans").run().unwrap_err();
    assert!(matches!(err, Error::ProblemsFound(_)), "{err:?}");
    assert_eq!(err.exit_code(), Some(3));
    let report = err.report().unwrap();
    assert!(!report.ok && report.warnings.iter().any(|w| w.kind == "missingFont"));
    let quiet = client()
        .check(&book)
        .strict(true)
        .set("bodyText.fontFamily", "Nonexistent Sans")
        .allow_problems()
        .run()
        .unwrap();
    assert!(!quiet.passed && quiet.warning_count >= 1);
}

#[test]
fn pack_unpack() {
    let (dir, book) = book();
    let bundle = dir.path().join("b.postext");
    client().pack(&book).out(&bundle).name("Packed").auto_thumbnail(false).run().unwrap();
    assert!(is_zip(&std::fs::read(&bundle).unwrap()));
    let r = client().unpack(std::fs::read(&bundle).unwrap()).out(dir.path().join("unpacked")).run().unwrap();
    assert!(r.files.unwrap_or(0) >= 3);
    assert!(dir.path().join("unpacked").join("preset.json").is_file());
    assert!(matches!(client().unpack(std::fs::read(&bundle).unwrap()).run(), Err(Error::InvalidArgument(_))));
}

#[test]
fn docx_round_trip() {
    let (dir, book) = book();
    let bundle = bundle(dir.path(), &book);
    let docx = dir.path().join("b.docx");
    client().docx(&bundle).out(&docx).run().unwrap();
    let r = client().import_docx(&docx).out(dir.path().join("imported")).run().unwrap();
    assert!(r.quality.is_some());
    assert!(dir.path().join("imported").join("preset.json").is_file());
    let folder = dir.path().join("unpacked");
    client().unpack(&bundle).out(&folder).run().unwrap();
    let dry = client().import_docx(std::fs::read(&docx).unwrap()).into_book(&folder).dry_run(true).run().unwrap();
    assert!(dry.ok && dry.edits.is_empty() && dry.export_id.is_some());
}

#[test]
fn build() {
    let (dir, book) = book();
    let d = dir.path();
    let r = client()
        .build(&book)
        .pdf(d.join("b.pdf"))
        .html(d.join("b.html"))
        .epub(d.join("b.epub"))
        .idml(d.join("b.idml"))
        .run()
        .unwrap();
    let mut kinds: Vec<&str> = r.outputs.iter().map(|o| o.kind.as_str()).collect();
    kinds.sort();
    assert_eq!(kinds, ["epub", "html", "idml", "pdf"]);
    assert!(r.outputs.iter().all(|o| Path::new(&o.path).is_file()));
}

#[test]
fn design_round_trip() {
    let (dir, book) = book();
    let d = dir.path();
    let styled = d.join("styled.postext");
    assert!(
        client().pack(&book).out(&styled).set("bodyText.fontSize.value", 14).auto_thumbnail(false).run().unwrap().ok
    );
    let out = d.join("type.postext");
    let r = client().design(&styled).out(&out).parts(["page", "text"]).design_name("Large type").run().unwrap();
    assert_eq!((r.name.as_deref(), r.parts.clone()), (Some("Large type"), vec!["page".to_owned(), "text".to_owned()]));
    assert!(is_zip(&std::fs::read(&out).unwrap()));
    assert_eq!(r.output().map(|o| o.path.clone()), Some(out.display().to_string()));
    let plain = client().pdf(&book).out(d.join("plain.pdf")).run().unwrap();
    let large = client().pdf(&book).out(d.join("large.pdf")).design(&out).design_parts(["text"]).run().unwrap();
    assert!(large.ok && large.pages.unwrap_or(0) >= plain.pages.unwrap_or(0));
    let data = client().design(&styled).parts(["text"]).bytes().unwrap();
    assert!(is_zip(&data));
    assert!(client().pdf(&book).design(data).bytes().unwrap().starts_with(b"%PDF-"));
    let usage = client().pdf(&book).out(STDOUT).design_parts(["text"]).run().unwrap_err();
    assert!(matches!(usage, Error::Usage(_)), "{usage:?}");
}

#[test]
fn idml_and_import_idml() {
    let (dir, book) = book();
    let d = dir.path();
    let out = d.join("b.idml");
    let r = client().idml(&book).out(&out).lines("reflow").spreads("single").run().unwrap();
    let o = r.output().unwrap();
    assert!(r.ok && o.kind == "idml" && o.pages == Some(3));
    assert!(is_zip(&std::fs::read(&out).unwrap()));
    assert!(is_zip(&client().idml(&book).bytes().unwrap()));
    let imported =
        client().import_idml(std::fs::read(&out).unwrap()).out(d.join("imported")).layout("flow").run().unwrap();
    assert_eq!(imported.layout.as_deref(), Some("flow"));
    assert!(imported.chapters.unwrap_or(0) >= 1 && imported.quality.is_some() && imported.package.is_none());
    assert!(d.join("imported").join("preset.json").is_file());
    let bundle = client().import_idml(&out).out(d.join("imported.postext")).auto_thumbnail(false).run().unwrap();
    assert!(matches!(bundle.layout.as_deref(), Some("pages" | "flow")));
    assert!(is_zip(&std::fs::read(d.join("imported.postext")).unwrap()));
}

#[test]
fn failures_are_errors() {
    let (dir, book) = book();
    let err = client().pdf(dir.path().join("nothere.md")).out(dir.path().join("x.pdf")).run().unwrap_err();
    assert!(matches!(err, Error::Failed(_)), "{err:?}");
    assert_eq!(err.exit_code(), Some(1));
    assert!(err.to_string().contains("nothere.md"), "{err}");
    assert!(err.report().is_some_and(|r| !r.ok));
    let usage = client().html(&book).out(STDOUT).assets("folder").run().unwrap_err();
    assert!(matches!(usage, Error::Usage(_)) && usage.exit_code() == Some(2), "{usage:?}");
    assert!(matches!(client().pdf(&book).chapters(3..3).run(), Err(Error::InvalidArgument(_))));
}

#[test]
fn config_json_and_arguments() {
    let (dir, book) = book();
    let cmd =
        client().pdf(&book).config_json(&json!({"page": {"sizePreset": "A5"}})).set("page.dpi", 300).set("x", "y");
    let args: Vec<String> = cmd.args().unwrap().iter().map(|a| a.to_string_lossy().into_owned()).collect();
    assert_eq!(args[0], "pdf");
    assert!(args.windows(2).any(|w| w == ["--set", "page.dpi=300"]) && args.windows(2).any(|w| w == ["--set", "x=y"]));
    assert!(args.iter().any(|a| a == "--offline") && args.ends_with(&["--json".into(), "--no-color".into()]));
    let r = cmd.out(dir.path().join("a5.pdf")).run().unwrap();
    assert!(r.ok);
}

#[test]
fn run_and_root_functions() {
    let (dir, book) = book();
    assert!(client().run(["--version"]).unwrap().status.success());
    // The root functions find the executable themselves: the cached one, or POSTEXT_BIN.
    let r = postext::pdf(&book).out(dir.path().join("m.pdf")).offline(true).run().unwrap();
    assert!(r.ok && dir.path().join("m.pdf").is_file());
}
