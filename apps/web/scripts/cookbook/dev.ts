/**
 * `pnpm cookbook dev <slug> [--lang es] [--port 4400] [--engine npm@x.y.z]`:
 * serves the exact capture page of one recipe with live reload. Saving
 * anything under cookbook/<slug>/ or cookbook/_kit/ recomposes the pen and
 * reloads the browser.
 */
import fs from "node:fs";
import path from "node:path";
import { variantFor } from "../../src/lib/cookbook/compose.ts";
import { KIT_DIR, REPO_DIR, recipeDir } from "../../src/lib/cookbook/paths.ts";
import { resetKitCache } from "../../src/lib/cookbook/sources.ts";
import type { Locale } from "../../src/lib/cookbook/types.ts";
import { LOCALES } from "../../src/lib/cookbook/types.ts";
import { UsageError, c, int, loadRecipes, mark, parseArgs, shown, str } from "./args.ts";
import type { PenServer } from "./serve.ts";

export const DEV_USAGE = `pnpm cookbook dev <slug> [--lang es] [--port 4400] [--engine npm@x.y.z]

  Serves the page the capture runs, with live reload: saving a file under
  cookbook/<slug>/ or cookbook/_kit/ recomposes the pen and reloads it.

  --lang <en|es>     Sample edition (default: the recipe's first sample language)
  --port <n>         Port of the local server (default 4400)
  --engine <spec>    npm (default: the released version) or npm@x.y.z`;

export const ENGINE_PATTERN = /^npm(@\d+\.\d+\.\d+)?$/;

/** Editor droppings that should not trigger a reload. */
function ignored(file: string): boolean {
  const base = path.basename(file);
  return base.startsWith(".") || base.endsWith("~") || /\.(swp|swx|tmp)$/.test(base) || base === "4913";
}

function clock(): string {
  return new Date().toTimeString().slice(0, 8);
}

export async function runDev(argv: readonly string[]): Promise<number> {
  const args = parseArgs(
    argv,
    {
      lang: { type: "string", value: "en|es", choices: LOCALES },
      port: { type: "int", value: "n", min: 1, max: 65535 },
      engine: { type: "string", value: "spec" },
    },
    "dev",
  );
  const [slug, ...extra] = args.positionals;
  if (!slug) throw new UsageError("name the recipe to serve: pnpm cookbook dev <slug>", "dev");
  if (extra.length) throw new UsageError(`one recipe at a time (unexpected "${extra[0]}")`, "dev");
  const entry = loadRecipes().find((recipe) => recipe.slug === slug);
  if (!entry) throw new UsageError(`no recipe "${slug}" in cookbook/`, "dev");
  const engine = str(args, "engine");
  if (engine && !ENGINE_PATTERN.test(engine)) {
    throw new UsageError(`--engine expects npm or npm@x.y.z, not "${engine}"`, "dev");
  }
  const meta = entry.meta;
  if (!meta) {
    console.error(`${mark.fail()} ${slug}: ${entry.error}`);
    return 1;
  }

  const lang = (str(args, "lang") as Locale | undefined) ?? meta.sample?.locales?.[0] ?? "en";
  const variant = meta.sample?.locales?.length ? variantFor(meta, lang) : lang;
  if (variant !== lang) console.log(`${mark.warn()} ${slug} has no ${lang} sample: serving the ${variant} edition`);

  const { startPenServer } = await import("./serve.ts");
  const port = int(args, "port") ?? 4400;
  let server: PenServer;
  try {
    server = await startPenServer({ slug, variant, engine, live: true, port });
  } catch (error) {
    if ((error as { code?: string }).code === "EADDRINUSE") {
      console.error(`${mark.fail()} port ${port} is busy: pass another with --port <n>`);
      return 1;
    }
    throw error;
  }

  const watched = [recipeDir(slug), KIT_DIR].filter((dir) => fs.existsSync(dir));
  console.log(`${c.bold("Cookbook dev")} · ${slug} (${variant}) · live reload`);
  console.log(`  ${c.cyan(server.url)}`);
  console.log(c.dim(`  Watching ${watched.map((dir) => `${shown(dir, REPO_DIR)}/`).join(", ")} · Ctrl+C to stop`));

  // Editors save in bursts (write, rename, chmod): reload once per burst.
  const changed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = async () => {
    timer = null;
    const files = [...changed];
    changed.clear();
    resetKitCache();
    try {
      await server.reload();
      console.log(`${c.dim(`[${clock()}]`)} ${files.join(", ")} ${c.dim("→ reloaded")}`);
    } catch (error) {
      console.log(`${c.dim(`[${clock()}]`)} ${mark.fail()} ${files.join(", ")}: ${(error as Error).message}`);
    }
  };
  const watchers = watched.map((dir) =>
    fs.watch(dir, { recursive: true }, (_event, filename) => {
      const name = filename ? path.join(dir, filename.toString()) : dir;
      if (ignored(name)) return;
      changed.add(shown(name, REPO_DIR));
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 120);
    }),
  );

  return new Promise<number>((resolve) => {
    const stop = async () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      for (const watcher of watchers) watcher.close();
      if (timer) clearTimeout(timer);
      await server.close();
      console.log(c.dim("\nStopped."));
      resolve(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
