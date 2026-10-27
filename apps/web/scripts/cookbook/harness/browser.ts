// Finding and launching the Chrome the harness drives.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import type { Browser } from "puppeteer-core";
import { pickChrome, installedChromes, tooOldMessage, CHROME_HELP, chromeTooOld } from "../chrome.ts";

// ─── Chrome ─────────────────────────────────────────────────────────────────

const CFT_BINARIES = [
  "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "chrome-linux64/chrome",
  "chrome-win64/chrome.exe",
];

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** The Chrome to launch (chrome.ts `pickChrome`): COOKBOOK_CHROME, else the
 *  newest Chrome for Testing Puppeteer cached when it is current enough,
 *  else the Chrome installed on the machine. */
export function findChrome(): string {
  const env = process.env.COOKBOOK_CHROME;
  if (env && !fs.existsSync(env)) throw new Error(`COOKBOOK_CHROME does not exist: ${env}`);
  const root = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
  const cached = (fs.existsSync(root) ? fs.readdirSync(root) : [])
    .map((dir) => ({ dir, version: /-(\d+\.\d+\.\d+\.\d+)$/.exec(dir)?.[1] }))
    .filter((entry): entry is { dir: string; version: string } => !!entry.version)
    .flatMap(({ dir, version }) =>
      CFT_BINARIES.map((bin) => ({ file: path.join(root, dir, bin), version })).filter(({ file }) => fs.existsSync(file)),
    )
    .sort((a, b) => compareVersions(b.version, a.version));
  const choice = pickChrome({ env, cached, installed: installedChromes() });
  if (!choice) {
    throw new Error(cached.length
      ? `${tooOldMessage(cached[0].version, cached[0].file)} No other Chrome is installed.`
      : `No Chrome found (none in ~/.cache/puppeteer/chrome, none installed): ${CHROME_HELP}.`);
  }
  return choice.file;
}

export interface HarnessBrowser {
  browser: Browser;
  /** "131.0.6778.204" */
  chrome: string;
  userAgent: string;
}

/** `protocolTimeout`: how long one CDP call may stay unanswered
 *  (steps.ts `protocolTimeoutFor`; Puppeteer's own default is 180 s).
 *  A Chrome older than chrome.ts `OLDEST_CHROME` is refused: its pages are
 *  not the ones a reader's browser lays out (#746). */
export async function launchBrowser({ headed = false, protocolTimeout }: { headed?: boolean; protocolTimeout?: number } = {}): Promise<HarnessBrowser> {
  const executablePath = findChrome();
  const browser = await puppeteer.launch({
    executablePath,
    headless: !headed,
    args: ["--no-sandbox", "--hide-scrollbars", "--mute-audio", "--no-first-run", "--no-default-browser-check"],
    defaultViewport: null,
    ...(protocolTimeout ? { protocolTimeout } : {}),
  });
  const version = await browser.version();
  const chrome = /(\d+\.\d+\.\d+\.\d+)/.exec(version)?.[1] ?? version;
  if (chromeTooOld(chrome)) {
    await browser.close().catch(() => {});
    throw new Error(tooOldMessage(chrome, executablePath));
  }
  return { browser, chrome, userAgent: await browser.userAgent() };
}
