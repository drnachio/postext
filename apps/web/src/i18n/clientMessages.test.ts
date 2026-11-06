import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { CLIENT_NAMESPACES, clientMessages } from "./clientMessages";

const SRC = path.join(__dirname, "..");

/** The namespaces a sandbox-only provider supplies (sandbox layout). */
const SANDBOX_ONLY = new Set(["Sandbox"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("client messages", () => {
  const calls = sourceFiles(SRC).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return [...text.matchAll(/\buseTranslations\s*\(([^)]*)\)/g)].map((m) => ({ file: path.relative(SRC, file), arg: m[1]!.trim() }));
  });

  it("finds the useTranslations calls", () => {
    expect(calls.length).toBeGreaterThan(20);
  });

  it("names every namespace a useTranslations call reads", () => {
    const listed = new Set<string>(CLIENT_NAMESPACES);
    const missing = calls.filter(({ arg }) => {
      const literal = /^["']([^"'.]+)(?:\.[^"']*)?["']$/.exec(arg);
      // A call without a literal namespace could read any of them.
      if (!literal) return true;
      return !listed.has(literal[1]!) && !SANDBOX_ONLY.has(literal[1]!);
    });
    expect(missing, "add the namespace to CLIENT_NAMESPACES (src/i18n/clientMessages.ts)").toEqual([]);
  });

  it("lists namespaces the messages have", () => {
    for (const ns of CLIENT_NAMESPACES) expect(en, ns).toHaveProperty(ns);
  });

  it("keeps only the client namespaces", () => {
    expect(Object.keys(clientMessages(en)).sort()).toEqual([...CLIENT_NAMESPACES].sort());
  });
});
