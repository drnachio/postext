//! Finding the postext executable, and downloading it on first use.
//!
//! Every release of postext attaches one self-contained executable per
//! system to its GitHub Release, with their checksums in `SHA256SUMS`. They
//! are too large to ship in a crate (185 to 230 MB), so the crate fetches the
//! one of this system the first time it is needed, checks it and keeps it in
//! the cache:
//!
//! ```text
//! <cache>/bin/<version>/postext[.exe]
//! ```
//!
//! `<cache>` is the folder the command line keeps downloaded fonts in:
//! `POSTEXT_CACHE_DIR`, else `%LOCALAPPDATA%\postext\cache` on Windows and
//! `$XDG_CACHE_HOME/postext` (`~/.cache/postext`) elsewhere. The Python
//! package uses the same folder, so the two share one download.
//!
//! `POSTEXT_BIN` names an executable that is already installed (Homebrew,
//! Scoop, a local build) and skips the download.

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

/// Names an executable to run instead of the cached one; nothing is downloaded.
pub const ENV_BIN: &str = "POSTEXT_BIN";
/// The cache folder (fonts, and the executables in `bin/<version>/`).
pub const ENV_CACHE: &str = "POSTEXT_CACHE_DIR";
/// A mirror of the releases: a URL with `{version}` where a release's files are.
pub const ENV_RELEASE_URL: &str = "POSTEXT_RELEASE_URL";
/// Where the releases are, `{version}` being the crate's version.
pub const RELEASE_URL: &str = "https://github.com/drnachio/postext/releases/download/v{version}";
/// The crate's version, which is the version of the executable it runs.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// The executables each release publishes.
pub const FILES: [&str; 6] = [
    "postext-macos-arm64",
    "postext-macos-x64",
    "postext-linux-x64",
    "postext-linux-arm64",
    "postext-linux-x64-musl",
    "postext-windows-x64.exe",
];

fn env(name: &str) -> Option<OsString> {
    std::env::var_os(name).filter(|v| !v.is_empty())
}

/// Whether this Linux runs on musl (Alpine) rather than glibc.
pub fn is_musl() -> bool {
    if cfg!(target_env = "musl") {
        return true;
    }
    if !cfg!(target_os = "linux") || cfg!(target_env = "gnu") {
        return false;
    }
    std::fs::read_dir("/lib")
        .map(|dir| dir.flatten().any(|e| e.file_name().to_string_lossy().starts_with("ld-musl-")))
        .unwrap_or(false)
}

/// The name of this system's executable on the GitHub Release.
pub fn platform_file() -> Result<&'static str> {
    platform_file_for(std::env::consts::OS, std::env::consts::ARCH, is_musl())
}

/// The name of the executable for `os` and `arch` (as in
/// [`std::env::consts`]), and musl on Linux. An error for a system no
/// release builds for.
pub fn platform_file_for(os: &str, arch: &str, musl: bool) -> Result<&'static str> {
    let arch_name = match arch.to_ascii_lowercase().as_str() {
        "x86_64" | "amd64" | "x64" => Some("x64"),
        "aarch64" | "arm64" | "armv8" | "armv8l" => Some("arm64"),
        _ => None,
    };
    let (os_name, arch_name) = match os {
        "macos" | "darwin" => ("macos", arch_name),
        "linux" => ("linux", arch_name),
        // Windows on ARM runs the x64 executable under emulation.
        "windows" => ("windows", arch_name.map(|_| "x64")),
        other => (other, arch_name),
    };
    let musl = musl && os_name == "linux";
    let name = format!(
        "postext-{os_name}-{}{}{}",
        arch_name.unwrap_or(arch),
        if musl { "-musl" } else { "" },
        if os_name == "windows" { ".exe" } else { "" }
    );
    match FILES.iter().find(|f| **f == name) {
        Some(f) if arch_name.is_some() => Ok(f),
        _ => Err(Error::BinaryNotFound(format!(
            "No postext executable is published for {os} {arch}{}. Build one (packages/postext-cli: bun run build:bin) and point {ENV_BIN} at it.",
            if musl { " (musl)" } else { "" }
        ))),
    }
}

/// The folder postext keeps downloads in (fonts, and here the executables).
pub fn cache_dir() -> PathBuf {
    cache_dir_from(env)
}

pub(crate) fn cache_dir_from(get: impl Fn(&str) -> Option<OsString>) -> PathBuf {
    if let Some(dir) = get(ENV_CACHE) {
        return PathBuf::from(dir);
    }
    let home = || get("HOME").or_else(|| get("USERPROFILE")).map(PathBuf::from).unwrap_or_default();
    if cfg!(windows) {
        let base = get("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| home().join("AppData").join("Local"));
        return base.join("postext").join("cache");
    }
    get("XDG_CACHE_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".cache")).join("postext")
}

/// Where the executable of `version` is kept once downloaded.
pub fn cached_binary(version: &str) -> PathBuf {
    cached_binary_in(&cache_dir(), version)
}

fn cached_binary_in(cache: &Path, version: &str) -> PathBuf {
    let exe = if cfg!(windows) { "postext.exe" } else { "postext" };
    cache.join("bin").join(version).join(exe)
}

/// `SHA256SUMS` (`<hex>  <file>` per line) as `{file: hex}`.
pub fn parse_sums(text: &str) -> BTreeMap<String, String> {
    text.lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let (digest, name, rest) = (parts.next()?, parts.next()?, parts.next());
            rest.is_none().then(|| (name.trim_start_matches('*').to_owned(), digest.to_ascii_lowercase()))
        })
        .collect()
}

/// The postext executable to run: `POSTEXT_BIN`, else the cached executable
/// of the crate's version, downloaded first if needed (with the `download`
/// feature).
pub fn find_binary() -> Result<PathBuf> {
    find_binary_version(VERSION, true, false)
}

/// [`find_binary`] for another version. With `download` false, a missing
/// executable is an error instead of a download; `quiet` leaves out the
/// line the download prints to stderr.
pub fn find_binary_version(version: &str, download: bool, quiet: bool) -> Result<PathBuf> {
    if let Some(bin) = env(ENV_BIN) {
        return resolve_bin(bin);
    }
    let path = cached_binary(version);
    if path.is_file() {
        return Ok(path);
    }
    if !download {
        return Err(Error::BinaryNotFound(format!("postext {version} is not downloaded yet ({})", path.display())));
    }
    #[cfg(feature = "download")]
    {
        Download::new(version).dest(&path).quiet(quiet).run()
    }
    #[cfg(not(feature = "download"))]
    {
        let _ = quiet;
        Err(Error::BinaryNotFound(format!(
            "postext {version} is not in the cache ({}) and this build of the crate does not download it (feature `download`): set {ENV_BIN}",
            path.display()
        )))
    }
}

pub(crate) fn resolve_bin(bin: OsString) -> Result<PathBuf> {
    let path = PathBuf::from(&bin);
    if path.is_file() {
        return Ok(path);
    }
    // A bare name: look it up on PATH.
    if path.components().count() == 1
        && let Some(found) = which(&bin)
    {
        return Ok(found);
    }
    Err(Error::BinaryNotFound(format!("{ENV_BIN} is {}, which is not a file", path.display())))
}

fn which(name: &OsString) -> Option<PathBuf> {
    let exts: Vec<OsString> = if cfg!(windows) {
        let pathext = env("PATHEXT").unwrap_or_else(|| ".EXE;.CMD;.BAT".into());
        std::iter::once(OsString::new()).chain(pathext.to_string_lossy().split(';').map(OsString::from)).collect()
    } else {
        vec![OsString::new()]
    };
    std::env::split_paths(&env("PATH")?).find_map(|dir| {
        exts.iter().find_map(|ext| {
            let mut file = name.clone();
            file.push(ext);
            let candidate = dir.join(file);
            candidate.is_file().then_some(candidate)
        })
    })
}

#[cfg(feature = "download")]
pub use download::Download;

#[cfg(feature = "download")]
mod download {
    use std::io::{Read, Write};
    use std::path::{Path, PathBuf};
    use std::time::Duration;

    use sha2::{Digest, Sha256};

    use super::{ENV_RELEASE_URL, RELEASE_URL, VERSION, cached_binary, env, parse_sums, platform_file};
    use crate::error::{Error, Result};

    /// Downloads the executable of a version, checks its SHA256 against the
    /// release's `SHA256SUMS` and moves it into place.
    ///
    /// ```no_run
    /// let path = postext::Download::new("1.87.0").quiet(true).run()?;
    /// # Ok::<_, postext::Error>(())
    /// ```
    #[derive(Debug, Clone)]
    pub struct Download {
        version: String,
        dest: Option<PathBuf>,
        file: Option<String>,
        base_url: Option<String>,
        quiet: bool,
    }

    impl Default for Download {
        fn default() -> Self {
            Download::new(VERSION)
        }
    }

    impl Download {
        /// The executable of `version`, for this system, into the cache.
        pub fn new(version: impl Into<String>) -> Self {
            Download { version: version.into(), dest: None, file: None, base_url: None, quiet: false }
        }

        /// Where to put it (default: [`cached_binary`]).
        pub fn dest(mut self, path: impl AsRef<Path>) -> Self {
            self.dest = Some(path.as_ref().to_owned());
            self
        }

        /// The release file to take (default: [`platform_file`]).
        pub fn file(mut self, name: impl Into<String>) -> Self {
            self.file = Some(name.into());
            self
        }

        /// Where the release's files are, `{version}` standing for the
        /// version (default: `POSTEXT_RELEASE_URL`, else the GitHub Release).
        pub fn base_url(mut self, url: impl Into<String>) -> Self {
            self.base_url = Some(url.into());
            self
        }

        /// Leave out the line that says the download started.
        pub fn quiet(mut self, quiet: bool) -> Self {
            self.quiet = quiet;
            self
        }

        /// Download, check and install it. Returns its path.
        pub fn run(self) -> Result<PathBuf> {
            let file = match self.file {
                Some(f) => f,
                None => platform_file()?.to_owned(),
            };
            let dest = self.dest.unwrap_or_else(|| cached_binary(&self.version));
            let template = self
                .base_url
                .or_else(|| env(ENV_RELEASE_URL).map(|v| v.to_string_lossy().into_owned()))
                .unwrap_or_else(|| RELEASE_URL.to_owned());
            let base = template.replace("{version}", &self.version).trim_end_matches('/').to_owned();
            let agent: ureq::Agent = ureq::Agent::config_builder()
                .timeout_connect(Some(Duration::from_secs(30)))
                .timeout_recv_response(Some(Duration::from_secs(60)))
                .user_agent(format!("postext-rust/{VERSION}"))
                .build()
                .into();

            let sums_url = format!("{base}/SHA256SUMS");
            let mut sums_text = String::new();
            fetch(&agent, &sums_url)?.0.read_to_string(&mut sums_text).map_err(|e| failed(&sums_url, e))?;
            let expected = parse_sums(&sums_text)
                .remove(&file)
                .ok_or_else(|| Error::BinaryNotFound(format!("{sums_url} lists no {file}")))?;

            let dir = dest.parent().map(Path::to_owned).unwrap_or_default();
            std::fs::create_dir_all(&dir)?;
            let url = format!("{base}/{file}");
            let (mut body, length) = fetch(&agent, &url)?;
            if !self.quiet {
                let mb = length.map(|n| format!(" ({:.0} MB)", n as f64 / 1e6)).unwrap_or_default();
                eprintln!("postext: downloading {file} {}{mb}, once, into {}", self.version, dir.display());
            }
            let mut tmp = tempfile::Builder::new().prefix(".download-").tempfile_in(&dir)?;
            let mut digest = Sha256::new();
            let mut buf = vec![0u8; 1 << 20];
            loop {
                let n = body.read(&mut buf).map_err(|e| failed(&url, e))?;
                if n == 0 {
                    break;
                }
                digest.update(&buf[..n]);
                tmp.write_all(&buf[..n])?;
            }
            tmp.flush()?;
            let got: String = digest.finalize().iter().map(|b| format!("{b:02x}")).collect();
            if got != expected {
                return Err(Error::BinaryNotFound(format!(
                    "The checksum of {url} does not match SHA256SUMS ({got} instead of {expected}); nothing was installed."
                )));
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                tmp.as_file().set_permissions(std::fs::Permissions::from_mode(0o755))?;
            }
            if let Err(e) = tmp.persist(&dest) {
                // Another process put it there first (and Windows does not
                // replace an executable that is running): keep theirs.
                if !dest.is_file() {
                    return Err(e.error.into());
                }
            }
            Ok(dest)
        }
    }

    fn failed(url: &str, e: impl std::fmt::Display) -> Error {
        Error::BinaryNotFound(format!("Could not download {url}: {e}"))
    }

    fn fetch(agent: &ureq::Agent, url: &str) -> Result<(impl Read + use<>, Option<u64>)> {
        match agent.get(url).call() {
            Ok(res) => {
                let body = res.into_body();
                let length = body.content_length();
                Ok((body.into_reader(), length))
            }
            Err(ureq::Error::StatusCode(code)) => Err(failed(url, format!("HTTP {code}"))),
            Err(e) => Err(failed(url, e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_files() {
        assert_eq!(platform_file_for("macos", "aarch64", false).unwrap(), "postext-macos-arm64");
        assert_eq!(platform_file_for("macos", "x86_64", false).unwrap(), "postext-macos-x64");
        assert_eq!(platform_file_for("linux", "x86_64", false).unwrap(), "postext-linux-x64");
        assert_eq!(platform_file_for("linux", "aarch64", false).unwrap(), "postext-linux-arm64");
        assert_eq!(platform_file_for("linux", "x86_64", true).unwrap(), "postext-linux-x64-musl");
        assert_eq!(platform_file_for("windows", "x86_64", false).unwrap(), "postext-windows-x64.exe");
        assert_eq!(platform_file_for("windows", "aarch64", false).unwrap(), "postext-windows-x64.exe");
        assert!(matches!(platform_file_for("linux", "aarch64", true), Err(Error::BinaryNotFound(_))));
        assert!(matches!(platform_file_for("freebsd", "x86_64", false), Err(Error::BinaryNotFound(_))));
        assert!(matches!(platform_file_for("linux", "riscv64", false), Err(Error::BinaryNotFound(_))));
        // this machine has one
        assert!(FILES.contains(&platform_file().unwrap()));
    }

    #[test]
    fn cache_folder() {
        let with = |pairs: &'static [(&'static str, &'static str)]| {
            move |k: &str| pairs.iter().find(|(n, _)| *n == k).map(|(_, v)| OsString::from(v))
        };
        assert_eq!(cache_dir_from(with(&[(ENV_CACHE, "/c"), ("HOME", "/h")])), PathBuf::from("/c"));
        if !cfg!(windows) {
            assert_eq!(cache_dir_from(with(&[("HOME", "/h")])), PathBuf::from("/h/.cache/postext"));
            assert_eq!(cache_dir_from(with(&[("XDG_CACHE_HOME", "/x"), ("HOME", "/h")])), PathBuf::from("/x/postext"));
        } else {
            assert_eq!(
                cache_dir_from(with(&[("LOCALAPPDATA", "C:\\L")])),
                PathBuf::from("C:\\L").join("postext").join("cache")
            );
        }
        let exe = if cfg!(windows) { "postext.exe" } else { "postext" };
        assert_eq!(cached_binary_in(Path::new("/c"), "9.9.9"), Path::new("/c").join("bin").join("9.9.9").join(exe));
    }

    #[test]
    fn sums() {
        let sums =
            parse_sums("aa11  postext-linux-x64\nBB22 *postext-windows-x64.exe\n\nnot a line with three parts\n");
        assert_eq!(sums.len(), 2);
        assert_eq!(sums["postext-linux-x64"], "aa11");
        assert_eq!(sums["postext-windows-x64.exe"], "bb22");
    }

    #[test]
    fn postext_bin_must_be_a_file() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("my-postext");
        std::fs::write(&exe, b"").unwrap();
        assert_eq!(resolve_bin(exe.clone().into()).unwrap(), exe);
        let missing = resolve_bin(dir.path().join("nothing").into()).unwrap_err();
        assert!(missing.to_string().contains(ENV_BIN), "{missing}");
    }
}
