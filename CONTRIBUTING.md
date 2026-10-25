# Contributing to Postext

Thanks for your interest in contributing to postext! Postext is a community-driven open-source project with an active and growing community of contributors. Contributions of any kind — code, documentation, design feedback, bug reports, ideas, or questions — are welcome from everyone, regardless of experience level. This document explains how to get involved.

For the broader community vision, areas of contribution, and the project's goals, see the [Contributing guide](https://postext.dev/en/docs/contributing) in the documentation.

## Community

All coordination happens on GitHub — issues, pull requests, and discussions. Everything is public, searchable, and open to participation.

- **[Issues](https://github.com/drnachio/postext/issues)** — bugs, feature requests, and tasks.
- **[Pull Requests](https://github.com/drnachio/postext/pulls)** — code contributions.
- **[Discussions](https://github.com/drnachio/postext/discussions)** — ideas, design conversations, and questions.

## Before You Start

**Open an issue first.** If you want to contribute code, please open an issue to discuss your approach before submitting a pull request. This helps avoid duplicate work and ensures alignment with the project direction.

Bug reports and feature requests are also welcome as issues.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) 12 (the version in `packageManager`; `corepack enable` installs it)
- [Rust](https://rustup.rs/) only to rebuild the WebAssembly line breaker in `rust/` (see `rust/README.md`); the built module is checked in

### Getting Started

```bash
git clone https://github.com/drnachio/postext.git
cd postext
pnpm install
```

### Useful Commands

```bash
# Start all packages in dev mode (library watch + Next.js dev server)
pnpm dev

# Build all packages
pnpm build

# Run tests (a package whose inputs did not change replays from Turbo's cache)
pnpm test

# Only the packages your uncommitted changes touch, and those that depend on them
pnpm test:changed

# The packages that differ from main (what the next release runs)
pnpm test:affected

# Leave out the long sweeps, whole books and end-to-end runs while you work
pnpm test:quick

# One package, or one file
pnpm --filter postext test
pnpm --filter postext exec vitest run src/__tests__/knuthPlass.test.ts

# Type-check all packages
pnpm check-types

# Lint all packages
pnpm lint
```

The repository is a pnpm + Turborepo monorepo with seven packages, the web app and a Rust workspace:

- `packages/postext` — the core layout engine (parse, measurement, Knuth-Plass line breaking, pipeline, HTML/canvas backends, bundles, Word import and export).
- `packages/postext-pdf` — the PDF rendering backend.
- `packages/postext-epub` — the EPUB 3 writer (fixed layout and reflowable).
- `packages/postext-folio` — the 3D book viewer (three.js).
- `packages/postext-citeproc` — CSL citations and bibliographies (citeproc-js).
- `packages/postext-cli` — the `postext` command line, compiled with Bun into self-contained executables.
- `packages/postext-sandbox` — the interactive sandbox UI (configuration controls and live viewports).
- `packages/typescript-config` — shared strict TypeScript configuration.
- `apps/web` — the Next.js documentation site, landing page, hosted sandbox and Cookbook.
- `rust/` — the Knuth-Plass line breaker in Rust, compiled to WebAssembly for `packages/postext`.
- `cookbook/` — the Cookbook recipes, checked and captured with `pnpm cookbook` (see `cookbook/README.md`).
- `plugins/postext/` — the `postext-port` agent skill.

Turborepo handles the dependency graph: the packages build first, then `apps/web` picks up the changes.

CI runs its jobs at once, each on a runner of its own: the long suites in shards (`vitest --shard`), the site's build, EPUBCheck, and types, lint and the command line. A job whose Turbo hash matches a run that already passed is skipped. A test file that takes much longer than the rest holds its whole shard up, so a long sweep is cut into `*.part<N>.test.ts` files that share it (see `stripRoundTrip.harness.ts`).

## Making Changes

1. Fork the repository and create a branch from `develop`.
2. Make your changes. Follow existing code style and TypeScript strict mode.
3. Add or update tests for any new or changed behavior.
4. Make sure all checks pass:
   ```bash
   pnpm build && pnpm test && pnpm check-types && pnpm lint
   ```
5. Submit a pull request targeting the `develop` branch.

### Code Style

- TypeScript strict mode is enforced across all packages.
- ESM-only — no CommonJS.
- Relative imports in the published packages carry the extension Node needs: `./layout.js` for `layout.ts`, `./parse/index.js` for a folder. Their `dist` then loads in plain Node and vitest leaves it untransformed; `check-types` reports a missing extension (TS2834).
- Run `pnpm lint` before submitting. The CI pipeline will reject PRs that fail linting.

### Documentation Convention

The documentation lives in the top-level `docs/` folder as one MDX file per topic and locale, `<topic>-<locale>.mdx`, in ten locales: `en`, `es`, `ca`, `fr`, `de`, `it`, `pt` (Brazilian Portuguese), `zh` (Simplified Chinese), `ja` and `ar` (e.g. `configuration-en.mdx`, `configuration-es.mdx`…). English is the reference, and every locale says the same thing: never change one without the others. Each file starts with an exported metadata object:

```ts
export const metadata = {
  title: '…',
  sidebarTitle: '…',
  description: '…',
  lang: 'en', // the file's locale
  lastUpdated: '2026-06-10',
  readingTime: '8 min',
  order: 3,
};
```

When you edit a doc, recalculate `readingTime` (roughly 200 words per minute) and write each locale natively, not as a word-for-word translation, keeping identifiers and code exactly as in English. The doc pages of the GitHub wiki are generated from the English files (`pnpm wiki` in `apps/web`).

### Sandbox i18n Convention

Every new user-facing string in the sandbox UI must be wired in **thirteen places**:

1. `packages/postext-sandbox/src/types/labels.ts` — the labels type.
2. `packages/postext-sandbox/src/types/defaultLabels.ts` — the English fallback values.
3. The web app's labels bridge (`apps/web/src/components/sandbox/SandboxPage/labels.ts`) — maps translated messages into the sandbox labels object.
4. `apps/web/messages/<locale>.json` for each of the ten locales (`en`, `es`, `ca`, `fr`, `de`, `it`, `pt`, `zh`, `ja`, `ar`) — the translations.

Dynamic strings use `__token__` placeholders (e.g. `"Page __current__ of __total__"`) rather than ICU message syntax.

### Commit Messages

Write clear, concise commit messages. Use the imperative mood in the subject line (e.g., "add column balancing algorithm", not "added column balancing algorithm").

## Pull Requests

- Keep PRs focused. One logical change per PR.
- Include a clear description of what the change does and why.
- Link to the related issue.
- All CI checks (build, test, type-check, lint) must pass before merging.

## Labels

Every issue carries labels from the catalogue in [`.github/labels.json`](.github/labels.json), in three dimensions:

- **`type: …`**: exactly one. `bug`, `feature` (a new capability, setting, syntax or output), `improvement` (better behaviour, defaults or UX of something that exists), `performance`, `docs`, `content` (Cookbook recipes, showcase books, videos), `chore` (CI, release, build, dependencies), `security`, `tracker` (an umbrella issue over a programme of sub-issues) or `research`.
- **`area: …`**: one or more, where the work lands. The packages (`engine`, `pdf`, `html`, `epub`, `scorm`, `folio`, `sandbox`, `cli`, `citeproc`, `bundle`) and the rest of the project (`website`, `cookbook`, `guide`, `showcase`, `skill`, `infra`).
- **`topic: …`**: any that apply. Writing systems (`chinese`, `japanese`, `arabic`), programmes (`comics`, `composed-pages`, `citations`, `print`, `video`) and subjects (`accessibility`, `i18n`, `fonts`, `typography`, `pagination`, `math`, `tables`, `figures`, `footnotes`, `index`, `design`).

The issue templates add `status: triage`, which comes off once the issue has its type, areas and topics. `help wanted`, `good first issue`, `question`, `duplicate`, `invalid` and `wontfix` keep their GitHub meaning. On pull requests, `major` and `minor` choose the release bump when the PR merges into `main` (`patch` is the default).

To add or change a label, edit `labels.json` and run `node .github/scripts/sync-labels.mjs` (`--dry-run` first; a `from` entry renames an old label so its issues keep it).

## Areas Where You Can Help

The project especially welcomes contributors with experience in:

- **Typographic layout algorithms** (Knuth-Plass, column balancing, optimal paragraph breaking)
- **PDF generation** (low-level PDF construction, font embedding)
- **Editorial design** (magazine/newspaper layout, book typesetting — you do not need to write code to contribute design knowledge)
- **Text rendering** (canvas, SVG, font metrics)
- **Documentation and translations** (the docs are in ten languages; more are welcome)
- **Testing** (cross-browser, cross-platform, and edge case testing)

## License

By contributing to postext, you agree that your contributions will be licensed under the [MIT License](LICENSE).
