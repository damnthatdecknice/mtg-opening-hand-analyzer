"use client";

import { useEffect } from "react";

const preferenceKeys = {
  contrast: "mtg-hand-pro:a11y-high-contrast",
  motion: "mtg-hand-pro:a11y-reduced-motion",
  text: "mtg-hand-pro:a11y-large-text",
  theme: "mtg-hand-pro:theme"
};

const themes = [
  { id: "opening-edge", label: "Jace" },
  { id: "nicol-bolas", label: "Nicol Bolas" },
  { id: "karn", label: "Karn" },
  { id: "ajani", label: "Ajani" },
  { id: "teferi", label: "Teferi" },
  { id: "chandra", label: "Chandra" },
  { id: "progenitus", label: "Progenitus" },
  { id: "landscape", label: "Landscape" }
] as const;

export type ThemeId = (typeof themes)[number]["id"];

function isThemeId(value: string | null): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}

function applyPreference(key: string, attr: string, defaultEnabled = false) {
  const saved = window.localStorage.getItem(key);
  const enabled = saved === null ? defaultEnabled : saved === "true";
  document.documentElement.dataset[attr] = enabled ? "true" : "false";
}

function applyThemePreference() {
  const saved = window.localStorage.getItem(preferenceKeys.theme);
  document.documentElement.dataset.theme = isThemeId(saved) ? saved : "opening-edge";
}

export function applyAccessibilityPreferences() {
  applyPreference(preferenceKeys.contrast, "highContrast", true);
  applyPreference(preferenceKeys.motion, "reducedMotion");
  applyPreference(preferenceKeys.text, "largeText");
  applyThemePreference();
}

export function AppPreferences() {
  useEffect(() => {
    applyAccessibilityPreferences();

    function handleStorage() {
      applyAccessibilityPreferences();
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return null;
}

export { preferenceKeys, themes };
