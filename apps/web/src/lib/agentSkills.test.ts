import { describe, expect, it } from "vitest";
import path from "node:path";
import { agentSkillPaths, agentSkillResponse, agentSkills, skillFrontmatter } from "./agentSkills";

const DIR = path.join(__dirname, "../../../../plugins/postext/skills");

describe("agent skills discovery", () => {
  it("reads name and description from SKILL.md front matter", () => {
    expect(skillFrontmatter("---\nname: a\ndescription: Does b.\n---\n# A")).toEqual({ name: "a", description: "Does b." });
    expect(skillFrontmatter("---\nname: a\ndescription: >\n  folded\n  text\n---\n")).toEqual({ name: "a", description: "folded text" });
    expect(skillFrontmatter("# no front matter")).toBeNull();
  });

  it("lists the repository's skills with every file", () => {
    const skills = agentSkills(DIR);
    const port = skills.find((s) => s.name === "postext-port");
    expect(port).toBeDefined();
    expect(port!.files).toContain("SKILL.md");
    expect(port!.files).toContain("references/document-format.md");
    expect(port!.files).toContain("scripts/render.mjs");
    expect(port!.files.some((f) => f.includes("__pycache__"))).toBe(false);
  });

  it("serves index.json and the skill files, 404 otherwise", async () => {
    const index = await agentSkillResponse(["index.json"], DIR).json();
    expect(index.skills[0]).toMatchObject({ name: "postext-port" });
    const md = agentSkillResponse(["postext-port", "SKILL.md"], DIR);
    expect(md.status).toBe(200);
    expect(md.headers.get("content-type")).toContain("text/markdown");
    expect(await md.text()).toContain("name: postext-port");
    expect(agentSkillResponse(["postext-port", "..", "..", "package.json"], DIR).status).toBe(404);
    expect(agentSkillResponse(["nope", "SKILL.md"], DIR).status).toBe(404);
  });

  it("enumerates static paths for every file", () => {
    const paths = agentSkillPaths(DIR);
    expect(paths[0]).toEqual(["index.json"]);
    expect(paths).toContainEqual(["postext-port", "references", "playbooks.md"]);
  });
});
