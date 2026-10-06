import { describe, expect, it } from "vitest";
import { chainedBundleParts } from "../../../scripts/cookbook/lib/probe.js";

// The Sandbox bundle of a capture whose `capture.doc` lists several builds
// chained with `continuation` (#540): a book, one chapter per build.

const config = { page: { dpi: 150 } };
const build = (markdown: string, resources: { id: string }[], continuation?: object, own = config) => ({
  kind: "document", config: own, content: { markdown, resources, ...(continuation ? { continuation } : {}) },
});

describe("chainedBundleParts (#540)", () => {
  it("makes a chapter of each chained build, with every build's resources", () => {
    const parts = chainedBundleParts([
      build("# First article\n\nText.", [{ id: "a" }, { id: "shared" }]),
      build("# Second *article*\n\nText.", [{ id: "shared" }, { id: "b" }], { pageIndexOffset: 3, headings: { h1: 0 } }),
    ], "Bulletin");
    expect(parts!.chapters.map((c) => c.title)).toEqual(["First article", "Second article"]);
    expect(parts!.chapters[1].markdown).toBe("# Second *article*\n\nText.");
    expect(parts!.resources.map((r) => r.id)).toEqual(["a", "shared", "b"]);
    expect(parts!.notes).toEqual(["build 2: continuation.headings not carried (the Sandbox chains the chapters itself)"]);
  });

  it("reports a build whose configuration differs", () => {
    const parts = chainedBundleParts([
      build("# One", []),
      build("# Two", [], { pageIndexOffset: 2 }, { page: { dpi: 300 } }),
    ]);
    expect(parts!.notes).toEqual(["build 2: its configuration differs from the first's, which the book keeps"]);
  });

  it("leaves builds that do not chain (two editions) to the first build", () => {
    expect(chainedBundleParts([build("# En", []), build("# Es", [])])).toBeNull();
    expect(chainedBundleParts([build("# One", [])])).toBeNull();
    expect(chainedBundleParts(undefined)).toBeNull();
  });
});
