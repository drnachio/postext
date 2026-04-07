"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
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

// Listeners that get notified when consent changes
const listeners = new Set<() => void>();
function emitChange() {
  for (const listener of listeners) listener();
}

// Cached snapshot — useSyncExternalStore requires referential equality
let cachedRaw: string | null | undefined = undefined;
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
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// hasLoaded: false on server, true on client
function subscribeMounted(): () => void {
  return () => {};
}
function getMounted(): boolean {
  return true;
}
function getServerMounted(): boolean {
  return false;
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hasLoaded = useSyncExternalStore(subscribeMounted, getMounted, getServerMounted);

  const updateConsent = useCallback((newConsent: ConsentState) => {
    const value = JSON.stringify({
      ...newConsent,
      timestamp: new Date().toISOString(),
    });
    setCookie(CONSENT_COOKIE, value, CONSENT_EXPIRY_DAYS);
    // Invalidate cache and notify subscribers
    cachedRaw = undefined;
    emitChange();
  }, []);

  const resetConsent = useCallback(() => {
    setCookie(CONSENT_COOKIE, "", 0);
    cachedRaw = undefined;
    emitChange();
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
