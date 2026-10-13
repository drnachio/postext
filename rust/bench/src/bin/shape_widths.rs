//! Widths of words shaped by HarfRust: one word per stdin line in, one
//! width (px at `size`) per line out. The experiment of #779 phase 2:
//! compared with what Skia and Chrome measure for the same font file.
//!
//!   shape_widths <font.ttf> <size px> [lang] < words.txt

use harfrust::{Buffer, Direction, Font, Language, ShapeOptions, ShaperFont};
use std::io::{BufRead, Write};
use std::str::FromStr;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let bytes = std::fs::read(&args[1]).expect("font");
    let size: f64 = args[2].parse().expect("size");
    let lang = args.get(3).map(|l| Language::from_str(l).expect("lang"));
    let font = Font::new(bytes, 0).expect("parse font");
    let shaper = ShaperFont::new(&font);
    let upem = font.units_per_em() as f64;
    let stdin = std::io::stdin();
    let mut out = std::io::BufWriter::new(std::io::stdout());
    let mut buffer = Buffer::new();
    for line in stdin.lock().lines() {
        let word = line.expect("read");
        buffer.clear();
        buffer.push_str(&word);
        buffer.guess_segment_properties();
        if buffer.direction() == Direction::Invalid {
            buffer.set_direction(Direction::LeftToRight);
        }
        if let Some(l) = &lang {
            buffer.set_language(Some(l.clone()));
        }
        harfrust::shape(&shaper, &mut buffer, ShapeOptions::default()).expect("shape");
        let units: i64 = buffer.glyph_positions().iter().map(|p| p.x_advance as i64).sum();
        writeln!(out, "{}", units as f64 * size / upem).unwrap();
    }
}
