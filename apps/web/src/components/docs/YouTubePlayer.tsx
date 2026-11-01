"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

/** A film on YouTube, inside the page. Until the reader plays it, this is a
 *  link to the video around a self-hosted poster: the page asks YouTube for
 *  nothing, and without JavaScript the link still opens the film. */
export function YouTubePlayer({
  embedUrl,
  watchUrl,
  poster,
  title,
  playLabel,
  duration,
  freeCorner,
}: {
  embedUrl: string;
  watchUrl: string;
  poster: string;
  title: string;
  playLabel: string;
  duration: string;
  /** Where the poster leaves room for the button. */
  freeCorner: "start" | "end";
}) {
  const [playing, setPlaying] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  // The link that held the focus is gone: the focus goes on to the player.
  useEffect(() => {
    if (playing) frame.current?.focus();
  }, [playing]);

  const play = (event: MouseEvent) => {
    // A new tab or window, as any link: the video plays there.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setPlaying(true);
  };

  return (
    <div className="relative aspect-video overflow-hidden bg-night">
      {playing ? (
        <iframe
          ref={frame}
          src={embedUrl}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <a
          href={watchUrl}
          onClick={play}
          aria-label={`${playLabel}: ${title} (${duration})`}
          className="group absolute inset-0 block focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster}
            alt=""
            width={960}
            height={540}
            loading="lazy"
            decoding="async"
            className="!m-0 size-full object-cover"
          />
          <span className={`absolute bottom-2 flex min-h-11 items-center gap-2 rounded-full bg-brand py-1 pe-4 ps-1.5 font-sans text-sm font-semibold text-brand-contrast shadow-[0_12px_40px_-10px_rgba(14,16,20,0.7)] transition-transform duration-300 group-hover:scale-105 sm:bottom-4 ${freeCorner === "start" ? "start-2 sm:start-4" : "end-2 sm:end-4"}`}>
            <span className="flex size-8 items-center justify-center rounded-full bg-brand-contrast/15">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="ml-0.5 size-4" fill="currentColor">
                <path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5Z" />
              </svg>
            </span>
            <span className="sr-only sm:not-sr-only">{playLabel} · </span>
            <bdi>{duration}</bdi>
          </span>
        </a>
      )}
    </div>
  );
}
