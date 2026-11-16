//! Running the executable: the client, the run itself and the report or the
//! error that comes back.

use std::ffi::{OsStr, OsString};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command as Process, ExitStatus, Output as ProcessOutput, Stdio};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use crate::args::{split_stdout, stderr_error};
use crate::binary::find_binary;
use crate::error::{Error, Failure, Result};
use crate::report::Report;

/// Runs one postext executable.
///
/// The executable is `POSTEXT_BIN`, else the one of this system, downloaded
/// on first use; [`Postext::with_binary`] names another. The folder, the
/// environment and the timeout apply to every run; [`offline`](Self::offline)
/// and [`font_dir`](Self::font_dir) are the defaults of the book options of
/// the same names.
///
/// The functions at the crate's root ([`crate::pdf`] …) use a default client.
///
/// ```no_run
/// use std::time::Duration;
///
/// let client = postext::Postext::new().offline(true).timeout(Duration::from_secs(300));
/// let report = client.pdf("book.postext").out("book.pdf").run()?;
/// # Ok::<_, postext::Error>(())
/// ```
#[derive(Debug, Clone, Default)]
pub struct Postext {
    binary: Option<PathBuf>,
    found: OnceLock<PathBuf>,
    cwd: Option<PathBuf>,
    env: Vec<(OsString, OsString)>,
    timeout: Option<Duration>,
    pub(crate) offline: bool,
    pub(crate) font_dirs: Vec<OsString>,
}

impl Postext {
    /// A client for `POSTEXT_BIN`, else the executable of the crate's version.
    pub fn new() -> Self {
        Self::default()
    }

    /// A client for this executable.
    pub fn with_binary(path: impl AsRef<Path>) -> Self {
        Postext { binary: Some(path.as_ref().to_owned()), ..Self::default() }
    }

    /// The folder every run starts in (relative paths are read from it).
    pub fn cwd(mut self, dir: impl AsRef<Path>) -> Self {
        self.cwd = Some(dir.as_ref().to_owned());
        self
    }

    /// An environment variable for every run, over the inherited ones.
    pub fn env(mut self, key: impl AsRef<OsStr>, value: impl AsRef<OsStr>) -> Self {
        self.env.push((key.as_ref().to_owned(), value.as_ref().to_owned()));
        self
    }

    /// Stop a run that takes longer and return [`Error::Timeout`].
    pub fn timeout(mut self, limit: Duration) -> Self {
        self.timeout = Some(limit);
        self
    }

    /// Never download fonts from Google Fonts (the default of every book
    /// command's `offline`).
    pub fn offline(mut self, offline: bool) -> Self {
        self.offline = offline;
        self
    }

    /// A folder to look for fonts the book does not carry, for every book
    /// command that names none of its own.
    pub fn font_dir(mut self, dir: impl AsRef<OsStr>) -> Self {
        self.font_dirs.push(dir.as_ref().to_owned());
        self
    }

    /// The executable (found, or downloaded, on first use).
    pub fn executable(&self) -> Result<PathBuf> {
        if let Some(path) = &self.binary {
            return Ok(path.clone());
        }
        if let Some(path) = self.found.get() {
            return Ok(path.clone());
        }
        let path = find_binary()?;
        Ok(self.found.get_or_init(|| path).clone())
    }

    /// The executable's version line: `postext 1.87.0 (engine 1.87.0, darwin-arm64)`.
    pub fn version(&self) -> Result<String> {
        let out = self.run(["--version"])?;
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_owned())
    }

    fn process<I, S>(&self, args: I) -> Result<Process>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut cmd = Process::new(self.executable()?);
        cmd.args(args).stdin(Stdio::null());
        if let Some(dir) = &self.cwd {
            cmd.current_dir(dir);
        }
        for (k, v) in &self.env {
            cmd.env(k, v);
        }
        Ok(cmd)
    }

    /// Run the executable with `args` as given, nothing added, and capture
    /// what it prints. A non-zero exit code is not an error here.
    pub fn run<I, S>(&self, args: I) -> Result<ProcessOutput>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut cmd = self.process(args)?;
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        let Some(limit) = self.timeout else {
            return Ok(cmd.output()?);
        };
        let mut child = cmd.spawn()?;
        let read = |pipe: Option<Box<dyn Read + Send>>| {
            std::thread::spawn(move || {
                let mut buf = Vec::new();
                if let Some(mut p) = pipe { p.read_to_end(&mut buf).map(|_| buf) } else { Ok(buf) }
            })
        };
        let stdout = read(child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
        let stderr = read(child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
        let deadline = Instant::now() + limit;
        let status = loop {
            if let Some(status) = child.try_wait()? {
                break status;
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                return Err(Error::Timeout(limit));
            }
            std::thread::sleep(Duration::from_millis(20));
        };
        let join = |h: std::thread::JoinHandle<std::io::Result<Vec<u8>>>| h.join().unwrap_or_else(|_| Ok(Vec::new()));
        Ok(ProcessOutput { status, stdout: join(stdout)?, stderr: join(stderr)? })
    }

    /// Run the executable with `args`, its output on the terminal (for
    /// `build --watch` and the like). No timeout.
    pub fn run_inherit<I, S>(&self, args: I) -> Result<ExitStatus>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        Ok(self.process(args)?.stdout(Stdio::inherit()).stderr(Stdio::inherit()).status()?)
    }

    /// Run `command` with `--json` and read its report.
    pub(crate) fn execute(
        &self,
        command: &str,
        args: Vec<OsString>,
        content: bool,
        allow_problems: bool,
    ) -> Result<Report> {
        let mut all: Vec<OsString> = Vec::with_capacity(args.len() + 3);
        all.push(command.into());
        all.extend(args);
        all.push("--json".into());
        all.push("--no-color".into());
        let out = self.run(&all)?;
        let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
        let (data, payload) = split_stdout(&out.stdout, content);
        let report = data.map(|d| Report::from_json(d, payload, stderr.clone()));
        let code = out.status.code().unwrap_or(-1);
        if code == 0 {
            return report.ok_or_else(|| {
                Error::Failed(Failure {
                    message: format!("postext {command} printed no report"),
                    exit_code: 0,
                    report: None,
                    stderr,
                })
            });
        }
        let message = report.as_ref().and_then(|r| r.error.clone()).unwrap_or_else(|| stderr_error(&stderr));
        let failure = |message: String, report: Option<Report>| Failure {
            message,
            exit_code: code,
            report: report.map(Box::new),
            stderr: stderr.clone(),
        };
        match (code, report) {
            (2, report) => Err(Error::Usage(failure(message, report))),
            (3, Some(report)) => {
                if allow_problems {
                    return Ok(report);
                }
                let found: Vec<String> = report.warnings.iter().take(3).map(ToString::to_string).collect();
                let found = if found.is_empty() { message } else { found.join(", ") };
                Err(Error::ProblemsFound(failure(format!("postext {command}: {found}"), Some(report))))
            }
            (_, report) => Err(Error::Failed(failure(message, report))),
        }
    }
}
