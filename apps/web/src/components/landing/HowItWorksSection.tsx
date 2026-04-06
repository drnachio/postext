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
    <section className="mx-auto w-full max-w-5xl px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-widest text-slate">
        Workflow
      </p>
      <h2
        className="mt-4 font-display text-3xl font-bold italic tracking-tight"
        style={{ textWrap: "balance" }}
      >
        Three Steps to Publication-Grade Layout
      </h2>

      <div className="mt-16 space-y-0">
        {steps.map((step, index) => (
          <div key={step.number}>
            {index > 0 && (
              <div className="mx-0 border-t border-rule" />
            )}
            <div className="flex gap-8 py-10">
              <span className="font-display text-5xl font-bold italic leading-none text-rule">
                {step.number}
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-lg leading-[1.8] text-slate">
                  {step.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
