import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
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

/** Bundle descriptions are written "Spanish · English". */
function localizedDescription(description: string, locale: string): string {
  const [es, ...en] = description.split(" · ");
  return locale.startsWith("es") ? es! : en.join(" · ") || es!;
}

function Book({ href, name, description, children }: { href: string; name: string; description: string; children: React.ReactNode }) {
  return (
    <li className="reveal w-[13rem] shrink-0 snap-start md:w-[14rem] 2xl:w-[15rem]">
      <Link href={href} className="group block rounded-sm focus-visible:outline-offset-4">
        <div className="relative [perspective:1200px]">
          <div className="relative overflow-hidden rounded-[2px] shadow-[0_2px_3px_rgba(0,0,0,0.4),0_28px_50px_-18px_rgba(0,0,0,0.8)] transition-transform duration-500 ease-out [transform-origin:left_center] group-hover:[transform:rotateY(-14deg)_translateX(4px)]">
            {children}
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/35 to-transparent" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-white/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          </div>
        </div>
        <p className="mt-4 font-head text-[0.95rem] leading-snug font-bold text-white transition-colors group-hover:text-gold">{name}</p>
        <p className="mt-1.5 line-clamp-3 font-sans text-[0.8rem] leading-relaxed text-mist/75">{description}</p>
      </Link>
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
    <section aria-labelledby="showcase-heading" className="on-night dark relative isolate overflow-hidden bg-night py-16 text-cream md:py-20">
      <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden="true" className="pointer-events-none absolute top-1/3 left-1/2 -z-10 h-[30rem] w-[60rem] -translate-x-1/2 rounded-full bg-blue/20 blur-[160px]" />
      <div className="mx-auto max-w-6xl px-6 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <div className="grid grid-cols-1 items-end gap-6 md:grid-cols-12">
          <div className="md:col-span-7">
            <Kicker className="text-gold">{t("eyebrow")}</Kicker>
            <span aria-hidden="true" className="mt-3 block h-[3px] w-12 bg-gold" />
            <h2 id="showcase-heading" className="display mt-5 text-[2.1rem] text-white md:text-[3rem]" style={{ textWrap: "balance" }}>
              {t("title")}
            </h2>
          </div>
          <p className="font-body text-base leading-relaxed text-cream/75 italic md:col-span-5 md:text-lg">{t("lead")}</p>
        </div>
      </div>

      <ul className="mx-auto mt-12 flex max-w-[100vw] snap-x snap-mandatory gap-8 overflow-x-auto px-6 pb-6 [scrollbar-width:thin] md:gap-10 lg:justify-center lg:overflow-visible lg:flex-wrap 2xl:px-8">
        <Book href={`/sandbox#preset=postext-guide&lang=${lang}`} name={t("guideName")} description={t("guideDescription")}>
          <GuideCover kicker={hero("kicker")} title="Postext" subtitle={hero("colophon")} label={hero("artAlt")} />
        </Book>
        {presets.map((p) => (
          <Book
            key={p.id}
            href={`/sandbox#preset=${p.id}&lang=${lang}`}
            name={p.name}
            description={localizedDescription(p.description, locale)}
          >
            <Image
              src={`/presets/${p.dir}/${p.thumbnail ?? "thumbnail.jpg"}`}
              alt=""
              width={544}
              height={720}
              sizes="(min-width: 1536px) 15rem, 14rem"
              className="block aspect-[210/280] h-auto w-full object-cover"
            />
          </Book>
        ))}
      </ul>
    </section>
  );
}
