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
  hasLoaded: boolean;
  updateConsent: (consent: ConsentState) => void;
  resetConsent: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextValue>({
  consent: null,
  hasLoaded: false,
  updateConsent: () => {},
  resetConsent: () => {},
});

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    consent: ConsentState | null;
    hasLoaded: boolean;
  }>({ consent: null, hasLoaded: false });

  useEffect(() => {
    let consent: ConsentState | null = null;
    const raw = getCookie(CONSENT_COOKIE);
    if (raw) {
      try {
        consent = JSON.parse(raw) as ConsentState;
      } catch {
        // Invalid cookie — treat as no consent
      }
    }
    setState({ consent, hasLoaded: true });
  }, []);

  const updateConsent = useCallback((newConsent: ConsentState) => {
    const value = JSON.stringify({
      ...newConsent,
      timestamp: new Date().toISOString(),
    });
    setCookie(CONSENT_COOKIE, value, CONSENT_EXPIRY_DAYS);
    setState(prev => ({ ...prev, consent: newConsent }));
  }, []);

  const resetConsent = useCallback(() => {
    setCookie(CONSENT_COOKIE, "", 0);
    setState(prev => ({ ...prev, consent: null }));
  }, []);

  return (
    <CookieConsentContext.Provider
      value={{
        consent: state.consent,
        hasLoaded: state.hasLoaded,
        updateConsent,
        resetConsent,
      }}
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
