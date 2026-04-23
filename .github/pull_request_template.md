<!--
Thanks for contributing to postext.

Before opening a non-trivial PR, please make sure there is a linked issue discussing
the approach. postext is a small project and unaligned implementation work is the
single most common source of churn.

If this PR is a draft, open it as a GitHub Draft PR and mark the relevant checkboxes
below as `[ ]` until they are genuinely done.
-->

## Summary

<!--
One or two sentences. What does this PR change, and why? Write for a reader who has
not seen the linked issue.
-->

Closes #

## Area

<!-- Check every area this PR touches. -->

- [ ] Enriched markdown input / parser
- [ ] Layout engine — column flow / balancing / convergence (VDT)
- [ ] Layout engine — resource placement / text flow around obstacles
- [ ] Typography — orphan/widow, keep-together, rag, spacing rules
- [ ] Typography — hyphenation (language: ____)
- [ ] References — footnotes / endnotes / margin notes / pull quotes
- [ ] Renderer — HTML / CSS
- [ ] Renderer — PDF
- [ ] Renderer — canvas / rasterization
- [ ] Web Worker (`postext/worker`) — build, cancellation, font pipeline
- [ ] Configuration — schema, defaults, validation
- [ ] Playground / docs site (`apps/web`)
- [ ] Build, types, packaging, CI
- [ ] Internal refactor with no behavior change

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds capability)
- [ ] Breaking change (fix or feature that changes existing API, configuration shape, or rendered output)
- [ ] Documentation only
- [ ] Refactor / chore (no behavior change)

## Motivation and context

<!--
Why is this change needed? Link to the issue, discussion, or editorial reference
(Bringhurst rule, InDesign behavior, magazine spread, etc.) that motivates it.

For layout or typography changes, describe the rule in one or two sentences so a
reviewer unfamiliar with the issue can judge the intent.
-->

## Implementation notes

<!--
How does the change work? Anything a reviewer should know before reading the diff?

Call out specifically:
- Changes to the VDT shape or the iterative convergence loop.
- Changes that affect the main-thread vs. worker split or the font pipeline.
- Any place where you relied on existing behavior of `@chenglou/pretext` or worked
  around it.
- Non-obvious performance tradeoffs (allocations inside the layout loop, cache
  invalidation, work added per iteration).
-->

## Visual impact

<!--
Required for any change that can affect rendered output (HTML, PDF, canvas).

- Attach before/after screenshots or rendered PDFs.
- For multi-column or multi-page documents, show the full spread, not just a
  cropped region.
- If the change is responsive, include at least one narrow and one wide viewport.
- Mention the exact fixture / config used so a reviewer can reproduce locally.

If this PR has no visual impact, write "No visual impact" and delete the rest of
this section.
-->

## Tests

<!--
- What did you add or change under `packages/postext/**/*.test.ts` (or elsewhere)?
- For layout/typography bugs, a regression test that locks the corrected geometry
  is strongly preferred over a test that only checks the output type.
- If you could not add a test, explain why.
-->

- [ ] `pnpm lint` passes
- [ ] `pnpm check-types` passes
- [ ] `pnpm test` passes (run inside `packages/postext`)
- [ ] `pnpm build` passes at the repo root
- [ ] I tested the change manually in the playground (`apps/web`) where applicable

## Breaking changes

<!--
Fill this in only if you checked "Breaking change" above. Otherwise delete the
section.

- What breaks?
- Who is affected (library consumers, playground users, internal packages)?
- Migration path — what should a user do to adapt their code or configuration?
-->

## Checklist

- [ ] My commits follow the project's existing style (small, focused, imperative subject line).
- [ ] I updated the documentation under `apps/web/` and/or README where relevant.
- [ ] I did **not** bump the version in `packages/postext/package.json` — releases are handled separately.
- [ ] I did **not** include unrelated refactors, formatting changes, or dependency bumps in this PR.
- [ ] If this change introduces new configuration, it has sensible defaults and keeps the zero-config path working.
- [ ] If this change affects the worker surface (`postext/worker`), the main-thread and worker code paths stay behavior-compatible.
