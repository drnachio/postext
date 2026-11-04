// A minimal structural check of an unzipped package, used by the tests:
// every XML part is well-formed with declared prefixes (wellFormed.ts),
// the main document has its content type, every part has a content type, every override
// and internal relationship target exists, and every `r:id`/`r:embed`
// a part uses is one of its relationships.

import { children, type XmlElement, parseXml } from '../xml.js';
import { xmlPartText } from '../anchors/exportMap.js';
import { CONTENT_TYPE, REL } from './constants.js';
import { xmlProblems } from './wellFormed.js';

function resolveTarget(source: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = source.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

/** The part a `.rels` file belongs to (`word/_rels/document.xml.rels` →
 *  `word/document.xml`; `_rels/.rels` → the package root ''). */
function sourceOfRels(relsPath: string): string {
  const m = /^(.*?)_rels\/([^/]*)\.rels$/.exec(relsPath);
  if (!m) return '';
  return `${m[1]}${m[2]}`;
}

function collectRelIds(el: XmlElement, out: Set<string>): void {
  for (const [k, v] of Object.entries(el.attrs)) if (/^r:(id|embed|link|pict|href)$/.test(k)) out.add(v);
  for (const c of el.children) if (typeof c !== 'string') collectRelIds(c, out);
}

/** Problems found in the package (empty = valid). */
export function validateDocxPackage(files: Record<string, Uint8Array>): string[] {
  const errors: string[] = [];
  const parsed = new Map<string, XmlElement>();
  for (const [path, bytes] of Object.entries(files)) {
    if (!/\.(xml|rels)$/.test(path)) continue;
    try {
      const text = xmlPartText(bytes);
      for (const p of xmlProblems(text)) errors.push(`${path}: ${p}`);
      parsed.set(path, parseXml(text));
    } catch (e) {
      errors.push(`${path}: does not parse (${(e as Error).message})`);
    }
  }
  const types = parsed.get('[Content_Types].xml');
  if (!types) return [...errors, '[Content_Types].xml is missing'];
  const defaults = new Map(children(types, 'Default').map((d) => [(d.attrs.Extension ?? '').toLowerCase(), d.attrs.ContentType ?? '']));
  const overrides = new Map(children(types, 'Override').map((o) => [(o.attrs.PartName ?? '').replace(/^\//, ''), o.attrs.ContentType ?? '']));
  for (const p of overrides.keys()) if (!(p in files)) errors.push(`[Content_Types].xml: override for missing part /${p}`);
  for (const path of Object.keys(files)) {
    if (path === '[Content_Types].xml' || path.endsWith('/')) continue;
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    if (!overrides.has(path) && !defaults.has(ext)) errors.push(`${path}: no content type`);
  }
  if (!('_rels/.rels' in files)) errors.push('_rels/.rels is missing');
  const main = children(parsed.get('_rels/.rels'), 'Relationship').find((r) => r.attrs.Type === REL.officeDocument);
  const mainPath = main ? (main.attrs.Target ?? '').replace(/^\//, '') : undefined;
  if (!mainPath) errors.push('_rels/.rels: no officeDocument relationship');
  else if (overrides.get(mainPath) !== CONTENT_TYPE.document) errors.push(`${mainPath}: content type is not ${CONTENT_TYPE.document}`);

  for (const [relsPath, root] of parsed) {
    if (!relsPath.endsWith('.rels')) continue;
    const source = sourceOfRels(relsPath);
    if (source && !(source in files)) errors.push(`${relsPath}: source part ${source} is missing`);
    const ids = new Set<string>();
    for (const r of children(root, 'Relationship')) {
      const id = r.attrs.Id ?? '';
      if (!id) errors.push(`${relsPath}: relationship without Id`);
      if (ids.has(id)) errors.push(`${relsPath}: duplicate Id ${id}`);
      ids.add(id);
      if (r.attrs.TargetMode === 'External') continue;
      const target = resolveTarget(source || '_', r.attrs.Target ?? '');
      if (!(target in files)) errors.push(`${relsPath}: ${id} → missing target ${target}`);
    }
    const part = source ? parsed.get(source) : undefined;
    if (part) {
      const used = new Set<string>();
      collectRelIds(part, used);
      for (const id of used) if (!ids.has(id)) errors.push(`${source}: r:id ${id} has no relationship`);
    }
  }
  // Parts using r:id without any .rels file.
  for (const [path, root] of parsed) {
    if (path.endsWith('.rels')) continue;
    const dir = path.split('/').slice(0, -1).join('/');
    const relsPath = `${dir ? `${dir}/` : ''}_rels/${path.split('/').pop()}.rels`;
    if (relsPath in files) continue;
    const used = new Set<string>();
    collectRelIds(root, used);
    if (used.size) errors.push(`${path}: uses ${[...used].join(', ')} but has no relationships part`);
  }
  return errors;
}
