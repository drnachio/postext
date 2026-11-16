//! The builder every command shares: its inputs, `out`, its options and the
//! run. The options of each command are in `commands.rs`.

use std::ffi::{OsStr, OsString};
use std::marker::PhantomData;

use serde_json::Value;

use crate::args::{Book, Books, Chapters, STDOUT, Temp, join, setting_arg};
use crate::client::Postext;
use crate::error::{Error, Result};
use crate::report::{FromReport, Report};

/// What a command does with a book given as bytes and no `out`.
#[doc(hidden)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutMode {
    /// One file: it comes back as bytes (`out("-")`).
    File,
    /// A folder, or a file that cannot go to stdout: `out` is required.
    Required,
    /// The command takes no `out`.
    Never,
}

/// A command of the command line. The types in [`kind`](crate::kind) name
/// them; [`Command`] is built for one.
pub trait Kind: sealed::Sealed {
    /// Its name on the command line.
    const COMMAND: &'static str;
    /// The file name a book given as bytes is written to.
    const INPUT: &'static str = "book.postext";
    #[doc(hidden)]
    const OUT: OutMode;
    /// Whether the client's `offline` and `font_dir` apply.
    #[doc(hidden)]
    const FONT_DEFAULTS: bool = true;
    /// The report it returns.
    type Report: FromReport;
}

/// A command that reads a book and takes the book options.
pub trait ReadsBook: Kind {}
/// A command that takes `fonts`: font files bundled with loose Markdown.
pub trait TakesFonts: ReadsBook {}
/// A command that writes one file, and so can return its bytes.
pub trait WritesFile: Kind {}

pub(crate) mod sealed {
    pub trait Sealed {}
}

#[derive(Debug, Clone)]
enum Piece {
    Arg(OsString),
    /// A file argument given as a path or bytes, the bytes written to `name`.
    File(Book, &'static str),
    /// JSON written to a file `name`.
    Json(String, &'static str),
}

/// A command being built: its book, `out` and options, run by
/// [`run`](Self::run) (or [`bytes`](Self::bytes)).
///
/// Setting an option again replaces it, but for the ones that repeat
/// (`set`, `font_dir`).
#[must_use = "a command does nothing until it is run"]
#[derive(Debug, Clone)]
pub struct Command<'a, K: Kind> {
    client: &'a Postext,
    inputs: Vec<Book>,
    extra: Vec<OsString>,
    out: Option<OsString>,
    options: Vec<(&'static str, Vec<Piece>)>,
    offline: Option<bool>,
    font_dirs: Option<Vec<OsString>>,
    allow_problems: bool,
    error: Option<String>,
    kind: PhantomData<K>,
}

impl<'a, K: Kind> Command<'a, K> {
    pub(crate) fn new(client: &'a Postext, books: Books) -> Self {
        Command {
            client,
            inputs: books.0,
            extra: Vec::new(),
            out: None,
            options: Vec::new(),
            offline: None,
            font_dirs: None,
            allow_problems: false,
            error: None,
            kind: PhantomData,
        }
    }

    fn put(&mut self, key: &'static str, pieces: Vec<Piece>) {
        match self.options.iter_mut().find(|(k, _)| *k == key) {
            Some(entry) => entry.1 = pieces,
            None => self.options.push((key, pieces)),
        }
    }

    pub(crate) fn opt(mut self, name: &'static str, value: impl AsRef<OsStr>) -> Self {
        let flag = OsString::from(format!("--{name}"));
        self.put(name, vec![Piece::Arg(flag), Piece::Arg(value.as_ref().to_owned())]);
        self
    }

    pub(crate) fn flag(mut self, name: &'static str, on: bool) -> Self {
        let flag = if on { format!("--{name}") } else { format!("--no-{name}") };
        self.put(name, vec![Piece::Arg(flag.into())]);
        self
    }

    pub(crate) fn repeat(mut self, name: &'static str, value: OsString) -> Self {
        self.options.push((name, vec![Piece::Arg(format!("--{name}").into()), Piece::Arg(value)]));
        self
    }

    pub(crate) fn file_opt(mut self, name: &'static str, value: Book, file: &'static str) -> Self {
        self.put(name, vec![Piece::Arg(format!("--{name}").into()), Piece::File(value, file)]);
        self
    }

    pub(crate) fn json_opt(mut self, name: &'static str, value: &Value, file: &'static str) -> Self {
        self.put(name, vec![Piece::Arg(format!("--{name}").into()), Piece::Json(value.to_string(), file)]);
        self
    }

    pub(crate) fn input(mut self, value: impl AsRef<OsStr>) -> Self {
        self.extra.push(value.as_ref().to_owned());
        self
    }

    pub(crate) fn set_offline(mut self, offline: bool) -> Self {
        self.offline = Some(offline);
        self
    }

    pub(crate) fn add_font_dir(mut self, dir: impl AsRef<OsStr>) -> Self {
        self.font_dirs.get_or_insert_with(Vec::new).push(dir.as_ref().to_owned());
        self
    }

    pub(crate) fn invalid(mut self, message: String) -> Self {
        self.error.get_or_insert(message);
        self
    }

    pub(crate) fn problems_allowed(mut self) -> Self {
        self.allow_problems = true;
        self
    }

    /// Where the output goes: a file or folder, or `"-"` ([`STDOUT`]) for the
    /// bytes in [`Report::content`]. Default: beside the book.
    pub fn out(mut self, path: impl AsRef<OsStr>) -> Self {
        self.out = Some(path.as_ref().to_owned());
        self
    }

    /// The arguments the command line gets, books given as bytes and JSON
    /// written to `temp`, and whether its output is on stdout.
    fn arguments(&self, temp: &mut Temp) -> Result<(Vec<OsString>, bool)> {
        if let Some(e) = &self.error {
            return Err(Error::InvalidArgument(e.clone()));
        }
        if self.inputs.is_empty() {
            return Err(Error::InvalidArgument(format!("{}: no book given", K::COMMAND)));
        }
        let mut args = Vec::new();
        for book in &self.inputs {
            args.push(temp.input(book, K::INPUT)?);
        }
        args.extend(self.extra.iter().cloned());
        let mut out = self.out.clone();
        if out.is_none() && temp.used && self.extra.is_empty() {
            match K::OUT {
                OutMode::File => out = Some(STDOUT.into()),
                OutMode::Required => {
                    return Err(Error::InvalidArgument(format!(
                        "{}: give out() when the input is bytes (it is read from a temporary file)",
                        K::COMMAND
                    )));
                }
                OutMode::Never => {}
            }
        }
        let content = out.as_deref() == Some(OsStr::new(STDOUT));
        if let Some(out) = out {
            args.push("--out".into());
            args.push(out);
        }
        for (_, pieces) in &self.options {
            for piece in pieces {
                args.push(match piece {
                    Piece::Arg(a) => a.clone(),
                    Piece::File(book, name) => temp.file(book, name)?,
                    Piece::Json(text, name) => temp.write(name, text.as_bytes())?,
                });
            }
        }
        if K::FONT_DEFAULTS {
            for dir in self.font_dirs.as_ref().unwrap_or(&self.client.font_dirs) {
                args.push("--font-dir".into());
                args.push(dir.clone());
            }
            if self.offline.unwrap_or(self.client.offline) {
                args.push("--offline".into());
            }
        }
        Ok((args, content))
    }

    /// The arguments the command line would get (books given as bytes show
    /// as temporary files that are gone once this returns).
    pub fn args(&self) -> Result<Vec<OsString>> {
        let mut temp = Temp::default();
        let (mut args, _) = self.arguments(&mut temp)?;
        args.insert(0, K::COMMAND.into());
        args.push("--json".into());
        args.push("--no-color".into());
        Ok(args)
    }

    fn execute(&self) -> Result<Report> {
        let mut temp = Temp::default();
        let (args, content) = self.arguments(&mut temp)?;
        self.client.execute(K::COMMAND, args, content, self.allow_problems)
    }

    /// Run the command and return its report. A failure is an [`Error`].
    pub fn run(self) -> Result<K::Report> {
        self.execute().map(K::Report::from_report)
    }
}

impl<K: WritesFile> Command<'_, K> {
    /// Run the command with its output on stdout and return the bytes.
    pub fn bytes(mut self) -> Result<Vec<u8>> {
        self.out = Some(STDOUT.into());
        Ok(self.execute()?.content.unwrap_or_default())
    }
}

impl<K: ReadsBook> Command<'_, K> {
    /// The language to read a multilingual book in (`es`, `en`, `pt-BR`…).
    pub fn locale(self, locale: impl AsRef<OsStr>) -> Self {
        self.opt("locale", locale)
    }

    /// Chapters to lay out, from 1: `3`, `"1,3-5"`, `1..=3`, `[1, 3]`.
    pub fn chapters(self, chapters: impl Into<Chapters>) -> Self {
        match chapters.into().as_arg() {
            Ok(arg) => {
                let arg = arg.to_owned();
                self.opt("chapters", arg)
            }
            Err(e) => self.invalid(e.to_string()),
        }
    }

    /// A setting to change: `set("page.dpi", 300)`,
    /// `set("bodyText.fontFamily", "Lora")`. Text goes as given (the command
    /// line reads it as JSON when it parses), anything else as JSON.
    pub fn set(self, key: &str, value: impl Into<Value>) -> Self {
        let arg = format!("{key}={}", setting_arg(&value.into()));
        self.repeat("set", arg.into())
    }

    /// A setting as the command line takes it: `"page.dpi=300"`.
    pub fn set_raw(self, setting: impl AsRef<OsStr>) -> Self {
        let arg = setting.as_ref().to_owned();
        self.repeat("set", arg)
    }

    /// A design file (a `.postext` from `design` or the Sandbox), or another
    /// book, whose design the book is set in: a path or bytes.
    pub fn design(self, design: impl Into<Book>) -> Self {
        self.file_opt("design", design.into(), "design.postext")
    }

    /// With [`design`](Self::design): only these parts (`["page", "text"]`).
    pub fn design_parts<I, S>(self, parts: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        self.opt("design-parts", join(parts))
    }

    /// A language's composition rules, applied after the design: `"es"`,
    /// `"en-GB"`…, or `"auto"` for the book's language.
    pub fn composition(self, composition: impl AsRef<OsStr>) -> Self {
        self.opt("composition", composition)
    }

    /// A configuration file for loose Markdown, or merged over a book's.
    pub fn config(self, path: impl AsRef<OsStr>) -> Self {
        self.opt("config", path)
    }

    /// [`config`](Self::config) given as JSON (`json!({"page": {"sizePreset": "A5"}})`).
    pub fn config_json(self, config: &Value) -> Self {
        self.json_opt("config", config, "config.json")
    }

    /// The pictures folder for loose Markdown.
    pub fn resources(self, dir: impl AsRef<OsStr>) -> Self {
        self.opt("resources", dir)
    }

    /// The book's title for loose Markdown.
    pub fn name(self, name: impl AsRef<OsStr>) -> Self {
        self.opt("name", name)
    }

    /// A folder to look for fonts the book does not carry (repeats; replaces
    /// the client's).
    pub fn font_dir(self, dir: impl AsRef<OsStr>) -> Self {
        self.add_font_dir(dir)
    }

    /// Never download fonts from Google Fonts (default: the client's).
    pub fn offline(self, offline: bool) -> Self {
        self.set_offline(offline)
    }

    /// Where downloaded fonts are kept.
    pub fn cache_dir(self, dir: impl AsRef<OsStr>) -> Self {
        self.opt("cache-dir", dir)
    }
}

impl<K: TakesFonts> Command<'_, K> {
    /// Font files bundled with loose Markdown.
    pub fn fonts(self, dir: impl AsRef<OsStr>) -> Self {
        self.opt("fonts", dir)
    }
}
