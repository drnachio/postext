import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { docAnchor } from "@/lib/cookbook/docLinks";
import { LevelSquares } from "@/components/cookbook/RecipeCard";
import { formatDate, galleryHref, licenceName, type RecipeT, type RecipeView } from "./model";
import { RecipeToc } from "./RecipeToc";

/** The recipe's facts: config at a glance (the top-level config sections it
 *  sets, each linked to its docs), genre, outputs, level, the engine it was
 *  tested with, the last update and the licence. Server component. */
function RecipeFacts({ view, t }: { view: RecipeView; t: RecipeT }) {
  const { locale, recipe, registry, engine, detected } = view;
  const { meta } = recipe;
  const { taxonomy } = registry;
  const level = taxonomy.levels.find((l) => l.id === meta.level);
  const config = detected.configSections.map((key) => {
    const anchor = registry.config[key];
    return { key, href: anchor ? docAnchor(anchor, locale) : null };
  });
  return (
    <dl className="cb-facts">
      {config.length > 0 && (
        <div>
          <dt>{t("configAtAGlance")}</dt>
          <dd className="cb-config">
            {config.map(({ key, href }) =>
              href ? (
                <Link key={key} href={href}>
                  {key}
                </Link>
              ) : (
                <code key={key}>{key}</code>
              ),
            )}
          </dd>
        </div>
      )}
      <div>
        <dt>{t("genre")}</dt>
        <dd>
          {meta.genres.map((id, i) => (
            <span key={id}>
              {i > 0 && " · "}
              <Link href={galleryHref(locale, "genre", id)}>{taxonomy.genres.find((g) => g.id === id)?.title[locale] ?? id}</Link>
            </span>
          ))}
        </dd>
      </div>
      <div>
        <dt>{t("output")}</dt>
        <dd>
          {meta.outputs.map((id, i) => (
            <span key={id}>
              {i > 0 && " · "}
              <Link href={galleryHref(locale, "out", id)}>{taxonomy.outputs.find((o) => o.id === id)?.title[locale] ?? id}</Link>
            </span>
          ))}
        </dd>
      </div>
      <div>
        <dt>{t("level")}</dt>
        <dd className="flex items-center gap-2">
          <LevelSquares level={meta.level} label={t("levelAria", { level: meta.level, title: level?.title[locale] ?? "" })} />
          <Link href={galleryHref(locale, "level", meta.level)}>{level?.title[locale]}</Link>
        </dd>
      </div>
      <div>
        <dt className="sr-only">Postext</dt>
        <dd className="cb-facts-note">
          {engine ? t("tested", { version: engine.postext }) : t("untested")}
          <br />
          {t("needs", { version: meta.engine.postext })}
          {meta.engine.postextPdf && ` · postext-pdf ≥ ${meta.engine.postextPdf}`}
        </dd>
      </div>
      <div>
        <dt className="sr-only">{t("licence")}</dt>
        <dd className="cb-facts-note">
          {t("updated", { date: formatDate(meta.updated, locale) })}
          <br />
          {t("licenceValue", { code: meta.license.code, content: licenceName(meta.license.content, t) })}
        </dd>
      </div>
    </dl>
  );
}

/** Beside the write-up (lg+), sticky: On this page, then the facts. */
export function RecipeAside({ view, t }: { view: RecipeView; t: RecipeT }) {
  return (
    <aside className="cb-aside hidden lg:block" aria-label={t("aboutRecipe")}>
      <div className="cb-aside-inner">
        <p className="kicker cb-aside-title">{t("onThisPage")}</p>
        <RecipeToc sections={view.sections} label={t("onThisPage")} />
        <RecipeFacts view={view} t={t} />
      </div>
    </aside>
  );
}

/** Below lg the aside folds into a disclosure after the band. */
export function RecipeAsideMobile({ view, t }: { view: RecipeView; t: RecipeT }) {
  return (
    <details className="cb-aside-mobile lg:hidden">
      <summary>
        <span className="kicker">{t("onThisPage")}</span>
        <ChevronDown aria-hidden="true" className="size-4" />
      </summary>
      <div className="cb-aside-mobile-body">
        <RecipeToc sections={view.sections} label={t("onThisPage")} />
        <RecipeFacts view={view} t={t} />
      </div>
    </details>
  );
}
