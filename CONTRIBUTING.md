# Contributing to Postext

Thanks for your interest in contributing to postext! Contributions of any kind — code, documentation, design feedback, bug reports, ideas, or questions — are welcome from everyone, regardless of experience level. This document explains how to get involved.

## Before You Start

**Open an issue first.** If you want to contribute code, please open an issue to discuss your approach before submitting a pull request. This helps avoid duplicate work and ensures alignment with the project direction.

Bug reports and feature requests are also welcome as issues.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10

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

# Run tests
pnpm test

# Type-check all packages
pnpm check-types

# Lint all packages
pnpm lint
```

Turborepo handles the dependency graph: `packages/postext` builds first, then `apps/web` picks up the changes.

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
- Run `pnpm lint` before submitting. The CI pipeline will reject PRs that fail linting.

### Commit Messages

Write clear, concise commit messages. Use the imperative mood in the subject line (e.g., "add column balancing algorithm", not "added column balancing algorithm").

## Pull Requests

- Keep PRs focused. One logical change per PR.
- Include a clear description of what the change does and why.
- Link to the related issue.
- All CI checks (build, test, type-check, lint) must pass before merging.

## Areas We Need Help With

We are especially looking for contributors with experience in:

- **Typographic layout algorithms** (Knuth-Plass, column balancing, optimal paragraph breaking)
- **PDF generation** (low-level PDF construction, font embedding)
- **Editorial design** (magazine/newspaper layout, book typesetting)
- **Text rendering** (canvas, SVG, font metrics)

## License

By contributing to postext, you agree that your contributions will be licensed under the [MIT License](LICENSE).
