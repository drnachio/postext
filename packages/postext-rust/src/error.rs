//! The one error type of the crate.

use std::fmt;
use std::io;
use std::time::Duration;

use crate::report::Report;

/// What a run that failed left behind: the message, the exit code, the
/// parsed `--json` report when the command printed one, and what it wrote
/// to stderr.
#[derive(Debug)]
pub struct Failure {
    /// Why the command failed: the report's `error`, else the `error` lines
    /// of stderr.
    pub message: String,
    /// The executable's exit code (`-1` when a signal ended it).
    pub exit_code: i32,
    /// The report, when the command printed one.
    pub report: Option<Box<Report>>,
    /// The command's terminal log.
    pub stderr: String,
}

/// Everything that can go wrong running postext.
#[derive(Debug)]
#[non_exhaustive]
pub enum Error {
    /// The command ran and failed (exit code 1, or another non-zero code).
    Failed(Failure),
    /// The command was called wrongly: an unknown option, a bad value (exit
    /// code 2).
    Usage(Failure),
    /// `check` found problems, or `import_docx` could not apply an edit
    /// (exit code 3). The report is complete: its `warnings` list what was
    /// found. `allow_problems()` returns the report instead.
    ProblemsFound(Failure),
    /// No executable: none is published for this system, a download or its
    /// checksum failed, or `POSTEXT_BIN` names no file.
    BinaryNotFound(String),
    /// An argument the command cannot take, found before running it (a
    /// book given as bytes to a command that needs `out`, an empty range of
    /// chapters…).
    InvalidArgument(String),
    /// The run took longer than the client's timeout and was stopped.
    Timeout(Duration),
    /// Starting the executable, or reading and writing a file, failed.
    Io(io::Error),
}

impl Error {
    /// The failure of a run that ended with a non-zero exit code.
    pub fn failure(&self) -> Option<&Failure> {
        match self {
            Error::Failed(f) | Error::Usage(f) | Error::ProblemsFound(f) => Some(f),
            _ => None,
        }
    }

    /// The `--json` report of a failed run, when the command printed one.
    pub fn report(&self) -> Option<&Report> {
        self.failure().and_then(|f| f.report.as_deref())
    }

    /// The exit code of a failed run.
    pub fn exit_code(&self) -> Option<i32> {
        self.failure().map(|f| f.exit_code)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Failed(x) | Error::Usage(x) | Error::ProblemsFound(x) => f.write_str(&x.message),
            Error::BinaryNotFound(m) | Error::InvalidArgument(m) => f.write_str(m),
            Error::Timeout(d) => write!(f, "postext did not finish within {:.1} s", d.as_secs_f64()),
            Error::Io(e) => write!(f, "postext: {e}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl From<io::Error> for Error {
    fn from(e: io::Error) -> Self {
        Error::Io(e)
    }
}

/// `Result<T, postext::Error>`.
pub type Result<T, E = Error> = std::result::Result<T, E>;
