"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCookieConsent } from "./CookieConsentProvider";

export function CookieBanner() {
  const t = useTranslations("CookieBanner");
  const { consent, updateConsent } = useCookieConsent();
  const [showCustomize, setShowCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-rule bg-surface/95 p-4 backdrop-blur-sm sm:p-6"
    >
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
            <div className="flex shrink-0 gap-3">
              <button
                onClick={rejectAll}
                className="rounded border border-rule px-4 py-2 text-sm text-foreground transition-colors hover:bg-foreground/5 2xl:text-base"
              >
                {t("rejectAll")}
              </button>
              <button
                onClick={() => setShowCustomize(true)}
                className="rounded border border-rule px-4 py-2 text-sm text-foreground transition-colors hover:bg-foreground/5 2xl:text-base"
              >
                {t("customize")}
              </button>
              <button
                onClick={acceptAll}
                className="rounded bg-gilt px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-gilt-hover 2xl:text-base"
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
                <p className="text-sm text-foreground 2xl:text-base">
                  {t("necessary")}
                </p>
                <p className="text-xs text-slate 2xl:text-sm">
                  {t("necessaryDescription")}
                </p>
              </div>
              <Toggle checked disabled />
            </div>

            {/* Analytics */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground 2xl:text-base">
                  {t("analytics")}
                </p>
                <p className="text-xs text-slate 2xl:text-sm">
                  {t("analyticsDescription")}
                </p>
              </div>
              <Toggle
                checked={analytics}
                onChange={() => setAnalytics(!analytics)}
              />
            </div>

            {/* Marketing */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground 2xl:text-base">
                  {t("marketing")}
                </p>
                <p className="text-xs text-slate 2xl:text-sm">
                  {t("marketingDescription")}
                </p>
              </div>
              <Toggle
                checked={marketing}
                onChange={() => setMarketing(!marketing)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={rejectAll}
                className="rounded border border-rule px-4 py-2 text-sm text-foreground transition-colors hover:bg-foreground/5 2xl:text-base"
              >
                {t("rejectAll")}
              </button>
              <button
                onClick={savePreferences}
                className="rounded bg-gilt px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-gilt-hover 2xl:text-base"
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

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
        checked ? "bg-gilt" : "bg-rule"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span
        className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
