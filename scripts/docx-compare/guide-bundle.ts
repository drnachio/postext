// The built-in guide as a .postext book the CLI reads (#1399): the
// Sandbox's guide configuration, the edition cut into its chapters as the
// Sandbox cuts it, and the figures and tables it seeds, with each SVG
// figure drawn for the edition. Run by Bun (it imports the Sandbox's
// TypeScript sources):
//   bun scripts/docx-compare/guide-bundle.ts <locale> <out.postext>
// Strips, videos and the cover painting live in the Sandbox's blob store
// and are left out; the CLI warns about the resources it cannot find.

import { writeFileSync } from 'node:fs';
import { createBundle } from '../../packages/postext/dist/bundle/index.js';
import { createPostextGuideConfig } from '../../packages/postext-sandbox/src/context/guideConfig.ts';
import { sampleChapterTexts } from '../../packages/postext-sandbox/src/book/chapterOps.ts';
import * as editions from '../../packages/postext-sandbox/src/defaultMarkdown/index.ts';
import { buildDefaultResources, figureBlobId, guideLang, SVG_FIGURES } from '../../packages/postext-sandbox/src/defaultResources/index.ts';

const [locale = 'en', out = `guide-${locale}.postext`] = process.argv.slice(2);
const key = `DEFAULT_MARKDOWN_${locale.toUpperCase().replace(/-/g, '_')}`;
const markdown = (editions as Record<string, string>)[key];
if (!markdown) {
  console.error(`guide-bundle: no guide edition "${locale}" (${Object.keys(editions).join(', ')})`);
  process.exit(2);
}
const lang = guideLang(locale);
const files: Record<string, Uint8Array> = {};
for (const [fileId, fig] of Object.entries(SVG_FIGURES)) files[figureBlobId(fileId, lang)] = new TextEncoder().encode(fig.generate(lang));
// Without IndexedDB the blob writes fail quietly; the resource list is what
// is wanted here.
const resources = (await buildDefaultResources(locale)).filter((r) => {
  const id = r.kind === 'svg' ? r.svg?.fileId : r.kind === 'bitmap' ? r.bitmap?.fileId : undefined;
  return id === undefined || r.kind === 'table' || !!files[id];
});
const { bytes, warnings } = await createBundle({
  name: 'Postext guide',
  id: `postext-guide-${locale}`,
  locale,
  chapters: sampleChapterTexts(markdown).map((md) => ({ markdown: md })),
  config: createPostextGuideConfig(locale),
  resources,
  files,
});
for (const w of warnings) console.error(`guide-bundle: ${typeof w === 'string' ? w : (w as { message?: string }).message ?? JSON.stringify(w)}`);
writeFileSync(out, bytes);
console.log(`guide-bundle: ${out} (${resources.length} resources)`);
