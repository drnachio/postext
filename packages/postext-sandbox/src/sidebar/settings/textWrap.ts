/** A `wrap` value as the settings show it (#627): `'start'` is the flow's
 *  left side, `'end'` its right; anything else is no wrap. */
export function wrapSideOf(value: unknown): 'none' | 'left' | 'right' {
  if (value === 'left' || value === 'start') return 'left';
  if (value === 'right' || value === 'end') return 'right';
  return 'none';
}
