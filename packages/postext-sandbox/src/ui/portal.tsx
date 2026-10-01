'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

/** Where popups (menus, selects, popovers, tooltips) are portaled: a fixed
 *  layer inside the sandbox's main landmark, so a popup is never content
 *  outside every landmark (axe `region`). Undefined outside the sandbox
 *  (tests, a primitive rendered alone): Base UI then portals to the body. */
const PortalContainerContext = createContext<HTMLElement | undefined>(undefined);
const PortalSetterContext = createContext<((el: HTMLElement | null) => void) | null>(null);

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext);
}

/** Holds the layer element for every primitive below it. */
export function PortalProvider({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return (
    <PortalSetterContext value={setEl}>
      <PortalContainerContext value={el ?? undefined}>{children}</PortalContainerContext>
    </PortalSetterContext>
  );
}

/** The layer itself, rendered once inside the main landmark. It covers the
 *  window and takes no pointer events; the popups inside it do. */
export function PortalHost() {
  const setEl = useContext(PortalSetterContext);
  return (
    <div
      ref={setEl ?? undefined}
      data-postext-portal=""
      className="pointer-events-none fixed inset-0 z-50 [&>*]:pointer-events-auto"
    />
  );
}
