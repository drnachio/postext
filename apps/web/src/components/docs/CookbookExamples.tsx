import Link from "next/link";
import type { DocExampleCard } from "@/lib/cookbook/docExamplesIndex";
import { GROUP_SIZE, type ExampleGroup } from "@/lib/cookbook/docExamples";
import "./cookbookExamples.css";

/** "Nº 188" */
function number(prefix: string, n: number): string {
  return `${prefix} ${String(n).padStart(3, "0")}`;
}

/** The recipe's captured card on the desk colour, 4:3, sized before it
 *  loads (no layout shift) and fetched only near the viewport. The link
 *  around it carries the title, so the picture is decorative (alt=""), as
 *  on the Cookbook's own plates. */
function Thumb({ src }: { src: string }) {
  return (
    <span className="docs-cb-thumb" aria-hidden="true">
      {src ? (
        // A plain <img>: the file is already 480 wide and cache-busted.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={480} height={360} loading="lazy" decoding="async" />
      ) : null}
    </span>
  );
}

/** A heading as the docs write it: `code` spans set as code, other
 *  Markdown marks dropped. */
export function HeadingText({ text }: { text: string }) {
  const parts = text.split(/`([^`]+)`/);
  return <>{parts.map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")))}</>;
}

function Card({ recipe, numberPrefix }: { recipe: DocExampleCard; numberPrefix: string }) {
  return (
    <li>
      <Link href={recipe.href} prefetch={false} className="docs-cb-card">
        <Thumb src={recipe.card480} />
        <span className="docs-cb-text">
          <span className="docs-cb-number">{number(numberPrefix, recipe.number)}</span>
          <span className="docs-cb-title">{recipe.title}</span>
        </span>
      </Link>
    </li>
  );
}

/** "In the Cookbook": up to three recipes at the end of a docs section. */
export function CookbookStrip({
  recipes,
  label,
  section,
  numberPrefix,
}: {
  recipes: DocExampleCard[];
  /** "In the Cookbook" */
  label: string;
  /** The landmark's name: "Cookbook recipes for Finishes". */
  section: string;
  numberPrefix: string;
}) {
  if (!recipes.length) return null;
  return (
    <aside className="docs-cb-strip not-prose" aria-label={section}>
      <p className="docs-cb-kicker">{label}</p>
      <ul className="docs-cb-cards">
        {recipes.map((recipe) => (
          <Card key={recipe.slug} recipe={recipe} numberPrefix={numberPrefix} />
        ))}
      </ul>
    </aside>
  );
}

/** "Examples in the Cookbook": every recipe the page links, once each,
 *  under the section where it fits best. */
export function CookbookExamples({
  id,
  groups,
  recipes,
  locale,
  labels,
}: {
  id: string;
  groups: ExampleGroup[];
  recipes: Record<string, DocExampleCard>;
  locale: string;
  labels: {
    heading: string;
    headingLink: string;
    lead: string;
    numberPrefix: string;
    /** "{count} more use {feature}: all of them" */
    more: (count: number, feature: string) => string;
  };
}) {
  if (!groups.length) return null;
  return (
    <section aria-labelledby={id} className="docs-content docs-cb-examples">
      <h2 id={id} className="docs-heading group" style={{ scrollMarginTop: "var(--docs-nav-h, 5rem)" }}>
        <a href={`#${id}`} className="docs-heading-anchor" aria-label={labels.headingLink}>
          #
        </a>
        {labels.heading}
      </h2>
      <p className="docs-cb-lead">{labels.lead}</p>
      {groups.map((group) => (
        <div key={group.id} className="docs-cb-group">
          <h3 className="docs-cb-group-title">
            <a href={`#${group.id}`}>
              <HeadingText text={group.text} />
            </a>
          </h3>
          <ul className="docs-cb-list">
            {group.recipes.slice(0, GROUP_SIZE).map((slug) =>
              recipes[slug] ? <Card key={slug} recipe={recipes[slug]} numberPrefix={labels.numberPrefix} /> : null,
            )}
          </ul>
          {group.more > 0 && group.feature && (
            <p className="docs-cb-more">
              <Link
                href={`/${locale}/cookbook?feat=${encodeURIComponent(group.feature.id)}`}
                prefetch={false}
                className="docs-cb-more-link"
              >
                {labels.more(group.more, group.feature.label)}
              </Link>
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
