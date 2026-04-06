"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = getCookie(CONSENT_COOKIE);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ConsentState;
        setConsent(parsed);
      } catch {
        // Invalid cookie — treat as no consent
      }
    }
    setLoaded(true);
  }, []);

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
