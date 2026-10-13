//! The constants of `knuthPlass/constants.ts`.

/// A penalty at or above this never breaks; at or below its negative,
/// always does. Also the adjustment ratio of a line that cannot stretch.
pub const KP_INFINITY: f64 = 10000.0;
pub const DEFAULT_CONSECUTIVE_HYPHEN_DEMERIT: f64 = 3000.0;
pub const DEFAULT_FITNESS_CLASS_DEMERIT: f64 = 100.0;
pub const BADNESS_CAP: f64 = 10000.0;
/// The floor of the cost of a line stretched past its limit (× r²).
pub const OVER_STRETCH_BADNESS: f64 = 2000.0;
/// The cost of a line that takes all the tracking it may (× share²).
pub const TRACKING_BADNESS: f64 = 100.0;
/// A hyphen ending a line that closes a column or a page.
pub const COLUMN_END_HYPHEN_BADNESS: f64 = 1000.0;
/// Word spacing past this multiple of the normal space sets a line ragged.
pub const RAGGED_SPACE_RATIO: f64 = 3.0;
