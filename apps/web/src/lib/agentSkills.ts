import fs from "fs";
import path from "path";

/**
 * The agent skills shipped in `plugins/postext/skills/`, published at
 * `/.well-known/agent-skills/` in the legacy (v0.1.0) discovery layout the
 * `skills` CLI reads: `index.json` lists each skill with its files, and every
 * file is served at `<name>/<file>` next to it. `npx skills add
 * https://postext.dev` installs from there.
 */
export const SKILLS_DIR = path.join(process.cwd(), "../../plugins/postext/skills");

export interface AgentSkillEntry {
  name: string;
  description: string;
  files: string[];
}

function listFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "__pycache__") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out.sort();
}

/** `name` and `description` from a SKILL.md YAML frontmatter (single-line or folded). */
export function skillFrontmatter(source: string): { name: string; description: string } | null {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const field = (key: string): string => {
    const i = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (i < 0) return "";
    const inline = lines[i].slice(key.length + 1).trim();
    if (inline && !/^[>|][-+]?$/.test(inline)) return inline.replace(/^(['"])(.*)\1$/, "$2");
    const block: string[] = [];
    for (const l of lines.slice(i + 1)) {
      if (!/^\s+/.test(l)) break;
      block.push(l.trim());
    }
    return block.join(" ").trim();
  };
  const name = field("name");
  const description = field("description");
  return name && description ? { name, description } : null;
}

export function agentSkills(dir = SKILLS_DIR): AgentSkillEntry[] {
  if (!fs.existsSync(dir)) return [];
  const skills: AgentSkillEntry[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(dir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;
    const meta = skillFrontmatter(fs.readFileSync(skillMd, "utf-8"));
    if (!meta || meta.name !== entry.name) continue;
    skills.push({ ...meta, files: listFiles(path.join(dir, entry.name)) });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** Every URL path under `/.well-known/agent-skills/`, as route segments. */
export function agentSkillPaths(dir = SKILLS_DIR): string[][] {
  return [
    ["index.json"],
    ...agentSkills(dir).flatMap((s) => s.files.map((f) => [s.name, ...f.split("/")])),
  ];
}

const CONTENT_TYPES: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".py": "text/x-python; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".sh": "text/x-shellscript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** The response for one path under `/.well-known/agent-skills/`. */
export function agentSkillResponse(segments: string[], dir = SKILLS_DIR): Response {
  const headers = {
    "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    "Access-Control-Allow-Origin": "*",
  };
  if (segments.length === 1 && segments[0] === "index.json") {
    return Response.json({ skills: agentSkills(dir) }, { headers });
  }
  const [name, ...rest] = segments;
  const skill = agentSkills(dir).find((s) => s.name === name);
  const file = rest.join("/");
  if (!skill || !skill.files.includes(file)) {
    return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const body = fs.readFileSync(path.join(dir, name, ...rest));
  const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  return new Response(body, { headers: { ...headers, "Content-Type": type } });
}
