import { CodeBlock } from "./CodeBlock";

export function InstallSection() {
  return (
    <section id="install" className="mx-auto w-full max-w-5xl px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-widest text-slate">
        Installation
      </p>
      <h2
        className="mt-4 font-display text-3xl font-bold italic tracking-tight"
        style={{ textWrap: "balance" }}
      >
        Start in Under a Minute
      </h2>

      <div className="mt-10 max-w-2xl space-y-6">
        <CodeBlock code="pnpm add postext">
          <span className="syntax-comment"># Install with your package manager</span>
          {"\n"}
          <span className="text-foreground">pnpm add postext</span>
        </CodeBlock>

        <CodeBlock code={`import { createLayout } from "postext";\n\nconst Page = createLayout({\n  markdown: "# Hello World\\n\\nYour content here.",\n});\n\nexport default Page;`}>
          <span className="syntax-comment">{`// Quick start`}</span>
          {"\n"}
          <span className="syntax-keyword">import</span>{" "}
          {"{ createLayout }"}{" "}
          <span className="syntax-keyword">from</span>{" "}
          <span className="syntax-string">{'"postext"'}</span>;{"\n"}
          {"\n"}
          <span className="syntax-keyword">const</span> Page = createLayout({"{"}{"\n"}
          {"  "}markdown: <span className="syntax-string">{'"# Hello World\\n\\nYour content here."'}</span>,{"\n"}
          {"}"});{"\n"}
          {"\n"}
          <span className="syntax-keyword">export default</span> Page;
        </CodeBlock>
      </div>
    </section>
  );
}
