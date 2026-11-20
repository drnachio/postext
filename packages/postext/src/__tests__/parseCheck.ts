// Test setup (vitest.config.ts), on with POSTEXT_PARSE_CHECK=1 (#1647):
// every paragraph reading the parser takes from the ones it kept is read
// again, and must be the same (result and issues, places in the source
// moved), or the test that parsed it fails.

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
if (env?.POSTEXT_PARSE_CHECK === '1') {
  (globalThis as { __postextKeptRunsCheck?: unknown }).__postextKeptRunsCheck = {
    differ(key: string, kept: string, fresh: string): never {
      let at = 0;
      while (at < kept.length && kept[at] === fresh[at]) at++;
      throw new Error(`KEPT-RUN differs at ${at} for ${JSON.stringify(key.slice(0, 120))}\nkept:  ${kept.slice(Math.max(0, at - 80), at + 120)}\nfresh: ${fresh.slice(Math.max(0, at - 80), at + 120)}`);
    },
  };
}
