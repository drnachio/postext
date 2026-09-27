import { ArrowDownToLine } from "lucide-react";
import { CodeLines, linesText, parseHighlight } from "../recipe/CodeLines";
import { CopyButton } from "../recipe/CopyButton";
import type { RecipeT, RecipeView } from "../recipe/model";

export interface ExcerptProps {
  /** A `// #region <id>` of script.js. */
  region: string;
  /** Lines to mark, counted from the excerpt's first line: "4-7", "2,5". */
  highlight?: string;
}

/** `<Excerpt region="photo" highlight="4-7"/>`: a region of the composed
 *  script with its real line numbers (they link into the whole recipe),
 *  "script.js · lines a–b", Copy and "↧ in full code". Server component;
 *  the page binds `view` and `t`. */
export function Excerpt({
  view,
  t,
  region,
  highlight,
  caption = false,
}: ExcerptProps & { view: RecipeView; t: RecipeT; caption?: boolean }) {
  const hit = view.pen.ranges.regions[region];
  if (!hit) {
    return (
      <p role="note" className="cb-excerpt-missing">
        {t("missingRegion", { region })}
      </p>
    );
  }
  const [from, to] = hit.lines;
  const file = "script.js";
  return (
    <figure className="cb-excerpt">
      <figcaption className="cb-excerpt-bar">
        <span className="cb-excerpt-file">
          {from === to ? t("excerptLine", { file, line: from }) : t("excerptLines", { file, from, to })}
        </span>
        <span className="cb-excerpt-actions">
          <CopyButton
            text={linesText(view.pen.js, from, to)}
            label={t("copyShort")}
            ariaLabel={t("copyLines", { from, to })}
            copied={t("copiedLines", { from, to, file })}
            failed={t("copyFailed")}
          />
          <a href={`#L${from}`} data-to={to} className="cb-code-button" title={t("inFullCodeTitle")}>
            <ArrowDownToLine aria-hidden="true" className="size-3.5" />
            {t("inFullCode")}
          </a>
        </span>
      </figcaption>
      <pre className="cb-code">
        <CodeLines lines={view.jsLines} from={from} to={to} highlight={parseHighlight(highlight, from)} />
      </pre>
      {/* Region titles are code comments, written in English. */}
      {caption && hit.title && view.locale === "en" && (
        <p className="cb-excerpt-caption">{hit.title.replace(/^./, (c) => c.toUpperCase())}</p>
      )}
    </figure>
  );
}
