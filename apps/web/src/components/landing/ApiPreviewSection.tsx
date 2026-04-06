import { CodeBlock } from "./CodeBlock";

const codeRaw = `import { createLayout } from "postext";

const Article = createLayout(
  {
    markdown: content,
    resources: [
      { id: "hero", type: "image", src: "/hero.jpg", width: 800, height: 400 },
    ],
    notes: [
      { id: "1", type: "footnote", content: "Additional context." },
    ],
  },
  {
    columns: 2,
    gutter: "2rem",
    typography: {
      orphans: 2,
      widows: 2,
      hyphenation: true,
    },
    references: {
      footnotes: { placement: "columnBottom" },
    },
  }
);`;

export function ApiPreviewSection() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-widest text-slate">
        API
      </p>
      <h2
        className="mt-4 font-display text-3xl font-bold italic tracking-tight"
        style={{ textWrap: "balance" }}
      >
        One Function, Full Control
      </h2>
      <p className="mt-4 max-w-2xl leading-[1.8] text-slate">
        Call <code className="font-mono text-foreground">createLayout</code>{" "}
        with your content and a configuration object. Get back a React component
        laid out to your specifications.
      </p>

      <div className="mt-10">
        <CodeBlock code={codeRaw}>
          <span className="syntax-keyword">import</span>{" "}
          {"{ createLayout }"}{" "}
          <span className="syntax-keyword">from</span>{" "}
          <span className="syntax-string">{'"postext"'}</span>;{"\n"}
          {"\n"}
          <span className="syntax-keyword">const</span> Article = createLayout({"\n"}
          {"  "}{"{"}{"\n"}
          {"    "}markdown: content,{"\n"}
          {"    "}resources: [{"\n"}
          {"      "}{"{"} id: <span className="syntax-string">{'"hero"'}</span>, type: <span className="syntax-string">{'"image"'}</span>, src: <span className="syntax-string">{'"hero.jpg"'}</span>, width: <span className="syntax-value">800</span>, height: <span className="syntax-value">400</span> {"}"},
{"\n"}
          {"    "}],{"\n"}
          {"    "}notes: [{"\n"}
          {"      "}{"{"} id: <span className="syntax-string">{'"1"'}</span>, type: <span className="syntax-string">{'"footnote"'}</span>, content: <span className="syntax-string">{'"Additional context."'}</span> {"}"},
{"\n"}
          {"    "}],{"\n"}
          {"  "}{"}"},{"\n"}
          {"  "}{"{"}{"\n"}
          {"    "}columns: <span className="syntax-value">2</span>,{"\n"}
          {"    "}gutter: <span className="syntax-string">{'"2rem"'}</span>,{"\n"}
          {"    "}typography: {"{"}{"\n"}
          {"      "}orphans: <span className="syntax-value">2</span>,{"\n"}
          {"      "}widows: <span className="syntax-value">2</span>,{"\n"}
          {"      "}hyphenation: <span className="syntax-value">true</span>,{"\n"}
          {"    "}{"}"},{"\n"}
          {"    "}references: {"{"}{"\n"}
          {"      "}footnotes: {"{"} placement: <span className="syntax-string">{'"columnBottom"'}</span> {"}"},
{"\n"}
          {"    "}{"}"},{"\n"}
          {"  "}{"}"}{"\n"}
          );
        </CodeBlock>
      </div>
    </section>
  );
}
