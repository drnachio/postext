"use client";

import { useEffect, useRef } from "react";

/** The narrated showreel, streamed as HLS from Cloudflare R2 through the
 *  `postext-media` Worker. Safari and iOS play HLS natively; other browsers
 *  load hls.js on demand, once the player comes near the viewport. No
 *  autoplay (it is narrated) and `preload="none"`: nothing is fetched until
 *  the reader scrolls to it. A new cut ships under a new version path. */
export const MEDIA_BASE = process.env.NEXT_PUBLIC_MEDIA_BASE?.replace(/\/+$/, "");
const VERSION = "v1";

export function ShowreelVideo({ lang, title }: { lang: "en" | "es"; title: string }) {
  const ref = useRef<HTMLVideoElement>(null);
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

  return (
    <video
      ref={ref}
      controls
      playsInline
      preload="none"
      poster={`${base}/poster.jpg`}
      aria-label={title}
      className="block aspect-video w-full bg-night"
    />
  );
}
