// Test setup (vitest.config.ts): the measurement cache freezes the segments
// it keeps. Every copy it hands out shares them (#1609), so a write to a
// placed segment would change every other copy of the paragraph; frozen, it
// throws in the test that reaches it. Put a copy in the line's list
// instead: `segments[i] = { ...segments[i], color }`.
(globalThis as { __postextFreezeMeasured?: boolean }).__postextFreezeMeasured = true;
