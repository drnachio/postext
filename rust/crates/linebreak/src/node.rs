//! Breakpoint nodes: a place a line may end, with the totals at the start
//! of the next line and the cheapest way there. Nodes live in an arena and
//! point back by index, so a search allocates nothing per node.

/// No node (the paragraph's start has no previous).
pub(crate) const NONE: u32 = u32::MAX;

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct Node {
    /// Item the line ends at (-1: the paragraph's start).
    pub position: i32,
    /// Lines set before the next one (0 at the start).
    pub line: u32,
    /// Fitness class of the line ending here.
    pub fitness: u8,
    pub total_width: f64,
    pub total_stretch: f64,
    pub total_shrink: f64,
    pub total_chars: f64,
    pub total_spaces: f64,
    pub total_no_tracking: f64,
    pub total_demerits: f64,
    /// A short looseness target only: the widest justified word spacing of
    /// the chain and how many of its lines are set ragged.
    pub loosest: f64,
    pub ragged: u32,
    pub total_word_spaces: f64,
    pub total_word_space_width: f64,
    pub previous: u32,
}

impl Node {
    pub fn start() -> Self {
        Self { position: -1, fitness: 1, previous: NONE, ..Self::default() }
    }
}

/// The nodes of one search.
#[derive(Default)]
pub(crate) struct Arena {
    nodes: Vec<Node>,
}

impl Arena {
    pub fn clear(&mut self) {
        self.nodes.clear();
    }

    #[inline]
    pub fn push(&mut self, node: Node) -> u32 {
        self.nodes.push(node);
        (self.nodes.len() - 1) as u32
    }

    #[inline]
    pub fn get(&self, id: u32) -> &Node {
        &self.nodes[id as usize]
    }

    /// The positions of the chain ending at `id`, first line first.
    pub fn trace(&self, mut id: u32, out: &mut Vec<u32>) {
        out.clear();
        while id != NONE {
            let n = self.get(id);
            if n.position < 0 {
                break;
            }
            out.push(n.position as u32);
            id = n.previous;
        }
        out.reverse();
    }

    /// Whether no line of the chain ending at `id` is very loose.
    pub fn within_stretch_limit(&self, mut id: u32) -> bool {
        while id != NONE {
            let n = self.get(id);
            if n.position < 0 {
                break;
            }
            if n.fitness == 3 {
                return false;
            }
            id = n.previous;
        }
        true
    }
}
