import { getLocale, getTranslations } from "next-intl/server";
import { ChapterOpener } from "@/components/brand/ChapterOpener";
import { Kicker } from "@/components/brand/Kicker";
import { PageMock } from "./PageMock";

/** The markdown the miniature page is set from, per language. */
const SOURCE: Record<"en" | "es", string> = {
  en: `:::part{number="I" title="Foundations"
  palette="band=#2b4acb"}
:::

# Why Postext {lead="Print typography
spent five centuries…"}

Postext is an **open-source layout
engine** that brings the craft of
print typography to the web, as
:ref{id="fig-flow"} shows.

:::callout{type="try"}
Change a word: the page sets
itself again.
:::`,
  es: `:::part{number="I" title="Fundamentos"
  palette="band=#2b4acb"}
:::

# Por qué Postext {lead="La tipografía
impresa pasó cinco siglos…"}

Postext es un **motor de maquetación
de código abierto** que lleva a la web
el oficio de la tipografía impresa,
como muestra :ref{id="fig-flujo"}.

:::callout{type="try"}
Cambia una palabra: la página
vuelve a componerse.
:::`,
};

export async function AboutSection() {
  const t = await getTranslations("About");
  const tl = await getTranslations("Landing");
  const pm = await getTranslations("PageMock");
  const body = [1, 2, 3, 4, 5, 6].map((i) => pm(`body${i}`));
  const source = SOURCE[(await getLocale()).startsWith("es") ? "es" : "en"];

  return (
    <section aria-labelledby="about-heading" className="relative">
      <ChapterOpener
        id="about-heading"
        color="blue"
        number="1"
        kicker={`${tl("chapter")} 1 · ${t("eyebrow")}`}
        title={
          <>
            {t("titleLine1")} {t("titleLine2")}
          </>
        }
        lead={t("lead")}
      />

      <div className="mx-auto max-w-6xl px-6 py-14 md:py-20 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <div className="book-prose two-col reveal text-base leading-[1.75] text-foreground/90">
          <p>{t("paragraph1")}</p>
          <p>
            {t("paragraph2prefix")}
            <a
              href="https://github.com/chenglou/pretext"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand underline decoration-brand/30 underline-offset-4 hover:decoration-brand"
            >
              {t("pretextLink")}
            </a>
            {t("paragraph2suffix")}
          </p>
        </div>

        <figure className="reveal mt-14 md:mt-16">
          <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-12 md:gap-6">
            <div className="md:col-span-5">
              <Kicker className="mb-3 text-slate">{t("inputLabel")}</Kicker>
              <pre
                className="overflow-x-auto rounded-lg border border-rule bg-surface p-5 font-mono text-[0.78rem] leading-6 text-foreground/85 2xl:text-sm 2xl:leading-7"
                aria-label={t("inputAriaLabel")}
              >
                {source}
              </pre>
            </div>
            <div aria-hidden="true" className="hidden justify-center md:col-span-2 md:flex">
              <svg viewBox="0 0 80 24" className="w-20 text-brand">
                <path d="M2 12 H70 M60 3 L72 12 L60 21" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="md:col-span-5">
              <Kicker className="mb-3 text-slate">{t("outputLabel")}</Kicker>
              <div className="mx-auto max-w-sm md:max-w-none">
                <PageMock
                  label={t("outputAriaLabel")}
                  kicker={pm("kicker")}
                  title={pm("title")}
                  lead={pm("lead")}
                  body={body}
                  figureLabel={pm("figureLabel")}
                  figureCaption={pm("figureCaption")}
                  tryTitle={pm("tryTitle")}
                  tryText={pm("tryText")}
                />
              </div>
            </div>
          </div>
          <figcaption className="mt-8 max-w-2xl font-sans text-sm leading-relaxed text-slate">
            <b className="font-bold text-brand">{tl("figure")} 1.1</b> {t("caption")}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
