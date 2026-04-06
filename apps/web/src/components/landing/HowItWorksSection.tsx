const steps = [
  {
    number: "01",
    title: "Write Semantic Markdown",
    description:
      "Author your content in enriched markdown with resource references and footnote markers. No layout concerns — just content.",
  },
  {
    number: "02",
    title: "Configure Layout Rules",
    description:
      "Define columns, typography rules, resource placement strategies, and section overrides in a PostextConfig object.",
  },
  {
    number: "03",
    title: "Render React Components",
    description:
      "Call createLayout and receive a React component with pixel-perfect editorial layout — ready for the web or PDF.",
  },
];

export function HowItWorksSection() {
  return (
    <section aria-labelledby="how-heading" className="mx-auto w-full max-w-5xl px-6 py-24 2xl:max-w-6xl 2xl:px-8 2xl:py-32 4xl:max-w-7xl 4xl:px-12 4xl:py-40">
      <p className="font-mono text-xs uppercase tracking-widest text-slate 2xl:text-sm 4xl:text-base">
        Workflow
      </p>
      <h2
        id="how-heading"
        className="mt-4 font-display text-3xl font-bold italic tracking-tight 2xl:text-4xl 4xl:text-5xl"
        style={{ textWrap: "balance" }}
      >
        Three Steps to Publication-Grade Layout
      </h2>

      <ol className="mt-16 space-y-0 2xl:mt-20 4xl:mt-24" aria-label="Workflow steps">
        {steps.map((step, index) => (
          <li key={step.number}>
            {index > 0 && (
              <div className="mx-0 border-t border-rule" aria-hidden="true" />
            )}
            <div className="flex gap-8 py-10 2xl:gap-10 2xl:py-12 4xl:gap-14 4xl:py-16">
              <span className="font-display text-5xl font-bold italic leading-none text-gilt 2xl:text-6xl 4xl:text-7xl" aria-hidden="true">
                {step.number}
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold tracking-tight 2xl:text-xl 4xl:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-lg leading-[1.8] text-slate 2xl:max-w-xl 2xl:text-lg 4xl:max-w-2xl 4xl:text-xl">
                  {step.description}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
