import { getTranslations } from "next-intl/server";
import type { GalleryData } from "./data";
import { DocsSearchButton } from "./DocsSearchButton";
import { ASK_RECIPE_URL, WRITE_RECIPE_URL } from "./links";
import { NewTabNote } from "@/components/ui/NewTabNote";

const LINK =
  "inline-flex min-h-11 items-center rounded-sm font-medium text-foreground underline decoration-(--brand)/40 decoration-[1.5px] underline-offset-4 transition-colors hover:decoration-(--brand) sm:min-h-10";

/** The book's last page: how the plates were set, the typefaces, and where
 *  to go when the recipe you need is not here. */
export async function CookbookColophon({ data }: { data: GalleryData }) {
  const t = await getTranslations("Cookbook");
  const version = data.catalog.testedWith;
  return (
    <section aria-labelledby="cb-colophon" className="mx-auto max-w-2xl px-4 pt-20 pb-16 text-center sm:px-6">
      <span aria-hidden="true" className="tri-stripe mx-auto block h-[3px] w-12" />
      <h2 id="cb-colophon" className="kicker mt-6 text-slate">
        {t("colophonKicker")}
      </h2>
      <p className="mt-3 font-body text-[0.95rem] leading-relaxed text-foreground/80 italic">
        {version && data.chrome ? t("colophon", { version, chrome: data.chrome }) : t("colophonPlain")}
      </p>
      {/* Two groups that wrap as wholes, so no separator dot is left at a line end. */}
      <p className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-sans text-sm leading-normal">
        <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <span className="text-slate">{t("cantFind")}</span>
          <DocsSearchButton label={t("searchDocs")} shortcut="⌘K" className={LINK} />
        </span>
        <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <a href={ASK_RECIPE_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
            {t("askRecipeGithub")}
            <NewTabNote />
          </a>
          <span aria-hidden="true" className="text-slate">·</span>
          <a href={WRITE_RECIPE_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
            {t("writeOne")} →
            <NewTabNote />
          </a>
        </span>
      </p>
    </section>
  );
}
