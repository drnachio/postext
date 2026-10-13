//! Shaping plans, one per font, script, direction and language: a plan
//! compiles the font's lookups for its script, and building one per word
//! made shaping sixty times slower.

use harfrust::{Buffer, Direction, Font, Language, Script, ShapeOptions, ShapePlan, ShaperFont};
use std::collections::HashMap;

/// Font id, script, direction and language id (`u32::MAX`: none): a
/// language is keyed by its id, so a lookup allocates nothing.
type Key = (u32, Option<Script>, Direction, u32);

#[derive(Default)]
pub(crate) struct Plans {
    plans: HashMap<Key, ShapePlan>,
}

impl Plans {
    /// Shapes `word` and returns the buffer for reuse with the sum of its
    /// advances in font units, or `None` when a glyph is missing.
    pub fn shape(
        &mut self,
        id: u32,
        font: &Font,
        shaper: &ShaperFont<'_, '_>,
        mut buffer: Buffer,
        word: &str,
        language: Option<(u32, &Language)>,
    ) -> (Buffer, Option<i64>) {
        buffer.clear();
        buffer.push_str(word);
        buffer.guess_segment_properties();
        if buffer.direction() == Direction::Invalid {
            buffer.set_direction(Direction::LeftToRight);
        }
        if let Some((_, l)) = language {
            buffer.set_language(Some(l.clone()));
        }
        let (script, direction) = (buffer.script(), buffer.direction());
        let key = (id, script, direction, language.map_or(u32::MAX, |(i, _)| i));
        let plan = self
            .plans
            .entry(key)
            .or_insert_with(|| ShapePlan::new(font, direction, script, language.map(|(_, l)| l), &[]));
        if harfrust::shape(shaper, &mut buffer, ShapeOptions::new().plan(Some(plan))).is_err() {
            return (buffer, None);
        }
        if buffer.glyph_infos().iter().any(|g| g.glyph_id == 0) {
            return (buffer, None);
        }
        let units = buffer.glyph_positions().iter().map(|p| i64::from(p.x_advance)).sum();
        (buffer, Some(units))
    }
}
