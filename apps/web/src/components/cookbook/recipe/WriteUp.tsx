import { MdxContent } from "@/components/docs/MdxContent";
import type { SectionId } from "@/lib/cookbook/types";
import { recipeMdxComponents } from "../mdx";
import { Excerpt } from "../mdx/Excerpt";
import { Credits } from "./Credits";
import { AnswersList, Ingredients } from "./Ingredients";
import type { RecipeSection, RecipeT, RecipeView } from "./model";
import { Pitfalls } from "./Pitfalls";
import type { RecipeActionsData } from "./RecipeActions";
import { WholeRecipe } from "./WholeRecipe";

/** `page={3}` → `page="3"`: the docs' MDX pipeline drops JavaScript
 *  expressions (next-mdx-remote's `blockJS`), attribute values included, and
 *  the page components read the number from a string just as well. */
function literalPages(source: string): string {
  return source.replace(/(<(?:PageRef|PageShot)\b[^>]*?\bpage=)\{\s*(\d+)\s*\}/g, '$1"$2"');
}

function SectionHeading({ section }: { section: RecipeSection }) {
  return (
    <h2 id={section.anchor} className="docs-heading group" style={{ scrollMarginTop: "5rem" }}>
      <a href={`#${section.anchor}`} className="docs-heading-anchor" aria-hidden="true" tabIndex={-1}>
        #
      </a>
      {section.title}
    </h2>
  );
}

/** The write-up in the template's fixed order (spec §4.4): the authored MDX
 *  sections, compiled with the docs' pipeline and the Cookbook components,
 *  interleaved with the generated ones, so no recipe can drift from the
 *  order. Server component. */
export async function WriteUp({ view, t, data }: { view: RecipeView; t: RecipeT; data: RecipeActionsData }) {
  const components = recipeMdxComponents(view, t);
  // The authored sections compile one after another, in page order, so an
  // abbreviation is expanded where it first appears on the page.
  const abbrSeen = new Set<string>();
  const compiled: Partial<Record<SectionId, React.ReactNode>> = {};
  for (const { id } of view.sections) {
    const source = view.writeup.sections[id];
    if (source) {
      compiled[id] = await MdxContent({
        source: literalPages(source),
        components,
        locale: view.writeup.locale,
        abbrSeen,
      });
    }
  }
  const authored = (id: SectionId) => compiled[id] ?? null;
  const body: Record<SectionId, () => React.ReactNode> = {
    build: () => (
      <>
        {authored("build")}
        <AnswersList view={view} t={t} />
      </>
    ),
    short: () => <Excerpt view={view} t={t} region="answer" caption />,
    ingredients: () => <Ingredients view={view} t={t} />,
    method: () => authored("method"),
    whole: () => <WholeRecipe view={view} t={t} data={data} />,
    variations: () => authored("variations"),
    pitfalls: () => (
      <>
        <Pitfalls view={view} t={t} />
        {authored("pitfalls")}
      </>
    ),
    credits: () => <Credits view={view} t={t} />,
  };
  return (
    <div className="docs-content cb-writeup">
      {view.sections.map((section) => (
        <section key={section.id} aria-labelledby={section.anchor} className={`cb-section cb-section-${section.id}`}>
          <SectionHeading section={section} />
          {body[section.id]()}
        </section>
      ))}
    </div>
  );
}
