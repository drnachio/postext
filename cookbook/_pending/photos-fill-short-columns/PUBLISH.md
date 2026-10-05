# Nº 116 · photos-fill-short-columns: publishing

A preview draft for the picture safe area (#442), waiting for postext 1.16.0 on npm (#453).
It passes `pnpm cookbook lint <slug> --engine local` and
`pnpm cookbook capture <slug> --engine local --preview-dir <dir>`.

Once 1.16.0 is released:

1. `git mv cookbook/_pending/photos-fill-short-columns cookbook/` (this file and the patch
   stay out of the recipe folder: delete them in the same commit).
2. `pnpm cookbook capture photos-fill-short-columns` (from npm), look at every page.
3. Check the numbers the write-ups quote against the new capture: page 2, the shellfish and
   net-mender photos grow a line each; page 3 (Spanish edition, the one the ca/zh/ar pages
   show), the octopus photo grows a line and the English closing page does not change.
4. Set `"status": "published"`.
5. `git apply cookbook/_pending/photos-fill-short-columns/docs-links.patch`: the docs' Safe
   area section links the recipe in en/es/ca/zh/ar.
6. `pnpm cookbook lint photos-fill-short-columns` and `pnpm exec vitest run src/lib/cookbook`
   (from apps/web).
