import { agentSkillPaths, agentSkillResponse } from "@/lib/agentSkills";

/**
 * Agent skills discovery (`npx skills add https://postext.dev`): `index.json`
 * plus every file of every skill in `plugins/postext/skills/`.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return agentSkillPaths().map((path) => ({ path }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  return agentSkillResponse(path?.length ? path : ["index.json"]);
}
