import { getLocale, getTranslations } from "next-intl/server";
import fs from "fs";
import path from "path";
import Image from "next/image";
import { Kicker } from "@/components/brand/Kicker";
import presetIndex from "../../../public/presets/index.json";
import { GuideCover } from "./GuideCover";

interface PresetEntry {
  id: string;
  dir: string;
  name: string;
  description: string;
  thumbnail?: string;
  tags?: string[];
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

/** Bundle descriptions are written "Spanish · English". */
function localizedDescription(description: string, locale: string): string {
  const [es, ...en] = description.split(" · ");
  return locale.startsWith("es") ? es! : en.join(" · ") || es!;
}

function Book({ href, name, description, children }: { href: string; name: string; description: string; children: React.ReactNode }) {
  return (
    <li className="reveal w-[13rem] shrink-0 snap-start md:w-[14rem] 2xl:w-[15rem]">
      {/* A full page load: the Sandbox reads its permalink hash when it mounts,
          before a client-side navigation has put the new URL in place. */}
      <a href={href} className="group block rounded-sm focus-visible:outline-offset-4">
        <div className="relative [perspective:1200px]">
          <div className="relative overflow-hidden rounded-[2px] shadow-[0_2px_3px_rgba(14,16,20,0.25),0_24px_40px_-18px_rgba(14,16,20,0.55)] dark:shadow-[0_2px_3px_rgba(0,0,0,0.4),0_28px_50px_-18px_rgba(0,0,0,0.8)] transition-transform duration-500 ease-out [transform-origin:left_center] group-hover:[transform:rotateY(-14deg)_translateX(4px)]">
            {children}
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/35 to-transparent" />
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
  const presets = (presetIndex as { presets: PresetEntry[] }).presets;
  const lang = locale.startsWith("es") ? "es" : "en";

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
          <p className="font-body text-base leading-relaxed text-foreground/70 italic md:col-span-5 md:text-lg">{t("lead")}</p>
        </div>
      </div>

      <ul className="mx-auto mt-12 flex max-w-[100vw] snap-x snap-mandatory gap-8 overflow-x-auto px-6 pb-6 [scrollbar-width:thin] md:gap-10 lg:justify-center lg:overflow-visible lg:flex-wrap 2xl:px-8">
        <Book href={`/${locale}/sandbox#preset=postext-guide&lang=${lang}&view=canvas`} name={t("guideName")} description={t("guideDescription")}>
          <GuideCover kicker={hero("kicker")} title="Postext" subtitle={hero("colophon")} label={hero("artAlt")} />
        </Book>
        {presets.map((p) => (
          <Book
            key={p.id}
            href={`/${locale}/sandbox#preset=${p.id}&lang=${lang}&view=canvas`}
            name={p.name}
            description={localizedDescription(p.description, locale)}
          >
            <Image
              src={`/presets/${p.dir}/${p.thumbnail ?? "thumbnail.jpg"}?v=${bundleVersion(p.dir)}`}
              alt=""
              width={544}
              height={720}
              unoptimized
              className="block aspect-[210/280] h-auto w-full object-cover"
            />
          </Book>
        ))}
      </ul>
    </section>
  );
}
