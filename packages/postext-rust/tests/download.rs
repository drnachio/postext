//! Downloading the executable, against a local server.
#![cfg(feature = "download")]

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::path::PathBuf;

use postext::{Download, Error};
use sha2::{Digest, Sha256};

/// Serves `v1.2.3/postext-test`, `v1.2.3/postext-bad` and `v1.2.3/SHA256SUMS`;
/// anything else is a 404. Returns the release URL template and the body.
fn release() -> (String, Vec<u8>) {
    let body = b"#!/bin/sh\necho fake postext\n".repeat(1000);
    let good: String = Sha256::digest(&body).iter().map(|b| format!("{b:02x}")).collect();
    let sums = format!("{good}  postext-test\n{}  postext-bad\n", "0".repeat(64));
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let served = body.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            let path = line.split_whitespace().nth(1).unwrap_or("").to_owned();
            loop {
                let mut header = String::new();
                if reader.read_line(&mut header).unwrap() == 0 || header == "\r\n" {
                    break;
                }
            }
            let file: Option<Vec<u8>> = match path.as_str() {
                "/v1.2.3/SHA256SUMS" => Some(sums.clone().into_bytes()),
                "/v1.2.3/postext-test" | "/v1.2.3/postext-bad" => Some(served.clone()),
                _ => None,
            };
            let mut stream = stream;
            let (status, data) = match file {
                Some(d) => ("200 OK", d),
                None => ("404 Not Found", b"not found".to_vec()),
            };
            let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", data.len());
            let _ = stream.write_all(&data);
        }
    });
    (format!("http://127.0.0.1:{port}/v{{version}}"), body)
}

fn get(url: &str, dest: PathBuf, file: &str, version: &str) -> postext::Result<PathBuf> {
    Download::new(version).dest(dest).file(file).base_url(url).quiet(true).run()
}

#[test]
fn download_checks_the_sum() {
    let (url, body) = release();
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("cache").join("postext");
    let path = get(&url, dest.clone(), "postext-test", "1.2.3").unwrap();
    assert_eq!(path, dest);
    assert_eq!(std::fs::read(&dest).unwrap(), body);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(std::fs::metadata(&dest).unwrap().permissions().mode() & 0o111, 0o111);
    }

    let bad = dir.path().join("bad");
    let err = get(&url, bad.join("postext"), "postext-bad", "1.2.3").unwrap_err();
    assert!(matches!(&err, Error::BinaryNotFound(m) if m.contains("checksum")), "{err}");
    // no partial download left
    assert_eq!(std::fs::read_dir(&bad).unwrap().count(), 0);

    let err = get(&url, dir.path().join("x"), "postext-missing", "1.2.3").unwrap_err();
    assert!(err.to_string().contains("lists no"), "{err}");
    let err = get(&url, dir.path().join("y"), "postext-test", "9.9.9").unwrap_err();
    assert!(err.to_string().contains("HTTP 404"), "{err}");
}
