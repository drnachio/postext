//! The WebAssembly face of the Rust engine: a C ABI over linear memory,
//! with no binding generator. JavaScript writes a paragraph straight into
//! buffers the module owns (one `Float64Array` view, no copies, no
//! serialisation), calls `lb_break`, and reads the breaks back the same
//! way. Every buffer lives in a context and is reused, so breaking a book
//! allocates only while the buffers grow to the longest paragraph.
//!
//! See `js/linebreak.mjs` for the JavaScript side.

mod linebreak;

pub use linebreak::*;
