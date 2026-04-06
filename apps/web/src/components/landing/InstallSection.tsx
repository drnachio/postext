import { CodeBlock } from "./CodeBlock";

export function InstallSection() {
  return (
    <section id="install" aria-labelledby="install-heading" className="mx-auto w-full max-w-5xl px-6 py-24 2xl:max-w-6xl 2xl:px-8 2xl:py-32 4xl:max-w-7xl 4xl:px-12 4xl:py-40">
      <p className="font-mono text-xs uppercase tracking-widest text-slate 2xl:text-sm 4xl:text-base">
        Installation
      </p>
      <h2
        id="install-heading"
        className="mt-4 font-display text-3xl font-bold italic tracking-tight 2xl:text-4xl 4xl:text-5xl"
        style={{ textWrap: "balance" }}
      >
        Start in Under a Minute
      </h2>

      <div className="mt-10 max-w-2xl space-y-6 2xl:mt-12 2xl:max-w-3xl 2xl:space-y-8 4xl:mt-16 4xl:max-w-4xl 4xl:space-y-10">
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
