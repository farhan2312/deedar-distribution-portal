import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LANG, isLang, LANG_COOKIE, type Lang } from "./config";
import { translate } from "./dictionary";

/** Current language from the cookie (server components / actions). */
export async function getLang(): Promise<Lang> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

/** A server-side `t()` bound to the current language. */
export async function getT(): Promise<(key: string) => string> {
  const lang = await getLang();
  return (key: string) => translate(lang, key);
}
