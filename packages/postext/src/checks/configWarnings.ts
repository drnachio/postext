/**
 * Configuration values the engine cannot use as written. The engine never
 * fails on them — it numbers in decimal, sets a font stack in its first
 * family, cuts the columns of a one-and-a-half layout at the nearest width
 * both can take, ignores a heading setting it does not know — but a silent
 * substitution is hard to spot, so every one is reported: on
 * `VDTDocument.configWarnings`, and to any host that asks with
 * {@link collectConfigWarnings}.
 */



export { collectConfigWarnings } from './configWarnings/collect.js';
export type { ConfigWarningOptions } from './configWarnings/collect.js';
export { designTextLiteral, contentInConfigRule } from './configWarnings/contentInConfig.js';
export type { DesignTextVerdict } from './configWarnings/contentInConfig.js';
