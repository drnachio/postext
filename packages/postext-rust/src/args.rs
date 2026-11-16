//! The arguments of the command line, built from Rust values, and the
//! reading of what the executable prints back.

use std::ffi::{OsStr, OsString};
use std::ops::{Range, RangeInclusive};
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::error::{Error, Result};

/// `out("-")`: the command writes to stdout and the bytes come back in
/// [`Report::content`](crate::Report::content).
pub const STDOUT: &str = "-";

/// A book: a `.postext` file, a book folder or a Markdown file, or the bytes
/// of a `.postext` bundle (written to a temporary file for the run).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Book {
    /// A path, as given.
    Path(PathBuf),
    /// The bytes of a file.
    Bytes(Vec<u8>),
}

macro_rules! book_from {
    ($($t:ty => |$v:ident| $e:expr;)*) => {
        $(impl From<$t> for Book {
            fn from($v: $t) -> Self {
                $e
            }
        })*
    };
}

book_from! {
    &str => |v| Book::Path(v.into());
    String => |v| Book::Path(v.into());
    &String => |v| Book::Path(v.into());
    PathBuf => |v| Book::Path(v);
    &PathBuf => |v| Book::Path(v.clone());
    &Path => |v| Book::Path(v.to_owned());
    &OsStr => |v| Book::Path(v.into());
    OsString => |v| Book::Path(v.into());
    Vec<u8> => |v| Book::Bytes(v);
    &Vec<u8> => |v| Book::Bytes(v.clone());
    &[u8] => |v| Book::Bytes(v.to_vec());
}

/// One book, or several Markdown files (the chapters, in order).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Books(pub Vec<Book>);

macro_rules! books_from {
    (one: $($t:ty),*; many: $($m:ty),*) => {
        $(impl From<$t> for Books {
            fn from(v: $t) -> Self {
                Books(vec![v.into()])
            }
        })*
        $(impl From<Vec<$m>> for Books {
            fn from(v: Vec<$m>) -> Self {
                Books(v.into_iter().map(Book::from).collect())
            }
        }
        impl From<&[$m]> for Books {
            fn from(v: &[$m]) -> Self {
                Books(v.iter().cloned().map(Book::from).collect())
            }
        }
        impl<const N: usize> From<[$m; N]> for Books {
            fn from(v: [$m; N]) -> Self {
                Books(v.into_iter().map(Book::from).collect())
            }
        })*
    };
}

books_from! {
    one: Book, &str, String, &String, PathBuf, &PathBuf, &Path, &OsStr, OsString, Vec<u8>, &Vec<u8>, &[u8];
    many: &str, String, PathBuf, &Path, OsString
}

impl From<Vec<Book>> for Books {
    fn from(v: Vec<Book>) -> Self {
        Books(v)
    }
}

/// Chapters to lay out, from 1: `3`, `"1,3-5"`, `1..=3`, `[1, 3]`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Chapters(pub(crate) Result<String, String>);

impl Chapters {
    /// The value of `--chapters`.
    pub fn as_arg(&self) -> Result<&str> {
        self.0.as_deref().map_err(|e| Error::InvalidArgument(e.clone()))
    }
}

fn run_of(start: i64, last: i64) -> Result<String, String> {
    match last - start {
        d if d < 0 => Err(format!("chapters: {start}..={last} is not a run of chapters")),
        0 => Ok(start.to_string()),
        _ => Ok(format!("{start}-{last}")),
    }
}

macro_rules! chapters_from_int {
    ($($t:ty),*) => {$(
        impl From<$t> for Chapters {
            fn from(v: $t) -> Self {
                Chapters(Ok(v.to_string()))
            }
        }
        impl From<Range<$t>> for Chapters {
            fn from(v: Range<$t>) -> Self {
                Chapters(run_of(v.start as i64, v.end as i64 - 1))
            }
        }
        impl From<RangeInclusive<$t>> for Chapters {
            fn from(v: RangeInclusive<$t>) -> Self {
                Chapters(run_of(*v.start() as i64, *v.end() as i64))
            }
        }
        impl From<Vec<$t>> for Chapters {
            fn from(v: Vec<$t>) -> Self {
                Chapters(Ok(v.iter().map(ToString::to_string).collect::<Vec<_>>().join(",")))
            }
        }
        impl From<&[$t]> for Chapters {
            fn from(v: &[$t]) -> Self {
                Chapters::from(v.to_vec())
            }
        }
        impl<const N: usize> From<[$t; N]> for Chapters {
            fn from(v: [$t; N]) -> Self {
                Chapters::from(v.to_vec())
            }
        }
    )*};
}

chapters_from_int!(i32, u32, usize);

impl From<&str> for Chapters {
    fn from(v: &str) -> Self {
        Chapters(Ok(v.to_owned()))
    }
}

impl From<String> for Chapters {
    fn from(v: String) -> Self {
        Chapters(Ok(v))
    }
}

/// A `--set` value: text as given (the command line reads it as JSON when it
/// parses), anything else as compact JSON.
pub(crate) fn setting_arg(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

/// A list of names joined with commas (`"page,text"`).
pub(crate) fn join<I, S>(items: I) -> String
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    items.into_iter().map(|s| s.as_ref().to_owned()).collect::<Vec<_>>().join(",")
}

/// The JSON report and, with `-o -`, the bytes before it. The report is the
/// last thing on stdout and opens with `{\n  "ok": `; no nested key sits at
/// that indentation, so its last occurrence is the report's start.
pub(crate) fn split_stdout(stdout: &[u8], want_content: bool) -> (Option<Value>, Option<Vec<u8>>) {
    const START: &[u8] = b"{\n  \"ok\": ";
    let start = if want_content {
        match stdout.windows(START.len()).rposition(|w| w == START) {
            Some(i) => i,
            None => return (None, Some(stdout.to_vec())),
        }
    } else {
        0
    };
    let content = |upto: usize| want_content.then(|| stdout[..upto].to_vec());
    let text = String::from_utf8_lossy(&stdout[start..]);
    let text = text.trim();
    if text.is_empty() {
        return (None, content(start));
    }
    match serde_json::from_str::<Value>(text) {
        Ok(v @ Value::Object(_)) => (Some(v), content(start)),
        Ok(_) => (None, content(start)),
        Err(_) => (None, content(stdout.len())),
    }
}

/// The `error` lines of the terminal log, else its last line.
pub(crate) fn stderr_error(stderr: &str) -> String {
    let lines: Vec<&str> = stderr.lines().filter(|l| !l.trim().is_empty()).collect();
    let errors: Vec<&str> =
        lines.iter().filter(|l| l.starts_with("error")).map(|l| l.strip_prefix("error ").unwrap_or(l)).collect();
    if !errors.is_empty() {
        return errors.join("; ");
    }
    lines.last().map(|l| (*l).to_owned()).unwrap_or_else(|| "postext failed".to_owned())
}

/// A temporary folder for the books given as bytes and the settings given
/// as JSON, removed after the run.
#[derive(Default)]
pub(crate) struct Temp {
    dir: Option<tempfile::TempDir>,
    count: usize,
    /// Whether a book was given as bytes.
    pub used: bool,
}

impl Temp {
    pub fn write(&mut self, name: &str, data: &[u8]) -> Result<OsString> {
        if self.dir.is_none() {
            self.dir = Some(tempfile::Builder::new().prefix("postext-").tempdir()?);
        }
        self.count += 1;
        let path = self.dir.as_ref().expect("created above").path().join(format!("{}-{name}", self.count));
        std::fs::write(&path, data)?;
        Ok(path.into_os_string())
    }

    /// A path as given, or bytes written to a file called `name` (which does
    /// not count as a book given as bytes).
    pub fn file(&mut self, value: &Book, name: &str) -> Result<OsString> {
        match value {
            Book::Path(p) => Ok(p.clone().into_os_string()),
            Book::Bytes(b) => self.write(name, b),
        }
    }

    /// The books as arguments, the bytes written to `name` files.
    pub fn input(&mut self, value: &Book, name: &str) -> Result<OsString> {
        if matches!(value, Book::Bytes(_)) {
            self.used = true;
        }
        self.file(value, name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn chapters() {
        let arg = |c: Chapters| c.0.unwrap();
        assert_eq!(arg(3.into()), "3");
        assert_eq!(arg("1,3-5".into()), "1,3-5");
        assert_eq!(arg((1..=3).into()), "1-3");
        assert_eq!(arg((1..3).into()), "1-2");
        assert_eq!(arg((2..3).into()), "2");
        assert_eq!(arg([1, 3].into()), "1,3");
        assert_eq!(arg(vec![2u32, 4].into()), "2,4");
        assert!(Chapters::from(3..3).as_arg().is_err());
    }

    #[test]
    fn settings() {
        assert_eq!(setting_arg(&json!(300)), "300");
        assert_eq!(setting_arg(&json!("A5")), "A5");
        assert_eq!(setting_arg(&json!(true)), "true");
        assert_eq!(setting_arg(&json!({"a": [1, "b"]})), r#"{"a":[1,"b"]}"#);
        assert_eq!(setting_arg(&json!("Lóra")), "Lóra");
        assert_eq!(join(["page", "text"]), "page,text");
    }

    #[test]
    fn books() {
        assert_eq!(Books::from("a.md").0, vec![Book::Path("a.md".into())]);
        assert_eq!(Books::from(["a.md", "b.md"]).0.len(), 2);
        assert_eq!(Books::from(vec![1u8, 2]).0, vec![Book::Bytes(vec![1, 2])]);
        assert_eq!(Books::from(&b"PK"[..]).0, vec![Book::Bytes(b"PK".to_vec())]);
    }

    #[test]
    fn stdout_split() {
        let report = b"{\n  \"ok\": true,\n  \"command\": \"pdf\"\n}\n";
        let (r, c) = split_stdout(report, false);
        assert_eq!(r.unwrap()["command"], "pdf");
        assert!(c.is_none());

        let mut both = b"%PDF-1.7 {\n  \"ok\": nested?".to_vec();
        both.extend_from_slice(report);
        let (r, c) = split_stdout(&both, true);
        assert_eq!(r.unwrap()["ok"], true);
        assert_eq!(c.unwrap(), b"%PDF-1.7 {\n  \"ok\": nested?");

        let (r, c) = split_stdout(b"just bytes", true);
        assert!(r.is_none());
        assert_eq!(c.unwrap(), b"just bytes");
        assert_eq!(split_stdout(b"", false), (None, None));
    }

    #[test]
    fn stderr_errors() {
        assert_eq!(stderr_error("info a\nerror cannot read x\nerror y\n"), "cannot read x; y");
        assert_eq!(stderr_error("one\nlast\n\n"), "last");
        assert_eq!(stderr_error(""), "postext failed");
    }

    #[test]
    fn temp_files() {
        let mut t = Temp::default();
        let p = t.file(&Book::Bytes(b"x".to_vec()), "design.postext").unwrap();
        assert!(!t.used);
        assert!(PathBuf::from(&p).file_name().unwrap().to_string_lossy().ends_with("design.postext"));
        let q = t.input(&Book::Bytes(b"y".to_vec()), "book.postext").unwrap();
        assert!(t.used && std::fs::read(&q).unwrap() == b"y");
        assert_eq!(t.input(&Book::Path("b.md".into()), "book.postext").unwrap(), OsString::from("b.md"));
        drop(t);
        assert!(!PathBuf::from(q).exists());
    }
}
