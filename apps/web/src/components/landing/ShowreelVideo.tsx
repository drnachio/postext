"use client";

import { useEffect, useRef, useState } from "react";

/** A narrated video (the home page showreel, the skill tutorial), streamed as
 *  HLS from Cloudflare R2 through the `postext-media` Worker. Safari and iOS play HLS natively; other browsers
 *  load hls.js on demand, once the player comes near the viewport. No
 *  autoplay (it is narrated) and `preload="none"`: nothing is fetched until
 *  the reader scrolls to it. A new cut ships under a new version path.
 *  Until the first play the poster is one big button: a click plays the
 *  video full screen, and the native controls take over from then on. */
export const MEDIA_BASE = process.env.NEXT_PUBLIC_MEDIA_BASE?.replace(/\/+$/, "");
const VERSION = "v1";

/** The corner buttons over the player (subtitles, full screen). */
const TOOL =
  "flex h-8 items-center rounded-md border font-sans text-sm font-bold tracking-wider shadow-[0_4px_16px_rgba(0,0,0,0.45)] transition-[opacity,background-color,color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-9";
const TOOL_ON = "border-brand bg-brand text-brand-contrast opacity-100";
const TOOL_OFF = "border-white/85 bg-night/80 text-white hover:border-brand hover:text-brand";

/** iOS Safari only puts a video element full screen (and back) through these. */
type IOSVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

/** The videos on the media CDN, each under `<video>/<version>/<lang>/`. */
export type MediaVideo = "showreel" | "tutorial";

export function ShowreelVideo({
  video = "showreel",
  lang,
  title,
  playLabel,
  watchLabel,
  subtitlesLabel,
  fullscreenLabel,
  exitFullscreenLabel,
}: {
  video?: MediaVideo;
  lang: "en" | "es";
  title: string;
  playLabel: string;
  watchLabel: string;
  subtitlesLabel: string;
  fullscreenLabel: string;
  exitFullscreenLabel: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  // Nothing comes from the media domain, poster included, until the player
  // nears the viewport; the 16:9 frame holds its place meanwhile.
  const [near, setNear] = useState(false);
  const [hasSubs, setHasSubs] = useState(false);
  const [subsOn, setSubsOn] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Element full screen (not the iPhone): our button replaces the native one
  const [frameFs, setFrameFs] = useState(false);
  const base = `${MEDIA_BASE}/${video}/${VERSION}/${lang}`;
  const src = `${base}/master.m3u8`;
  const poster = `${base}/poster.jpg`;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let hls: { destroy(): void } | undefined;
    let cancelled = false;
    const attach = async () => {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        return;
      }
      const { default: Hls } = await import("hls.js");
      if (cancelled || !Hls.isSupported()) return;
      // hls.js ignores `preload`, so the playlist and segments wait for play.
      const h = new Hls({ capLevelToPlayerSize: true, startLevel: -1, autoStartLoad: false });
      h.loadSource(src);
      h.attachMedia(video);
      video.addEventListener("play", () => h.startLoad(), { once: true });
      hls = h;
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          io.disconnect();
          setNear(true);
          void attach();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(video);
    return () => {
      cancelled = true;
      io.disconnect();
      hls?.destroy();
    };
  }, [src]);

  // The subtitles come from the master playlist (hls.js, or Safari itself)
  // and start off; the CC button and the browser's own menu stay in step.
  useEffect(() => {
    const tracks = ref.current?.textTracks;
    if (!tracks) return;
    const sync = () => {
      const subs = [...tracks].filter((t) => t.kind === "subtitles" || t.kind === "captions");
      setHasSubs(subs.length > 0);
      setSubsOn(subs.some((t) => t.mode === "showing"));
    };
    sync();
    tracks.addEventListener("addtrack", sync);
    tracks.addEventListener("removetrack", sync);
    tracks.addEventListener("change", sync);
    return () => {
      tracks.removeEventListener("addtrack", sync);
      tracks.removeEventListener("removetrack", sync);
      tracks.removeEventListener("change", sync);
    };
  }, []);

  // The frame is what goes full screen. The native button (where the browser
  // keeps it) would stack the video on top instead of leaving, so a switch
  // to the video means "exit" and the page leaves full screen altogether.
  useEffect(() => {
    const change = () => {
      const el = document.fullscreenElement;
      if (el && el === ref.current) {
        void document.exitFullscreen().then(() => {
          if (document.fullscreenElement) return document.exitFullscreen();
        }).catch(() => {});
        return;
      }
      setFullscreen(!!el && el === frame.current);
    };
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void frame.current?.requestFullscreen().catch(() => {});
  };

  const toggleSubs = () => {
    const tracks = ref.current?.textTracks;
    if (!tracks) return;
    const subs = [...tracks].filter((t) => t.kind === "subtitles" || t.kind === "captions");
    const pick = subs.find((t) => t.language === lang) ?? subs[0];
    for (const t of subs) t.mode = !subsOn && t === pick ? "showing" : "disabled";
  };

  // Both calls stay inside the click so the browser counts them as the
  // reader's gesture; a refused full screen still leaves the video playing.
  // The frame goes full screen, not the video, so the CC button comes along;
  // the iPhone has no element full screen and uses its own player instead.
  const start = () => {
    const video: IOSVideo | null = ref.current;
    if (!video) return;
    setStarted(true);
    setFrameFs(document.fullscreenEnabled);
    void video.play().catch(() => {});
    if (document.fullscreenEnabled && frame.current) void frame.current.requestFullscreen().catch(() => {});
    else video.webkitEnterFullscreen?.();
  };

  // At the end the reader comes back to the page, whichever full screen it
  // was, and finds the player as it started: poster, pill, from the top.
  const ended = () => {
    const video: IOSVideo | null = ref.current;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (video?.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
    if (video) video.currentTime = 0;
    setStarted(false);
  };

  return (
    <div ref={frame} className="group/player relative bg-night">
      <video
        ref={ref}
        controls={started}
        controlsList={frameFs ? "nofullscreen" : undefined}
        playsInline
        preload="none"
        poster={near ? poster : undefined}
        aria-label={title}
        onPlay={() => setStarted(true)}
        onEnded={ended}
        className="block aspect-video w-full bg-night group-[:fullscreen]/player:h-full group-[:fullscreen]/player:aspect-auto"
      />
      {!started && (
        <button
          type="button"
          onClick={start}
          aria-label={playLabel}
          // the video shows its poster only until the first play; after the
          // end the button carries it
          style={near ? { backgroundImage: `url(${poster})` } : undefined}
          className="group absolute inset-0 flex cursor-pointer bg-cover bg-center items-start justify-start p-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:items-end sm:p-4 md:p-6"
        >
          {/* where the poster leaves room (its centre carries the title): bottom-left, or top-left on phones, where its foot line sits too close */}
          <span className="flex items-center gap-1.5 rounded-full bg-brand py-0.5 pr-2.5 pl-0.5 font-sans text-[0.7rem] font-semibold text-brand-contrast shadow-[0_12px_40px_-10px_rgba(14,16,20,0.7)] transition-transform duration-300 group-hover:scale-105 sm:gap-2.5 sm:py-2 sm:pr-5 sm:pl-2 sm:text-sm md:text-base">
            <span className="flex size-5 items-center justify-center rounded-full bg-brand-contrast/15 sm:size-8 md:size-9">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="ml-px size-2.5 sm:ml-0.5 sm:size-4 md:size-5" fill="currentColor">
                <path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5Z" />
              </svg>
            </span>
            {watchLabel}
          </span>
        </button>
      )}
      {started && (hasSubs || frameFs) && (
        <div className="absolute top-3 right-3 flex gap-2 md:top-4 md:right-4">
          {hasSubs && (
            <button
              type="button"
              onClick={toggleSubs}
              aria-pressed={subsOn}
              aria-label={subtitlesLabel}
              title={subtitlesLabel}
              className={`${TOOL} px-2.5 ${subsOn ? TOOL_ON : TOOL_OFF}`}
            >
              CC
            </button>
          )}
          {frameFs && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? exitFullscreenLabel : fullscreenLabel}
              title={fullscreen ? exitFullscreenLabel : fullscreenLabel}
              className={`${TOOL} w-8 justify-center md:w-9 ${TOOL_OFF}`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 md:size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={fullscreen ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
