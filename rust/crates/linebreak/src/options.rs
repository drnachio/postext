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
    /// The composition rules (`KPOptions.stacks`, `ladders`,
    /// `lastWordDemerits`, `extraHyphenPenalty`).
    pub rules: Rules,
}

/// The composition rules: stacks (#1463) and the hyphen rules (#1466).
#[derive(Clone, Debug, Default)]
pub struct Rules {
    /// Hyphen ladders: each line ending on a hyphen past `ladder_run` such
    /// lines in a row costs `ladder_demerits` (`ladder_run` 0: off).
    pub ladder_run: u32,
    pub ladder_demerits: f64,
    /// The paragraph's last word divided: the line before the last ends on
    /// a hyphen and the last line holds no word space (0: off).
    pub last_word_demerits: f64,
    /// Added to the penalty of every break that ends a line on a hyphen
    /// (`hyphenation.fewerHyphens`).
    pub extra_hyphen_penalty: f64,
    /// Demerits a stack adds (twice for a repeated monosyllable); `None`:
    /// stacks are not looked at.
    pub stack_demerits: Option<f64>,
    /// The line edges stacks compare (`writeEdges` in `wasm/abi.ts`), as
    /// ids (0: none; a word id's low bit says it is a monosyllable) and
    /// reaches (how far into the line each edge goes, in units of the
    /// paragraph's text): `end_*[k]` of a line ending at break `k`,
    /// `start_*[k + 1]` of the line after it (`[0]`: the paragraph's first
    /// line), and `offset[k]`, where item `k` starts in that text.
    pub end_word: Vec<u32>,
    pub end_chars: Vec<u32>,
    pub end_word_reach: Vec<u32>,
    pub end_chars_reach: Vec<u32>,
    pub start_word: Vec<u32>,
    pub start_chars: Vec<u32>,
    pub start_word_reach: Vec<u32>,
    pub start_chars_reach: Vec<u32>,
    pub offset: Vec<u32>,
}

/// One edge of a line, as far as the line holds it: its word and its
/// characters (0: none).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct Edge {
    pub word: u32,
    pub chars: u32,
}

impl Edge {
    /// The bits of the edge the line holds (word 1, characters 2): part of
    /// an exact node's key.
    pub fn bits(self) -> u32 {
        u32::from(self.word != 0) | (u32::from(self.chars != 0) << 1)
    }
}

impl Rules {
    /// The length of the line from break `from` (-1: the paragraph's
    /// start) to break `to`, in units of the paragraph's text.
    #[inline]
    fn line_length(&self, from: i32, to: usize) -> u32 {
        self.offset[to] - self.offset[(from + 1) as usize]
    }

    /// The end edge of the line from break `from` to break `to`.
    #[inline]
    pub(crate) fn line_end(&self, from: i32, to: usize) -> Edge {
        let len = self.line_length(from, to);
        Edge {
            word: if self.end_word_reach[to] <= len { self.end_word[to] } else { 0 },
            chars: if self.end_chars_reach[to] <= len { self.end_chars[to] } else { 0 },
        }
    }

    /// The start edge of the line from break `from` to break `to`.
    #[inline]
    pub(crate) fn line_start(&self, from: i32, to: usize) -> Edge {
        let len = self.line_length(from, to);
        let s = (from + 1) as usize;
        Edge {
            word: if self.start_word_reach[s] <= len { self.start_word[s] } else { 0 },
            chars: if self.start_chars_reach[s] <= len { self.start_chars[s] } else { 0 },
        }
    }
}

/// What a stack between edges `a` and `b` costs, in units of the stack
/// demerits: 2 for a repeated monosyllable, 1 for another stack, 0 for
/// none (`stackWeight`).
#[inline]
pub(crate) fn stack_weight(a: Edge, b: Edge) -> u32 {
    let same_word = a.word != 0 && a.word == b.word;
    if !same_word && !(a.chars != 0 && a.chars == b.chars) {
        0
    } else if same_word && a.word & 1 != 0 {
        2
    } else {
        1
    }
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
            rules: Rules::default(),
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
