import { getLocale, getTranslations } from "next-intl/server";
import { Kicker } from "@/components/brand/Kicker";
import { siteLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/** "In short" on the landing: the page in plain words (WCAG 3.1.5), set
 *  as a standfirst of its own between the cover and the showreel. A paper
 *  band ruled off at both ends, the heading in display type on the left
 *  and the summary in large text with a drop cap on the right. */
export async function InShortSection() {
  const t = await getTranslations("PlainLanguage");
  const locale = siteLocale(await getLocale());
  const cjk = locale === "zh" || locale === "ja";

  return (
    <section aria-labelledby="in-short" className="border-b border-rule bg-surface">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-16 md:py-24 lg:grid-cols-12 lg:gap-12 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <div className="lg:col-span-4">
          <Kicker className="text-brand">Postext</Kicker>
          <span aria-hidden="true" className="mt-3 block h-[3px] w-12 bg-brand" />
          <h2
            id="in-short"
            className="display mt-5 text-[2.6rem] text-foreground sm:text-[3.2rem] lg:text-[3.6rem] 2xl:text-[4rem]"
            style={{ textWrap: "balance" }}
          >
            {t("heading")}
          </h2>
        </div>
        <p
          className={cn(
            "font-body text-[1.15rem] leading-[1.65] text-foreground md:text-[1.3rem] lg:col-span-8 lg:pt-1",
            !cjk && "in-short-lead",
          )}
        >
          {t("home")}
        </p>
      </div>
    </section>
  );
}
