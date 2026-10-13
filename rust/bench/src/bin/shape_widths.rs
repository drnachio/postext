//! Widths of words shaped by HarfRust: one word per stdin line in, one
//! width (px at `size`) per line out. The experiment of #779 phase 2:
//! compared with what Skia and Chrome measure for the same font file.
//!
//!   shape_widths <font.ttf> <size px> [lang] [--fixed] < words.txt
//!
//! --fixed shapes at the font size in 16.16 fixed point, as Chrome sets
//! HarfBuzz's scale, and sums the integer advances.

use harfrust::{Buffer, Direction, Font, Language, Script, ShapeOptions, ShapePlan, ShaperFont};
use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::str::FromStr;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let bytes = std::fs::read(&args[1]).expect("font");
    let size: f64 = args[2].parse().expect("size");
    let fixed = args.iter().any(|a| a == "--fixed");
    let lang = args.get(3).filter(|l| !l.starts_with("--")).map(|l| Language::from_str(l).expect("lang"));
    let font = Font::new(bytes, 0).expect("parse font");
    let scale = (size * 65536.0).round() as i32;
    let shaper = if fixed { ShaperFont::new(&font).with_scale(scale) } else { ShaperFont::new(&font) };
    let upem = font.units_per_em() as f64;
    let stdin = std::io::stdin();
    let mut out = std::io::BufWriter::new(std::io::stdout());
    let mut buffer = Buffer::new();
    // One plan per script and direction, as a shaper keeps them: building
    // one compiles the font's lookups for the script.
    let mut plans: HashMap<(Option<Script>, Direction), ShapePlan> = HashMap::new();
    let started = std::time::Instant::now();
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
        let key = (buffer.script(), buffer.direction());
        let plan = plans.entry(key).or_insert_with(|| ShapePlan::new(&font, key.1, key.0, lang.as_ref(), &[]));
        harfrust::shape(&shaper, &mut buffer, ShapeOptions::new().plan(Some(plan))).expect("shape");
        let units: i64 = buffer.glyph_positions().iter().map(|p| p.x_advance as i64).sum();
        if args.iter().any(|a| a == "--units") {
            let adv: Vec<String> = buffer.glyph_positions().iter().map(|p| p.x_advance.to_string()).collect();
            writeln!(out, "{}", adv.join(" ")).unwrap();
            continue;
        }
        let width = if fixed { units as f64 / 65536.0 } else { units as f64 * size / upem };
        writeln!(out, "{width}").unwrap();
    }
    eprintln!("harfrust: shaped in {:.0} ms", started.elapsed().as_secs_f64() * 1000.0);
}
