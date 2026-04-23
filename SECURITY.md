# Security Policy

Thank you for taking the time to help keep postext and its users safe. This document explains how to report vulnerabilities, what is in scope, and what you can expect after you report.

## Supported Versions

postext is distributed on npm as [`postext`](https://www.npmjs.com/package/postext). While the library is pre-1.0 and the API is still stabilizing, only the latest `0.x` release line receives security fixes.

| Version              | Supported                |
| -------------------- | ------------------------ |
| Latest `0.x` minor   | Yes                      |
| Older `0.x` versions | No — please upgrade      |

Once postext reaches `1.0`, this table will be updated to cover the current major plus the previous one.

## Reporting a Vulnerability

**Please do not open a public GitHub issue, pull request, or discussion for a suspected security problem.** Public reports can put users at risk before a fix is available.

Use one of the following private channels instead:

1. **Preferred — GitHub Private Vulnerability Reporting.** Open a private advisory at
   [github.com/drnachio/postext/security/advisories/new](https://github.com/drnachio/postext/security/advisories/new).
   This keeps the report, discussion, and eventual CVE in one place.
2. **Email.** Write to **nacho@a2r.com** with a subject line beginning with `postext security:` followed by a short summary.
   PGP is available on request if you need encrypted correspondence.

### What to include

A good report lets the maintainer reproduce the problem quickly. Please include as much of the following as you can:

- The postext version (and `@chenglou/pretext` version, if relevant).
- The environment: browser and version, Node.js version, or worker context.
- A minimal reproduction — ideally a short snippet of input markdown, configuration, and the postext API call that triggers the issue.
- The observed behavior and the behavior you expected.
- Impact: what an attacker could realistically achieve (e.g. XSS in rendered HTML, prototype pollution, denial of service via crafted input, resource exhaustion in the worker).
- Any suggested mitigation, if you have one.

Please do **not** include real user data, production credentials, or third-party secrets in your report.

## Our Commitments

When you report privately, you can expect:

- **Acknowledgement within 3 business days.** A human will confirm the report was received.
- **Initial triage within 7 business days.** You will get an assessment of severity and whether the issue is in scope.
- **Progress updates** at least every 14 days until the report is closed.
- **Credit in the release notes and the GitHub advisory**, unless you ask to remain anonymous.
- **Coordinated disclosure.** We will agree on a disclosure timeline with you before publishing details. The default is disclosure at patch release; 90 days is the hard upper bound unless we mutually agree to extend it.

postext is maintained by a single person as a community-driven open-source project, not a company. Response times are best-effort within the commitments above; complex issues may take longer to fix, and we will keep you informed if they do.

## Scope

### In scope

Vulnerabilities in code shipped from this repository, including:

- The `postext` npm package (`packages/postext`) — the layout engine, parsers, renderers (HTML and PDF), and the Web Worker entry point (`postext/worker`).
- The demo and documentation site under `apps/web` when running against an official build.
- Build and release tooling in this repository that could be used to compromise the published npm package (e.g. malicious supply-chain paths, unsafe release scripts).

Classes of issue we are particularly interested in:

- **Cross-site scripting** in the HTML renderer output, including injection through enriched markdown, configuration fields, or referenced resources (figures, footnotes, pull quotes, etc.).
- **Prototype pollution**, unsafe deserialization, or unsafe dynamic property access in the layout pipeline.
- **Denial of service** via crafted input that causes unbounded memory use, non-terminating layout convergence, or excessive CPU use on the main thread or in the worker.
- **Worker isolation issues** — e.g. ways a malicious document could escape the worker, exfiltrate fonts or data, or corrupt shared caches.
- **PDF renderer** issues that produce malformed or unsafe PDFs (e.g. embedded active content, font-loading exploits).
- **Supply-chain integrity** issues affecting how `postext` is built and published to npm.

### Out of scope

- Vulnerabilities in third-party dependencies (e.g. `@chenglou/pretext`, `mathjax-full`, `hypher`, `gray-matter`). Please report those upstream. If the vulnerability is triggered *through* postext in a way the upstream project would not consider a bug, that **is** in scope.
- Missing security headers, TLS configuration, or rate limiting on `postext.dev` or other externally hosted surfaces not built from this repository.
- Denial of service through obviously adversarial inputs that exceed documented limits (e.g. multi-gigabyte markdown, pathological configuration values) unless the impact is disproportionate to the input.
- Self-XSS, clickjacking on pages without sensitive state, and issues that require a compromised local machine or a malicious browser extension.
- Best-practice findings without a demonstrable security impact (e.g. "library X is outdated" without a concrete vulnerable code path).
- Automated scanner output submitted without a working proof of concept.

## Safe Harbor

We will not pursue or support legal action against researchers who:

- Make a good-faith effort to follow this policy.
- Avoid privacy violations, data destruction, and service degradation for other users.
- Use only their own accounts and test data, or accounts for which they have explicit permission.
- Give us a reasonable opportunity to remediate before public disclosure.

If in doubt, contact us first at **nacho@a2r.com** and we will work with you.

## Security Considerations for Users

postext is a layout engine. It turns semantic content and configuration into layout geometry and renders it to HTML or PDF. A few things are worth keeping in mind when you embed it in your own application:

- **Treat input as untrusted.** If you pass user-authored markdown or configuration into `buildDocument`, apply the same sanitization posture you would for any other templating engine. The HTML renderer aims to escape text content, but user-supplied HTML, URLs in figures and links, and configuration values should be validated at your application boundary.
- **Run heavy layouts in a Web Worker.** The `postext/worker` entry point isolates the pipeline from the main thread and supports `AbortSignal` cancellation. This is the recommended path for any interactive integration.
- **Keep dependencies up to date.** You should audit your own lockfile regularly. Subscribe to this repository's releases to be notified of security-relevant fixes.
- **Pin a known-good version** in production and review the changelog before upgrading across a minor bump while the project is still pre-1.0.

## Public Disclosure and Advisories

Fixed vulnerabilities are published as GitHub Security Advisories on this repository and, where applicable, as npm advisories against the `postext` package. Release notes call out security fixes explicitly with a `Security` heading so downstream consumers can identify them at a glance.

Thank you for helping make postext safer for everyone who relies on it.
