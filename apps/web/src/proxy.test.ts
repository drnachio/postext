import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import proxy from "./proxy";

// next-intl's middleware does not resolve under vitest; the negotiation is
// what is tested here, so the locale routing just passes through.
vi.mock("next-intl/middleware", () => ({ default: () => () => NextResponse.next() }));

function run(path: string, accept?: string) {
  const req = new NextRequest(`https://postext.dev${path}`, { headers: accept ? { accept } : {} });
  const res = proxy(req);
  return { rewrite: res.headers.get("x-middleware-rewrite"), vary: res.headers.get("vary") };
}

describe("Markdown negotiation", () => {
  it("serves the rendition to agents that ask for Markdown", () => {
    for (const accept of ["text/markdown", "text/markdown, text/html, */*", "text/markdown;q=1.0, text/html;q=0.7"]) {
      expect(run("/es/docs/configuration", accept).rewrite, accept).toBe("https://postext.dev/md/es/docs/configuration");
    }
    expect(run("/ja/sandbox", "text/markdown").rewrite).toBe("https://postext.dev/md/ja/sandbox");
  });

  it("keeps HTML for browsers and for agents that weigh HTML higher", () => {
    for (const accept of [
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "*/*",
      "text/markdown;q=0.5, text/html",
      "text/markdown;q=0",
    ]) {
      expect(run("/es/docs/configuration", accept).rewrite, accept).toBeNull();
    }
  });

  it("tells caches that the page varies by Accept", () => {
    expect(run("/zh/glossary", "text/html").vary).toMatch(/\bAccept\b/);
  });
});
