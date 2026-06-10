import { getTranslations } from "next-intl/server";
import { CodeBlock } from "./CodeBlock";

const codeRaw = `import { buildDocument, renderToHtml } from "postext";

const doc = buildDocument(
  { markdown },
  {
    layout: { layoutType: "double" },
    bodyText: {
      textAlign: "justify",
      hyphenation: { enabled: true, locale: "en-us" },
    },
  }
);

const html = renderToHtml(doc);`;

export async function ApiPreviewSection() {
  const t = await getTranslations("ApiPreview");

  return (
    <section aria-labelledby="api-heading" className="mx-auto w-full max-w-5xl px-6 py-24 2xl:max-w-6xl 2xl:px-8 2xl:py-32 4xl:max-w-7xl 4xl:px-12 4xl:py-40">
      <p className="font-mono text-xs uppercase tracking-widest text-slate 2xl:text-sm 4xl:text-base">
        {t("eyebrow")}
      </p>
      <h2
        id="api-heading"
        className="mt-4 font-display text-3xl font-bold italic tracking-tight 2xl:text-4xl 4xl:text-5xl"
        style={{ textWrap: "balance" }}
      >
        {t("title")}
      </h2>
      <p className="mt-4 max-w-2xl leading-[1.8] text-slate 2xl:max-w-3xl 2xl:text-lg 4xl:max-w-4xl 4xl:text-xl">
        {t.rich("description", {
          code: (chunks) => <code className="font-mono text-foreground">{chunks}</code>,
        })}
      </p>

      <div className="mt-10 2xl:mt-12 4xl:mt-16">
        <CodeBlock code={codeRaw}>
          <span className="syntax-keyword">import</span>{" "}
          {"{ buildDocument, renderToHtml }"}{" "}
          <span className="syntax-keyword">from</span>{" "}
          <span className="syntax-string">{'"postext"'}</span>;{"\n"}
          {"\n"}
          <span className="syntax-keyword">const</span> doc = buildDocument({"\n"}
          {"  "}{"{"} markdown {"}"},{"\n"}
          {"  "}{"{"}{"\n"}
          {"    "}layout: {"{"} layoutType: <span className="syntax-string">{'"double"'}</span> {"}"},{"\n"}
          {"    "}bodyText: {"{"}{"\n"}
          {"      "}textAlign: <span className="syntax-string">{'"justify"'}</span>,{"\n"}
          {"      "}hyphenation: {"{"} enabled: <span className="syntax-value">true</span>, locale: <span className="syntax-string">{'"en-us"'}</span> {"}"},{"\n"}
          {"    "}{"}"},{"\n"}
          {"  "}{"}"}{"\n"}
          );{"\n"}
          {"\n"}
          <span className="syntax-keyword">const</span> html = renderToHtml(doc);
        </CodeBlock>
      </div>
    </section>
  );
}
