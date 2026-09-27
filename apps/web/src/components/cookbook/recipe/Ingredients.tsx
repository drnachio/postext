import Link from "next/link";
import { docAnchor } from "@/lib/cookbook/docLinks";
import { readRecipeSources } from "@/lib/cookbook/sources";
import { licenceName, type RecipeT, type RecipeView } from "./model";

/** "This recipe answers": the questions in `answers`, at the end of What
 *  you'll build. */
export function AnswersList({ view, t }: { view: RecipeView; t: RecipeT }) {
  const { registry, recipe, locale } = view;
  const questions = recipe.meta.answers.map((id) => registry.questions[id]?.text[locale]).filter(Boolean);
  if (questions.length === 0) return null;
  return (
    <div className="cb-answers">
      <p className="kicker">{t("answersTitle")}</p>
      <ul>
        {questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
    </div>
  );
}

function Chip({ href, title, primary, children }: { href: string | null; title?: string; primary?: boolean; children: React.ReactNode }) {
  const className = primary ? "cb-chip is-primary" : "cb-chip";
  return href ? (
    <Link href={href} title={title} className={className}>
      {children}
    </Link>
  ) : (
    <span title={title} className={className}>
      {children}
    </span>
  );
}

/** "Ingredients" (generated): the features (each to its docs section; the
 *  primary ones first and marked), features the capture detected but the
 *  recipe does not declare, the type with its licences, the assets with
 *  their credits, and the engine APIs it calls. Server component. */
export function Ingredients({ view, t }: { view: RecipeView; t: RecipeT }) {
  const { registry, recipe, locale, detected } = view;
  const { meta } = recipe;
  const declared = [...meta.features.primary, ...meta.features.also];
  const also = detected.features.filter((id) => !declared.includes(id) && registry.features[id]);
  const feature = (id: string, primary = false) => {
    const f = registry.features[id];
    if (!f) return null;
    return (
      <Chip key={id} href={docAnchor(f.docs, locale)} title={primary ? `${t("primaryFeature")}: ${f.definition[locale]}` : f.definition[locale]} primary={primary}>
        {f.label[locale]}
      </Chip>
    );
  };
  const assets = readRecipeSources(recipe.slug).assets;
  const credited = new Map(meta.credits.images.filter((c) => c.file).map((c) => [c.file!, c]));
  const apis = detected.apis.filter((api) => registry.apis[api]);
  const fontsByLicence = [...Map.groupBy(meta.credits.fonts, (font) => font.license)].map(
    ([licence, fonts]) => [licence, fonts.map((font) => font.family)] as const,
  );

  return (
    <dl className="cb-ingredients">
      <div>
        <dt>{t("features")}</dt>
        <dd className="cb-chips">
          {meta.features.primary.map((id) => feature(id, true))}
          {meta.features.also.map((id) => feature(id))}
        </dd>
      </div>
      {also.length > 0 && (
        <div>
          <dt>{t("alsoUses")}</dt>
          <dd className="cb-chips">{also.map((id) => feature(id))}</dd>
        </div>
      )}
      <div>
        <dt>{t("type")}</dt>
        <dd>
          {fontsByLicence.map(([licence, families], i) => (
            <span key={licence}>
              {i > 0 && " · "}
              {t("fontLicence", { family: families.join(", "), licence: licenceName(licence, t) })}
            </span>
          ))}
        </dd>
      </div>
      <div>
        <dt>{t("assets")}</dt>
        <dd>
          {assets.length === 0 && meta.credits.images.length === 0 ? (
            t("noAssets")
          ) : (
            <ul className="cb-plain-list">
              {assets.map((file) => {
                const credit = credited.get(file);
                return (
                  <li key={file}>
                    <code>{file.replace(/^assets\//, "")}</code>
                    {credit && ` (${credit.who}, ${licenceName(credit.license, t)})`}
                  </li>
                );
              })}
              {meta.credits.images
                .filter((c) => !c.file || !assets.includes(c.file))
                .map((c) => (
                  <li key={c.what.en}>
                    {c.what[locale]} ({c.who}, {licenceName(c.license, t)})
                  </li>
                ))}
            </ul>
          )}
        </dd>
      </div>
      {apis.length > 0 && (
        <div>
          <dt>{t("api")}</dt>
          <dd className="cb-chips">
            {apis.map((api) => (
              <Chip key={api} href={docAnchor(registry.apis[api], locale)}>
                <code>{api}</code>
              </Chip>
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
}
