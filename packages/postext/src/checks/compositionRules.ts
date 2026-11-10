// The faults of the composition rules in a laid-out document, as the
// `'warn'` and `'avoid'` levels report them: stacks (#1463) and the hyphen
// rules (#1466).
export { findStacks, type Stack, type StackRange, type FindStacksOptions } from './stacks.js';
export { findHyphenFaults, endsOnHyphen, type HyphenFault, type FindHyphenFaultsOptions } from './hyphenRules.js';
