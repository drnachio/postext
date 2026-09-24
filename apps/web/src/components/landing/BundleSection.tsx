import { getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { ChapterOpener } from "@/components/brand/ChapterOpener";
import { Kicker } from "@/components/brand/Kicker";
import { penDefineData } from "@/lib/codepen";
import { GUIDE_BUNDLE_FILE, GUIDE_BUNDLE_PATH, guideBundleStats } from "@/lib/guideBundle";
import { CodeBlock } from "./CodeBlock";

/** What the `.postext` carries, in the order the figure lists it, with the
 *  path each part lives at inside the archive. */
const PARTS = [
  ["config", "preset.json"],
  ["chapters", "chapters/<lang>/*.md"],
  ["fonts", "fonts/*.woff2"],
  ["resources", "preset.json › resources"],
  ["images", "resources/*.svg"],
] as const;

/** The `.postext` bundle as an open standard: one file that holds a whole
 *  document (configuration, chapters, typefaces, resources and images), and
 *  a runnable example that opens the Sandbox's guide and draws its pages.
 *  It returns to chapter 1's blue so it does not repeat chapter 3's vermilion. */
export async function BundleSection() {
  const t = await getTranslations("Bundle");
  const tl = await getTranslations("Landing");
  const locale = (await getLocale()).startsWith("es") ? "es" : "en";
  const stats = guideBundleStats();
  const families = new Intl.ListFormat(locale, { type: "conjunction" }).format(stats.families);

  const partText = {
    config: t("configText"),
    chapters: t("chaptersText", { chapters: stats.chapters, languages: stats.languages }),
    fonts: t("fontsText", { count: stats.fontFiles, families }),
    resources: t("resourcesText", { count: stats.resources }),
    images: t("imagesText", { count: stats.imageFiles }),
  };

  const code = `import { openBundle, loadBundleFonts, registerBundleImages,
  buildBundle, renderPageToCanvas } from "postext";

${t("commentFile")}
const file = await fetch("${GUIDE_BUNDLE_FILE}").then((r) => r.blob());
const book = await openBundle(file, { locale: "${locale}" });

await loadBundleFonts(book);      ${t("commentFonts")}
await registerBundleImages(book); ${t("commentImages")}

${t("commentPages")}
for (const doc of buildBundle(book))
  for (const page of doc.pages) {
    const canvas = document.createElement("canvas");
    renderPageToCanvas(page, doc, canvas, { scale: 0.5 });
    document.body.append(canvas);
  }`;

  return (
    <section aria-labelledby="bundle-heading">
      <ChapterOpener
        id="bundle-heading"
        color="blue"
        number="4"
        kicker={`${tl("chapter")} 4 · ${t("eyebrow")}`}
        title={t("title")}
        lead={t("lead")}
      />
      <div className="mx-auto max-w-6xl px-6 py-14 md:py-20 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <div className="book-prose two-col reveal text-base leading-[1.75] text-foreground/90">
          <p>{t("paragraph1")}</p>
          <p>
            {t.rich("paragraph2", {
              code: (chunks) => <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-accent-blue">{chunks}</code>,
            })}
          </p>
        </div>

        <figure className="reveal mt-14 md:mt-16">
          <div className="relative overflow-hidden rounded-sm bg-ink px-6 py-7 text-mist shadow-[0_30px_60px_-30px_rgba(14,16,20,0.6)] md:px-10 md:py-9 dark:ring-1 dark:ring-white/5">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-blue" />
            <Kicker as="div" className="text-[#8ea2ff]">
              {t("figureTitle", { file: GUIDE_BUNDLE_FILE })}
            </Kicker>
            <ol className="mt-6 divide-y divide-white/10">
              {PARTS.map(([key, filePath], i) => (
                <li key={key} className="grid grid-cols-1 gap-1 py-4 md:grid-cols-12 md:items-baseline md:gap-6">
                  <span className="font-sans text-xs font-bold tracking-[0.18em] text-[#8ea2ff] uppercase md:col-span-1">4.{i + 1}</span>
                  <code className="font-mono text-[0.8rem] text-white/90 md:col-span-4 2xl:text-sm">{filePath}</code>
                  <p className="font-sans text-sm leading-relaxed md:col-span-7">
                    <b className="font-bold text-white">{t(`${key}Title`)}.</b> {partText[key]}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <figcaption className="mt-6 max-w-2xl font-sans text-sm leading-relaxed text-slate">
            <b className="font-bold text-accent-blue">{tl("figure")} 4.1</b> {t("caption", { kb: stats.kb })}
          </figcaption>
        </figure>

        <div className="reveal mt-16 grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-12">
          <div className="md:col-span-4">
            <Kicker className="text-accent-blue">{t("demoEyebrow")}</Kicker>
            <h3 className="display mt-4 text-3xl md:text-4xl" style={{ textWrap: "balance" }}>
              {t("demoTitle")}
            </h3>
            <p className="mt-5 font-body leading-[1.75] text-foreground/75 2xl:text-lg">{t("demoDescription")}</p>
            <a
              href={GUIDE_BUNDLE_PATH}
              download
              className="mt-6 inline-flex items-center gap-3 rounded-md border border-rule-strong px-4 py-2.5 font-sans text-foreground transition-colors hover:border-foreground/50 hover:bg-foreground/5"
            >
              <Download className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{t("download")}</span>
                <span className="font-mono text-xs text-slate">
                  {GUIDE_BUNDLE_FILE} · {stats.kb} KB
                </span>
              </span>
            </a>
          </div>
          <div className="md:col-span-8">
            <CodeBlock code={code} title="open-guide.js" codepen={penDefineData("open-guide", { title: t("penTitle") })}>
              <span className="syntax-keyword">import</span> {"{ openBundle, loadBundleFonts, registerBundleImages,"}{"\n"}
              {"  buildBundle, renderPageToCanvas }"} <span className="syntax-keyword">from</span>{" "}
              <span className="syntax-string">{'"postext"'}</span>;{"\n"}
              {"\n"}
              <span className="syntax-comment">{t("commentFile")}</span>{"\n"}
              <span className="syntax-keyword">const</span> file = <span className="syntax-keyword">await</span> fetch(
              <span className="syntax-string">{`"${GUIDE_BUNDLE_FILE}"`}</span>).then((r) =&gt; r.blob());{"\n"}
              <span className="syntax-keyword">const</span> book = <span className="syntax-keyword">await</span> openBundle(file, {"{"} locale:{" "}
              <span className="syntax-string">{`"${locale}"`}</span> {"}"});{"\n"}
              {"\n"}
              <span className="syntax-keyword">await</span> loadBundleFonts(book);{"      "}
              <span className="syntax-comment">{t("commentFonts")}</span>{"\n"}
              <span className="syntax-keyword">await</span> registerBundleImages(book);{" "}
              <span className="syntax-comment">{t("commentImages")}</span>{"\n"}
              {"\n"}
              <span className="syntax-comment">{t("commentPages")}</span>{"\n"}
              <span className="syntax-keyword">for</span> (<span className="syntax-keyword">const</span> doc{" "}
              <span className="syntax-keyword">of</span> buildBundle(book)){"\n"}
              {"  "}<span className="syntax-keyword">for</span> (<span className="syntax-keyword">const</span> page{" "}
              <span className="syntax-keyword">of</span> doc.pages) {"{"}{"\n"}
              {"    "}<span className="syntax-keyword">const</span> canvas = document.createElement(
              <span className="syntax-string">{'"canvas"'}</span>);{"\n"}
              {"    "}renderPageToCanvas(page, doc, canvas, {"{"} scale: <span className="syntax-value">0.5</span> {"}"});{"\n"}
              {"    "}document.body.append(canvas);{"\n"}
              {"  "}{"}"}
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}
