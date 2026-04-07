import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { createLayout } from "../createLayout";
import type { PostextContent, PostextConfig } from "../types";

describe("createLayout", () => {
  const minimalContent: PostextContent = {
    markdown: "# Hello\n\nA paragraph of text.",
  };

  it("returns a React function component", () => {
    const Layout = createLayout(minimalContent);
    expect(typeof Layout).toBe("function");
  });

  it("returned component has displayName 'PostextLayout'", () => {
    const Layout = createLayout(minimalContent);
    expect(Layout.displayName).toBe("PostextLayout");
  });

  it("returned component renders without throwing", () => {
    const Layout = createLayout(minimalContent);
    // createElement exercises the component function
    expect(() => createElement(Layout)).not.toThrow();
  });

  it("accepts content with resources", () => {
    const content: PostextContent = {
      markdown: "# Article\n\nSome text with a figure reference.",
      resources: [
        {
          id: "fig-1",
          type: "image",
          src: "/photo.jpg",
          alt: "A photo",
          caption: "Figure 1",
          width: 800,
          height: 600,
        },
        {
          id: "tbl-1",
          type: "table",
          content: "| A | B |\n|---|---|\n| 1 | 2 |",
        },
        {
          id: "pq-1",
          type: "pullQuote",
          content: "A compelling quote.",
        },
      ],
    };
    const Layout = createLayout(content);
    expect(Layout.displayName).toBe("PostextLayout");
  });

  it("accepts content with notes", () => {
    const content: PostextContent = {
      markdown: "Text with a footnote reference.",
      notes: [
        { id: "fn-1", type: "footnote", content: "A footnote.", marker: "1" },
        { id: "en-1", type: "endnote", content: "An endnote." },
        { id: "mn-1", type: "marginNote", content: "A margin note." },
      ],
    };
    const Layout = createLayout(content);
    expect(Layout.displayName).toBe("PostextLayout");
  });

  it("accepts a full config object", () => {
    const config: PostextConfig = {
      columns: 2,
      gutter: "2rem",
      columnConfig: {
        count: 2,
        gutter: "2rem",
        columnRule: { width: "1px", style: "solid", color: "#ccc" },
        balancing: true,
      },
      typography: {
        orphans: 2,
        widows: 2,
        hyphenation: true,
        ragOptimization: true,
        spacing: {
          beforeHeading: "1.5em",
          afterHeading: "0.5em",
          beforeFigure: "1em",
          afterFigure: "1em",
          beforeBlockQuote: "1em",
          afterBlockQuote: "1em",
        },
        keepTogether: {
          headingWithParagraph: true,
          figureWithCaption: true,
        },
      },
      resourcePlacement: {
        defaultStrategy: "topOfColumn",
        deferPlacement: false,
        preserveAspectRatio: true,
      },
      references: {
        footnotes: { placement: "columnBottom", marker: "number" },
        figureNumbering: true,
        tableNumbering: true,
        marginNotes: true,
      },
      sectionOverrides: [
        {
          selector: ".intro",
          columns: { count: 1 },
          typography: { orphans: 3 },
        },
      ],
      renderer: "web",
    };
    const Layout = createLayout(minimalContent, config);
    expect(Layout.displayName).toBe("PostextLayout");
  });

  it("accepts config with pdf renderer", () => {
    const Layout = createLayout(minimalContent, { renderer: "pdf" });
    expect(Layout.displayName).toBe("PostextLayout");
  });

  it("works with no config (optional)", () => {
    const Layout = createLayout(minimalContent);
    expect(Layout.displayName).toBe("PostextLayout");
  });

  it("works with empty config", () => {
    const Layout = createLayout(minimalContent, {});
    expect(Layout.displayName).toBe("PostextLayout");
  });

  it("accepts all resource placement strategies", () => {
    const strategies = [
      "topOfColumn",
      "inline",
      "floatLeft",
      "floatRight",
      "fullWidthBreak",
      "margin",
    ] as const;

    for (const strategy of strategies) {
      const Layout = createLayout(minimalContent, {
        resourcePlacement: { defaultStrategy: strategy },
      });
      expect(Layout.displayName).toBe("PostextLayout");
    }
  });
});
