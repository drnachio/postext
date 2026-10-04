"use client";

import { SearchIcon } from "lucide-react";
import type { Locale } from "@/lib/cookbook/types";
import { loadCatalog, useCatalog } from "./useGallery";

/** Event the filter bar listens to: the frontispiece hands it what the
 *  reader started typing, and the bar takes over (the frontispiece folds
 *  into a slim header as soon as the gallery is filtered). */
export const HAND_OFF_EVENT = "cookbook:search";

/** Moves what the field holds to the sticky bar and empties the field. */
function handOff(input: HTMLInputElement) {
  const value = input.value;
  if (!value.trim()) return;
  input.value = "";
  window.dispatchEvent(new CustomEvent(HAND_OFF_EVENT, { detail: { value } }));
}

/** The frontispiece's search field. Without JavaScript it is a plain GET
 *  form; with it, the first keystroke moves to the sticky bar's field (once
 *  a composition — a dead key, an IME — has committed its text). When the
 *  catalogue failed to load it is disabled, like the bar. */
export function FrontispieceSearch({
  locale,
  label,
  placeholder,
  unavailable,
}: {
  locale: Locale;
  label: string;
  placeholder: string;
  unavailable: string;
}) {
  const failed = useCatalog(locale).status === "error";
  return (
    <form role="search" aria-label={label} action={`/${locale}/cookbook`} method="get" onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="cb-hero-search" className="sr-only">
        {label}
      </label>
      <div className="relative">
        <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 start-3.5 size-4 -translate-y-1/2 text-mist" />
        <input
          id="cb-hero-search"
          name="q"
          type="search"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={failed ? unavailable : placeholder}
          disabled={failed}
          onFocus={() => loadCatalog(locale)}
          onChange={(e) => {
            if ((e.nativeEvent as InputEvent).isComposing) return;
            handOff(e.currentTarget);
          }}
          onCompositionEnd={(e) => handOff(e.currentTarget)}
          className="cb-search-input h-12 w-full rounded-md bg-white/[0.07] pe-12 ps-10 font-sans text-[0.9rem] text-cream shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] outline-none placeholder:text-mist focus-visible:shadow-[inset_0_0_0_2px_var(--brand-gilt)] disabled:opacity-70"
        />
        <kbd aria-hidden="true" className="cb-kbd pointer-events-none absolute top-1/2 end-3 hidden -translate-y-1/2 sm:block">
          /
        </kbd>
      </div>
    </form>
  );
}
