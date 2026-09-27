import Link from "next/link";
import { docAnchor } from "@/lib/cookbook/docLinks";
import type { GotchaId, WarningKind } from "@/lib/cookbook/types";
import type { RecipeT, RecipeView } from "./model";

/** One shared pitfall from gotchas.json (also `<Gotcha id>` in the MDX). */
export function GotchaCard({ view, t, id }: { view: RecipeView; t: RecipeT; id: GotchaId }) {
  const { registry, locale } = view;
  const gotcha = registry.gotchas[id];
  if (!gotcha) return null;
  const feature = gotcha.feature ? registry.features[gotcha.feature] : undefined;
  const docs = feature ? docAnchor(feature.docs, locale) : null;
  return (
    <div className="cb-pitfall" id={`gotcha-${id}`}>
      <p className="kicker cb-pitfall-kicker">
        {t("pitfall")}
        {gotcha.fixedIn && <span className="cb-pitfall-fixed"> · {t("fixedIn", { version: gotcha.fixedIn })}</span>}
      </p>
      <p className="cb-pitfall-title">{gotcha.title[locale]}</p>
      <p className="cb-pitfall-body">
        {gotcha.body[locale]}
        {docs && feature && (
          <>
            {" "}
            <Link href={docs}>{feature.label[locale]} →</Link>
          </>
        )}
      </p>
    </div>
  );
}

const SOURCE_KEY = { engine: "warningEngine", parse: "warningParse", sandbox: "warningSandbox" } as const;

/** A warning the recipe explains, anchored at `#warning-<kind>` (search and
 *  the Sandbox link here). */
function WarningCard({ view, t, kind }: { view: RecipeView; t: RecipeT; kind: WarningKind }) {
  const { registry, locale } = view;
  const warning = registry.warnings[kind];
  if (!warning) return null;
  const docs = warning.docs ? docAnchor(warning.docs, locale) : null;
  return (
    <div className="cb-pitfall is-warning" id={`warning-${kind}`}>
      <p className="kicker cb-pitfall-kicker">
        {t(SOURCE_KEY[warning.source])} · <code>{kind}</code>
      </p>
      <p className="cb-pitfall-title">{warning.label[locale]}</p>
      <p className="cb-pitfall-body">
        <strong>{t("cause")}.</strong> {warning.cause[locale]}
      </p>
      <p className="cb-pitfall-body">
        <strong>{t("fix")}.</strong> {warning.fix[locale]}
        {docs && (
          <>
            {" "}
            <Link href={docs}>{t("readDocs")} →</Link>
          </>
        )}
      </p>
    </div>
  );
}

/** "Pitfalls" (generated): the recipe's gotchas, then the warnings it
 *  explains; the authored MDX lines follow. Server component. */
export function Pitfalls({ view, t }: { view: RecipeView; t: RecipeT }) {
  const { meta } = view.recipe;
  const gotchas = meta.gotchas ?? [];
  const warnings = meta.explainsWarnings ?? [];
  if (gotchas.length + warnings.length === 0) return null;
  return (
    <div className="cb-pitfalls">
      {gotchas.map((id) => (
        <GotchaCard key={id} view={view} t={t} id={id} />
      ))}
      {warnings.map((kind) => (
        <WarningCard key={kind} view={view} t={t} kind={kind} />
      ))}
    </div>
  );
}
