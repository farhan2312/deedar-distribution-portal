"use server";

import { cookies } from "next/headers";
import { isLang, LANG_COOKIE, type Lang } from "./config";

/** Persist the chosen language for a year. Client refreshes after calling. */
export async function setLanguage(lang: Lang) {
  if (!isLang(lang)) return;
  const cookieStore = await cookies();
  cookieStore.set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
