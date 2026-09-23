/** Plain-text responses for the agent-facing routes (Markdown, llms.txt). */
export function textResponse(body: string | null, contentType: string): Response {
  if (body == null) {
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(body, {
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
      "X-Robots-Tag": "noindex, follow",
      Vary: "Accept",
    },
  });
}
