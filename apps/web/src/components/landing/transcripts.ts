/**
 * Text alternatives for the narrated videos (WCAG 1.2.3 and 1.2.8): what is said, verbatim from the captions, and
 * what is shown, from the animation sources. One list of blocks per video and locale; each follows its own cut. Every
 * site locale has a cut of its own (Catalan, Arabic and Japanese since #510, Brazilian Portuguese since #611, French,
 * German and Italian since #843), with its own narration, timings and on-screen text: the Chinese and Japanese films
 * are set vertically, with scenes of their own where the English film is about space-separated text, and the Arabic
 * film is mirrored right to left. The French narration takes the site's French spacing (no-break spaces before
 * colons and inside « », narrow ones before ; ? !), which the captions leave out.
 */
import { TRANSCRIPTS_EN } from "./transcripts/en";
import { TRANSCRIPTS_ES } from "./transcripts/es";
import { TRANSCRIPTS_ZH } from "./transcripts/zh";
import { TRANSCRIPTS_CA } from "./transcripts/ca";
import { TRANSCRIPTS_AR } from "./transcripts/ar";
import { TRANSCRIPTS_JA } from "./transcripts/ja";
import { TRANSCRIPTS_PT } from "./transcripts/pt";
import { TRANSCRIPTS_FR } from "./transcripts/fr";
import { TRANSCRIPTS_DE } from "./transcripts/de";
import { TRANSCRIPTS_IT } from "./transcripts/it";

export type TranscriptVideo = "showreel" | "tutorial";
export type TranscriptLocale = "en" | "es" | "zh" | "ca" | "ar" | "ja" | "pt" | "fr" | "de" | "it";
export interface TranscriptBlock {
  /** Start time in the cut, "m:ss". */
  time: string;
  /** What is on screen, in plain present-tense prose (optional when nothing new appears). */
  scene?: string;
  /** What the narrator says in this stretch, verbatim from the captions. */
  narration?: string;
}

export const TRANSCRIPTS: Record<TranscriptVideo, Record<TranscriptLocale, TranscriptBlock[]>> = {
  showreel: {
    en: TRANSCRIPTS_EN.showreel,
    es: TRANSCRIPTS_ES.showreel,
    zh: TRANSCRIPTS_ZH.showreel,
    ca: TRANSCRIPTS_CA.showreel,
    ar: TRANSCRIPTS_AR.showreel,
    ja: TRANSCRIPTS_JA.showreel,
    pt: TRANSCRIPTS_PT.showreel,
    fr: TRANSCRIPTS_FR.showreel,
    de: TRANSCRIPTS_DE.showreel,
    it: TRANSCRIPTS_IT.showreel,
  },
  tutorial: {
    en: TRANSCRIPTS_EN.tutorial,
    es: TRANSCRIPTS_ES.tutorial,
    zh: TRANSCRIPTS_ZH.tutorial,
    ca: TRANSCRIPTS_CA.tutorial,
    ar: TRANSCRIPTS_AR.tutorial,
    ja: TRANSCRIPTS_JA.tutorial,
    pt: TRANSCRIPTS_PT.tutorial,
    fr: TRANSCRIPTS_FR.tutorial,
    de: TRANSCRIPTS_DE.tutorial,
    it: TRANSCRIPTS_IT.tutorial,
  },
};
