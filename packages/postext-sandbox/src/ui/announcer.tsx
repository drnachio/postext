'use client';

import { useEffect, useState } from 'react';

type Listener = (message: string) => void;
const listeners = new Set<Listener>();

/** Says `message` through the sandbox's polite live region (WCAG 4.1.3):
 *  saving, a finished layout or PDF, an error. Focus does not move. */
export function announce(message: string): void {
  if (!message) return;
  for (const l of listeners) l(message);
}

/** The live region `announce` writes to. Mounted once inside the main
 *  landmark. The same message twice in a row is still read: the text is
 *  cleared first. */
export function SandboxAnnouncer() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    let timer: number | undefined;
    const listener: Listener = (next) => {
      setMessage('');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(next), 60);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <div role="status" className="sr-only">
      {message}
    </div>
  );
}
