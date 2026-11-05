// A strict well-formedness and namespace check for the validator. The
// reader's `parseXml` is lenient on purpose (it recovers from bad end tags),
// so it cannot tell a broken part from a good one; Word can, and refuses the
// whole file. Checks: one root, balanced and matching tags, no stray `<` or
// bare `&` in text, no duplicate attributes, every element/attribute prefix
// declared in scope, and every `mc:Ignorable` prefix declared.

const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const BARE_AMP = /&(?!(?:[A-Za-z_][\w.-]*|#\d+|#x[0-9A-Fa-f]+);)/;

const prefixOf = (name: string): string | undefined => (name.includes(':') ? name.slice(0, name.indexOf(':')) : undefined);

/** Problems in one XML part (empty = well-formed with declared prefixes). */
export function xmlProblems(xml: string): string[] {
  const errors: string[] = [];
  const stack: { name: string; scope: Set<string> }[] = [];
  let roots = 0;
  let last = 0;
  const textCheck = (s: string): void => {
    if (s.includes('<')) errors.push('stray "<" in text');
    if (BARE_AMP.test(s)) errors.push('unescaped "&" in text');
    if (!stack.length && s.trim()) errors.push('text outside the root element');
  };
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(xml))) {
    textCheck(xml.slice(last, m.index));
    last = TOKEN.lastIndex;
    const [, endName, startName, attrSource, selfClose] = m;
    if (endName !== undefined) {
      const top = stack.pop();
      if (!top) errors.push(`end tag </${endName}> without a start tag`);
      else if (top.name !== endName) errors.push(`end tag </${endName}> closes <${top.name}>`);
      continue;
    }
    if (startName === undefined) continue;
    if (!stack.length && roots++ > 0) errors.push(`second root element <${startName}>`);
    const scope = new Set(stack.length ? stack[stack.length - 1]!.scope : ['xml', 'xmlns']);
    const attrs = new Map<string, string>();
    let a: RegExpExecArray | null;
    ATTR.lastIndex = 0;
    while ((a = ATTR.exec(attrSource ?? ''))) {
      const name = a[1]!;
      const value = a[2] ?? a[3] ?? '';
      if (attrs.has(name)) errors.push(`<${startName}>: duplicate attribute ${name}`);
      attrs.set(name, value);
      if (BARE_AMP.test(value) || value.includes('<')) errors.push(`<${startName}>: bad character in ${name}`);
      if (name.startsWith('xmlns:')) scope.add(name.slice(6));
    }
    const used = [prefixOf(startName), ...[...attrs.keys()].filter((n) => !n.startsWith('xmlns')).map(prefixOf)];
    for (const p of used) if (p !== undefined && !scope.has(p)) errors.push(`<${startName}>: undeclared prefix ${p}`);
    for (const [name, value] of attrs) {
      if (!name.endsWith(':Ignorable')) continue;
      for (const p of value.split(/\s+/).filter(Boolean)) if (!scope.has(p)) errors.push(`<${startName}>: ignorable prefix ${p} is not declared`);
    }
    if (!selfClose) stack.push({ name: startName, scope });
  }
  textCheck(xml.slice(last));
  for (const open of stack.reverse()) errors.push(`<${open.name}> is never closed`);
  if (!roots) errors.push('no root element');
  return [...new Set(errors)];
}
