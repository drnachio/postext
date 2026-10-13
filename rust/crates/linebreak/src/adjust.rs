//! How a line is set: its adjustment ratio, its tracking, its badness.

use crate::constants::{BADNESS_CAP, KP_INFINITY};

/// A line's adjustment ratio and the tracking it takes.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LineAdjustment {
    /// Adjustment ratio of the word spaces once tracking has taken its part.
    pub r: f64,
    /// Tracking, px after every character; negative tightens.
    pub tracking: f64,
    /// Share of the line's tracking capacity it uses (0–1).
    pub share: f64,
}

/// The adjustment ratio of a line leaving `slack` px against its measure,
/// with `stretch`/`shrink` px of word-space give; past the limits (|r| > 1)
/// tracking on its `chars` characters takes the excess, up to
/// `tracking_per_char` each, when the line has a word space (`trackable`).
pub fn adjust_line(
    slack: f64,
    stretch: f64,
    shrink: f64,
    chars: f64,
    tracking_per_char: f64,
    trackable: bool,
) -> LineAdjustment {
    let r = ratio(slack, stretch, shrink);
    let none = LineAdjustment { r, tracking: 0.0, share: 0.0 };
    if tracking_per_char <= 0.0 || !trackable || chars <= 0.0 || (-1.0..=1.0).contains(&r) {
        return none;
    }
    let capacity = tracking_per_char * chars;
    if r > 1.0 {
        let excess = slack - stretch;
        let used = excess.min(capacity);
        let left = excess - used;
        if left <= 0.0 {
            return if used > 0.0 {
                LineAdjustment { r: 1.0, tracking: used / chars, share: used / capacity }
            } else {
                LineAdjustment { r: 0.0, tracking: 0.0, share: 0.0 }
            };
        }
        let r = if stretch > 0.0 { 1.0 + left / stretch } else { KP_INFINITY };
        return LineAdjustment { r, tracking: used / chars, share: used / capacity };
    }
    let deficit = -slack - shrink;
    if deficit > capacity {
        return none;
    }
    LineAdjustment { r: -1.0, tracking: -deficit / chars, share: deficit / capacity }
}

/// The plain adjustment ratio (no tracking).
#[inline]
pub(crate) fn ratio(slack: f64, stretch: f64, shrink: f64) -> f64 {
    if slack >= 0.0 {
        if stretch > 0.0 { slack / stretch } else { KP_INFINITY }
    } else if shrink > 0.0 {
        slack / shrink
    } else {
        -KP_INFINITY
    }
}

/// Fitness class: 0 tight, 1 normal, 2 loose, 3 very loose.
#[inline]
pub(crate) fn fitness_class(r: f64) -> u8 {
    if r < -0.5 {
        0
    } else if r < 0.5 {
        1
    } else if r < 1.0 {
        2
    } else {
        3
    }
}

/// `100 |r|³`, rounded as JavaScript's `Math.round` (half up), capped.
#[inline]
pub(crate) fn badness(r: f64) -> f64 {
    let a = r.abs();
    js_round(100.0 * a * a * a).min(BADNESS_CAP)
}

/// `Math.round`: the nearest integer, halves towards +∞.
#[inline]
fn js_round(x: f64) -> f64 {
    let f = x.floor();
    if x - f >= 0.5 { f + 1.0 } else { f }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rounds_like_javascript() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(0.49), 0.0);
    }

    #[test]
    fn badness_is_capped() {
        assert_eq!(badness(0.5), 13.0);
        assert_eq!(badness(KP_INFINITY), BADNESS_CAP);
    }

    #[test]
    fn tracking_takes_the_excess() {
        let a = adjust_line(30.0, 10.0, 5.0, 40.0, 1.0, true);
        assert_eq!(a, LineAdjustment { r: 1.0, tracking: 0.5, share: 0.5 });
        let b = adjust_line(30.0, 10.0, 5.0, 40.0, 1.0, false);
        assert_eq!(b.r, 3.0);
    }
}
