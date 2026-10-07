/** Put values into a label's `__token__` placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/__(\w+)__/g, (m, key: string) => (key in values ? String(values[key]) : m));
}
