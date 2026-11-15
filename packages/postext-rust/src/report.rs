//! The `--json` report of a command, as Rust values.
//!
//! Every command prints one JSON object: `ok`, `command`, `version`,
//! `outputs`, `warnings`, `timings`, `exitCode` (and `error` when it failed),
//! plus fields of its own (`pages` and `book` for the commands that lay a
//! book out, `chapters` and `fonts` for `info`, `check` for `check`…).
//! [`Report::raw`] keeps the whole object, so a field this crate does not
//! name yet is still there. A field of an unexpected type reads as absent.

use std::collections::BTreeMap;
use std::fmt;
use std::ops::Deref;

use serde_json::{Map, Value};

fn int(v: Option<&Value>) -> Option<u64> {
    v.and_then(Value::as_u64)
}

fn text(v: Option<&Value>) -> Option<String> {
    v.and_then(Value::as_str).map(str::to_owned)
}

fn label(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::String(s) => Some(s.clone()),
        Value::Null => None,
        other => Some(other.to_string()),
    }
}

fn object(v: Option<&Value>) -> Option<Map<String, Value>> {
    v.and_then(Value::as_object).cloned()
}

fn objects(v: Option<&Value>) -> Vec<Map<String, Value>> {
    v.and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.as_object().cloned()).collect()).unwrap_or_default()
}

fn strings(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array)
        .map(|a| a.iter().map(|x| label(Some(x)).unwrap_or_default()).collect())
        .unwrap_or_default()
}

/// A warning, error or note the command reported.
#[derive(Debug, Clone, PartialEq)]
pub struct Diagnostic {
    /// The problem: `missingFont`, `unknownConfigKey`, `frameOverflow`,
    /// `preflight.lowResolution`…
    pub kind: String,
    /// What it says, in English.
    pub message: String,
    /// `error`, `warning` or `info`.
    pub severity: String,
    /// Where in the sources (`chapters/02.md:14`), when known.
    pub at: Option<String>,
    /// The page's label, when known.
    pub page: Option<String>,
    /// Details of its own, as the command gives them.
    pub data: Option<Map<String, Value>>,
}

impl Diagnostic {
    /// Whether its severity is `error`.
    pub fn is_error(&self) -> bool {
        self.severity == "error"
    }

    fn from_json(d: &Map<String, Value>) -> Self {
        Diagnostic {
            kind: text(d.get("kind")).unwrap_or_default(),
            message: text(d.get("message")).unwrap_or_default(),
            severity: text(d.get("severity")).unwrap_or_else(|| "warning".to_owned()),
            at: text(d.get("at")),
            page: label(d.get("page")),
            data: object(d.get("data")),
        }
    }
}

impl fmt::Display for Diagnostic {
    /// `warning missingFont (chapters/02.md:14, page 3): …`
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let page = self.page.as_ref().map(|p| format!("page {p}"));
        let place: Vec<&str> = [self.at.as_deref(), page.as_deref()].into_iter().flatten().collect();
        write!(f, "{} {}", self.severity, self.kind)?;
        if !place.is_empty() {
            write!(f, " ({})", place.join(", "))?;
        }
        write!(f, ": {}", self.message)
    }
}

/// A file or folder the command wrote (`path` is `"-"` for stdout).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Output {
    /// `pdf`, `html`, `epub`, `image`, `docx`, `idml`, `postext`…
    pub kind: String,
    /// Where it went.
    pub path: String,
    /// Its size in bytes.
    pub size: Option<u64>,
    /// Its number of pages.
    pub pages: Option<u64>,
}

impl Output {
    fn from_json(d: &Map<String, Value>) -> Self {
        Output {
            kind: text(d.get("kind")).unwrap_or_default(),
            path: text(d.get("path")).unwrap_or_default(),
            size: int(d.get("bytes")),
            pages: int(d.get("pages")),
        }
    }
}

/// The book a command read. `chapters` is the number of chapters laid out
/// ([`InfoReport::chapters`] lists them instead).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BookSummary {
    /// The book's title.
    pub name: String,
    /// Its id.
    pub id: String,
    /// The language it was read in.
    pub locale: Option<String>,
    /// `bundle`, `folder` or `markdown` (loose files).
    pub kind: Option<String>,
    /// The number of chapters laid out.
    pub chapters: Option<u64>,
    /// Its description.
    pub description: Option<String>,
    /// The languages a multilingual book carries.
    pub locales: Option<Vec<String>>,
    /// The page size preset (`A5`, `letter`…), when it names one.
    pub page_size: Option<String>,
}

impl BookSummary {
    fn from_json(d: &Map<String, Value>) -> Self {
        BookSummary {
            name: text(d.get("name")).unwrap_or_default(),
            id: text(d.get("id")).unwrap_or_default(),
            locale: text(d.get("locale")),
            kind: text(d.get("kind")),
            chapters: int(d.get("chapters")),
            description: text(d.get("description")),
            locales: d.get("locales").and_then(Value::as_array).map(|_| strings(d.get("locales"))),
            page_size: text(d.get("pageSize")),
        }
    }
}

/// What a command did: its outputs, warnings, timings and page count.
#[derive(Clone, PartialEq)]
pub struct Report {
    /// Whether the command succeeded.
    pub ok: bool,
    /// The command (`pdf`, `check`…).
    pub command: String,
    /// The executable's version.
    pub version: String,
    /// The exit code the command reported.
    pub exit_code: i32,
    /// The files and folders it wrote.
    pub outputs: Vec<Output>,
    /// Its warnings, errors and notes.
    pub warnings: Vec<Diagnostic>,
    /// Milliseconds per stage (`total`, `layout`, `pdf`…).
    pub timings: BTreeMap<String, f64>,
    /// Why it failed.
    pub error: Option<String>,
    /// The number of pages laid out.
    pub pages: Option<u64>,
    /// The book it read.
    pub book: Option<BookSummary>,
    /// The whole JSON object.
    pub raw: Value,
    /// The bytes the command wrote to stdout (`out("-")`).
    pub content: Option<Vec<u8>>,
    /// The command's terminal log.
    pub stderr: String,
}

impl Report {
    /// The first output, for the commands that write one file.
    pub fn output(&self) -> Option<&Output> {
        self.outputs.first()
    }

    /// The warnings of severity `error`.
    pub fn errors(&self) -> impl Iterator<Item = &Diagnostic> {
        self.warnings.iter().filter(|w| w.is_error())
    }

    /// A report from the JSON object the command printed.
    pub fn from_json(raw: Value, content: Option<Vec<u8>>, stderr: String) -> Self {
        let empty = Map::new();
        let d = raw.as_object().unwrap_or(&empty);
        let timings = d
            .get("timings")
            .and_then(Value::as_object)
            .map(|t| t.iter().filter_map(|(k, v)| Some((k.clone(), v.as_f64()?))).collect())
            .unwrap_or_default();
        Report {
            ok: d.get("ok").and_then(Value::as_bool).unwrap_or(false),
            command: text(d.get("command")).unwrap_or_default(),
            version: text(d.get("version")).unwrap_or_default(),
            exit_code: d.get("exitCode").and_then(Value::as_i64).unwrap_or(0) as i32,
            outputs: objects(d.get("outputs")).iter().map(Output::from_json).collect(),
            warnings: objects(d.get("warnings")).iter().map(Diagnostic::from_json).collect(),
            timings,
            error: text(d.get("error")),
            pages: int(d.get("pages")),
            book: object(d.get("book")).as_ref().map(BookSummary::from_json),
            content,
            stderr,
            raw,
        }
    }

    fn get(&self, key: &str) -> Option<&Value> {
        self.raw.get(key)
    }
}

impl fmt::Debug for Report {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Report")
            .field("ok", &self.ok)
            .field("command", &self.command)
            .field("version", &self.version)
            .field("exit_code", &self.exit_code)
            .field("outputs", &self.outputs)
            .field("warnings", &self.warnings)
            .field("timings", &self.timings)
            .field("error", &self.error)
            .field("pages", &self.pages)
            .field("book", &self.book)
            .field("content", &self.content.as_ref().map(|c| format!("{} bytes", c.len())))
            .finish_non_exhaustive()
    }
}

/// A report a command returns: [`Report`], or one of the reports with
/// fields of their own, which dereference to [`Report`].
pub trait FromReport: Sized {
    /// Reads the command's own fields from [`Report::raw`].
    fn from_report(report: Report) -> Self;
}

impl FromReport for Report {
    fn from_report(report: Report) -> Self {
        report
    }
}

macro_rules! detailed {
    ($(#[$m:meta])* $name:ident { $($(#[$fm:meta])* $field:ident: $ty:ty = |$r:ident| $e:expr,)* }) => {
        $(#[$m])*
        #[derive(Debug, Clone, PartialEq)]
        pub struct $name {
            /// What every command reports.
            pub report: Report,
            $($(#[$fm])* pub $field: $ty,)*
        }

        impl FromReport for $name {
            fn from_report(report: Report) -> Self {
                $(let $field = { let $r = &report; $e };)*
                $name { report, $($field,)* }
            }
        }

        impl Deref for $name {
            type Target = Report;
            fn deref(&self) -> &Report {
                &self.report
            }
        }

        impl From<$name> for Report {
            fn from(r: $name) -> Report {
                r.report
            }
        }
    };
}

/// A chapter `info` lists.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChapterInfo {
    /// Its position, from 1.
    pub index: u64,
    /// Its title.
    pub title: String,
    /// Its number of words.
    pub words: u64,
    /// The Markdown file it comes from.
    pub file: Option<String>,
    /// With `pages(true)`.
    pub pages: Option<u64>,
}

/// A font family the book uses: where its faces come from (`embedded`,
/// `book`, `font-dir`, `google`, `missing`…) and its variants (`400`,
/// `400i`, `700`…).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FontInfo {
    /// The family's name.
    pub family: String,
    /// Where its faces come from.
    pub source: String,
    /// Its variants.
    pub variants: Vec<String>,
}

/// A page: its printed label (`"iv"`, `"12"`), its position from 1 and its
/// chapter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageRef {
    /// The printed label.
    pub label: String,
    /// The position, from 1.
    pub position: u64,
    /// The chapter, from 1.
    pub chapter: Option<u64>,
}

detailed! {
    /// `info`: the book's chapters, resources by kind and fonts.
    InfoReport {
        /// The book's chapters.
        chapters: Vec<ChapterInfo> = |r| objects(r.get("chapters")).iter().map(|c| ChapterInfo {
            index: int(c.get("index")).unwrap_or(0),
            title: text(c.get("title")).unwrap_or_default(),
            words: int(c.get("words")).unwrap_or(0),
            file: text(c.get("file")),
            pages: int(c.get("pages")),
        }).collect(),
        /// Resources by kind, and `total`.
        resources: BTreeMap<String, u64> = |r| r.get("resources").and_then(Value::as_object)
            .map(|m| m.iter().filter_map(|(k, v)| Some((k.clone(), v.as_u64()?))).collect())
            .unwrap_or_default(),
        /// The font families it uses.
        fonts: Vec<FontInfo> = |r| objects(r.get("fonts")).iter().map(|f| FontInfo {
            family: text(f.get("family")).unwrap_or_default(),
            source: text(f.get("source")).unwrap_or_default(),
            variants: strings(f.get("variants")),
        }).collect(),
        /// The number of files it holds.
        files: Option<u64> = |r| int(r.get("files")),
    }
}

detailed! {
    /// `check`: whether the book passed, its error and warning counts, and
    /// the contrast, reflow and preflight results as the command gives them.
    CheckReport {
        /// Whether the book passed.
        passed: bool = |r| r.get("check").and_then(|c| c.get("passed")).and_then(Value::as_bool).unwrap_or(r.ok),
        /// The number of errors.
        error_count: u64 = |r| int(r.get("check").and_then(|c| c.get("errors"))).unwrap_or(0),
        /// The number of warnings.
        warning_count: u64 = |r| int(r.get("check").and_then(|c| c.get("warnings"))).unwrap_or(0),
        /// The contrast check.
        contrast: Option<Map<String, Value>> = |r| object(r.get("contrast")),
        /// The reflow check.
        reflow: Vec<Value> = |r| r.get("reflow").and_then(Value::as_array).cloned().unwrap_or_default(),
        /// The print preflight.
        preflight: Option<Map<String, Value>> = |r| object(r.get("preflight")),
    }
}

detailed! {
    /// `image`: the page that was rendered.
    ImageReport {
        /// The page.
        page: Option<PageRef> = |r| object(r.get("page")).map(|p| PageRef {
            label: label(p.get("label")).unwrap_or_default(),
            position: int(p.get("position")).unwrap_or(0),
            chapter: int(p.get("chapter")),
        }),
    }
}

detailed! {
    /// `import_docx`. Into a book: the `edits` applied, in conflict or
    /// rejected, the `comments`, the `files` changed and the unified `diff`.
    /// As a new book: the number of `chapters` and the document's `quality`
    /// report.
    ImportDocxReport {
        /// The new book's number of chapters.
        chapters: Option<u64> = |r| int(r.get("chapters")),
        /// The exported document's variant.
        variant: Option<String> = |r| text(r.get("variant")),
        /// The export the document came from.
        export_id: Option<String> = |r| text(r.get("exportId")),
        /// The edits applied, in conflict or rejected.
        edits: Vec<Map<String, Value>> = |r| objects(r.get("edits")),
        /// The document's comments.
        comments: Vec<Map<String, Value>> = |r| objects(r.get("comments")),
        /// The files changed.
        files: Vec<Value> = |r| r.get("files").and_then(Value::as_array).cloned().unwrap_or_default(),
        /// The unified diff of the changes.
        diff: Option<String> = |r| text(r.get("diff")),
        /// The import's quality report.
        quality: Option<Map<String, Value>> = |r| object(r.get("report")),
    }
}

detailed! {
    /// `unpack`: how many files the bundle held.
    UnpackReport {
        /// The number of files the bundle held.
        files: Option<u64> = |r| int(r.get("files")),
    }
}

detailed! {
    /// `design`: the design file's `name` and the `parts` it took (`page`,
    /// `text`, `headings`…).
    DesignReport {
        /// The design's name.
        name: Option<String> = |r| text(r.get("design").and_then(|d| d.get("name"))),
        /// The parts it took.
        parts: Vec<String> = |r| strings(r.get("design").and_then(|d| d.get("parts"))),
    }
}

detailed! {
    /// `import_idml`: whether the book was set as composed pages or as a
    /// flowing book (`layout`: `pages` or `flow`) and why (`reason`), the
    /// number of `chapters`, the importer's `quality` report, the `fonts` the
    /// document names, the linked pictures not found (`missing_links`) and,
    /// for a zipped InDesign package, `package`.
    ImportIdmlReport {
        /// `pages` or `flow`.
        layout: Option<String> = |r| text(r.get("layout")),
        /// Why.
        reason: Option<String> = |r| text(r.get("reason")),
        /// The number of chapters.
        chapters: Option<u64> = |r| int(r.get("chapters")),
        /// The importer's quality report.
        quality: Option<Map<String, Value>> = |r| object(r.get("report")),
        /// The fonts the document names.
        fonts: Vec<Map<String, Value>> = |r| objects(r.get("fonts")),
        /// The linked pictures not found.
        missing_links: Vec<Map<String, Value>> = |r| objects(r.get("missingLinks")),
        /// For a zipped package: the document taken, the pictures and font files read.
        package: Option<Map<String, Value>> = |r| object(r.get("package")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_a_report() {
        let raw = json!({
            "ok": true, "command": "pdf", "version": "1.87.0", "exitCode": 0, "pages": 3,
            "outputs": [{"kind": "pdf", "path": "b.pdf", "bytes": 1234, "pages": 3}, "junk"],
            "warnings": [{"kind": "unknownConfigKey", "message": "nonsense", "at": "config.json", "page": 2}],
            "timings": {"total": 812.5, "layout": 400, "bad": "x"},
            "book": {"name": "B", "id": "b", "chapters": 2, "locales": ["en", "es"], "pageSize": "A5"},
            "future": {"kept": true}
        });
        let r = Report::from_json(raw, None, String::new());
        assert!(r.ok && r.command == "pdf" && r.pages == Some(3));
        assert_eq!(
            r.output().unwrap(),
            &Output { kind: "pdf".into(), path: "b.pdf".into(), size: Some(1234), pages: Some(3) }
        );
        let w = &r.warnings[0];
        assert_eq!(w.severity, "warning");
        assert_eq!(w.to_string(), "warning unknownConfigKey (config.json, page 2): nonsense");
        assert_eq!(r.timings.len(), 2);
        let book = r.book.as_ref().unwrap();
        assert_eq!((book.chapters, book.locales.as_deref()), (Some(2), Some(&["en".to_owned(), "es".to_owned()][..])));
        assert_eq!(r.raw["future"]["kept"], true);
        assert_eq!(r.errors().count(), 0);
    }

    #[test]
    fn detailed_reports() {
        let r = Report::from_json(
            json!({"ok": false, "check": {"passed": false, "errors": 1, "warnings": 2}, "reflow": [1]}),
            None,
            String::new(),
        );
        let c = CheckReport::from_report(r);
        assert!(!c.passed && c.error_count == 1 && c.warning_count == 2 && c.reflow.len() == 1);
        assert!(!c.ok); // through Deref
        let d = DesignReport::from_report(Report::from_json(
            json!({"design": {"name": "Large", "parts": ["page", "text"]}}),
            None,
            String::new(),
        ));
        assert_eq!((d.name.as_deref(), d.parts.clone()), (Some("Large"), vec!["page".to_owned(), "text".to_owned()]));
        let i = ImageReport::from_report(Report::from_json(
            json!({"page": {"label": "iv", "position": 4, "chapter": 1}}),
            None,
            String::new(),
        ));
        assert_eq!(i.page, Some(PageRef { label: "iv".into(), position: 4, chapter: Some(1) }));
    }
}
