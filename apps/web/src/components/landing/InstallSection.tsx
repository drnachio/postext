import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Kicker } from "@/components/brand/Kicker";
import { CropMarks } from "@/components/brand/CropMarks";
import { CodeBlock } from "./CodeBlock";
import { InstallChip } from "./InstallChip";

/** The back cover: night again, the install line set large between crop
 *  marks, and the quick start. */
export async function InstallSection() {
  const t = await getTranslations("Install");
  const hero = await getTranslations("Hero");

  return (
    <section id="install" aria-labelledby="install-heading" className="relative isolate overflow-hidden bg-surface py-16 text-foreground md:py-20 dark:bg-night">
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-20 -z-10 size-[36rem] rounded-full bg-red/10 blur-[150px] dark:bg-red/15" />
      <div className="mx-auto max-w-6xl px-6 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <div className="relative grid grid-cols-1 gap-12 p-2 md:grid-cols-12 md:p-10">
          <CropMarks className="hidden md:block" />
          <div className="md:col-span-6">
            <Kicker className="text-brand">{t("eyebrow")}</Kicker>
            <span aria-hidden="true" className="mt-3 block h-[3px] w-12 bg-brand" />
            <h2 id="install-heading" className="display mt-5 text-[2.2rem] text-foreground md:text-[3.2rem] dark:text-white" style={{ textWrap: "balance" }}>
              {t("title")}
            </h2>
            <p className="mt-5 font-body text-base leading-relaxed md:text-lg text-foreground/70 italic">{t("lead")}</p>
            <div className="mt-6 flex flex-col items-start gap-3">
              <InstallChip />
              <InstallChip command="pnpm add postext-pdf" />
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/docs"
                className="rounded-md bg-brand px-5 py-2.5 font-sans text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
              >
                {hero("getStarted")} →
              </Link>
              <a
                href="https://github.com/drnachio/postext"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-rule-strong px-5 py-2.5 font-sans text-sm font-semibold text-foreground transition-colors hover:border-foreground/50 hover:bg-foreground/5"
              >
                {hero("viewOnGitHub")}
              </a>
            </div>
          </div>
          <div className="md:col-span-6 md:pt-4">
            <CodeBlock
              title="quick-start.ts"
              className="bg-elevated shadow-[0_24px_48px_-28px_rgba(14,16,20,0.35)]"
              code={`import { buildDocument, renderPage } from "postext";\nimport { renderToPdf } from "postext-pdf";\n\nconst doc = buildDocument({\n  markdown: "# Hello World\\n\\nYour content here.",\n});\n\ndocument.body.append(renderPage(doc.pages[0], doc));\n\nconst pdf = await renderToPdf(doc, { fontProvider });`}
            >
              <span className="syntax-comment">{t("commentQuickStart")}</span>
              {"\n"}
              <span className="syntax-keyword">import</span> {"{ buildDocument, renderPage }"}{" "}
              <span className="syntax-keyword">from</span> <span className="syntax-string">{'"postext"'}</span>;{"\n"}
              <span className="syntax-keyword">import</span> {"{ renderToPdf }"}{" "}
              <span className="syntax-keyword">from</span> <span className="syntax-string">{'"postext-pdf"'}</span>;{"\n"}
              {"\n"}
              <span className="syntax-keyword">const</span> doc = buildDocument({"{"}{"\n"}
              {"  "}markdown: <span className="syntax-string">{'"# Hello World\\n\\nYour content here."'}</span>,{"\n"}
              {"}"});{"\n"}
              {"\n"}
              <span className="syntax-comment">{t("commentCanvas")}</span>{"\n"}
              document.body.append(renderPage(doc.pages[<span className="syntax-value">0</span>], doc));{"\n"}
              {"\n"}
              <span className="syntax-comment">{t("commentPdf")}</span>{"\n"}
              <span className="syntax-keyword">const</span> pdf = <span className="syntax-keyword">await</span> renderToPdf(doc, {"{"} fontProvider {"}"});
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}
