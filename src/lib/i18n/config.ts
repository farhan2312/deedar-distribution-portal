export const LANGS = ["en", "hi"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "en";
export const LANG_COOKIE = "lang";

export const LANG_LABEL: Record<Lang, string> = {
  en: "EN",
  hi: "हिं",
};

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "hi";
}
