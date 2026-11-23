/** Checks for values read from untrusted data. Not exported from the
 *  package. */

export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A finite number, zero or more. */
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
