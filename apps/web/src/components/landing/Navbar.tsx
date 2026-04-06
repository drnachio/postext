export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-rule bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-2">
        <a href="/" className="flex items-baseline gap-0 text-xl tracking-tight">
          <span className="font-logo text-5xl font-black text-ink-red">P</span>
          <span className="-ml-2 font-display text-2xl text-foreground">ostext</span>
        </a>
        <div className="flex items-center gap-8">
          <a
            href="#install"
            className="font-body text-sm text-slate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-red"
          >
            Get Started
          </a>
          <a
            href="https://github.com/drnachio/postext"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Postext on GitHub"
            className="font-body text-sm text-slate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-red"
          >
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
