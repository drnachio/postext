//! Typeset books from Rust with [Postext](https://postext.dev/): a
//! print-ready PDF, HTML pages, an EPUB, page images, a Word document or an
//! InDesign package from a `.postext` book, a book folder or loose Markdown
//! files.
//!
//! ```no_run
//! let report = postext::pdf("book.postext").out("book.pdf").set("page.dpi", 300).run()?;
//! println!("{} pages", report.output().and_then(|o| o.pages).unwrap_or(0));
//! for warning in &report.warnings {
//!     eprintln!("{warning}"); // warning missingFont (chapters/02.md:14): …
//! }
//!
//! let pdf: Vec<u8> = postext::pdf(std::fs::read("book.postext")?).bytes()?; // bytes in, bytes out
//! # Ok::<_, Box<dyn std::error::Error>>(())
//! ```
//!
//! The crate drives the self-contained `postext` command line, the same
//! executable as `brew install drnachio/postext/postext`, `npx postext-cli`
//! or `pip install postext`: the layout is the Sandbox's, and the same book
//! breaks into the same pages. The executable of your system (185 to 230 MB,
//! too large for a crate) is downloaded on first use from the GitHub Release
//! of the crate's version, checked against the release's `SHA256SUMS` and
//! kept in the cache (see [`find_binary`]). Nothing is downloaded at build
//! time.
//!
//! | Environment variable | Effect |
//! | --- | --- |
//! | `POSTEXT_BIN` | Run this executable instead (Homebrew, Scoop, a local build); nothing is downloaded |
//! | `POSTEXT_CACHE_DIR` | Cache folder (default `~/.cache/postext`, `%LOCALAPPDATA%\postext\cache` on Windows) |
//! | `POSTEXT_RELEASE_URL` | Download from a mirror: a URL with `{version}` where the release's files are |
//!
//! # Commands
//!
//! Every command of the command line is a builder, made by a function of
//! the same name ([`pdf`], [`html`], [`epub`], [`image`], [`images`],
//! [`docx`], [`idml`], [`pack`], [`unpack`], [`design`], [`info`],
//! [`check`], [`build`], [`import_docx`], [`import_idml`]). Its options are
//! methods; [`Command::run`] runs it with `--json` and returns its report,
//! [`Command::bytes`] returns the file instead.
//!
//! A book is a path (a `.postext` file, a book folder, a Markdown file), a
//! list of Markdown files (the chapters, in order), or the bytes of a
//! `.postext` bundle. The commands that read a book take the book options:
//!
//! ```no_run
//! use serde_json::json;
//!
//! postext::pdf(["01.md", "02.md"])
//!     .out("notes.pdf")
//!     .name("Notes")                                   // --name
//!     .config_json(&json!({"page": {"sizePreset": "A5"}})) // --config (or .config("config.json"))
//!     .set("bodyText.fontSize.value", 11)              // --set, one per key
//!     .locale("es")                                    // --locale
//!     .chapters(1..=2)                                 // --chapters 1-2 (also 3, "1,3-5", [1, 3])
//!     .resources("img/")                               // --resources
//!     .fonts("fonts/")                                 // --fonts
//!     .font_dir("/Library/Fonts")                      // --font-dir
//!     .offline(true)                                   // --offline: never download fonts
//!     .design("novel.postext")                         // --design: a design file (a path or bytes), or another book
//!     .design_parts(["page", "text"])                  // --design-parts page,text
//!     .composition("auto")                             // --composition
//!     .run()?;
//! # Ok::<_, postext::Error>(())
//! ```
//!
//! # Errors
//!
//! A failed run is an [`Error`]: [`Error::Failed`] (exit code 1),
//! [`Error::Usage`] (a wrong option or value, exit code 2),
//! [`Error::ProblemsFound`] (`check` found an error, or `import_docx` could
//! not apply an edit, exit code 3; `allow_problems()` returns the report
//! instead), [`Error::BinaryNotFound`] (no executable for this system, a
//! failed download or checksum, a `POSTEXT_BIN` that is not a file). The
//! report and stderr of a failed run are in [`Error::report`] and
//! [`Failure::stderr`].
//!
//! # One executable, many runs
//!
//! A [`Postext`] client has the same methods with its own executable,
//! folder, environment and timeout. [`Postext::run_inherit`] runs any
//! command as typed, `build … --watch` included. Each call starts the
//! executable again.
//!
//! # Features
//!
//! - `download` (default): download the executable on first use. Without
//!   it, the crate runs `POSTEXT_BIN` or an executable already in the cache.

#![warn(missing_docs)]

mod args;
mod binary;
mod client;
mod command;
mod commands;
mod error;
mod report;

use std::ffi::OsStr;
use std::fmt::Display;
use std::sync::OnceLock;

pub use args::{Book, Books, Chapters, STDOUT};
#[cfg(feature = "download")]
pub use binary::Download;
pub use binary::{
    ENV_BIN, ENV_CACHE, ENV_RELEASE_URL, FILES, RELEASE_URL, VERSION, cache_dir, cached_binary, find_binary,
    find_binary_version, is_musl, parse_sums, platform_file, platform_file_for,
};
pub use client::Postext;
pub use command::{Command, Kind, ReadsBook, TakesFonts, WritesFile};
pub use commands::kind;
pub use error::{Error, Failure, Result};
pub use report::{
    BookSummary, ChapterInfo, CheckReport, DesignReport, Diagnostic, FontInfo, FromReport, ImageReport,
    ImportDocxReport, ImportIdmlReport, InfoReport, Output, PageRef, Report, UnpackReport,
};

/// The client the functions at the crate's root use.
pub fn client() -> &'static Postext {
    static CLIENT: OnceLock<Postext> = OnceLock::new();
    CLIENT.get_or_init(Postext::new)
}

macro_rules! root {
    ($($(#[$m:meta])* $name:ident($arg:ident: $ty:ty) -> $kind:ident;)*) => {$(
        $(#[$m])*
        pub fn $name($arg: $ty) -> Command<'static, kind::$kind> {
            client().$name($arg)
        }
    )*};
}

root! {
    /// [`Postext::pdf`] with the default client.
    pdf(book: impl Into<Books>) -> Pdf;
    /// [`Postext::html`] with the default client.
    html(book: impl Into<Books>) -> Html;
    /// [`Postext::epub`] with the default client.
    epub(book: impl Into<Books>) -> Epub;
    /// [`Postext::images`] with the default client.
    images(book: impl Into<Books>) -> Images;
    /// [`Postext::docx`] with the default client.
    docx(book: impl Into<Books>) -> Docx;
    /// [`Postext::pack`] with the default client.
    pack(book: impl Into<Books>) -> Pack;
    /// [`Postext::design`] with the default client.
    design(book: impl Into<Books>) -> Design;
    /// [`Postext::idml`] with the default client.
    idml(book: impl Into<Books>) -> Idml;
    /// [`Postext::info`] with the default client.
    info(book: impl Into<Books>) -> Info;
    /// [`Postext::check`] with the default client.
    check(book: impl Into<Books>) -> Check;
    /// [`Postext::build`] with the default client.
    build(book: impl Into<Books>) -> Build;
    /// [`Postext::import_docx`] with the default client.
    import_docx(docx: impl Into<Book>) -> ImportDocx;
    /// [`Postext::unpack`] with the default client.
    unpack(bundle: impl Into<Book>) -> Unpack;
    /// [`Postext::import_idml`] with the default client.
    import_idml(idml: impl Into<Book>) -> ImportIdml;
}

/// [`Postext::image`] with the default client.
pub fn image(book: impl Into<Books>, page: impl Display) -> Command<'static, kind::Image> {
    client().image(book, page)
}

/// Run the executable with `args` as given, its output on the terminal
/// ([`Postext::run_inherit`] with the default client).
pub fn run_inherit<I, S>(args: I) -> Result<std::process::ExitStatus>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    client().run_inherit(args)
}
