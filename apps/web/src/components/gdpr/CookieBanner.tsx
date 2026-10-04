"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCookieConsent } from "./CookieConsentProvider";

export function CookieBanner() {
  const t = useTranslations("CookieBanner");
  const { consent, hasLoaded, updateConsent } = useCookieConsent();
  const [showCustomize, setShowCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Don't render until we've read the cookie on the client
  if (!hasLoaded) return null;

  // Already consented — don't show
  if (consent !== null) return null;

  const acceptAll = () => {
    updateConsent({ necessary: true, analytics: true, marketing: true });
  };

  const rejectAll = () => {
    updateConsent({ necessary: true, analytics: false, marketing: false });
  };

  const savePreferences = () => {
    updateConsent({ necessary: true, analytics, marketing });
  };

  return (
    <div
      ref={bannerRef}
      role="dialog"
      aria-label={t("ariaLabel")}
      className="fixed inset-x-0 bottom-0 z-50 bg-surface/95 p-4 font-sans shadow-[0_-12px_40px_-20px_rgba(0,0,0,0.5)] backdrop-blur-md sm:p-6"
    >
      <div aria-hidden="true" className="tri-stripe absolute inset-x-0 top-0 h-[3px]" />
      <div className="mx-auto max-w-5xl">
        {!showCustomize ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate 2xl:text-base">
              {t.rich("message", {
                privacyLink: (chunks) => (
                  <Link
                    href="/privacy-policy"
                    className="text-foreground underline decoration-rule underline-offset-4 hover:decoration-foreground"
                  >
                    {chunks}
                  </Link>
                ),
                cookieLink: (chunks) => (
                  <Link
                    href="/cookie-policy"
                    className="text-foreground underline decoration-rule underline-offset-4 hover:decoration-foreground"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
            <div className="flex shrink-0 flex-wrap gap-3">
              <button
                onClick={rejectAll}
                className="min-h-10 flex-1 cursor-pointer whitespace-nowrap sm:flex-none rounded border border-rule px-4 py-2 text-sm text-foreground transition-colors hover:bg-foreground/5 2xl:text-base"
              >
                {t("rejectAll")}
              </button>
              <button
                onClick={() => setShowCustomize(true)}
                className="min-h-10 flex-1 cursor-pointer whitespace-nowrap sm:flex-none rounded border border-rule px-4 py-2 text-sm text-foreground transition-colors hover:bg-foreground/5 2xl:text-base"
              >
                {t("customize")}
              </button>
              <button
                onClick={acceptAll}
                className="min-h-10 flex-1 cursor-pointer whitespace-nowrap sm:flex-none rounded-md bg-brand px-4 py-2 font-sans text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover 2xl:text-base"
              >
                {t("acceptAll")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-medium text-foreground 2xl:text-base">
              {t("customizeTitle")}
            </p>

            {/* Necessary — always on */}
            <div className="flex items-center justify-between">
              <div>
                <p id="cookie-necessary" className="text-sm text-foreground 2xl:text-base">
                  {t("necessary")}
                </p>
                <p id="cookie-necessary-desc" className="text-xs text-slate 2xl:text-sm">
                  {t("necessaryDescription")}
                </p>
              </div>
              <Toggle checked disabled id="cookie-necessary" />
            </div>

            {/* Analytics */}
            <div className="flex items-center justify-between">
              <div>
                <p id="cookie-analytics" className="text-sm text-foreground 2xl:text-base">
                  {t("analytics")}
                </p>
                <p id="cookie-analytics-desc" className="text-xs text-slate 2xl:text-sm">
                  {t("analyticsDescription")}
                </p>
              </div>
              <Toggle
                id="cookie-analytics"
                checked={analytics}
                onChange={() => setAnalytics(!analytics)}
              />
            </div>

            {/* Marketing */}
            <div className="flex items-center justify-between">
              <div>
                <p id="cookie-marketing" className="text-sm text-foreground 2xl:text-base">
                  {t("marketing")}
                </p>
                <p id="cookie-marketing-desc" className="text-xs text-slate 2xl:text-sm">
                  {t("marketingDescription")}
                </p>
              </div>
              <Toggle
                id="cookie-marketing"
                checked={marketing}
                onChange={() => setMarketing(!marketing)}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button
                onClick={rejectAll}
                className="min-h-10 cursor-pointer whitespace-nowrap rounded border border-rule px-4 py-2 text-sm text-foreground transition-colors hover:bg-foreground/5 2xl:text-base"
              >
                {t("rejectAll")}
              </button>
              <button
                onClick={savePreferences}
                className="min-h-10 cursor-pointer whitespace-nowrap rounded-md bg-brand px-4 py-2 font-sans text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover 2xl:text-base"
              >
                {t("savePreferences")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A 44 px switch (WCAG 2.5.5) drawing a smaller track; named by the row's
 *  title and described by its line of help. The off track is outlined in
 *  slate so its edge holds 3:1 (1.4.11). */
function Toggle({
  id,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={id}
      aria-describedby={`${id}-desc`}
      disabled={disabled}
      onClick={onChange}
      className={`inline-flex min-h-10 min-w-14 shrink-0 cursor-pointer items-center justify-center rounded-full ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 items-center rounded-full border-2 transition-colors ${
          checked ? "border-brand bg-brand" : "border-slate bg-transparent"
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 rounded-full shadow-sm transition-transform ${
            checked ? "translate-x-5 rtl:-translate-x-5 bg-brand-contrast" : "translate-x-0.5 rtl:-translate-x-0.5 bg-slate"
          }`}
        />
      </span>
    </button>
  );
}
