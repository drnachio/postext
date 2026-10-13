//! Line breaking over the ABI.
//!
//! A paragraph is staged as `ITEM_STRIDE` f64 per item: kind (0 box,
//! 1 glue, 2 penalty), width, stretch, shrink, penalty, flags, chars,
//! post width (`postWidth + postShift`), post chars. Line widths as f64,
//! lines to avoid a hyphen at and fixed breaks as u32. Scalar options go
//! through `lb_set_options`.

use postext_linebreak::{Breaker, ItemKind, Items, LoosenessMode, Options};

pub const ITEM_STRIDE: usize = 9;

/// One line breaker and its staging buffers.
pub struct LineBreakContext {
    breaker: Breaker,
    items: Items,
    options: Options,
    staged_items: Vec<f64>,
    staged_avoid: Vec<u32>,
    staged_fixed: Vec<u32>,
    breaks: Vec<u32>,
}

#[unsafe(no_mangle)]
pub extern "C" fn lb_new() -> *mut LineBreakContext {
    Box::into_raw(Box::new(LineBreakContext {
        breaker: Breaker::new(),
        items: Items::default(),
        options: Options::default(),
        staged_items: Vec::new(),
        staged_avoid: Vec::new(),
        staged_fixed: Vec::new(),
        breaks: Vec::new(),
    }))
}

/// # Safety
/// `ctx` comes from `lb_new` and is not used afterwards.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn lb_free(ctx: *mut LineBreakContext) {
    drop(unsafe { Box::from_raw(ctx) });
}

fn ctx<'a>(ptr: *mut LineBreakContext) -> &'a mut LineBreakContext {
    // SAFETY: the JavaScript side only passes pointers `lb_new` returned.
    unsafe { &mut *ptr }
}

/// Room for `count` items; returns where to write them.
#[unsafe(no_mangle)]
pub extern "C" fn lb_items(ptr: *mut LineBreakContext, count: usize) -> *mut f64 {
    let c = ctx(ptr);
    c.staged_items.resize(count * ITEM_STRIDE, 0.0);
    c.staged_items.as_mut_ptr()
}

/// Room for `count` line widths.
#[unsafe(no_mangle)]
pub extern "C" fn lb_widths(ptr: *mut LineBreakContext, count: usize) -> *mut f64 {
    let c = ctx(ptr);
    c.options.widths.resize(count, 0.0);
    c.options.widths.as_mut_ptr()
}

/// Room for `count` lines that should not end on a hyphen.
#[unsafe(no_mangle)]
pub extern "C" fn lb_avoid(ptr: *mut LineBreakContext, count: usize) -> *mut u32 {
    let c = ctx(ptr);
    c.staged_avoid.resize(count, 0);
    c.staged_avoid.as_mut_ptr()
}

/// Room for `count` fixed breaks.
#[unsafe(no_mangle)]
pub extern "C" fn lb_fixed(ptr: *mut LineBreakContext, count: usize) -> *mut u32 {
    let c = ctx(ptr);
    c.staged_fixed.resize(count, 0);
    c.staged_fixed.as_mut_ptr()
}

/// The scalar options. A negative `uniform_from` or `hyphenation_zone`
/// means none; `flags`: 1 graded runt, 2 the single-search looseness.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn lb_set_options(
    ptr: *mut LineBreakContext,
    uniform_from: i32,
    normal_space_width: f64,
    max_stretch_ratio: f64,
    consecutive_hyphen_demerit: f64,
    fitness_class_demerit: f64,
    runt_penalty: f64,
    runt_min_width: f64,
    looseness: i32,
    tracking_per_char: f64,
    ragged_stretch: f64,
    hyphenation_zone: f64,
    flags: u32,
) {
    let o = &mut ctx(ptr).options;
    o.uniform_from = (uniform_from >= 0).then_some(uniform_from as u32);
    o.normal_space_width = normal_space_width;
    o.max_stretch_ratio = max_stretch_ratio;
    o.consecutive_hyphen_demerit = consecutive_hyphen_demerit;
    o.fitness_class_demerit = fitness_class_demerit;
    o.runt_penalty = runt_penalty;
    o.runt_min_width = runt_min_width;
    o.runt_graded = flags & 1 != 0;
    o.looseness = looseness;
    o.looseness_mode = if flags & 2 != 0 { LoosenessMode::Single } else { LoosenessMode::TwoPass };
    o.tracking_per_char = tracking_per_char;
    o.ragged_stretch = ragged_stretch;
    o.hyphenation_zone = (hyphenation_zone >= 0.0).then_some(hyphenation_zone);
}

/// Breaks the staged paragraph; returns how many breaks `lb_breaks` holds.
#[unsafe(no_mangle)]
pub extern "C" fn lb_break(ptr: *mut LineBreakContext) -> usize {
    let c = ctx(ptr);
    unstage(&c.staged_items, &mut c.items);
    c.options.avoid_hyphen_at_lines.clone_from(&c.staged_avoid);
    c.options.fixed_breaks.clone_from(&c.staged_fixed);
    let breaks = c.breaker.breakpoints(&c.items, &c.options);
    c.breaks.clear();
    c.breaks.extend_from_slice(breaks);
    c.breaks.len()
}

/// Where the breaks of the last `lb_break` are.
#[unsafe(no_mangle)]
pub extern "C" fn lb_breaks(ptr: *mut LineBreakContext) -> *const u32 {
    ctx(ptr).breaks.as_ptr()
}

/// The staged rows, column by column.
fn unstage(rows: &[f64], items: &mut Items) {
    items.clear();
    for r in rows.as_chunks::<ITEM_STRIDE>().0 {
        let kind = match r[0] as u8 {
            0 => ItemKind::Box,
            1 => ItemKind::Glue,
            _ => ItemKind::Penalty,
        };
        items.push(kind, r[1], r[2], r[3], r[4], r[5] as u8, r[6], r[7], r[8]);
    }
}
