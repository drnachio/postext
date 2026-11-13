'use client';

// The words the dictionary keeps whole (#699) and their files (#1530): the
// list for every language (`hyphenation.exceptions`) or one language's
// (`hyphenation.exceptionsByLanguage`), typed, imported from a file and
// exported to one.

import { useContext, useRef, useState } from 'react';
import {
  ALL_LANGUAGES_KEY,
  formatHyphenationExceptionsFile,
  matchHyphenationLocale,
  mergeHyphenationExceptionsFile,
  normalizeHyphenationExceptions,
  parseHyphenationExceptionsFile,
  withHyphenationExceptions,
} from 'postext';
import type { BodyTextConfig, ChapterStyleConfig, HyphenationConfig, ResolvedBodyTextConfig } from 'postext';
import { SelectInput, TextInput } from '../../../../controls/index.js';
import { FieldLayerContext, type FieldLayerValue } from '../../../../controls/fieldLayer.js';
import { useSandboxSelector, type useSandboxLabels } from '../../../../context/SandboxContext.js';
import { Button, Tooltip, announce } from '../../../../ui/index.js';
import { downloadBytes } from '../../../../storage/persistence.js';
import { localeDisplayName } from '../../../../presets/localeNames.js';

interface HyphenationExceptionsFieldProps {
  bodyText: ResolvedBodyTextConfig;
  raw: BodyTextConfig | undefined;
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

/** The words of `text`, separated by spaces, commas or semicolons, as the
 *  engine keeps them: checked, without duplicates, sorted. */
export function parseHyphenationExceptions(text: string): string[] | undefined {
  return normalizeHyphenationExceptions(text.split(/[\s,;]+/));
}

/** The languages that can have a list of their own, one tag per
 *  dictionary, in the order given; a language with no patterns of its own
 *  has none. */
function oneTagPerDictionary(tags: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const dictionary = tag ? matchHyphenationLocale(tag) : undefined;
    if (!tag || !dictionary || seen.has(dictionary)) continue;
    seen.add(dictionary);
    out.push(tag);
  }
  return out;
}

/** The languages the passages of `markdown` name (`:::paragraphs{lang=fr}`,
 *  `:ltr[…]{lang=fr}`, a poem's `{lang=fr}`), in the order they come:
 *  their words are divided with their own dictionary and list (#1547). */
export function passageLanguages(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(/\{[^}\n]*?\blang=["']?([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*)/g)) out.push(m[1]!);
  return out;
}

/** The languages the list select offers besides every language's list:
 *  - the editions of a book in several languages, in the scope of every
 *    language;
 *  - in one edition's scope, its own language once it has a list (the
 *    edition's `exceptions` is its own list already);
 *  - the languages chapter styles divide with (`hyphenation.locale`);
 *  - the languages passages of the text name (`passages`, #1547);
 *  - the languages that already have a list.
 *  A book with one language and no such chapter has none. */
export function exceptionListLanguages(input: {
  layer: Pick<FieldLayerValue, 'scope' | 'locale' | 'locales' | 'wording'> | null;
  documentTag: string;
  chapterStyles: readonly ChapterStyleConfig[] | undefined;
  stored: Record<string, unknown> | undefined;
  passages?: readonly string[];
}): string[] {
  const { layer, documentTag, chapterStyles, stored, passages = [] } = input;
  const styled = (chapterStyles ?? []).map((s) => (s.config as { bodyText?: BodyTextConfig }).bodyText?.hyphenation?.locale ?? undefined);
  const kept = Object.keys(stored ?? {});
  const languages = layer && !layer.wording ? layer.locales : [documentTag];
  if (layer && !layer.wording && layer.scope === 'edition') {
    const own = matchHyphenationLocale(layer.locale);
    const hasOwn = kept.some((tag) => own !== undefined && matchHyphenationLocale(tag) === own);
    return oneTagPerDictionary([...(hasOwn ? [layer.locale] : []), ...styled, ...passages]);
  }
  const all = oneTagPerDictionary([...languages, ...styled, ...passages, ...kept]);
  return all.length > 1 || kept.length > 0 ? all : [];
}

/** `raw`'s hyphenation with one list replaced; an empty list takes the
 *  field out. */
function withList(raw: BodyTextConfig | undefined, words: readonly string[] | undefined, language: string): HyphenationConfig | undefined {
  const { exceptions, exceptionsByLanguage, ...rest } = raw?.hyphenation ?? {};
  const lists = withHyphenationExceptions({ exceptions, exceptionsByLanguage }, words, language);
  const next: HyphenationConfig = {
    ...rest,
    ...(lists.exceptions ? { exceptions: lists.exceptions } : {}),
    ...(lists.exceptionsByLanguage ? { exceptionsByLanguage: lists.exceptionsByLanguage } : {}),
  };
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The words the dictionary keeps whole or divides only where they say.
 *  Typed freely and stored when the field is left, so a half-typed word
 *  never reaches the layout. Import merges a file into the list chosen
 *  (a file of lists by language into each of them), Export writes the
 *  list chosen to a file. */
export function HyphenationExceptionsField({ bodyText, raw, updateBodyText, labels }: HyphenationExceptionsFieldProps) {
  const layer = useContext(FieldLayerContext);
  const uiLocale = useSandboxSelector((s) => s.locale);
  const chapterStyles = useSandboxSelector((s) => s.config.chapterStyles);
  const markdown = useSandboxSelector((s) => s.markdown) ?? '';
  const documentTag = bodyText.hyphenation.tag ?? bodyText.hyphenation.locale;
  const languages = exceptionListLanguages({ layer, documentTag, chapterStyles, stored: raw?.hyphenation?.exceptionsByLanguage, passages: passageLanguages(markdown) });
  const [chosen, setChosen] = useState<string>(ALL_LANGUAGES_KEY);
  const list = languages.includes(chosen) ? chosen : ALL_LANGUAGES_KEY;
  const all = list === ALL_LANGUAGES_KEY;
  const dictionary = all ? undefined : matchHyphenationLocale(list);
  const words = (all ? bodyText.hyphenation.exceptions : dictionary ? bodyText.hyphenation.exceptionsByLanguage?.[dictionary] : undefined) ?? [];
  const stored = words.join(', ');
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const write = (next: readonly string[] | undefined) => {
    if ((next ?? []).join(', ') === stored) return;
    updateBodyText({ hyphenation: withList(raw, next, list) });
  };
  const commit = () => {
    if (draft === null) return;
    const next = parseHyphenationExceptions(draft);
    setDraft(null);
    write(next);
  };
  const say = (message: string) => {
    setStatus(message);
    announce(message);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      say(labels.bodyHyphenationExceptionsImportFailed.replace('__file__', file.name));
      return;
    }
    const merged = mergeHyphenationExceptionsFile(raw?.hyphenation, parseHyphenationExceptionsFile(text), list);
    setDraft(null);
    if (merged.added + merged.replaced > 0) {
      updateBodyText({ hyphenation: Object.keys(merged.hyphenation).length > 0 ? merged.hyphenation : undefined });
    }
    const result = labels.bodyHyphenationExceptionsImportResult
      .replace('__added__', String(merged.added))
      .replace('__replaced__', String(merged.replaced))
      .replace('__dropped__', String(merged.dropped));
    const unknown = merged.unknownLanguages.length > 0
      ? ` ${labels.bodyHyphenationExceptionsImportUnknown.replace('__languages__', merged.unknownLanguages.join(', '))}`
      : '';
    say(result + unknown);
  };
  const exportFile = () => {
    const name = all ? 'hyphenation-exceptions.txt' : `hyphenation-exceptions-${list.toLowerCase()}.txt`;
    downloadBytes(formatHyphenationExceptionsFile(words, all ? undefined : list), name, 'text/plain;charset=utf-8');
  };
  const choose = (next: string) => {
    commit();
    setChosen(next);
    setStatus(null);
  };

  return (
    <>
      {languages.length > 0 && (
        <SelectInput
          label={labels.bodyHyphenationExceptionsList}
          value={list}
          options={[
            { value: ALL_LANGUAGES_KEY, label: labels.bodyHyphenationExceptionsAllLanguages },
            ...languages.map((tag) => ({ value: tag, label: localeDisplayName(tag, uiLocale) })),
          ]}
          onChange={choose}
          tooltip={labels.bodyHyphenationExceptionsListTooltip}
          isDefault
        />
      )}
      <TextInput
        label={labels.bodyHyphenationExceptions}
        value={draft ?? stored}
        onChange={setDraft}
        onBlur={commit}
        placeholder="Alice, You-Tube"
        tooltip={labels.bodyHyphenationExceptionsTooltip}
        isDefault={stored === '' && draft === null}
        onReset={() => {
          setDraft(null);
          setStatus(null);
          updateBodyText({ hyphenation: withList(raw, undefined, list) });
        }}
        widthCh={22}
      />
      <div className="flex flex-wrap items-center justify-end gap-2 py-1">
        {status !== null && <span className="text-[12px] text-slate">{status}</span>}
        <Tooltip content={labels.bodyHyphenationExceptionsImportTooltip}>
          <Button onClick={() => fileRef.current?.click()}>{labels.bodyHyphenationExceptionsImport}</Button>
        </Tooltip>
        <Button disabled={words.length === 0} onClick={exportFile}>
          {labels.bodyHyphenationExceptionsExport}
        </Button>
        {/* Reached through the Import button, which names it; the input
            itself stays out of the tab order and of the accessibility tree. */}
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.dic,.tex,.csv,.json,text/plain,application/json"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void importFile(file);
          }}
        />
      </div>
    </>
  );
}
