"use client";

import { useEffect, useRef, useState } from "react";

const EVENT = "cookbook:toast";

/** Shows a short confirmation at the foot of the recipe page. */
export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }));
}

/** Copies `text`, then confirms with `ok` (or reports `failed`). */
export async function copyText(text: string, ok: string, failed: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(ok);
    return true;
  } catch {
    showToast(failed);
    return false;
  }
}

/** The page's one toast: a polite live region, so screen readers hear the
 *  confirmation too. */
export function Toaster() {
  const [message, setMessage] = useState<string | null>(null);
  const [serial, setSerial] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onToast = (event: Event) => {
      setMessage((event as CustomEvent<string>).detail);
      setSerial((n) => n + 1);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), 3600);
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div aria-live="polite" role="status" className="cb-toast-region">
      {message && (
        <p key={serial} className="cb-toast">
          {message}
        </p>
      )}
    </div>
  );
}
