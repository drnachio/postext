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
    <section id="install" aria-labelledby="install-heading" className="on-night dark relative isolate overflow-hidden bg-night py-16 text-cream md:py-20">
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-20 -z-10 size-[36rem] rounded-full bg-red/15 blur-[150px]" />
      <div className="mx-auto max-w-6xl px-6 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <div className="relative grid grid-cols-1 gap-12 p-2 md:grid-cols-12 md:p-10">
          <CropMarks className="hidden md:block" />
          <div className="md:col-span-6">
            <Kicker className="text-gold">{t("eyebrow")}</Kicker>
            <span aria-hidden="true" className="mt-3 block h-[3px] w-12 bg-gold" />
            <h2 id="install-heading" className="display mt-5 text-[2.2rem] text-white md:text-[3.2rem]" style={{ textWrap: "balance" }}>
              {t("title")}
            </h2>
            <p className="mt-5 font-body text-base leading-relaxed md:text-lg text-cream/75 italic">{t("lead")}</p>
            <div className="mt-6 flex flex-col items-start gap-3">
              <InstallChip />
              <InstallChip command="pnpm add postext-pdf" />
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/docs"
                className="rounded-md bg-gold px-5 py-2.5 font-sans text-sm font-semibold text-night transition-colors hover:bg-[#e8b73a]"
              >
                {hero("getStarted")} →
              </Link>
              <a
                href="https://github.com/drnachio/postext"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-white/20 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:border-white/50 hover:bg-white/5"
              >
                {hero("viewOnGitHub")}
              </a>
            </div>
          </div>
          <div className="md:col-span-6 md:pt-4">
            <CodeBlock
              title="quick-start.ts"
              code={`import { buildDocument, renderToHtml } from "postext";\n\nconst doc = buildDocument({\n  markdown: "# Hello World\\n\\nYour content here.",\n});\n\nconst html = renderToHtml(doc);`}
            >
              <span className="syntax-comment">{t("commentQuickStart")}</span>
              {"\n"}
              <span className="syntax-keyword">import</span>{" "}
              {"{ buildDocument, renderToHtml }"}{" "}
              <span className="syntax-keyword">from</span>{" "}
              <span className="syntax-string">{'"postext"'}</span>;{"\n"}
              {"\n"}
              <span className="syntax-keyword">const</span> doc = buildDocument({"{"}{"\n"}
              {"  "}markdown: <span className="syntax-string">{'"# Hello World\\n\\nYour content here."'}</span>,{"\n"}
              {"}"});{"\n"}
              {"\n"}
              <span className="syntax-keyword">const</span> html = renderToHtml(doc);
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}
