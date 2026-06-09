export const meta = {
  name: 'issue-49-resources',
  description: 'Implement the full scope of GitHub issue #49 (Resources panel: images, SVGs, tables, typed numbering, inline refs) on branch feat/49-resources-panel',
  whenToUse: 'Run to close issue #49 end-to-end. Sequential, dependency-ordered phases on a single shared branch; each phase implements, verifies with real check-types/tests, repairs once if broken, then commits.',
  phases: [
    { title: 'Foundations', detail: 'types, blob store, resources store, sandbox context wiring' },
    { title: 'Parser', detail: '::resource block directive + :ref inline directive' },
    { title: 'Numbering', detail: 'resourceNumbering pipeline + shared template helper' },
    { title: 'TableModel', detail: 'pure table model functions in postext core' },
    { title: 'ConfigEditor', detail: 'ResourceTypesSection in ConfigPanel' },
    { title: 'ResourcesPanel', detail: 'replace placeholder panel + uploaders + InlineMarkdownInput' },
    { title: 'TableEditor', detail: 'table editor UX (rows/cols/merge/keyboard/paste)' },
    { title: 'Rendering', detail: 'canvas + PDF resource/caption/ref rendering + measurement/placement' },
    { title: 'Warnings', detail: 'new warning kinds for resources' },
    { title: 'Docs', detail: 'document-format + configuration mdx, en + es' },
    { title: 'Tests', detail: 'vitest coverage: parser, numbering, table model, exports' },
    { title: 'Integration', detail: 'repo-wide check-types + full test run + summary' },
  ],
}

// ----- shared context handed to every coding agent -----
const REPO = '/Users/ignacioferropicon/dev/postext'
const BRANCH = 'feat/49-resources-panel'
const PREAMBLE = `You are implementing one phase of GitHub issue #49 ("Resources panel: images, SVGs, HTML tables with captions, typed numbering & inline references") in the postext pnpm monorepo.

Working directory: ${REPO}
Branch: ${BRANCH} (a SHARED working tree; prior phases have already committed their code — read it, build on it, do not revert it).

The owner's authoritative execution plan lives in the issue comments. Fetch it if you need the full spec: \`gh issue view 49 --json comments\`.

Hard rules:
- Only create/modify the files in scope for THIS phase (listed below). Do not touch other phases' files.
- Match existing code style. Project conventions: TypeScript, functional-programming-first (pure functions return NEW objects, no mutation), browser-only runtime, no new heavy dependencies without strong justification.
- READ every file you intend to modify BEFORE editing it, plus the sibling files it imports, so your code integrates correctly.
- After implementing, run the type check for each affected package: \`pnpm --filter <pkg> check-types\` (packages: postext, postext-pdf, postext-sandbox). Fix every type error you introduced until those packages type-check clean.
- Then \`git add\` ONLY your phase's files and \`git commit\` with a conventional message (e.g. \`feat(resources): <scope>\`). Do NOT \`git push\`. Do NOT commit unrelated changes.
- Never run watch/dev (tsc --watch) — it blocks. Use check-types (tsc --noEmit).

Return the structured summary as your final output.`

const PHASE_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'filesChanged', 'commit', 'notes', 'followups'],
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    filesChanged: { type: 'array', items: { type: 'string' } },
    commit: { type: 'string', description: 'commit sha + subject, or "none" if nothing committed' },
    notes: { type: 'string', description: 'what was implemented and any deviations from the plan' },
    followups: { type: 'array', items: { type: 'string' } },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['passed', 'command', 'errorSummary'],
  properties: {
    passed: { type: 'boolean' },
    command: { type: 'string' },
    errorSummary: { type: 'string', description: 'empty if passed; else the key errors (truncated to ~2k chars)' },
  },
}

// Run one phase: implement -> verify -> (repair once -> re-verify) -> return record.
async function runPhase(title, scope, verifyCmd, verifyDesc) {
  phase(title)
  const impl = await agent(`${PREAMBLE}\n\n## Phase: ${title}\n\n${scope}`, {
    label: `impl:${title}`,
    phase: title,
    schema: PHASE_RESULT_SCHEMA,
  })

  let verify = await agent(
    `Verify the work for phase "${title}" of issue #49. From ${REPO}, run EXACTLY this command and wait for it to finish:\n\n\`\`\`\n${verifyCmd}\n\`\`\`\n\n${verifyDesc}\nReport passed=true only if the command exits 0 with no errors. If it fails, capture the most important error lines (truncate to ~2000 chars). Do not edit any files; do not commit.`,
    { label: `verify:${title}`, phase: title, schema: VERIFY_SCHEMA },
  )

  let repair = null
  if (verify && !verify.passed) {
    repair = await agent(
      `${PREAMBLE}\n\n## Repair phase: ${title}\n\nThe verification command failed:\n\n\`\`\`\n${verifyCmd}\n\`\`\`\n\nError output:\n\`\`\`\n${verify.errorSummary}\n\`\`\`\n\nFix the cause (it is almost certainly in this phase's files). Re-run the command until it passes, then commit the fix (\`fix(resources): ...\`). Stay within this phase's scope:\n\n${scope}`,
      { label: `repair:${title}`, phase: title, schema: PHASE_RESULT_SCHEMA },
    )
    verify = await agent(
      `Re-verify phase "${title}". From ${REPO} run EXACTLY:\n\n\`\`\`\n${verifyCmd}\n\`\`\`\n\n${verifyDesc}\nReport passed and any remaining errors. Do not edit files.`,
      { label: `reverify:${title}`, phase: title, schema: VERIFY_SCHEMA },
    )
  }

  const rec = { title, impl, verify, repair }
  log(`Phase ${title}: status=${impl?.status ?? '?'} verify=${verify?.passed ? 'PASS' : 'FAIL'}`)
  return rec
}

const records = []

// ---------------- Phase 1: Foundations ----------------
records.push(await runPhase('Foundations', `
Types & storage foundations (issue plan §1).

1. \`packages/postext/src/types.ts\`: the existing \`PostextResource\` is declared but unused in rendering — replace/rename it safely. Add interfaces: \`ResourceType\` { id, name, namePlural?, shortLabel, numberingTemplate, resetOn: 'never'|'h1'..'h6', counterFormat: 'decimal'|'roman-lower'|'roman-upper'|'alpha-lower'|'alpha-upper', captionPrefix }, \`ResourceKind\` = 'bitmap'|'svg'|'table', \`Resource\` { id, typeId, kind, caption?, altText?, createdAt, updatedAt, bitmap?{fileId,format,width,height}, svg?{fileId}, table?{model:TableModel} }, \`TableCell\` { content, colSpan?, rowSpan?, isHeader?, align?, verticalAlign? }, \`TableModel\` { rows: TableCell[][], headerRowCount? }. Extend the resolved config type (PostextConfig) with \`resourceTypes: ResourceType[]\`.
2. \`packages/postext/src/defaults/resourceTypes.ts\` (NEW): export a function returning built-in defaults 'figure' and 'table' (resetOn:'h1', numberingTemplate:'{h1}.{n}', counterFormat:'decimal', sensible shortLabel/captionPrefix).
3. \`packages/postext/src/parse/types.ts\`: add 'resourceBlock' to the ContentBlockType union; add optional \`resourceId?: string\` to ContentBlock; add optional \`ref?: { resourceId: string; style?: 'default'|'number'|'full'; text?: string }\` to InlineSpan.
4. \`packages/postext-sandbox/src/storage/blobStore.ts\` (NEW): generic IndexedDB store (DB 'postext-sandbox', object store 'blobs', keyPath 'fileId'). Export putBlob(bytes,contentType):Promise<string>, getBlob(fileId):Promise<BlobRecord|null>, deleteBlob(fileId):Promise<void>, listBlobs():Promise<BlobRecord[]>. Handle IndexedDB being unavailable (private browsing) gracefully.
5. \`packages/postext-sandbox/src/storage/resources.ts\` (NEW): object store 'resources' (keyPath 'id') in same DB. Export loadResources():Promise<Resource[]>, saveResource(r):Promise<void>, deleteResource(id, cascadeBlobs?):Promise<void>.
6. \`packages/postext-sandbox/src/context/SandboxContext.tsx\`: add \`resources: Resource[]\` to state (loaded async on init, NOT via localStorage), actions SET_RESOURCES/UPSERT_RESOURCE/DELETE_RESOURCE, persist via saveResource/deleteResource in an effect (mirror the existing config debounce pattern). Ensure config.resourceTypes defaults to the built-in defaults when unset.

Export the new public types from the postext package entry so downstream packages can import them.`,
  'pnpm --filter postext check-types && pnpm --filter postext-sandbox check-types',
  'Both core and sandbox packages must type-check.'))

// ---------------- Phase 2: Parser ----------------
records.push(await runPhase('Parser', `
Markdown extension (issue plan §2).

1. \`packages/postext/src/parse/blockParser.ts\`: add \`::resource{id="..."}\` block directive. Regex like \`/^::resource\\s*\\{id="([^"]+)"\\}\\s*$/\`. Match it in the main loop (after math fences, before headings). Emit a block { type:'resourceBlock', resourceId:id, empty text/spans }. Malformed forms must fall through to a normal paragraph.
2. \`packages/postext/src/parse/inlineFormatting.ts\`: add a pre-pass (same layer/technique as the existing inline-math injection — atomic \\uFFFC placeholder so sourceMap stays 1:1) that finds \`:ref{id="..." style="default|number|full"? text="..."?}\` and attaches resolved metadata onto the corresponding InlineSpan.ref. Pass order: refs -> math -> formatting.

Keep changes minimal and consistent with existing directive handling. No backward-compat shims needed (net-new syntax).`,
  'pnpm --filter postext check-types',
  'Core package must type-check.'))

// ---------------- Phase 3: Numbering ----------------
records.push(await runPhase('Numbering', `
Resource numbering pipeline (issue plan §3).

1. \`packages/postext/src/numbering.ts\`: extract the counter/template rendering (the parseTemplate / formatNumeral logic) into a shared exported helper \`renderCounterTemplate(...)\` so both heading and resource numbering use it. Do not change heading-numbering behavior.
2. \`packages/postext/src/pipeline/resourceNumbering.ts\` (NEW): export ResourceNumberEntry { number, typeId, heading }, ResourceNumberingMap = Record<resourceId, ResourceNumberEntry>, and computeResourceNumbering(blocks, resourceTypes, resources, headingContext). Algorithm: walk blocks in reading order tracking heading context; for each resourceId encountered via a resourceBlock OR an InlineSpan.ref, record first occurrence; partition by typeId; per type assign counters in first-reference order honoring resetOn against heading context; render via renderCounterTemplate + counterFormat.
3. \`packages/postext/src/pipeline/build.ts\`: after computeHeadingNumbers and before the main loop, call computeResourceNumbering and thread the resulting map forward (into MeasurementInput) so captions and inline refs can resolve their strings before measurement. Read build.ts carefully to wire it correctly without breaking the existing pipeline.`,
  'pnpm --filter postext check-types',
  'Core package must type-check.'))

// ---------------- Phase 4: Table model (core) ----------------
records.push(await runPhase('TableModel', `
Pure table model (issue plan §6, core part only — NOT the React editor yet).

\`packages/postext/src/table/model.ts\` (NEW): pure, unit-testable functions, all returning NEW TableModel objects (no mutation):
addRow(m,at), addColumn(m,at), removeRow(m,at), removeColumn(m,at), mergeCells(m,range), unmergeCell(m,at), setCellContent(m,at,content), setAlignment(m,at,align?,vAlign?), parseTSV(input) -> TableModel.
Merge must track a primary cell and mark spanned cells hidden (e.g. hiddenBy?: CellPos) so rendering is straightforward; unmerge restores them. Export the needed helper types (CellPos, CellRange, Align, VAlign). Keep it dependency-free.`,
  'pnpm --filter postext check-types',
  'Core package must type-check.'))

// ---------------- Phase 5: Config editor (sandbox) ----------------
records.push(await runPhase('ConfigEditor', `
Resource-type config editor (issue plan §4).

1. \`packages/postext-sandbox/src/sidebar/config/ResourceTypesSection.tsx\` (NEW): follow the existing \`ColorPaletteSection.tsx\` pattern exactly (CollapsibleSection wrapper, editingId/draft local state, id generator, dispatch UPDATE_CONFIG with patched resourceTypes). Per-row editable fields: id (read-only once set), name, namePlural, shortLabel, numberingTemplate, resetOn (select), counterFormat (select), captionPrefix; plus a small live preview rendering e.g. "fig. 1.7.". Delete guarded by the existing ConfirmPopover, warning if any existing resource uses the type.
2. \`packages/postext-sandbox/src/sidebar/ConfigPanel.tsx\`: register the new section alongside the others.
Read ColorPaletteSection.tsx, CollapsibleSection, ConfirmPopover, and ConfigPanel before writing so the integration matches.`,
  'pnpm --filter postext-sandbox check-types',
  'Sandbox package must type-check.'))

// ---------------- Phase 6: Resources panel + InlineMarkdownInput (sandbox) ----------------
records.push(await runPhase('ResourcesPanel', `
Resources panel UI (issue plan §5). This phase also creates the shared inline editor used later by the table editor.

1. \`packages/postext-sandbox/src/controls/InlineMarkdownInput.tsx\` (NEW): a lightweight input that runs its value through the existing parseInlineFormatting for a live preview (bold/italic/code/inline math/:ref). Reusable for captions and table cells.
2. \`packages/postext-sandbox/src/sidebar/ResourcesPanel.tsx\`: REPLACE the "Coming Soon" placeholder with a two-column manager. Left: resources grouped by ResourceType.name with bitmap thumbnails + glyphs for svg/table and a "New" menu (Upload image / Upload SVG / New table). Right (detail): id input (auto-suggested via slugify from filename/caption), type selector, caption editor (InlineMarkdownInput), alt text, kind-specific controls.
3. New components under \`packages/postext-sandbox/src/panels/resources/\`: ResourceList.tsx, ResourceDetail.tsx, BitmapUploader.tsx (drag/drop + file input; decode via createImageBitmap for width/height; store via putBlob), SvgUploader.tsx (validate via DOMParser; store via putBlob), ResourcePreview.tsx (mock embed with caption prefix applied).
4. Delete flow: before deleting, regex-count \`::resource{id="X"}\` and \`:ref{id="X"}\` in the current markdown; if >0, the confirm warns "X is referenced N times. Delete anyway?".
Wire everything through SandboxContext actions (UPSERT_RESOURCE / DELETE_RESOURCE) from Phase 1.`,
  'pnpm --filter postext-sandbox check-types',
  'Sandbox package must type-check.'))

// ---------------- Phase 7: Table editor (sandbox) ----------------
records.push(await runPhase('TableEditor', `
Table editor UX (issue plan §6, React part). Build on the pure model from Phase 4 and InlineMarkdownInput from Phase 6.

New dir \`packages/postext-sandbox/src/panels/resources/TableEditor/\`:
- TableEditor.tsx: top-level; wires keyboard nav (Tab/Shift-Tab next/prev cell with row wrap; arrow keys directional) and undo/redo via a snapshot stack of TableModel (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z). All mutations go through the Phase-4 pure functions.
- TableEditorCell.tsx: single cell editor using InlineMarkdownInput.
- TableEditorToolbar.tsx: add/remove row & column, merge/split, header-row/header-column toggles, per-cell alignment, paste-TSV action.
- Paste: on cell onPaste, detect TSV/CSV and offer "paste as table" -> parseTSV -> overwrite model.
Open the editor from ResourceDetail when a table resource is selected; persist model changes via UPSERT_RESOURCE.`,
  'pnpm --filter postext-sandbox check-types',
  'Sandbox package must type-check.'))

// ---------------- Phase 8: Rendering (core + pdf) ----------------
records.push(await runPhase('Rendering', `
Canvas + PDF rendering (issue plan §7). Resources must flow through measurement/placement so they paginate atomically (resource+caption kept together; no mid-split for v1).

Shared resolution:
- \`packages/postext/src/pipeline/buildMeasurement.ts\`: thread \`resources: Resource[]\` and \`resourceNumbering: ResourceNumberingMap\` into MeasurementInput.
- \`packages/postext/src/pipeline/buildBlockKind.ts\`: resolve a 'resourceBlock' into a VDT 'resource' block, attaching the resolved Resource and its number string.
- Measurement: bitmap/svg height = aspect-preserved scale to column width; table = equal column split for v1, per-cell measure via existing measureRichBlock, row height = max cell height (account for rowspan); caption measured via measureRichBlock with the caption font. Measure resource+caption as one group.
- Placement (\`packages/postext/src/pipeline/placement.ts\`): keepTogether — if the resource+caption group fits remaining column space, place it; else advance to next column/page.

Canvas backend:
- \`packages/postext/src/canvas-backend/blockRender.ts\`: branch to a new \`renderResourceBlock\` for resource blocks.
- \`packages/postext/src/canvas-backend/renderResourceBlock.ts\` (NEW): bitmap -> getBlob -> createImageBitmap -> drawImage (cache per fileId); svg -> rasterize via an <img> data URL to offscreen canvas (cache); table -> draw borders + header backgrounds then delegate to the existing rich-text line renderer per cell; caption below with the type's captionPrefix prepended; inline :ref segments rendered as styled (link-colored) text (canvas has no click surface — clickability is PDF-only for v1).

PDF backend:
- \`packages/postext-pdf/src/pdf-backend/blockRender.ts\`: branch for resource blocks.
- \`packages/postext-pdf/src/pdf-backend/renderResourceBlock.ts\` (NEW): bitmap -> embedPng/embedJpg (WebP decoded to PNG via canvas), cache PDFImage by fileId; svg -> attempt vector emission, but if infeasible in a reasonable timebox FALL BACK to raster and leave a \`TODO(#49-svg-vector)\` comment (AC then a known partial); table -> lines + delegated cell rendering; caption below.
- \`packages/postext-pdf/src/pdf-backend/links.ts\` (NEW): named-destination helpers keyed by resource.id; emit a link annotation for inline :ref pointing at the destination created at the ::resource embed.

Read each target file before editing to integrate cleanly.`,
  'pnpm --filter postext check-types && pnpm --filter postext-pdf check-types && pnpm --filter postext-sandbox check-types',
  'Core, pdf, and sandbox must all type-check.'))

// ---------------- Phase 9: Warnings (sandbox) ----------------
records.push(await runPhase('Warnings', `
Warnings (issue plan §8).

- \`packages/postext-sandbox/src/warnings/types.ts\`: add WarningKind values unknownResourceId, unusedResource, duplicateResourceId, danglingTypeRef, bitmapTooSmall (and storageUnavailable for IDB failures).
- \`packages/postext-sandbox/src/warnings/compute.ts\`: collectors — unknownResourceId (::resource or :ref id not in resources); unusedResource (defined but never referenced); duplicateResourceId (two resources share id); danglingTypeRef (typeId points at a deleted ResourceType); bitmapTooSmall (rendered width > bitmap.width * 1.5).
- \`packages/postext-sandbox/src/sidebar/WarningsPanel.tsx\`: render the new kinds with icon + detail; add label strings to SandboxLabels.
Read compute.ts and WarningsPanel.tsx first to match the existing warning shape.`,
  'pnpm --filter postext-sandbox check-types',
  'Sandbox package must type-check.'))

// ---------------- Phase 10: Docs ----------------
records.push(await runPhase('Docs', `
Documentation (issue plan §9). No type-check needed; just author the content accurately to match the syntax actually implemented in Phases 2-3.

- \`docs/document-format-en.mdx\`: new "Resources" section after "Display math" — ::resource block embed, :ref inline reference with style="number"|"full" and text="..." options, and an explanation of first-reference numbering (embed vs reference).
- \`docs/configuration-en.mdx\`: new "Resource types" section — ResourceType shape, {h1}/{n} template tokens, resetOn, counterFormat, captionPrefix; cross-link heading numbering.
- \`docs/document-format-es.mdx\` and \`docs/configuration-es.mdx\`: faithful Spanish mirrors with matching structure.
Read the existing mdx files to match their frontmatter/component conventions. Commit the docs.`,
  'ls docs/document-format-en.mdx docs/document-format-es.mdx docs/configuration-en.mdx docs/configuration-es.mdx',
  'All four doc files must exist (content was just authored).'))

// ---------------- Phase 11: Tests ----------------
records.push(await runPhase('Tests', `
Tests (issue plan §10) — vitest, core package only, in \`packages/postext/src/__tests__/\`:
- parse/resourceDirective.test.ts: ::resource{id="x"} -> resourceBlock with correct id; malformed falls through to paragraph.
- parse/inlineRef.test.ts: :ref variations (default, style=number, style=full, text="..."), mixed with bold/italic/math; placeholder char count matches span count.
- pipeline/resourceNumbering.test.ts: first-reference ordering (embed-before-ref, ref-before-embed, ref-only, interleaved types); resetOn:'h1'; template rendering with {h1}/{n}; counter formats decimal/roman/alpha.
- table/model.test.ts: add/remove row/col invariants; merge/unmerge with no orphaned hidden cells; TSV paste normalization; content round-trip.
- defaults/resourceTypes.test.ts: built-in defaults have valid templates and non-empty prefixes.
- Update __tests__/exports.test.ts to include the new public types (Resource, ResourceType, TableModel, TableCell, ResourceKind).
Run \`pnpm --filter postext test\` and make ALL tests pass (fix the tests AND, if you find a real bug, the source — but stay minimal). Commit.`,
  'pnpm --filter postext test',
  'The full core vitest suite must pass.'))

// ---------------- Phase 12: Integration ----------------
phase('Integration')
const integ = await agent(
  `${PREAMBLE}\n\n## Phase: Integration\n\nFinal end-to-end verification for issue #49. From ${REPO}:\n1. Run \`pnpm check-types\` (turbo, all packages) and \`pnpm --filter postext test\`.\n2. If anything fails, fix the minimal cause (it is likely a cross-phase integration gap) and re-run until green. Commit fixes as \`fix(resources): integration\`.\n3. Run \`git log --oneline develop..HEAD\` and \`git status\` to confirm a clean tree with all phase commits present.\nReport the final state.`,
  { label: 'integration', phase: 'Integration', schema: {
    type: 'object', additionalProperties: false,
    required: ['checkTypesPass', 'testsPass', 'commitCount', 'cleanTree', 'remainingIssues'],
    properties: {
      checkTypesPass: { type: 'boolean' },
      testsPass: { type: 'boolean' },
      commitCount: { type: 'number' },
      cleanTree: { type: 'boolean' },
      remainingIssues: { type: 'array', items: { type: 'string' } },
    },
  } },
)

// ---------------- Final report ----------------
return {
  branch: BRANCH,
  integration: integ,
  phases: records.map(r => ({
    phase: r.title,
    status: r.impl?.status ?? 'unknown',
    verified: r.verify?.passed ?? false,
    commit: r.impl?.commit ?? 'none',
    repaired: !!r.repair,
    followups: r.impl?.followups ?? [],
  })),
}
