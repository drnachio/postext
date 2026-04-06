import { getTranslations } from "next-intl/server";

export async function FeaturesSection() {
  const t = await getTranslations("Features");

  const features = [
    { title: t("orphanTitle"), description: t("orphanDescription") },
    { title: t("columnTitle"), description: t("columnDescription") },
    { title: t("flowTitle"), description: t("flowDescription") },
    { title: t("footnotesTitle"), description: t("footnotesDescription") },
    { title: t("hyphenationTitle"), description: t("hyphenationDescription") },
    { title: t("outputTitle"), description: t("outputDescription") },
  ];

  const leftColumn = features.slice(0, 3);
  const rightColumn = features.slice(3, 6);

  return (
    <section aria-labelledby="features-heading" className="mx-auto w-full max-w-5xl px-6 py-24 2xl:max-w-6xl 2xl:px-8 2xl:py-32 4xl:max-w-7xl 4xl:px-12 4xl:py-40">
      <p className="font-mono text-xs uppercase tracking-widest text-slate 2xl:text-sm 4xl:text-base">
        {t("eyebrow")}
      </p>
      <h2
        id="features-heading"
        className="mt-4 font-display text-3xl font-bold italic tracking-tight 2xl:text-4xl 4xl:text-5xl"
        style={{ textWrap: "balance" }}
      >
        {t("title")}
      </h2>

      <div className="mt-16 grid grid-cols-1 gap-0 md:grid-cols-[1fr_1px_1fr] 2xl:mt-20 4xl:mt-24">
        <div className="space-y-12 md:pr-12 2xl:space-y-16 2xl:pr-16 4xl:space-y-20 4xl:pr-20">
          {leftColumn.map((feature) => (
            <div key={feature.title}>
              <h3 className="font-display text-lg font-semibold tracking-tight 2xl:text-xl 4xl:text-2xl">
                {feature.title}
              </h3>
              <p className="mt-2 leading-[1.8] text-slate 2xl:text-lg 4xl:text-xl">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <div className="column-rule my-0 hidden md:block" aria-hidden="true" />

        <div className="mt-12 space-y-12 md:mt-0 md:pl-12 2xl:space-y-16 2xl:pl-16 4xl:space-y-20 4xl:pl-20">
          {rightColumn.map((feature) => (
            <div key={feature.title}>
              <h3 className="font-display text-lg font-semibold tracking-tight 2xl:text-xl 4xl:text-2xl">
                {feature.title}
              </h3>
              <p className="mt-2 leading-[1.8] text-slate 2xl:text-lg 4xl:text-xl">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
