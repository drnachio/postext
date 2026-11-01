import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSiteLocale, LOCALE_INFO } from "@/i18n/locales";
import { isYouTubeFilm, YOUTUBE_VIDEOS, youtubePoster, type YouTubeFilm } from "./youtubeVideos";

const WEB_DIR = process.cwd();
const DOCS_DIR = path.join(WEB_DIR, "../../docs");
const LOCALES = Object.keys(LOCALE_INFO);
const FILMS = Object.keys(YOUTUBE_VIDEOS) as YouTubeFilm[];

function placements(locale: string): string[] {
  const films: string[] = [];
  for (const file of fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(`-${locale}.mdx`)).sort()) {
    const text = fs.readFileSync(path.join(DOCS_DIR, file), "utf8");
    for (const m of text.matchAll(/<YouTubeVideo film="([^"]*)" \/>/g)) {
      films.push(`${file.replace(`-${locale}.mdx`, "")}:${m[1]}`);
    }
  }
  return films.sort();
}

describe("the docs' YouTube films (#1374)", () => {
  it("each film has a distinct cut, a duration, a title and a poster per locale", () => {
    const ids = new Set<string>();
    for (const locale of LOCALES) {
      expect(isSiteLocale(locale)).toBe(true);
      const messages = JSON.parse(fs.readFileSync(path.join(WEB_DIR, "messages", `${locale}.json`), "utf8"));
      for (const film of FILMS) {
        const { id, duration } = YOUTUBE_VIDEOS[film][locale as keyof (typeof YOUTUBE_VIDEOS)[YouTubeFilm]];
        expect(ids.has(id), `${film} ${locale}: ${id} used twice`).toBe(false);
        ids.add(id);
        expect(duration).toMatch(/^\d+:\d\d$/);
        expect(messages.YouTubeVideos[film], `${film} ${locale}`).toBeTruthy();
        expect(fs.existsSync(path.join(WEB_DIR, "public", youtubePoster(id))), `${film} ${locale} poster`).toBe(true);
      }
    }
  });

  it("every locale's pages place the same films in the same pages", () => {
    const en = placements("en");
    expect(new Set(en.map((p) => p.split(":")[1]))).toEqual(new Set(FILMS));
    for (const p of en) expect(isYouTubeFilm(p.split(":")[1]!), p).toBe(true);
    for (const locale of LOCALES) expect(placements(locale), locale).toEqual(en);
  });
});
