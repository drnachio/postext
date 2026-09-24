import { getTranslations } from "next-intl/server";
import { ChapterOpener } from "@/components/brand/ChapterOpener";
import { Kicker } from "@/components/brand/Kicker";
import { penDefineData } from "@/lib/codepen";
import { CodeBlock } from "./CodeBlock";

const codeRaw = `import { buildDocument, renderPage } from "postext";
import { renderToPdf } from "postext-pdf";

const doc = buildDocument(
  { markdown },
  {
    page: { sizePreset: "21x28" },
    layout: { layoutType: "double" },
    bodyText: {
      fontSize: { value: 12, unit: "pt" },
      textAlign: "justify",
      hyphenation: { enabled: true, locale: "en-us" },
    },
  }
);

// Every page as an image…
const cover = renderPage(doc.pages[0], doc);
cover.toBlob((png) => save(png, "cover.png"));

// …or the whole book as a print-ready PDF
const pdf = await renderToPdf(doc, { fontProvider });`;

export async function HowItWorksSection() {
  const t = await getTranslations("HowItWorks");
  const tl = await getTranslations("Landing");
  const api = await getTranslations("ApiPreview");

  const steps = [1, 2, 3].map((n) => ({
    number: `3.${n}`,
    title: t(`step${n}Title`),
    description: t(`step${n}Description`),
  }));

  return (
    <section aria-labelledby="how-heading">
      <ChapterOpener
        id="how-heading"
        color="vermilion"
        number="3"
        kicker={`${tl("chapter")} 3 · ${t("eyebrow")}`}
        title={t("title")}
        lead={t("lead")}
      />
      <div className="mx-auto max-w-6xl px-6 py-14 md:py-20 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <ol className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-10" aria-label={t("title")}>
          {steps.map((step, i) => (
            <li key={step.number} className="reveal relative">
              <div className="flex items-baseline gap-4 border-t-[3px] border-red pt-5">
                <span className="display text-5xl text-vermilion" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="kicker text-slate">{step.number}</span>
              </div>
              <h3 className="mt-4 font-head text-lg font-bold tracking-[-0.01em] md:text-xl">{step.title}</h3>
              <p className="mt-2 font-body leading-[1.7] text-foreground/75">{step.description}</p>
            </li>
          ))}
        </ol>

        <div className="reveal mt-16 grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-12">
          <div className="md:col-span-4">
            <Kicker className="text-vermilion">{api("eyebrow")}</Kicker>
            <h3 className="display mt-4 text-3xl md:text-4xl" style={{ textWrap: "balance" }}>
              {api("title")}
            </h3>
            <p className="mt-5 font-body leading-[1.75] text-foreground/75 2xl:text-lg">
              {api.rich("description", {
                code: (chunks) => <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-vermilion">{chunks}</code>,
              })}
            </p>
          </div>
          <div className="md:col-span-8">
            <CodeBlock
              code={codeRaw}
              title="book.ts"
              codepen={penDefineData("home-book", { title: `Postext · ${api("title")}` })}
            >
              <span className="syntax-keyword">import</span> {"{ buildDocument, renderPage }"}{" "}
              <span className="syntax-keyword">from</span> <span className="syntax-string">{'"postext"'}</span>;{"\n"}
              <span className="syntax-keyword">import</span> {"{ renderToPdf }"}{" "}
              <span className="syntax-keyword">from</span> <span className="syntax-string">{'"postext-pdf"'}</span>;{"\n"}
              {"\n"}
              <span className="syntax-keyword">const</span> doc = buildDocument({"\n"}
              {"  "}{"{"} markdown {"}"},{"\n"}
              {"  "}{"{"}{"\n"}
              {"    "}page: {"{"} sizePreset: <span className="syntax-string">{'"21x28"'}</span> {"}"},{"\n"}
              {"    "}layout: {"{"} layoutType: <span className="syntax-string">{'"double"'}</span> {"}"},{"\n"}
              {"    "}bodyText: {"{"}{"\n"}
              {"      "}fontSize: {"{"} value: <span className="syntax-value">12</span>, unit: <span className="syntax-string">{'"pt"'}</span> {"}"},{"\n"}
              {"      "}textAlign: <span className="syntax-string">{'"justify"'}</span>,{"\n"}
              {"      "}hyphenation: {"{"} enabled: <span className="syntax-value">true</span>, locale: <span className="syntax-string">{'"en-us"'}</span> {"}"},{"\n"}
              {"    "}{"}"},{"\n"}
              {"  "}{"}"}{"\n"}
              );{"\n"}
              {"\n"}
              <span className="syntax-comment">{api("commentImages")}</span>{"\n"}
              <span className="syntax-keyword">const</span> cover = renderPage(doc.pages[<span className="syntax-value">0</span>], doc);{"\n"}
              cover.toBlob((png) =&gt; save(png, <span className="syntax-string">{'"cover.png"'}</span>));{"\n"}
              {"\n"}
              <span className="syntax-comment">{api("commentPdf")}</span>{"\n"}
              <span className="syntax-comment">{api("commentFonts")}</span>{"\n"}
              <span className="syntax-keyword">const</span> pdf = <span className="syntax-keyword">await</span> renderToPdf(doc, {"{"} fontProvider {"}"});
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}
