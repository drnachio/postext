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

// Cached snapshot to satisfy useSyncExternalStore's reference-equality requirement
let cachedRaw: string | null = null;
let cachedResult: ConsentState | null = null;

function getSnapshot(): ConsentState | null {
  const raw = getCookie(CONSENT_COOKIE);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    if (raw) {
      try {
        cachedResult = JSON.parse(raw) as ConsentState;
      } catch {
        cachedResult = null;
      }
    } else {
      cachedResult = null;
    }
  }
  return cachedResult;
}

function getServerSnapshot(): ConsentState | null {
  return null;
}

function subscribe(callback: () => void): () => void {
  // Re-check when the document cookie might change (e.g. from another tab)
  const onStorage = () => callback();
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

// Track client mount for hasLoaded
function subscribeMount(callback: () => void): () => void {
  callback();
  return () => {};
}
function getMounted(): boolean {
  return true;
}
function getServerMounted(): boolean {
  return false;
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const initialConsent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hasLoaded = useSyncExternalStore(subscribeMount, getMounted, getServerMounted);
  const [consent, setConsent] = useState<ConsentState | null>(initialConsent);

  const updateConsent = useCallback((newConsent: ConsentState) => {
    const value = JSON.stringify({
      ...newConsent,
      timestamp: new Date().toISOString(),
    });
    setCookie(CONSENT_COOKIE, value, CONSENT_EXPIRY_DAYS);
    // Update cached values so getSnapshot stays in sync
    cachedRaw = getCookie(CONSENT_COOKIE);
    cachedResult = newConsent;
    setConsent(newConsent);
  }, []);

  const resetConsent = useCallback(() => {
    setCookie(CONSENT_COOKIE, "", 0);
    cachedRaw = null;
    cachedResult = null;
    setConsent(null);
  }, []);

  return (
    <CookieConsentContext.Provider
      value={{ consent, hasLoaded, updateConsent, resetConsent }}
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
