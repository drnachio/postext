//! Where Chrome's canvas cuts a string before shaping it: at every space
//! (U+0020), which is shaped on its own, so nothing kerns across it.

/// The words and the spaces of `text`, in order.
pub(crate) fn split(text: &str) -> impl Iterator<Item = &str> {
    let mut rest = text;
    std::iter::from_fn(move || {
        if rest.is_empty() {
            return None;
        }
        let len = if rest.starts_with(' ') { 1 } else { rest.find(' ').unwrap_or(rest.len()) };
        let (piece, tail) = rest.split_at(len);
        rest = tail;
        Some(piece)
    })
}

#[cfg(test)]
mod tests {
    use super::split;

    #[test]
    fn cuts_at_every_space() {
        assert_eq!(split("a bc  d").collect::<Vec<_>>(), ["a", " ", "bc", " ", " ", "d"]);
        assert_eq!(split(" x").collect::<Vec<_>>(), [" ", "x"]);
        assert_eq!(split("").count(), 0);
    }
}
