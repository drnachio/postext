"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from "react";
import { getCookie, setCookie } from "@/lib/cookies";

const CONSENT_COOKIE = "postext_consent";
const CONSENT_EXPIRY_DAYS = 365;

export interface ConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
}

interface CookieConsentContextValue {
  consent: ConsentState | null;
  updateConsent: (consent: ConsentState) => void;
  resetConsent: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextValue>({
  consent: null,
  updateConsent: () => {},
  resetConsent: () => {},
});

function readConsentCookie(): ConsentState | null {
  const raw = getCookie(CONSENT_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConsentState;
  } catch {
    return null;
  }
}

const subscribe = () => () => {};
const getSnapshot = readConsentCookie;
const getServerSnapshot = (): ConsentState | null => null;

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const initialConsent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [consent, setConsent] = useState<ConsentState | null>(initialConsent);
  const [loaded, setLoaded] = useState(initialConsent !== null);

  // Mark as loaded on the client after first render
  if (!loaded && typeof window !== "undefined") {
    setLoaded(true);
  }

  const updateConsent = useCallback((newConsent: ConsentState) => {
    const value = JSON.stringify({
      ...newConsent,
      timestamp: new Date().toISOString(),
    });
    setCookie(CONSENT_COOKIE, value, CONSENT_EXPIRY_DAYS);
    setConsent(newConsent);
  }, []);

  const resetConsent = useCallback(() => {
    setCookie(CONSENT_COOKIE, "", 0);
    setConsent(null);
  }, []);

  if (!loaded) return <>{children}</>;

  return (
    <CookieConsentContext.Provider
      value={{ consent, updateConsent, resetConsent }}
    >
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  return useContext(CookieConsentContext);
}

export function hasConsent(
  consent: ConsentState | null,
  category: keyof Omit<ConsentState, "necessary">
): boolean {
  return consent?.[category] ?? false;
}
