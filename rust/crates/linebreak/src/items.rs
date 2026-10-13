//! A paragraph's items, column by column (struct of arrays): the search
//! reads one or two fields of many items, never a whole item.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ItemKind {
    Box = 0,
    Glue = 1,
    Penalty = 2,
}

/// Item flags.
pub mod flag {
    /// A penalty that is a hyphen (two in a row cost extra).
    pub const FLAGGED: u8 = 1;
    /// A dictionary syllable of a ragged hyphenation zone.
    pub const ZONED: u8 = 2;
    /// A box tracking may not reach.
    pub const NO_TRACKING: u8 = 4;
    /// A glue that is a word space (`sourceIndex >= 0`), not a closing one.
    pub const WORD_SPACE: u8 = 8;
}

/// The items of one paragraph. `width` of a penalty is what it adds when
/// the line breaks there (a hyphen); `stretch` of a box is an Arabic word's
/// kashida give; `post_width` is what a break at a penalty adds at the start
/// of the next line (`postWidth + postShift`), `post_chars` its characters.
#[derive(Default, Clone, Debug)]
pub struct Items {
    pub kind: Vec<ItemKind>,
    pub width: Vec<f64>,
    pub stretch: Vec<f64>,
    pub shrink: Vec<f64>,
    pub penalty: Vec<f64>,
    pub flags: Vec<u8>,
    pub chars: Vec<f64>,
    pub post_width: Vec<f64>,
    pub post_chars: Vec<f64>,
}

impl Items {
    pub fn len(&self) -> usize {
        self.kind.len()
    }

    pub fn is_empty(&self) -> bool {
        self.kind.is_empty()
    }

    pub fn clear(&mut self) {
        self.kind.clear();
        self.width.clear();
        self.stretch.clear();
        self.shrink.clear();
        self.penalty.clear();
        self.flags.clear();
        self.chars.clear();
        self.post_width.clear();
        self.post_chars.clear();
    }

    /// Appends one item; fields an item kind does not have are 0.
    #[allow(clippy::too_many_arguments)]
    pub fn push(
        &mut self,
        kind: ItemKind,
        width: f64,
        stretch: f64,
        shrink: f64,
        penalty: f64,
        flags: u8,
        chars: f64,
        post_width: f64,
        post_chars: f64,
    ) {
        self.kind.push(kind);
        self.width.push(width);
        self.stretch.push(stretch);
        self.shrink.push(shrink);
        self.penalty.push(penalty);
        self.flags.push(flags);
        self.chars.push(chars);
        self.post_width.push(post_width);
        self.post_chars.push(post_chars);
    }

    #[inline]
    pub(crate) fn is_flagged_penalty(&self, i: usize) -> bool {
        self.kind[i] == ItemKind::Penalty && self.flags[i] & flag::FLAGGED != 0
    }
}
