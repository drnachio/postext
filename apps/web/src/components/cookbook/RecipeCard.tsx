import { Link } from "@/i18n/navigation";
import { CropMarks } from "@/components/brand/CropMarks";
import type { PartColor } from "@/components/brand/partColors";
import type { CatalogRecipe, OutputId } from "@/lib/cookbook/types";
import { cn } from "@/lib/utils";

/** What a plate shows of a recipe: a subset of its catalogue entry. */
export type PlateRecipe = Pick<
  CatalogRecipe,
  "slug" | "number" | "title" | "summary" | "href" | "level" | "genres" | "outputs" | "pages" | "gap" | "draft" | "card"
>;

/** UI strings and vocabulary labels, resolved by the caller (server or
 *  client) so the plate itself stays a plain presentational component. */
export interface PlateLabels {
  /** "Nº" / "N.º" */
  number: string;
  levels: Record<number, string>;
  genres: Record<string, string>;
  /** Screen-reader prefix of the level: "Level 2 of 3". */
  levelOf: (level: number) => string;
  pages: (count: number) => string;
  /** Short badges for the outputs worth flagging (pdf, html, bundle, live). */
  badges: Partial<Record<OutputId, string>>;
  draft: string;
  workaround: string;
}

const BADGE_ORDER: OutputId[] = ["pdf", "html", "bundle", "live"];

/** "Nº 007" */
export function plateNumber(prefix: string, n: number): string {
  return `${prefix} ${String(n).padStart(3, "0")}`;
}

/** The level as three squares in the part colour, filled up to the level
 *  (■■□). With a `label` it is an image for screen readers; without one the
 *  caller prints the level in words. */
export function LevelSquares({ level, label, className }: { level: number; label?: string; className?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("cb-level", className)}
    >
      {[1, 2, 3].map((i) => (
        <span key={i} data-on={i <= level ? "" : undefined} />
      ))}
    </span>
  );
}

/** A stage for a recipe that has no capture yet: a blank page on the desk,
 *  an opener band in the part colour, greyed text and gilt crop marks. */
export function PlaceholderStage() {
  return (
    <span aria-hidden="true" className="cb-ph">
      <span className="cb-ph-page">
        <span className="cb-ph-band">
          <span className="cb-ph-title" />
        </span>
        <span className="cb-ph-text" />
        <span className="cb-ph-folio">—</span>
        <CropMarks offset={4} length={9} />
      </span>
    </span>
  );
}

/** The gallery's card, a "plate": Nº and output badges, a 4:3 stage with
 *  the captured spread or page over the desk colour, the chapter kicker,
 *  the title, the summary and the level, genre and page count. A stretched
 *  link on the title makes the whole plate clickable. No hooks: used by the
 *  server book view, the client results and the recipe page's related row. */
export function RecipeCard({
  recipe,
  chapter,
  labels,
  headingLevel = 3,
  eager = false,
  size = "md",
  reason,
  pinned = false,
  className,
}: {
  recipe: PlateRecipe;
  chapter: { title: string; color: PartColor };
  labels: PlateLabels;
  headingLevel?: 2 | 3 | 4;
  /** Load the image eagerly (the first row of the page). */
  eager?: boolean;
  size?: "md" | "lg";
  /** Why a search matched ("config · layout.sideColumnRole"). */
  reason?: string | null;
  /** Pinned first as the workaround for a gap the query names. */
  pinned?: boolean;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  const badges = BADGE_ORDER.filter((id) => recipe.outputs.includes(id) && labels.badges[id]);
  const genre = recipe.genres[0] ? labels.genres[recipe.genres[0]] : undefined;
  const hasImage = Boolean(recipe.card.src);

  return (
    <article className={cn("cb-plate group relative flex flex-col", `part-${chapter.color}`, size === "lg" && "cb-plate-lg", className)}>
      {/* The title leads the DOM (headings navigation); `order` sets the
          visual sequence. */}
      <Heading className="cb-plate-title order-4 mt-1.5 font-display font-semibold text-foreground transition-colors">
        <Link href={recipe.href} prefetch={false} className="cb-plate-link">
          {recipe.title}
        </Link>
      </Heading>

      <p className="order-1 flex min-h-5 items-center justify-between gap-2 font-sans text-[0.62rem] font-semibold tracking-[0.14em] uppercase">
        <span className="text-(--part-ink) tabular-nums">{plateNumber(labels.number, recipe.number)}</span>
        <span className="flex flex-wrap justify-end gap-1">
          {(recipe.gap || pinned) && <span className="cb-badge cb-badge-workaround">{labels.workaround}</span>}
          {badges.map((id) => (
            <span key={id} className="cb-badge">
              {labels.badges[id]}
            </span>
          ))}
        </span>
      </p>

      <div className="cb-stage order-2 relative mt-3.5">
        <div className="cb-stage-inner">
          {hasImage ? (
            // A plain <img>: next/image refuses srcSet, and the files are
            // already sized (960 and 480 wide) and cache-busted.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recipe.card.src}
              srcSet={`${recipe.card.src480} 480w, ${recipe.card.src} 960w`}
              sizes={
                size === "lg"
                  ? "(min-width: 1024px) 32vw, (min-width: 640px) 46vw, 80vw"
                  : "(min-width: 1280px) 24vw, (min-width: 1024px) 30vw, (min-width: 640px) 46vw, 80vw"
              }
              width={960}
              height={720}
              alt=""
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              className="cb-stage-img"
            />
          ) : (
            <PlaceholderStage />
          )}
        </div>
        <CropMarks offset={4} length={10} className="cb-plate-marks" />
        {recipe.draft && <span className="cb-draft">{labels.draft}</span>}
      </div>

      <p className="kicker order-3 mt-3.5 flex items-center gap-2 text-[0.6rem] text-(--part-ink)">
        <span aria-hidden="true" className="size-2 shrink-0 bg-(--part)" />
        <span className="truncate">{chapter.title}</span>
      </p>

      {recipe.summary && (
        <p className="cb-plate-summary order-5 mt-1.5 font-body text-[0.86rem] leading-snug text-slate italic">
          {recipe.summary}
        </p>
      )}

      {/* One line: a long genre is cut short, never wrapped. */}
      <p className="order-6 mt-2.5 flex items-center gap-x-2 font-sans text-[0.6rem] font-semibold tracking-[0.12em] whitespace-nowrap text-foreground/70 uppercase">
        <LevelSquares level={recipe.level} />
        <span className="shrink-0">
          <span className="sr-only">{labels.levelOf(recipe.level)}: </span>
          {labels.levels[recipe.level]}
        </span>
        {genre && (
          <>
            <span aria-hidden="true">·</span>
            <span className="min-w-0 truncate">{genre}</span>
          </>
        )}
        {recipe.pages > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{labels.pages(recipe.pages)}</span>
          </>
        )}
      </p>

      {reason && (
        <p className="order-7 mt-1.5 truncate font-mono text-[0.68rem] text-slate">
          <span aria-hidden="true">↳ </span>
          {reason}
        </p>
      )}
    </article>
  );
}
