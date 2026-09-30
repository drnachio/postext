import { localizedText, type Credit } from "@/lib/cookbook/types";
import { LICENSES, licenceName, type RecipeT, type RecipeView } from "./model";

function CreditLine({ credit, view, t }: { credit: Credit; view: RecipeView; t: RecipeT }) {
  const licence = LICENSES[credit.license];
  return (
    <li>
      {localizedText(credit.what, view.locale)} · {credit.source ? <a href={credit.source}>{credit.who}</a> : credit.who} ·{" "}
      {licence ? <a href={licence.url}>{licenceName(credit.license, t)}</a> : licenceName(credit.license, t)}
    </li>
  );
}

/** "Credits" (generated from `credits`): the recipe's authors, the text and
 *  image sources with their licences, the fonts, the code licence, and the
 *  links to edit the write-up or browse the folder. It mirrors the
 *  colophon printed in the sample document. Server component. */
export function Credits({ view, t }: { view: RecipeView; t: RecipeT }) {
  const { meta } = view.recipe;
  const { credits } = meta;
  const content = LICENSES[meta.license.content];
  return (
    <>
      <dl className="cb-credits">
        <div>
          <dt>{t("recipeBy")}</dt>
          <dd>
            {credits.authors.map((a, i) => (
              <span key={a.name}>
                {i > 0 && ", "}
                {a.url || a.github ? <a href={a.url ?? `https://github.com/${a.github}`}>{a.name}</a> : a.name}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>{t("text")}</dt>
          <dd>
            {credits.text.length > 0 ? (
              <ul className="cb-plain-list">
                {credits.text.map((c) => (
                  <CreditLine key={c.what.en} credit={c} view={view} t={t} />
                ))}
              </ul>
            ) : (
              <>
                {t("originalText")},{" "}
                {content ? <a href={content.url}>{content.name}</a> : meta.license.content}
              </>
            )}
          </dd>
        </div>
        {credits.images.length > 0 && (
          <div>
            <dt>{t("images")}</dt>
            <dd>
              <ul className="cb-plain-list">
                {credits.images.map((c) => (
                  <CreditLine key={`${c.what.en}-${c.file ?? ""}`} credit={c} view={view} t={t} />
                ))}
              </ul>
            </dd>
          </div>
        )}
        <div>
          <dt>{t("fonts")}</dt>
          <dd>
            {credits.fonts.map((font, i) => (
              <span key={font.family}>
                {i > 0 && " · "}
                {font.family} (<a href={LICENSES[font.license]?.url}>{licenceName(font.license, t)}</a>)
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>{t("code")}</dt>
          <dd>
            <a href={LICENSES.MIT?.url}>{t("codeLicence")}</a>
          </dd>
        </div>
      </dl>
      <p className="cb-credits-links">
        <a href={view.editUrl} target="_blank" rel="noopener noreferrer">
          {t("editWriteup")} ↗
        </a>
        <a href={view.githubUrl} target="_blank" rel="noopener noreferrer">
          {t("recipeFolder")} ↗
        </a>
      </p>
    </>
  );
}
