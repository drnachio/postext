import { folio, noteId } from "../recipe/pages";
import type { RecipeT, RecipeView } from "../recipe/model";

export interface PageShotProps {
  /** 1-based physical page. */
  page: number | string;
  /** "x,y,w,h" in fractions of the page (default: the whole page). */
  crop?: string;
  caption?: string;
}

function parseCrop(crop: string | undefined): [number, number, number, number] {
  const parts = (crop ?? "").split(",").map((n) => Number(n.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return [0, 0, 1, 1];
  const [x, y, w, h] = parts;
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return [clamp(x), clamp(y), Math.max(0.02, Math.min(1 - clamp(x), w)), Math.max(0.02, Math.min(1 - clamp(y), h))];
}

/** `<PageShot page={3} crop="0,.55,1,.45" caption="…"/>`: a cropped view
 *  of a captured page; it opens the lightbox at that page. With a caption
 *  the image is decorative and the link is named after the caption. Server
 *  component; the page binds `view` and `t`. */
export function PageShot({ view, t, page, crop, caption }: PageShotProps & { view: RecipeView; t: RecipeT }) {
  const n = Number(page);
  const shot = view.pages.find((p) => p.n === n);
  if (!shot) return null;
  const [x, y, w, h] = parseCrop(crop);
  return (
    <figure className="cb-pageshot">
      <a
        href={`#page-${n}`}
        className="cb-pageshot-frame"
        style={{ aspectRatio: `${w * shot.w} / ${h * shot.h}` }}
        aria-label={caption ? `${caption} (${t("openPage", { page: folio(shot) })})` : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shot.src}
          alt={caption ? "" : shot.alt}
          {...(!caption && shot.lang ? { lang: shot.lang } : {})}
          {...(!caption && shot.note ? { "aria-describedby": noteId(shot) } : {})}
          loading="lazy"
          decoding="async"
          width={shot.w}
          height={shot.h}
          style={{ width: `${100 / w}%`, left: `${(-x / w) * 100}%`, top: `${(-y / h) * 100}%` }}
        />
      </a>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
