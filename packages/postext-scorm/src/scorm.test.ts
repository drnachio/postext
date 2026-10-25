import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToScorm, scormOrganization, scormTree, treeLeaves, type ScoData, type ScormItem } from './index.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const config: PostextConfig = {
  page: { width: mm(148), height: mm(210), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false } },
  exercises: { digital: { passingScore: 60 } },
};

const CHAPTERS = [
  ['---', 'title: Plants', '---', '# Plants', '', 'Plants make their food.', '',
    '## Roots', '', 'Roots hold the plant.', '',
    ':::exercise', 'Complete.', '', '1. The roots take in [[water]].', '2. The leaves make [[food]].', ':::', '',
    '## Leaves', '', 'Leaves are green.', '',
    ':::exercise', 'True or false?', '', '- [x] Leaves are green.', ':::', '',
    '## Flowers', '', 'Flowers make seeds.', ''].join('\n'),
  ['# Animals', '', 'Animals eat plants or other animals.', '',
    ':::exercise', 'Choose.', '', '1. Which one flies?', '   - [ ] A dog', '   - [x] A bird', ':::', ''].join('\n'),
];

const docs: VDTDocument[] = CHAPTERS.map((markdown) => buildDocument({ markdown }, config));
const metadata = { title: 'Nature', language: 'en', identifier: 'urn:uuid:3b9b8a2c-7f5e-4d43-9a3e-6a1f1f0c2b11' };

const unpack = (zip: Uint8Array): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(unzipSync(zip))) out[name] = name.match(/\.(xml|html|xhtml|js|css|xsd)$/) ? strFromU8(bytes) : '';
  return out;
};
const scoData = (html: string): ScoData => JSON.parse(html.match(/<script type="application\/json" id="pt-scorm">([\s\S]*?)<\/script>/)![1]!) as ScoData;

const xmllint = (() => {
  try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

/** A schema importing every namespace a manifest of `version` uses, so the
 *  strict wildcards of the content packaging schema find their elements. */
const DRIVERS: Record<string, [string, string][]> = {
  '1.2': [
    ['http://www.imsproject.org/xsd/imscp_rootv1p1p2', 'imscp_rootv1p1p2.xsd'],
    ['http://www.adlnet.org/xsd/adlcp_rootv1p2', 'adlcp_rootv1p2.xsd'],
  ],
  '2004': [
    ['http://www.imsglobal.org/xsd/imscp_v1p1', 'imscp_v1p1.xsd'],
    ['http://www.adlnet.org/xsd/adlcp_v1p3', 'adlcp_v1p3.xsd'],
    ['http://www.adlnet.org/xsd/adlseq_v1p3', 'adlseq_v1p3.xsd'],
    ['http://www.adlnet.org/xsd/adlnav_v1p3', 'adlnav_v1p3.xsd'],
    ['http://www.imsglobal.org/xsd/imsss', 'imsss_v1p0.xsd'],
  ],
};

/** The manifest validated against the schemas the package carries. */
function validate(files: Record<string, string>, version: '1.2' | '2004'): void {
  const dir = mkdtempSync(join(tmpdir(), 'pt-scorm-'));
  try {
    for (const [name, body] of Object.entries(files)) {
      if (!name.endsWith('.xsd') && name !== 'imsmanifest.xml') continue;
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), body);
    }
    writeFileSync(join(dir, 'driver.xsd'), '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">' +
      DRIVERS[version]!.map(([ns, at]) => `<xs:import namespace="${ns}" schemaLocation="${at}"/>`).join('') + '</xs:schema>');
    execFileSync('xmllint', ['--noout', '--schema', join(dir, 'driver.xsd'), join(dir, 'imsmanifest.xml')], { stdio: 'pipe' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('the spine tree (#1266)', () => {
  const tree = scormTree(CHAPTERS.map((markdown, i) => ({ markdown, title: `chapter-${i + 1}.md` })));

  it('lists the chapters and their headings, the first taking the opening text', () => {
    expect(tree.map((n) => n.title)).toEqual(['Plants', 'Animals']);
    expect(tree[0]!.children.map((n) => n.title)).toEqual(['Roots', 'Leaves', 'Flowers']);
    const [roots, leaves, flowers] = tree[0]!.children;
    expect(roots!.range!.start).toBe(0);
    expect(CHAPTERS[0]!.slice(leaves!.range!.start, leaves!.range!.start + 9)).toBe('## Leaves');
    expect(roots!.range!.end).toBe(leaves!.range!.start);
    expect(flowers!.range!.end).toBeUndefined();
    expect(tree[1]!.children).toEqual([]);
  });

  it('makes a SCO of a node picked whole and groups a node picked in part', () => {
    const all = new Set(tree.flatMap(treeLeaves).map((l) => l.id));
    expect(scormOrganization(tree, all)).toEqual([
      { title: 'Plants', doc: 0 },
      { title: 'Animals', doc: 1 },
    ]);
    const some = new Set([tree[0]!.children[0]!.id, tree[0]!.children[1]!.id]);
    const org = scormOrganization(tree, some);
    expect(org).toHaveLength(1);
    expect(org[0]!.children!.map((c) => c.title)).toEqual(['Roots', 'Leaves']);
  });
});

describe('renderToScorm (#1265)', () => {
  for (const version of ['1.2', '2004'] as const) {
    for (const layout of ['fixed', 'reflowable'] as const) {
      it(`writes a SCORM ${version} package, ${layout}`, async () => {
        const files = unpack(await renderToScorm(docs, { version, layout, metadata }));
        const manifest = files['imsmanifest.xml']!;
        expect(manifest).toContain(version === '1.2' ? '<schemaversion>1.2</schemaversion>' : '<schemaversion>2004 4th Edition</schemaversion>');
        expect(manifest.match(/scorm[tT]ype="sco"/g)).toHaveLength(2);
        expect(files['sco-1.html']).toContain('player/player.js');
        expect(files['player/player.js']).toContain('API_1484_11');
        // The content documents' exercise script reports to the player.
        expect(files['content/scripts/exercises.js']).toContain('PostextScorm');
        const first = scoData(files['sco-1.html']!);
        expect(first.exercises.map((e) => e.points)).toEqual([2, 1]);
        expect(first.passing).toBe(0.6);
        for (const d of first.docs) expect(files[d.href]).toBeDefined();
        // Every exercise key names a data block's storage key.
        for (const e of first.exercises) {
          const scope = e.key.slice(0, e.key.lastIndexOf(':'));
          expect(Object.values(files).some((body) => body.includes(`data-storage-key="${first.storageKey}:${scope}"`))).toBe(true);
        }
        if (version === '1.2') expect(manifest).toContain('<adlcp:masteryscore>60</adlcp:masteryscore>');
        else expect(manifest).toMatch(/<imsss:rollupRules objectiveMeasureWeight="1"\/>[\s\S]*<imsss:rollupRules objectiveMeasureWeight="0.3333"\/>/);
        if (xmllint) validate(files, version);
      });
    }
  }

  it('cuts a chapter to the sections picked, the reflowable text at their headings', async () => {
    const tree = scormTree(CHAPTERS.map((markdown) => ({ markdown })));
    const picked = new Set([tree[0]!.children[1]!.id, tree[0]!.children[2]!.id]);
    const items: ScormItem[] = scormOrganization(tree, picked);
    const files = unpack(await renderToScorm(docs, { version: '2004', layout: 'reflowable', metadata, items }));
    const manifest = files['imsmanifest.xml']!;
    expect(manifest.match(/scormType="sco"/g)).toHaveLength(2);
    expect(manifest).toMatch(/<item identifier="item-1">\s*<title>Plants<\/title>\s*<item identifier="item-2" identifierref="res-1">\s*<title>Leaves<\/title>/);
    const leaves = scoData(files['sco-1.html']!);
    const body = leaves.docs.map((d) => files[d.href]!).join('');
    expect(body).toContain('Leaves are green.');
    expect(body).not.toContain('Roots hold the plant.');
    expect(body).not.toContain('Flowers make seeds.');
    expect(leaves.exercises.map((e) => e.points)).toEqual([1]);
    const flowers = scoData(files['sco-2.html']!);
    expect(flowers.exercises).toEqual([]);
    if (xmllint) validate(files, '2004');
  });

  it('keeps whole pages in the fixed layout, and counts an exercise in its own SCO only', async () => {
    const tree = scormTree(CHAPTERS.map((markdown) => ({ markdown })));
    const items = scormOrganization(tree, new Set([tree[0]!.children[0]!.id, tree[0]!.children[1]!.id]));
    const files = unpack(await renderToScorm(docs, { version: '1.2', layout: 'fixed', metadata, items }));
    const roots = scoData(files['sco-1.html']!);
    const leaves = scoData(files['sco-2.html']!);
    // The sections share their page: it shows in both.
    expect(roots.docs).toHaveLength(1);
    expect(leaves.docs).toHaveLength(1);
    expect(roots.exercises.map((e) => e.points)).toEqual([2]);
    expect(leaves.exercises.map((e) => e.points)).toEqual([1]);
    if (xmllint) validate(files, '1.2');
  });
});
