"use client";

import { useSyncExternalStore } from "react";

/**
 * Light/dark theme, stored as `data-theme` on <html> and mirrored to
 * localStorage. Dark is strictly opt-in — we never follow the OS preference,
 * so an existing user's UI can't change under them without asking.
 *
 * `useSyncExternalStore` rather than useState+useEffect: the DOM attribute is
 * the source of truth (an inline script in the root layout sets it before first
 * paint to avoid a white flash), and this is the sanctioned way to read
 * external state without a hydration mismatch or a setState inside an effect —
 * which React 19's lint rejects.
 */
export type Theme = "light" | "dark";

export const THEME_KEY = "deedar_theme";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** The server has no DOM and never opts in, so it always renders light. */
function getServerSnapshot(): Theme {
  return "light";
}

export function setTheme(next: Theme) {
  if (next === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    window.localStorage.setItem(THEME_KEY, next);
  } catch {
    // Private mode / storage blocked: the choice just won't survive a reload.
  }
  for (const l of listeners) l();
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    theme,
    isDark: theme === "dark",
    setTheme,
    toggle: () => setTheme(theme === "dark" ? "light" : "dark"),
  };
}
