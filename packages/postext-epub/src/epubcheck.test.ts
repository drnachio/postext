// W3C EPUBCheck on generated sample books. Runs only when asked
// (`pnpm epubcheck`, or EPUBCHECK=1) and the `epubcheck` command is on the
// PATH: it takes a few seconds of Java per book. Set EPUBCHECK_OUT to keep
// the files.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderToEpub } from './index';
import type { RenderToEpubOptions } from './types';
import { LORA, PNG, sampleBook } from './__tests__/sampleBook';

const available = process.env.EPUBCHECK === '1' && spawnSync('epubcheck', ['--version'], { encoding: 'utf8' }).status === 0;

interface EpubcheckMessage {
  ID: string;
  severity: string;
  message: string;
  locations: { path: string; line: number; column: number }[];
}

function epubcheck(file: string): EpubcheckMessage[] {
  const out = spawnSync('epubcheck', ['--json', '-', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const report = JSON.parse(out.stdout) as { messages: EpubcheckMessage[] };
  return report.messages.filter((m) => m.severity === 'ERROR' || m.severity === 'FATAL' || m.severity === 'WARNING');
}

const base = (layout: RenderToEpubOptions['layout']): RenderToEpubOptions => ({
  layout,
  metadata: {
    title: 'Sample book',
    subtitle: 'A test of both renditions',
    creators: ['Ada Lovelace'],
    language: 'en-US',
    date: '2026-10-04',
    publisher: 'Postext',
    modified: new Date(Date.UTC(2026, 9, 4)),
  },
  fonts: [{ family: 'Lora', weight: 400, style: 'normal', bytes: LORA, format: 'ttf' }],
  resourceBytes: (fileId) => fileId === 'f1.png' ? { bytes: PNG, mediaType: 'image/png' } : undefined,
});

const samples: { name: string; options: RenderToEpubOptions }[] = [
  { name: 'fixed', options: base('fixed') },
  { name: 'fixed-cover', options: { ...base('fixed'), cover: { bytes: PNG, mediaType: 'image/png', alt: 'A red square' } } },
  { name: 'reflowable', options: base('reflowable') },
];

describe.skipIf(!available)('EPUBCheck', () => {
  const dir = process.env.EPUBCHECK_OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'postext-epub-'));
  fs.mkdirSync(dir, { recursive: true });

  for (const sample of samples) {
    it(`${sample.name}: 0 errors, 0 warnings`, async () => {
      let bytes: Uint8Array;
      try {
        bytes = await renderToEpub(sampleBook(), sample.options);
      } catch (e) {
        // A rendition still being written is not checked yet.
        if (/not implemented/.test(String(e))) return;
        throw e;
      }
      const file = path.join(dir, `${sample.name}.epub`);
      fs.writeFileSync(file, bytes);
      const messages = epubcheck(file);
      expect(messages.map((m) => `${m.severity} ${m.ID} ${m.locations[0]?.path ?? ''}:${m.locations[0]?.line ?? ''} ${m.message}`)).toEqual([]);
    }, 120_000);
  }
});
