import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import zh from "../../../../messages/zh.json";

// A Sandbox string lives in six places: the `SandboxLabels` interface, its
// English defaults, this bridge, and the English, Spanish and Chinese
// messages. A key missing from one of them shows the key itself (or the
// English default) in the Spanish or Chinese interface.

const root = path.resolve(__dirname, "../../../../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const interfaceKeys = [...read("packages/postext-sandbox/src/types/labels.ts").matchAll(/^ {2}([A-Za-z0-9_]+)\??: string;/gm)].map((m) => m[1]!);
const defaultKeys = [...read("packages/postext-sandbox/src/types/defaultLabels.ts").matchAll(/^ {2}([A-Za-z0-9_]+):/gm)].map((m) => m[1]!);
const bridgeKeys = [...read("apps/web/src/components/sandbox/SandboxPage/labels.ts").matchAll(/^ {4}([A-Za-z0-9_]+): t\("([^"]+)"\)/gm)].map((m) => {
  expect(m[1], "a bridge entry reads its own key").toBe(m[2]);
  return m[1]!;
});
const enKeys = Object.keys((en as { Sandbox: Record<string, string> }).Sandbox);
const esKeys = Object.keys((es as { Sandbox: Record<string, string> }).Sandbox);
const zhKeys = Object.keys((zh as { Sandbox: Record<string, string> }).Sandbox);

describe("Sandbox labels", () => {
  it("are declared, defaulted, bridged and translated alike", () => {
    const sorted = (keys: string[]) => [...new Set(keys)].sort();
    const expected = sorted(interfaceKeys);
    expect(expected.length).toBeGreaterThan(1900);
    expect(sorted(defaultKeys)).toEqual(expected);
    expect(sorted(bridgeKeys)).toEqual(expected);
    // The messages also hold the page's own strings (its title and
    // description), in every language.
    expect(expected.filter((k) => !enKeys.includes(k)), "missing in en.json").toEqual([]);
    expect(expected.filter((k) => !esKeys.includes(k)), "missing in es.json").toEqual([]);
    expect(expected.filter((k) => !zhKeys.includes(k)), "missing in zh.json").toEqual([]);
    expect(sorted(esKeys)).toEqual(sorted(enKeys));
    expect(sorted(zhKeys)).toEqual(sorted(enKeys));
  });

  it("keep every placeholder token in the Chinese messages", () => {
    // `__n__`-style tokens are replaced in code: a translation that drops
    // or renames one shows the raw token, or loses the value.
    const tokens = (s: string) => [...s.matchAll(/__[A-Za-z0-9]+__/g)].map((m) => m[0]).sort();
    const enSandbox = (en as { Sandbox: Record<string, string> }).Sandbox;
    const zhSandbox = (zh as { Sandbox: Record<string, string> }).Sandbox;
    const broken = Object.keys(enSandbox).filter((k) => zhSandbox[k] !== undefined && tokens(zhSandbox[k]!).join() !== tokens(enSandbox[k]!).join());
    expect(broken).toEqual([]);
  });

  it("carry the Writing system group in both languages", () => {
    const sandbox = (m: unknown) => (m as { Sandbox: Record<string, string> }).Sandbox;
    expect(sandbox(en).settingsGroupWriting).toBe("Writing system");
    expect(sandbox(es).settingsGroupWriting).toBe("Escritura");
    expect(sandbox(es).chineseDefaults).toBe("Ajustes para chino");
  });
});
