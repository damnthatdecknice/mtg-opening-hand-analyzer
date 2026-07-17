"use client";

import { useEffect } from "react";

const preferenceKeys = {
  contrast: "mtg-hand-pro:a11y-high-contrast",
  motion: "mtg-hand-pro:a11y-reduced-motion",
  text: "mtg-hand-pro:a11y-large-text"
};

function applyPreference(key: string, attr: string) {
  const enabled = window.localStorage.getItem(key) === "true";
  document.documentElement.dataset[attr] = enabled ? "true" : "false";
}

export function applyAccessibilityPreferences() {
  applyPreference(preferenceKeys.contrast, "highContrast");
  applyPreference(preferenceKeys.motion, "reducedMotion");
  applyPreference(preferenceKeys.text, "largeText");
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

export { preferenceKeys };
