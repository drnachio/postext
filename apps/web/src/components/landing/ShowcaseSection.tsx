import { getLocale, getTranslations } from "next-intl/server";
import fs from "fs";
import path from "path";
import Image from "next/image";
import { Kicker } from "@/components/brand/Kicker";
import presetIndex from "../../../public/presets/index.json";
import { GuideCover } from "./GuideCover";
import { shelfOrder } from "@/lib/shelf";

interface PresetEntry {
  id: string;
  dir: string;
  name: string;
  description: string;
  thumbnail?: string;
  tags?: string[];
  /** The content locales the bundle ships editions in. */
  locales?: string[];
  /** The content locale the book opens in from the shelf (a Chinese
   *  original rather than the translation in the site's language). */
  openLocale?: string;
  /** The binding edge of the book the shelf opens: a right-bound book
   *  (Chinese or Japanese set vertically, Arabic) shows its spine on the
   *  right. */
  binding?: "left" | "right";
  /** Where the book stands on the shelf: the books without one keep the
   *  index order (by id) and come first, the others follow by this number
   *  (ألف ليلة وليلة, 紅樓夢 and こころ, the right-bound books, stand last). */
  shelfOrder?: number;
}

/** The bundle's content hash (`fingerprint.json`, rewritten by every build),
 *  as a cache-busting version for its thumbnail URL: a re-captured cover
 *  gets a new URL instead of a stale cached copy. */
function bundleVersion(dir: string): string {
  try {
    const file = path.join(process.cwd(), "public/presets", dir, "fingerprint.json");
    const { fingerprint } = JSON.parse(fs.readFileSync(file, "utf-8")) as { fingerprint?: string };
    return fingerprint ? fingerprint.slice(0, 12) : "";
  } catch {
    return "";
  }
}

/** The cover for the page locale: `thumbnail-<lang>.jpg` next to the
 *  default thumbnail when the bundle has one (the default cover is set in
 *  the bundle's own language), else the default. */
function localizedThumbnail(dir: string, thumbnail: string, lang: string): string {
  const localized = thumbnail.replace(/(\.[a-z]+)$/i, `-${lang}$1`);
  return fs.existsSync(path.join(process.cwd(), "public/presets", dir, localized)) ? localized : thumbnail;
}

/** Book titles and descriptions are in the `Showcase.books` and
 *  `Showcase.descriptions` messages, keyed by preset id (the index `name`
 *  mixes languages); a preset without them shows its index name and the
 *  index description, written "Spanish · English" (Catalan pages take the
 *  Spanish one). */
function indexDescription(description: string, locale: string): string {
  const [es, ...en] = description.split(" · ");
  return /^(es|ca)/.test(locale) ? es! : en.join(" · ") || es!;
}

/** The edition a book opens in: Catalan on Catalan pages when the bundle
 *  has it, Spanish on Spanish and Catalan pages, Simplified Chinese on
 *  Chinese pages and Arabic on Arabic pages when the bundle has them, else
 *  English. */
function openLocale(locale: string, locales: readonly string[] | undefined): string {
  if (locale.startsWith("ca") && locales?.includes("ca")) return "ca";
  if (locale.startsWith("es") || locale.startsWith("ca")) return "es";
  if (locale.startsWith("zh") && locales?.includes("zh-Hans")) return "zh-Hans";
  if (locale.startsWith("ar") && locales?.some((l) => l === "ar" || l.startsWith("ar-"))) return "ar";
  return "en";
}

function Book({ href, name, description, binding = "left", children }: { href: string; name: string; description: string; binding?: "left" | "right"; children: React.ReactNode }) {
  const right = binding === "right";
  return (
    <li className="reveal w-[13rem] shrink-0 snap-start md:w-[14rem] 2xl:w-[15rem]">
      {/* A full page load: the Sandbox reads its permalink hash when it mounts,
          before a client-side navigation has put the new URL in place. */}
      <a href={href} className="group block rounded-sm focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-brand">
        <div className="relative [perspective:1200px]">
          <div
            className={`relative overflow-hidden rounded-[2px] shadow-[0_2px_3px_rgba(14,16,20,0.25),0_24px_40px_-18px_rgba(14,16,20,0.55)] dark:shadow-[0_2px_3px_rgba(0,0,0,0.4),0_28px_50px_-18px_rgba(0,0,0,0.8)] transition-transform duration-500 ease-out ${
              right ? "[transform-origin:right_center] group-hover:[transform:rotateY(14deg)_translateX(-4px)]" : "[transform-origin:left_center] group-hover:[transform:rotateY(-14deg)_translateX(4px)]"
            }`}
          >
            {children}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-0 w-3 from-black/35 to-transparent ${right ? "right-0 bg-gradient-to-l" : "left-0 bg-gradient-to-r"}`}
            />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-white/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          </div>
        </div>
        <p className="mt-4 font-head text-[0.95rem] leading-snug font-bold text-foreground transition-colors group-hover:text-brand">{name}</p>
        <p className="mt-1.5 line-clamp-3 font-sans text-[0.8rem] leading-relaxed text-slate">{description}</p>
      </a>
    </li>
  );
}

export async function ShowcaseSection() {
  const t = await getTranslations("Showcase");
  const hero = await getTranslations("Hero");
  const locale = await getLocale();
  const presets = shelfOrder((presetIndex as { presets: PresetEntry[] }).presets);
  const guideLang = locale.startsWith("zh") ? "zh-Hans" : locale.startsWith("es") ? "es" : locale.startsWith("ca") ? "ca" : locale.startsWith("ar") ? "ar" : "en";

  return (
    <section aria-labelledby="showcase-heading" className="relative isolate overflow-hidden bg-surface py-16 text-foreground md:py-20 dark:bg-night">
      <div aria-hidden="true" className="pointer-events-none absolute top-1/3 left-1/2 -z-10 h-[30rem] w-[60rem] -translate-x-1/2 rounded-full bg-blue/8 blur-[160px] dark:bg-blue/20" />
      <div className="mx-auto max-w-6xl px-6 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <div className="grid grid-cols-1 items-end gap-6 md:grid-cols-12">
          <div className="md:col-span-7">
            <Kicker className="text-brand">{t("eyebrow")}</Kicker>
            <span aria-hidden="true" className="mt-3 block h-[3px] w-12 bg-brand" />
            <h2 id="showcase-heading" className="display mt-5 text-[2.1rem] text-foreground md:text-[3rem] dark:text-white" style={{ textWrap: "balance" }}>
              {t("title")}
            </h2>
          </div>
          <p className="font-body text-base leading-relaxed text-foreground/80 italic md:col-span-5 md:text-lg">{t("lead")}</p>
        </div>
      </div>

      <ul className="mx-auto mt-10 flex max-w-[100vw] snap-x snap-mandatory gap-8 overflow-x-auto px-6 pt-2 pb-6 md:gap-10 lg:justify-center lg:overflow-visible lg:flex-wrap 2xl:px-8">
        <Book href={`/${locale}/sandbox#preset=postext-guide&lang=${guideLang}&view=canvas`} name={t("guideName")} description={t("guideDescription")}>
          <GuideCover kicker={hero("kicker")} title="Postext" subtitle={hero("colophon")} label={hero("artAlt")} />
        </Book>
        {presets.map((p) => {
          const lang = openLocale(locale, p.locales);
          return (
          <Book
            key={p.id}
            href={`/${locale}/sandbox#preset=${p.id}&lang=${p.openLocale ?? lang}&view=canvas`}
            name={t.has(`books.${p.id}`) ? t(`books.${p.id}`) : p.name}
            description={t.has(`descriptions.${p.id}`) ? t(`descriptions.${p.id}`) : indexDescription(p.description, locale)}
            binding={p.binding}
          >
            <Image
              src={`/presets/${p.dir}/${localizedThumbnail(p.dir, p.thumbnail ?? "thumbnail.jpg", lang)}?v=${bundleVersion(p.dir)}`}
              alt=""
              width={544}
              height={720}
              unoptimized
              className="block aspect-[210/280] h-auto w-full object-cover"
            />
          </Book>
          );
        })}
      </ul>
    </section>
  );
}
