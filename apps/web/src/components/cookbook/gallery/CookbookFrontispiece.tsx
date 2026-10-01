import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Kicker } from "@/components/brand/Kicker";
import { PlaceholderStage, plateNumber } from "@/components/cookbook/RecipeCard";
import type { Locale } from "@/lib/cookbook/types";
import type { GalleryData } from "./data";
import { FrontispieceSearch } from "./FrontispieceSearch";

/** The gallery's cover: a night band in both themes with the kicker, the
 *  title (a gilt italic word), the lead, the featured recipe's capture, the
 *  search field and the count line. Filtered, only the kicker and the title
 *  stay, as a slim header (cookbook.css). */
export async function CookbookFrontispiece({ data, locale }: { data: GalleryData; locale: Locale }) {
  const t = await getTranslations("Cookbook");
  const { catalog, featured, chapters } = data;
  const count = catalog.recipes.length;
  const featuredChapter = featured ? chapters.find((c) => c.id === featured.chapter) : undefined;

  return (
    <header className="cb-front on-night dark relative isolate overflow-hidden bg-night text-cream">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 -right-40 -z-10 size-[40rem] rounded-full bg-blue/25 blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-64 -left-48 -z-10 size-[32rem] rounded-full bg-gold/10 blur-[140px]"
      />

      <div className="cb-front-inner mx-auto grid max-w-6xl grid-cols-1 gap-x-10 px-4 pt-10 pb-10 sm:px-6 md:pt-12 lg:grid-cols-12 lg:pb-12 2xl:max-w-7xl 2xl:px-8">
        <div className="lg:col-span-6 lg:row-start-1 lg:self-end">
          <Kicker className="text-gold">{t("kicker")}</Kicker>
          <h1
            className="display hero-title cb-front-title mt-4 text-[2.35rem] text-white sm:text-[2.9rem] lg:text-[3.1rem] xl:text-[3.3rem]"
            style={{ textWrap: "balance" }}
          >
            {t.rich("title", { em: (chunks) => <em className="hero-em">{chunks}</em> })}
          </h1>
          <div className="cb-book">
            <span aria-hidden="true" className="mt-6 block h-[3px] w-14 bg-gold" />
            <p className="mt-5 max-w-xl font-body text-base leading-relaxed text-cream italic lg:text-[1.05rem]">
              {t("lead")}
            </p>
          </div>
        </div>

        {featured && (
          <figure
            className={`cb-book mt-8 lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-center part-${featuredChapter?.color ?? "blue"}`}
          >
            <Link
              href={featured.href}
              prefetch={false}
              tabIndex={-1}
              aria-hidden="true"
              className="relative mx-auto block aspect-[4/3] max-w-[26rem] lg:max-w-[30rem]"
            >
              {featured.card.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={featured.card.src}
                  srcSet={`${featured.card.src480} 480w, ${featured.card.src} 960w`}
                  sizes="(min-width: 1024px) 44vw, 92vw"
                  width={960}
                  height={720}
                  alt=""
                  fetchPriority="high"
                  decoding="async"
                  className="cb-stage-img"
                />
              ) : (
                <PlaceholderStage />
              )}
            </Link>
            <figcaption className="mt-2 text-center">
              <span className="sr-only">{t("frontispiece")}: </span>
              <Link
                href={featured.href}
                prefetch={false}
                className="group inline-flex min-h-10 flex-wrap content-center items-baseline justify-center gap-x-2 rounded-sm font-sans text-[0.68rem] font-semibold tracking-[0.16em] text-mist uppercase transition-colors hover:text-gold"
              >
                <span className="whitespace-nowrap text-gold">{plateNumber(t("number"), featured.number)}</span>
                <span aria-hidden="true" className="max-sm:hidden">·</span>
                <span className="font-display text-[0.95rem] font-semibold tracking-normal text-cream normal-case group-hover:text-gold">
                  {featured.title}{" "}
                  <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </Link>
            </figcaption>
          </figure>
        )}

        {count > 0 && (
          <div className="cb-book mt-8 lg:col-span-6 lg:row-start-2 lg:mt-7 lg:self-start">
            <FrontispieceSearch
              locale={locale}
              label={t("searchLabel")}
              placeholder={t("searchPlaceholder", { count })}
              unavailable={t("unavailable")}
            />
            <p className="mt-3.5 font-sans text-[0.78rem] text-mist">
              {t("stats", { recipes: count, chapters: chapters.length })}
              {catalog.testedWith && (
                <>
                  <span aria-hidden="true" className="mx-1.5 opacity-60">·</span>
                  {t("testedWith", { version: catalog.testedWith })}
                </>
              )}
            </p>
          </div>
        )}
      </div>
      <div aria-hidden="true" className="tri-stripe h-1.5 w-full" />
    </header>
  );
}
