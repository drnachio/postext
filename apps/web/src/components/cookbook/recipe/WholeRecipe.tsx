import { highlightLines } from "@/lib/cookbook/highlight";
import { readRecipeSources } from "@/lib/cookbook/sources";
import { KIT_ORDER } from "@/lib/cookbook/types";
import { CodeLines } from "./CodeLines";
import type { RecipeT, RecipeView } from "./model";
import type { RecipeActionsData } from "./RecipeActions";
import { SOURCE_ATTR, SOURCE_EOL_ATTR } from "./sources";
import { WholeRecipeTabs, type WholeRecipePanel } from "./WholeRecipeTabs";

interface Fold {
  from: number;
  to: number;
  label: string;
}

/** Lines in a string (a trailing newline does not open another line). */
const lineCount = (text: string) => (text === "" ? 0 : text.replace(/\n$/, "").split("\n").length);

/** The content literals' file names, in marker order (`content.en.md`,
 *  `content.notes.es.md`), falling back like composition does. */
function contentFiles(view: RecipeView): string[] {
  const { recipe, pen } = view;
  const sources = readRecipeSources(recipe.slug);
  const fallback = recipe.meta.sample.locales[0];
  return [...sources.script.matchAll(/\/\* @content(?::([a-z0-9-]+))? \*\/ ''/g)].map((m) => {
    const prefix = m[1] ? `${m[1]}.` : "";
    const variant = sources.content[`${prefix}${pen.variant}`] !== undefined ? pen.variant : fallback;
    return `content.${prefix}${variant}.md`;
  });
}

/** "The whole recipe" (generated): every composed file in tabs, highlighted
 *  on the server with line numbers and `#L<n>` anchors; the Markdown sample
 *  and the kit fold into `<details>`, since they are not the recipe's own
 *  code. Server component. */
export async function WholeRecipe({ view, t, data }: { view: RecipeView; t: RecipeT; data: RecipeActionsData }) {
  const { pen, jsLines } = view;
  const total = lineCount(pen.js);

  const folds: Fold[] = [];
  const files = contentFiles(view);
  pen.ranges.content.forEach(([a, b], i) => {
    // The literal's first and last lines carry code (`const md = String.raw\`…`
    // and the closing backtick): they stay visible around the fold.
    if (b - a >= 2) folds.push({ from: a + 1, to: b - 1, label: t("contentFold", { count: b - a - 1, file: files[i] ?? "content.md" }) });
  });
  if (pen.ranges.kit) {
    const [a, b] = pen.ranges.kit;
    const blocks = KIT_ORDER.filter((block) => view.recipe.meta.kit.includes(block)).join(", ");
    folds.push({ from: a, to: Math.min(b, total), label: t("kitFold", { blocks, count: Math.min(b, total) - a + 1 }) });
  }
  folds.sort((x, y) => x.from - y.from);

  const js: React.ReactNode[] = [];
  let cursor = 1;
  for (const fold of folds) {
    if (fold.from > cursor) js.push(<CodeLines key={`p${cursor}`} lines={jsLines} from={cursor} to={fold.from - 1} anchors linkNumbers />);
    js.push(
      <details key={`f${fold.from}`} className="cb-fold">
        <summary>{fold.label}</summary>
        <CodeLines lines={jsLines} from={fold.from} to={fold.to} anchors linkNumbers />
      </details>,
    );
    cursor = fold.to + 1;
  }
  if (cursor <= total) js.push(<CodeLines key={`p${cursor}`} lines={jsLines} from={cursor} to={total} anchors linkNumbers />);

  // Copy, CodePen and the .html download rebuild each file from these
  // `<pre>`s (RecipeActions `readSources`): every line is rendered once.
  const sourceProps = (id: WholeRecipePanel["id"], code: string) => ({
    [SOURCE_ATTR]: id,
    ...(code.endsWith("\n") ? { [SOURCE_EOL_ATTR]: "" } : {}),
  });
  const panels: WholeRecipePanel[] = [
    { id: "js", file: "script.js", lines: total, content: <pre className="cb-code cb-code-whole" {...sourceProps("js", pen.js)}>{js}</pre> },
  ];
  for (const [id, file, code] of [
    ["html", "index.html", pen.html],
    ["css", "style.css", pen.css],
  ] as const) {
    if (!code) continue;
    const lines = await highlightLines(code, id);
    const count = lineCount(code);
    panels.push({
      id,
      file,
      lines: count,
      content: (
        <pre className="cb-code cb-code-whole" {...sourceProps(id, code)}>
          <CodeLines lines={lines} from={1} to={count} linkNumbers={false} />
        </pre>
      ),
    });
  }

  return (
    <>
      <WholeRecipeTabs panels={panels} data={data} />
      <p className="cb-whole-note">
        {t("howToRun")}{" "}
        <a href={view.githubUrl} target="_blank" rel="noopener noreferrer">
          {t("recipeFolder")} ↗
        </a>
      </p>
    </>
  );
}
