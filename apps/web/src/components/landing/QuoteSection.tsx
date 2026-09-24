import { getTranslations } from "next-intl/server";

/** The guide's pull quote: display italic in the part colour, hung from a
 *  large opening quotation mark. */
export async function QuoteSection() {
  const t = await getTranslations("Quote");
  return (
    <section className="mx-auto max-w-5xl px-6 pb-16 md:pb-20 2xl:max-w-6xl 2xl:px-8">
      <figure className="reveal relative pl-12 md:pl-20">
        <span
          aria-hidden="true"
          className="display absolute -top-6 left-0 text-[6rem] leading-none text-gold-deep md:-top-8 md:text-[8.5rem] dark:text-gold"
        >
          “
        </span>
        <blockquote
          className="font-display text-2xl leading-[1.2] font-medium tracking-[-0.015em] text-gold-deep italic md:text-[2.1rem] dark:text-gold"
          style={{ textWrap: "balance", fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
        >
          {t("text")}
        </blockquote>
        <figcaption className="kicker mt-6 text-slate">— {t("attribution")}</figcaption>
      </figure>
    </section>
  );
}
