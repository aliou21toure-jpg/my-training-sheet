"use client";

import { useEffect } from "react";

export type ThemePreference = "system" | "light" | "dark";

/** Writes the theme preference where the pre-paint script reads it, and applies it now. */
export function applyTheme(theme: ThemePreference) {
  try {
    window.localStorage.setItem("mts-theme", theme);
  } catch {
    /* storage unavailable: the OS theme applies */
  }
  window.dispatchEvent(new Event("mts-theme"));
}

/** Keeps this device in line with the preference saved in the database (e.g. changed on another device). */
export function ThemeSync({ theme }: { theme: ThemePreference }) {
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  return null;
}
