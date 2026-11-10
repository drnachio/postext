#!/usr/bin/env node
// Config coverage: which engine settings the docs, the postext-port skill and
// the Sandbox settings panel mention.
//
//   node scripts/config-coverage.mjs [--since <rev>] [--locale <docs locale>] [--json <file>] [--all] [--noted] [--check]
//
// Reads every interface and object type alias of packages/postext/src
// syntactically, keeps those reachable from `PostextConfig` and lists their
// fields as `Owner.field`. `--since <rev>` keeps only the fields that did not
// exist at that revision (the same walk over `git show <rev>:<file>`). Each
// field is then looked up as a whole word in three corpora:
//   docs   docs/*-<locale>.mdx (en by default)
//   skill  plugins/postext/skills/postext-port/{SKILL.md,references/*.md}
//   panel  packages/postext-sandbox/src/{sidebar,panels,controls} sources
// A hit is only a hint (a generic name such as `color` is always found); a
// miss is a real gap or a deliberate exclusion to note in the report.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'packages/postext/package.json'));
const ts = require('typescript');

const SRC = 'packages/postext/src';
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function walk(dir, keep, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name === '__bench__') continue;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, keep, out);
    else if (keep(name)) out.push(rel);
  }
  return out;
}

function sourceFiles(rev) {
  // The config types (types.ts and, since #1276, the types/ modules behind it).
  const isConfigTypes = (f) => f === `${SRC}/types.ts` || f.startsWith(`${SRC}/types/`);
  const first = (files) => [...files.filter(isConfigTypes), ...files.filter((f) => !isConfigTypes(f))];
  if (!rev) return first(walk(SRC, (n) => n.endsWith('.ts') && !n.endsWith('.test.ts') && !n.endsWith('.d.ts')));
  return first(execFileSync('git', ['ls-tree', '-r', '--name-only', rev, SRC], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('.d.ts') && !p.includes('__tests__') && !p.includes('__bench__')));
}

function readAt(rev, path) {
  if (!rev) return readFileSync(join(ROOT, path), 'utf8');
  return execFileSync('git', ['show', `${rev}:${path}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
}

/** name -> { fields: Map<field, refs:Set<typeName>>, refs:Set<typeName> } */
function collectTypes(rev) {
  const types = new Map();
  for (const path of sourceFiles(rev)) {
    const sf = ts.createSourceFile(path, readAt(rev, path), ts.ScriptTarget.Latest, true);
    const refsIn = (node) => {
      const refs = new Set();
      const visit = (n) => {
        if (ts.isTypeReferenceNode(n)) refs.add(n.typeName.getText(sf).split('.').pop());
        if (ts.isExpressionWithTypeArguments(n)) refs.add(n.expression.getText(sf).split('.').pop());
        ts.forEachChild(n, visit);
      };
      visit(node);
      return refs;
    };
    const addMembers = (entry, members) => {
      for (const m of members) {
        if (!ts.isPropertySignature(m) || !m.name) continue;
        const name = m.name.getText(sf).replace(/^['"]|['"]$/g, '');
        const refs = m.type ? refsIn(m.type) : new Set();
        entry.fields.set(name, refs);
        // Inline object literals: their fields belong to the owner as `field.sub`.
        const visit = (n, prefix) => {
          if (ts.isTypeLiteralNode(n)) {
            for (const sub of n.members) {
              if (!ts.isPropertySignature(sub) || !sub.name) continue;
              const subName = `${prefix}.${sub.name.getText(sf).replace(/^['"]|['"]$/g, '')}`;
              entry.fields.set(subName, sub.type ? refsIn(sub.type) : new Set());
              if (sub.type) visit(sub.type, subName);
            }
            return;
          }
          ts.forEachChild(n, (c) => visit(c, prefix));
        };
        if (m.type) visit(m.type, name);
      }
    };
    // A name declared in two files (an internal `FootnoteNumbering` beside
    // the setting's) keeps its first declaration; types.ts is read first.
    const entryFor = (name) => {
      if (!types.has(name)) types.set(name, { fields: new Map(), refs: new Set(), file: path });
      const e = types.get(name);
      return e.file === path ? e : { fields: new Map(), refs: new Set(), file: path };
    };
    ts.forEachChild(sf, (node) => {
      if (ts.isInterfaceDeclaration(node)) {
        const e = entryFor(node.name.text);
        for (const h of node.heritageClauses ?? []) for (const t of h.types) for (const r of refsIn(t)) e.refs.add(r);
        addMembers(e, node.members);
      } else if (ts.isTypeAliasDeclaration(node)) {
        const e = entryFor(node.name.text);
        for (const r of refsIn(node.type)) e.refs.add(r);
        const visit = (n) => {
          if (ts.isTypeLiteralNode(n)) addMembers(e, n.members);
          else ts.forEachChild(n, visit);
        };
        visit(node.type);
      }
    });
  }
  return types;
}

function reachable(types, root = 'PostextConfig') {
  const seen = new Set();
  const stack = [root];
  while (stack.length) {
    const name = stack.pop();
    if (seen.has(name) || !types.has(name)) continue;
    seen.add(name);
    const t = types.get(name);
    for (const r of t.refs) stack.push(r);
    for (const refs of t.fields.values()) for (const r of refs) stack.push(r);
  }
  return seen;
}

function fieldList(rev) {
  const types = collectTypes(rev);
  const live = reachable(types);
  // The field names that lead to each type (`markStyles` for MarkStyleConfig):
  // a mention of the field is looked for near one of them.
  const parents = new Map();
  for (const name of live) {
    for (const [field, refs] of types.get(name).fields) {
      for (const r of refs) {
        if (!parents.has(r)) parents.set(r, new Set());
        parents.get(r).add(field.split('.').pop());
      }
    }
    for (const r of types.get(name).refs) {
      // An alias or an `extends` passes its parents on.
      if (!parents.has(r)) parents.set(r, new Set());
      parents.get(r).add(`@${name}`);
    }
  }
  const parentNames = (name, seen = new Set()) => {
    if (seen.has(name)) return new Set();
    seen.add(name);
    const out = new Set();
    for (const p of parents.get(name) ?? []) {
      if (p.startsWith('@')) for (const q of parentNames(p.slice(1), seen)) out.add(q);
      else out.add(p);
    }
    return out;
  };
  const out = [];
  for (const name of live) {
    // Resolved* types are engine output, not settings.
    if (name.startsWith('Resolved')) continue;
    const ctx = [name, ...parentNames(name)];
    for (const field of types.get(name).fields.keys()) {
      const inner = field.split('.').slice(0, -1);
      out.push({ owner: name, field, file: types.get(name).file, context: [...ctx, ...inner] });
    }
  }
  return out;
}

function corpus(files) {
  return files.map((f) => readFileSync(join(ROOT, f), 'utf8').split('\n'));
}

const locale = opt('--locale') ?? 'en';
const docsFiles = readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith(`-${locale}.mdx`)).map((f) => `docs/${f}`);
const skillDir = 'plugins/postext/skills/postext-port';
const skillFiles = [`${skillDir}/SKILL.md`, ...readdirSync(join(ROOT, skillDir, 'references')).map((f) => `${skillDir}/references/${f}`)];
const panelFiles = ['sidebar', 'panels', 'controls', 'frameStyles', 'labelStyles', 'templates']
  .map((d) => `packages/postext-sandbox/src/${d}`)
  .flatMap((d) => {
    try {
      return walk(d, (n) => /\.tsx?$/.test(n) && !n.includes('.test.'));
    } catch {
      return [];
    }
  });
const corpora = { docs: corpus(docsFiles), skill: corpus(skillFiles), panel: corpus(panelFiles) };

const since = opt('--since');
let fields = fieldList();
if (since) {
  const before = new Set(fieldList(since).map((f) => `${f.owner}.${f.field}`));
  fields = fields.filter((f) => !before.has(`${f.owner}.${f.field}`));
}

const reEscape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (w) => new RegExp(`(^|[^A-Za-z0-9_])${reEscape(w)}([^A-Za-z0-9_]|$)`);
// A field counts as mentioned in a unit that names it together with its owner
// type or one of the fields that lead to it. Units: a `## ` section of a doc
// or a skill reference (a page mentions many settings), a whole panel file.
const sections = (lines) => {
  const out = [[]];
  for (const line of lines) {
    if (/^## /.test(line)) out.push([]);
    out[out.length - 1].push(line);
  }
  return out.map((l) => l.join('\n'));
};
const units = {
  docs: corpora.docs.flatMap(sections),
  skill: corpora.skill.flatMap(sections),
  panel: corpora.panel.map((l) => l.join('\n')),
};
// In the docs the field must be set as code (`leaf`, `a.leaf`, <code>leaf</code>,
// or a JSON key "leaf"); the skill writes `key = value` lists, any mention
// counts; in the panel, a key, a quoted name or a member access.
const esc = reEscape;
const asCode = (w) =>
  new RegExp(
    `(\`|<code>|"|[A-Za-z0-9_\\]]\\.)${esc(w)}(\`|</code>|"|\\.|\\[|\\s*[:=(]|\\s*\\|)` +
      // a key in a code sample: `  leaf?: …`, `{ leaf: …`, `, leaf, …`
      `|(^\\s+|[{,]\\s*)${esc(w)}\\??\\s*[:,}]`,
    'm',
  );
const asKey = (w) => new RegExp(`(['"\`.]${esc(w)}['"\`]?|[{,\\s]${esc(w)}\\??\\s*:)`);
const hit = (texts, f, prose) => {
  const name = f.field.split('.').pop();
  const leaf = prose === 'skill' ? word(name) : prose ? asCode(name) : asKey(name);
  // A top-level key needs no context: its own name is the path.
  if (f.owner === 'PostextConfig') return texts.some((t) => leaf.test(t));
  const ctx = f.context.map(word);
  return texts.some((t) => leaf.test(t) && ctx.some((c) => c.test(t)));
};
// The panel files that name a type edit its fields: there a field must be
// written (`update({ field`, `'field'`, `field: …` that is not an option's
// `label: labels.…`, `next.field = …`, `delete next.field`). A type no panel file names falls back to `hit`.
// A section split into a folder (#1278) may name the type in one module and
// write its fields in another, so a naming file inside a module's folder
// (one with an `index`, or a façade `<folder>.ts(x)` beside it) brings in
// the folder's files and the façade.
const panelSources = corpora.panel.map((l) => l.join('\n'));
const panelSet = new Set(panelFiles);
const moduleGroup = (p) => {
  const d = dirname(p);
  const facades = [`${d}.ts`, `${d}.tsx`].filter((q) => panelSet.has(q));
  const isModule = facades.length > 0 || panelSet.has(`${d}/index.ts`) || panelSet.has(`${d}/index.tsx`);
  return isModule ? [...panelFiles.filter((q) => dirname(q) === d), ...facades] : [p];
};
const panelHit = (f) => {
  const name = f.field.split('.').pop();
  const group = new Set(panelFiles.filter((_, i) => word(f.owner).test(panelSources[i])).flatMap(moduleGroup));
  const owners = panelSources.filter((_, i) => group.has(panelFiles[i]));
  if (owners.length === 0 || f.field.includes('.')) return hit(units.panel, f, false);
  const written = new RegExp(
    `\\(\\{ ?${esc(name)}\\b|['"]${esc(name)}['"]|[{,]\\s*${esc(name)}\\??:(?! labels\\.)|\\b${esc(name)}: (?!labels\\.)` +
      `|\\.${esc(name)} = |delete [\\w.?]+\\.${esc(name)}\\b`,
  );
  return owners.some((t) => written.test(t));
};
// Panel misses checked by hand: where the field is edited instead, or why
// the panel leaves it out. Printed apart, so a clean run lists no gap.
const PANEL_NOTED = [
  [/^(ComicsConfig\.viewerLeaf|ComicViewerLeafConfig\.|PostextConfig\.composedViewerLeaf|ComposedViewerLeafConfig\.)/, 'host only: the HTML viewer sets it, never saved with a document'],
  [/^PostextConfig\.customFonts$/, 'Fonts panel (sidebar/FontsPanel.tsx)'],
  [/^CustomFontVariant\.format$/, 'Fonts panel: read from the uploaded file name'],
  [/^CustomOutputProfile\.fileId$/, 'Print section: written by the ICC profile upload'],
  [/^Design\w+Element\.(when|unless)$/, 'FenceConditionFields.tsx, shared by every element editor'],
  [/^ElementAnchor\.at$/, 'PlacementFields.tsx (SidePointFields)'],
  [/^PageConfig\.cutLines$/, 'Print section (PrintSection.tsx)'],
  [/^PageTemplateGrid\./, 'PageTemplatesSection: the grid is written whole'],
  [/^ComicsConfig\.(balloonStyles|panelStyles)$/, "comics sections, setComicsField(raw, '…')"],
  [/^PostextConfig\.numerals$/, 'Writing section (WritingSection.tsx)'],
];
const rows = fields.map((f) => ({
  key: `${f.owner}.${f.field}`,
  file: relative(ROOT, join(ROOT, f.file)),
  docs: hit(units.docs, f, true),
  skill: hit(units.skill, f, 'skill'),
  panel: panelHit(f),
}));
rows.sort((a, b) => a.key.localeCompare(b.key));

const json = opt('--json');
if (json) writeFileSync(json, JSON.stringify(rows, null, 1));
const noted = (r) => PANEL_NOTED.find(([re]) => re.test(r.key))?.[1];
for (const r of rows) if (!r.panel && noted(r)) r.panelNote = noted(r);
const gap = (r) => !r.docs || !r.skill || (!r.panel && !r.panelNote);
const show = args.includes('--all') ? rows : rows.filter(gap);
const mark = (b) => (b ? '·' : 'MISSING');
for (const r of show) console.log(`${r.key.padEnd(60)} docs:${mark(r.docs).padEnd(8)} skill:${mark(r.skill).padEnd(8)} panel:${r.panel ? '·' : r.panelNote ? 'noted' : 'MISSING'}`);
if (args.includes('--noted')) for (const r of rows.filter((x) => x.panelNote)) console.log(`noted  ${r.key.padEnd(54)} ${r.panelNote}`);
console.error(`${rows.length} fields${since ? ` new since ${since}` : ''}; ${rows.filter(gap).length} gaps, ${rows.filter((r) => r.panelNote).length} noted (--noted lists them)`);
if (args.includes('--check') && rows.some(gap)) process.exit(1);
