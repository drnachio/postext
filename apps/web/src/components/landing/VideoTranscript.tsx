import { getTranslations } from "next-intl/server";
import { htmlLang, siteLocale } from "@/i18n/locales";
import {
  TRANSCRIPTS,
  type TranscriptLocale,
  type TranscriptVideo,
} from "./transcripts";

/** The text alternative under a narrated video (WCAG 1.2.3, 1.2.8): a
 *  disclosure, closed by default, with what is shown and what is said, block
 *  by block, timed against the cut each locale plays (one per site locale,
 *  each with its own narration). Server component. */
export async function VideoTranscript({
  video,
  locale,
}: {
  video: TranscriptVideo;
  locale: string;
}) {
  const t = await getTranslations("Transcript");
  // Each site locale reads its own transcript, timed against its own cut;
  // English when a video has none in that language.
  const site = siteLocale(locale);
  const lang: TranscriptLocale = TRANSCRIPTS[video][site]?.length ? site : "en";
  const blocks = TRANSCRIPTS[video][lang];
  if (!blocks?.length) return null;

  return (
    <details
      className="group/transcript mt-4 rounded-sm border border-rule bg-surface text-start [hyphens:manual]"
      lang={htmlLang(lang)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm px-4 py-2 font-sans text-sm font-semibold text-foreground hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4 shrink-0 transition-transform group-open/transcript:rotate-90 rtl:-scale-x-100 rtl:group-open/transcript:-rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        {t("summary")}
      </summary>
      <div className="border-t border-rule px-4 pt-3 pb-5 md:px-6">
        <div className="max-w-[42rem]">
          <p className="max-w-[30rem] font-sans text-sm leading-relaxed text-slate">
            {t("note")}
          </p>
          <ol className="mt-4 space-y-4">
            {blocks.map((block, i) => (
              <li
                key={i}
                className="grid gap-1 md:grid-cols-[4rem_minmax(0,1fr)] md:gap-4"
              >
                <span className="font-mono text-sm leading-relaxed text-slate tabular-nums">
                  {block.time}
                </span>
                <div className="space-y-1.5 font-body text-base leading-relaxed text-foreground">
                  {block.scene && (
                    <p>
                      <span className="kicker me-2 text-[0.7rem] text-slate">
                        {t("onScreen")}
                      </span>
                      <span className="italic">{block.scene}</span>
                    </p>
                  )}
                  {block.narration && (
                    <p>
                      <span className="kicker me-2 text-[0.7rem] text-slate">
                        {t("narration")}
                      </span>
                      {block.narration}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </details>
  );
}
