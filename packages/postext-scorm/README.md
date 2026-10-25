# postext-scorm

SCORM package writer for [Postext](https://postext.dev/) books. It writes a laid-out book, or the chapters and sections picked from it, as a SCORM 1.2 or SCORM 2004 (4th edition) package: the zip a learning management system (Moodle, Canvas, Blackboard, SCORM Cloud and most others) imports as a course. It runs in the browser or in Node, with no server.

The content is [postext-epub](https://www.npmjs.com/package/postext-epub)'s, as HTML5 pages: the printed pages (`layout: 'fixed'`) or the text set again for the window (`layout: 'reflowable'`). Each SCO has a launch page with a small player, and the book's exercises send their score, completion and pass or fail to the LMS.

```bash
npm install postext postext-epub postext-scorm
```

`postext` and `postext-epub` are peer dependencies: upgrade the three together.

## Use

```ts
import { buildBundle, openBundle } from 'postext';
import { renderToScorm, scormOrganization, scormTree, treeLeaves } from 'postext-scorm';

const bundle = await openBundle(bytes);
const docs = buildBundle(bundle); // one VDTDocument per chapter, in book order

const tree = scormTree(bundle.chapters.map((c) => ({ markdown: c.markdown, title: c.title })));
const picked = new Set(tree.flatMap(treeLeaves).map((n) => n.id)); // everything

const zip = await renderToScorm(docs, {
  version: '2004',
  layout: 'reflowable',
  items: scormOrganization(tree, picked),
  metadata: { title: 'Lantern', language: 'en' },
});
```

- `renderToScorm(docs, options)` returns the zip as bytes. `options`: `version` (`'1.2'` | `'2004'`), `layout` (`'fixed'` | `'reflowable'`), `items` (the organization; default one SCO per chapter), `metadata`, `fonts`, `svgFonts`, `resourceBytes`, `cover` (as `renderToEpub` takes them), `passingScore` (a percentage, over the books' `exercises.digital.passingScore`), `onProgress`, `onWarning`, `signal`.
- `items` is a tree of `{ title, doc?, range?, children? }`. An item with `children` is a group; one without is a SCO: chapter `doc` whole, or its `range` (`{ start, end? }`, offsets in the chapter's Markdown as written).
- `scormTree(chapters, config?)` lists the chapters and their headings to the third level, each with its range. `scormOrganization(tree, picked)` makes `items` from a set of picked leaf ids: a node picked whole is a SCO, a node picked in part groups its picked children.

## What the LMS receives

- **Score**: each exercise's last check, graded slots right out of graded slots; a SCO's score is the sum over its exercises (SCORM 1.2: a percentage in `cmi.core.score.raw`; SCORM 2004: `cmi.score.scaled`, with the slots as `raw` and `max`).
- **Completion**: every page or document shown and every exercise checked.
- **Success**: passed or failed against the passing score, the manifest's (`adlcp:masteryscore`, or a primary objective's `minNormalizedMeasure`) or the one the LMS hands back.
- **Interactions**: one per check (SCORM 1.2) or one per exercise, updated (SCORM 2004), with the response, the right one, the result and a weighting.
- **Rollup**: SCORM 2004 weighs each SCO by its graded slots; with SCORM 1.2 the LMS's grading method decides.
- **Answers** and the checks and fresh starts used, in `cmi.suspend_data`, so the limits of an attempt (`exercises.digital.maxChecks`, `maxResets`, `showSolution`) hold across visits. Past SCORM 1.2's 4,096 characters, the answers stay in the browser and the counts still go to the LMS.

Opened without an LMS, the package reads the same and keeps the answers in the browser.

The package carries the IMS and ADL schemas its manifest names; the tests validate both versions' manifests against them with `xmllint`. Docs: [SCORM packages](https://postext.dev/en/docs/configuration-html-folio-epub#scorm-packages-postext-scorm).

## License

MIT. The schema files are the IMS Global and ADL definitions every SCORM package carries.
