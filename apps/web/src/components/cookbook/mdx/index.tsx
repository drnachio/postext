import type { RecipeT, RecipeView } from "../recipe/model";
import { Excerpt, type ExcerptProps } from "./Excerpt";
import { Feature } from "./Feature";
import { Gotcha } from "./Gotcha";
import { Note } from "./Note";
import { PageRef } from "./PageRef";
import { PageShot, type PageShotProps } from "./PageShot";
import { RecipeLink } from "./RecipeLink";

type Children = { children?: React.ReactNode };

/** The components a recipe write-up may use, bound to its page (merged over
 *  the docs' map by `MdxContent`). Every one needs a case in
 *  lib/markdown.ts, which renders the same write-up as Markdown. */
export function recipeMdxComponents(view: RecipeView, t: RecipeT) {
  return {
    Excerpt: (props: ExcerptProps) => <Excerpt view={view} t={t} {...props} />,
    PageRef: (props: { page: number | string } & Children) => <PageRef view={view} {...props} />,
    PageShot: (props: PageShotProps) => <PageShot view={view} t={t} {...props} />,
    Gotcha: ({ id }: { id: string }) => <Gotcha view={view} t={t} id={id} />,
    Feature: ({ id, children }: { id: string } & Children) => (
      <Feature view={view} id={id}>
        {children}
      </Feature>
    ),
    RecipeLink: ({ slug, children }: { slug: string } & Children) => (
      <RecipeLink view={view} slug={slug}>
        {children}
      </RecipeLink>
    ),
    Note,
  };
}
