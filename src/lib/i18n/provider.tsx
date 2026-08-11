"use client";

import { createContext, useCallback, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LANG, type Lang } from "./config";
import { translate } from "./dictionary";
import { setLanguage } from "./actions";

type LanguageContextValue = {
  lang: Lang;
  /** Optimistically switch language, persist it, and refresh server components. */
  setLang: (lang: Lang) => void;
  pending: boolean;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ lang: initial, children }: { lang: Lang; children: React.ReactNode }) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initial);
  const [pending, startTransition] = useTransition();

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next); // optimistic — client components re-render immediately
      startTransition(async () => {
        await setLanguage(next);
        router.refresh(); // re-render server components with the new language
      });
    },
    [router],
  );

  const t = useCallback((key: string) => translate(lang, key), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, pending, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback for any client component rendered outside the provider.
    return { lang: DEFAULT_LANG, setLang: () => {}, pending: false, t: (k) => k };
  }
  return ctx;
}

/** Convenience hook returning just the `t()` function. */
export function useT(): (key: string) => string {
  return useLanguage().t;
}
