//! A corpus recorded by `bench-layout.ts --kp-dump`: one Knuth–Plass call
//! per JSON line, with the breaks the TypeScript engine chose.

use postext_linebreak::{ItemKind, Items, LoosenessMode, Options};
use serde::Deserialize;
use std::fs::File;
use std::io::{BufRead, BufReader};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawOptions {
    widths: Vec<f64>,
    line_width_uniform_from: Option<u32>,
    #[serde(default)]
    normal_space_width: f64,
    #[serde(default)]
    max_stretch_ratio: f64,
    consecutive_hyphen_demerit: Option<f64>,
    fitness_class_demerit: Option<f64>,
    runt_penalty: Option<f64>,
    runt_min_width: Option<f64>,
    runt_graded: Option<bool>,
    avoid_hyphen_at_lines: Option<Vec<u32>>,
    fixed_breaks: Option<Vec<u32>>,
    looseness: Option<i32>,
    tracking_per_char: Option<f64>,
    ragged_stretch: Option<f64>,
    hyphenation_zone: Option<f64>,
}

#[derive(Deserialize)]
struct RawCall {
    /// `[kind, width, stretch, shrink, penalty, flags, chars, postWidth, postChars, postShift]`
    items: Vec<[f64; 10]>,
    options: RawOptions,
    breaks: Vec<u32>,
}

/// One recorded call.
pub struct Call {
    pub items: Items,
    pub options: Options,
    /// What the TypeScript engine returned.
    pub breaks: Vec<u32>,
}

pub fn load(path: &str) -> Vec<Call> {
    let file = File::open(path).unwrap_or_else(|e| panic!("{path}: {e}"));
    BufReader::new(file)
        .lines()
        .map(|line| convert(serde_json::from_str(&line.expect("read")).expect("parse")))
        .collect()
}

fn convert(raw: RawCall) -> Call {
    let mut items = Items::default();
    for r in &raw.items {
        let kind = match r[0] as u8 {
            0 => ItemKind::Box,
            1 => ItemKind::Glue,
            _ => ItemKind::Penalty,
        };
        items.push(kind, r[1], r[2], r[3], r[4], r[5] as u8, r[6], r[7] + r[9], r[8]);
    }
    let o = raw.options;
    let options = Options {
        widths: o.widths,
        uniform_from: o.line_width_uniform_from,
        normal_space_width: o.normal_space_width,
        max_stretch_ratio: o.max_stretch_ratio,
        consecutive_hyphen_demerit: o
            .consecutive_hyphen_demerit
            .unwrap_or(Options::default().consecutive_hyphen_demerit),
        fitness_class_demerit: o.fitness_class_demerit.unwrap_or(Options::default().fitness_class_demerit),
        runt_penalty: o.runt_penalty.unwrap_or(0.0),
        runt_min_width: o.runt_min_width.unwrap_or(0.0),
        runt_graded: o.runt_graded.unwrap_or(false),
        avoid_hyphen_at_lines: o.avoid_hyphen_at_lines.unwrap_or_default(),
        fixed_breaks: o.fixed_breaks.unwrap_or_default(),
        looseness: o.looseness.unwrap_or(0),
        looseness_mode: LoosenessMode::Single,
        tracking_per_char: o.tracking_per_char.unwrap_or(0.0),
        ragged_stretch: o.ragged_stretch.unwrap_or(0.0),
        hyphenation_zone: o.hyphenation_zone,
    };
    Call { items, options, breaks: raw.breaks }
}
