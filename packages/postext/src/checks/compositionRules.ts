// The faults of the composition rules in a laid-out document, as the
// `'warn'` and `'avoid'` levels report them: stacks (#1463), the hyphen
// rules (#1466) and citations and lone operators at a line edge (#1519).
export { findStacks, type Stack, type StackRange, type FindStacksOptions } from './stacks.js';
export { findSpaceBreaks, type SpaceBreakFault, type FindSpaceBreaksOptions } from './spaceBreaks.js';
export { findHyphenFaults, endsOnHyphen, type HyphenFault, type FindHyphenFaultsOptions } from './hyphenRules.js';
