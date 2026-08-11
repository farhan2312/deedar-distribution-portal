"use client";

import { LANGS, LANG_LABEL } from "@/lib/i18n/config";
import { useLanguage } from "@/lib/i18n/provider";

/**
 * Compact EN / हिं segmented toggle. `variant="dark"` reads on the dark
 * sidebar; `variant="light"` (default) reads on light backgrounds (auth pages).
 */
export function LanguageToggle({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { lang, setLang, pending } = useLanguage();
  const trackBg = variant === "dark" ? "rgba(255,255,255,.1)" : "var(--bg-soft)";

  return (
    <div
      className="inline-flex gap-0.5 rounded-full p-[3px]"
      style={{ background: trackBg, opacity: pending ? 0.7 : 1 }}
      role="group"
      aria-label="Language"
    >
      {LANGS.map((l) => {
        const active = lang === l;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={active}
            className="rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#fff" : variant === "dark" ? "rgba(255,255,255,.7)" : "var(--ink-2)",
              cursor: "pointer",
            }}
          >
            {LANG_LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}
