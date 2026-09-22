import { describe, it, expect } from "vitest";
import { extractFrontmatter, frontmatterFieldSources } from "../frontmatter";

describe("extractFrontmatter", () => {
  it("parses a YAML frontmatter block and strips it from the content", () => {
    const input = `---
title: "Hello"
subtitle: "World"
author: "Ignacio"
publishDate: "2026-04-14"
---

# Heading

Body text.`;

    const { metadata, content } = extractFrontmatter(input);

    expect(metadata.title).toBe("Hello");
    expect(metadata.subtitle).toBe("World");
    expect(metadata.author).toBe("Ignacio");
    expect(metadata.publishDate).toBe("2026-04-14");
    expect(content.trimStart().startsWith("# Heading")).toBe(true);
    expect(content.includes("---")).toBe(false);
  });

  it("returns empty metadata when no frontmatter is present", () => {
    const input = `# Heading\n\nBody text.`;
    const { metadata, content } = extractFrontmatter(input);

    expect(metadata).toEqual({});
    expect(content).toBe(input);
  });

  it("preserves unknown keys for future extension", () => {
    const input = `---
title: "T"
customKey: "custom value"
---

Body`;
    const { metadata } = extractFrontmatter(input);
    expect(metadata.title).toBe("T");
    expect(metadata.customKey).toBe("custom value");
  });

  it("records the source range of every field value, quotes excluded", () => {
    const input = `---\ntitle: "Hello world"\nauthor: Ignacio\nsubtitle:   'Sub'  \n---\n\n# Heading`;
    const { fieldSources } = extractFrontmatter(input);
    expect(fieldSources).toBeDefined();
    const slice = (k: string) => input.slice(fieldSources![k]!.start, fieldSources![k]!.end);
    expect(slice("title")).toBe("Hello world");
    expect(slice("author")).toBe("Ignacio");
    expect(slice("subtitle")).toBe("Sub");
    expect(frontmatterFieldSources("# No frontmatter")).toBeUndefined();
    expect(extractFrontmatter("# Heading").fieldSources).toBeUndefined();
  });
});
