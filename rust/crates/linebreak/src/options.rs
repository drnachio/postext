//! The measure and the rules of a paragraph (`KPOptions`).

use crate::constants::{DEFAULT_CONSECUTIVE_HYPHEN_DEMERIT, DEFAULT_FITNESS_CLASS_DEMERIT};
use crate::looseness::LoosenessMode;

#[derive(Clone, Debug)]
pub struct Options {
    /// The width of each line, from the first; the last entry stands for
    /// every line after it (the measure is uniform from there on).
    pub widths: Vec<f64>,
    /// From this line on every line has the same width: nodes there merge
    /// by fitness class alone, which keeps the search linear.
    pub uniform_from: Option<u32>,
    pub normal_space_width: f64,
    pub max_stretch_ratio: f64,
    pub consecutive_hyphen_demerit: f64,
    pub fitness_class_demerit: f64,
    pub runt_penalty: f64,
    pub runt_min_width: f64,
    pub runt_graded: bool,
    /// Lines (1-based count of lines set so far + 1) that should not end
    /// on a hyphen: they close a column or a page.
    pub avoid_hyphen_at_lines: Vec<u32>,
    /// Breaks fixed in advance: line `k` ends at item `fixed_breaks[k]`.
    pub fixed_breaks: Vec<u32>,
    /// Lines more (> 0) or fewer (< 0) than the natural setting.
    pub looseness: i32,
    pub looseness_mode: LoosenessMode,
    /// Tracking capacity, px per character (0: no tracking).
    pub tracking_per_char: f64,
    /// Right-hand glue every line gets in a ragged setting (0: justified).
    pub ragged_stretch: f64,
    pub hyphenation_zone: Option<f64>,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            widths: Vec::new(),
            uniform_from: None,
            normal_space_width: 0.0,
            max_stretch_ratio: 0.0,
            consecutive_hyphen_demerit: DEFAULT_CONSECUTIVE_HYPHEN_DEMERIT,
            fitness_class_demerit: DEFAULT_FITNESS_CLASS_DEMERIT,
            runt_penalty: 0.0,
            runt_min_width: 0.0,
            runt_graded: false,
            avoid_hyphen_at_lines: Vec::new(),
            fixed_breaks: Vec::new(),
            looseness: 0,
            looseness_mode: LoosenessMode::default(),
            tracking_per_char: 0.0,
            ragged_stretch: 0.0,
            hyphenation_zone: None,
        }
    }
}

impl Options {
    /// The width of line `line` (0-based).
    #[inline]
    pub(crate) fn line_width(&self, line: u32) -> f64 {
        let last = self.widths.len() - 1;
        self.widths[(line as usize).min(last)]
    }
}
