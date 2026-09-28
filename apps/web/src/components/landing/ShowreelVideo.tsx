"use client";

import { useEffect, useRef, useState } from "react";

/** The narrated showreel, streamed as HLS from Cloudflare R2 through the
 *  `postext-media` Worker. Safari and iOS play HLS natively; other browsers
 *  load hls.js on demand, once the player comes near the viewport. No
 *  autoplay (it is narrated) and `preload="none"`: nothing is fetched until
 *  the reader scrolls to it. A new cut ships under a new version path.
 *  Until the first play the poster is one big button: a click plays the
 *  video full screen, and the native controls take over from then on. */
export const MEDIA_BASE = process.env.NEXT_PUBLIC_MEDIA_BASE?.replace(/\/+$/, "");
const VERSION = "v1";

/** iOS Safari only puts a video element full screen through this. */
type IOSVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

export function ShowreelVideo({
  lang,
  title,
  playLabel,
  watchLabel,
}: {
  lang: "en" | "es";
  title: string;
  playLabel: string;
  watchLabel: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const base = `${MEDIA_BASE}/showreel/${VERSION}/${lang}`;
  const src = `${base}/master.m3u8`;

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

  // Both calls stay inside the click so the browser counts them as the
  // reader's gesture; a refused full screen still leaves the video playing.
  const start = () => {
    const video: IOSVideo | null = ref.current;
    if (!video) return;
    setStarted(true);
    void video.play().catch(() => {});
    if (video.requestFullscreen) void video.requestFullscreen().catch(() => {});
    else video.webkitEnterFullscreen?.();
  };

  return (
    <div className="relative">
      <video
        ref={ref}
        controls={started}
        playsInline
        preload="none"
        poster={`${base}/poster.jpg`}
        aria-label={title}
        onPlay={() => setStarted(true)}
        className="block aspect-video w-full bg-night"
      />
      {!started && (
        <button
          type="button"
          onClick={start}
          aria-label={playLabel}
          className="group absolute inset-0 flex cursor-pointer items-start justify-start p-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:items-end sm:p-4 md:p-6"
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
    </div>
  );
}
