"use client";

import { useEffect, useState } from "react";
import {
  applyAccessibilityPreferences,
  preferenceKeys,
  themes,
  type ThemeId
} from "@/components/AppPreferences";
import { supabase } from "@/lib/supabase";

type Preferences = {
  contrast: boolean;
  motion: boolean;
  text: boolean;
  theme: ThemeId;
};

const defaultPreferences: Preferences = {
  contrast: true,
  motion: false,
  text: false,
  theme: "opening-edge"
};

function clearLocalAppCaches() {
  const prefixes = [
    "mtg-hand-pro:image-signature:",
    "mtg-hand-pro:last-analyzer-deck-id",
    preferenceKeys.contrast,
    preferenceKeys.motion,
    preferenceKeys.text,
    preferenceKeys.theme
  ];

  for (const key of Object.keys(window.localStorage)) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      window.localStorage.removeItem(key);
    }
  }
}

export function SettingsPanel() {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setPreferences({
      contrast: window.localStorage.getItem(preferenceKeys.contrast) !== "false",
      motion: window.localStorage.getItem(preferenceKeys.motion) === "true",
      text: window.localStorage.getItem(preferenceKeys.text) === "true",
      theme:
        themes.find((theme) => theme.id === window.localStorage.getItem(preferenceKeys.theme))?.id ??
        defaultPreferences.theme
    });
  }, []);

  function updatePreference(key: keyof Preferences, value: boolean) {
    const storageKey =
      key === "contrast"
        ? preferenceKeys.contrast
        : key === "motion"
          ? preferenceKeys.motion
          : preferenceKeys.text;

    window.localStorage.setItem(storageKey, String(value));
    setPreferences((current) => ({ ...current, [key]: value }));
    applyAccessibilityPreferences();
  }

  function updateTheme(value: ThemeId) {
    window.localStorage.setItem(preferenceKeys.theme, value);
    setPreferences((current) => ({ ...current, theme: value }));
    applyAccessibilityPreferences();
  }

  async function deleteAllAccountData() {
    setMessage("");

    if (confirmText !== "DELETE") {
      setMessage("Type DELETE to confirm account-data deletion.");
      return;
    }

    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    setIsDeleting(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setIsDeleting(false);
      setMessage("Sign in before deleting account data.");
      return;
    }

    const userId = userData.user.id;
    const deletes = await Promise.all([
      supabase.from("hand_sessions").delete().eq("user_id", userId),
      supabase.from("rating_entries").delete().eq("user_id", userId),
      supabase.from("decks").delete().eq("user_id", userId)
    ]);

    setIsDeleting(false);

    const failure = deletes.find((result) => result.error);
    if (failure?.error) {
      setMessage(failure.error.message);
      return;
    }

    clearLocalAppCaches();
    setPreferences(defaultPreferences);
    setConfirmText("");
    applyAccessibilityPreferences();
    setMessage("Deleted saved decks, tracked hands, rating entries, and local app caches.");
  }

  return (
    <section className="settings-page">
      <header className="panel dashboard-header">
        <p className="eyebrow">Settings</p>
        <h1>Account Settings</h1>
        <p>Manage app data and accessibility preferences for this browser.</p>
      </header>

      {message ? <p className="form-message">{message}</p> : null}

      <section className="panel settings-panel">
        <div className="section-heading">
          <p className="eyebrow">Accessibility</p>
          <h2>Display Preferences</h2>
        </div>
        <div className="settings-stack">
          <label className="toggle-row">
            <span>
              <strong>Theme</strong>
              <em>Changes the site background and accent palette in this browser.</em>
            </span>
            <select
              className="card-select settings-select"
              onChange={(event) => updateTheme(event.target.value as ThemeId)}
              value={preferences.theme}
            >
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle-row">
            <span>
              <strong>High contrast</strong>
              <em>Increases panel opacity, borders, and text contrast.</em>
            </span>
            <input
              checked={preferences.contrast}
              onChange={(event) => updatePreference("contrast", event.target.checked)}
              type="checkbox"
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>Reduced motion</strong>
              <em>Disables optional transitions and smooth visual effects.</em>
            </span>
            <input
              checked={preferences.motion}
              onChange={(event) => updatePreference("motion", event.target.checked)}
              type="checkbox"
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>Larger text</strong>
              <em>Raises the base text size across the paid app.</em>
            </span>
            <input
              checked={preferences.text}
              onChange={(event) => updatePreference("text", event.target.checked)}
              type="checkbox"
            />
          </label>
        </div>
      </section>

      <section className="panel settings-panel danger-panel">
        <div className="section-heading">
          <p className="eyebrow">Danger zone</p>
          <h2>Delete Account Data</h2>
          <p>
            Deletes saved decks, tracked hand sessions, old rating entries, and local
            browser caches for this app. This does not delete your sign-in account
            or billing records.
          </p>
        </div>
        <label className="field-stack">
          Type DELETE to confirm
          <input
            className="text-input"
            onChange={(event) => setConfirmText(event.target.value)}
            value={confirmText}
          />
        </label>
        <button
          className="danger-button"
          disabled={isDeleting || confirmText !== "DELETE"}
          onClick={deleteAllAccountData}
          type="button"
        >
          {isDeleting ? "Deleting..." : "Delete all app data"}
        </button>
      </section>
    </section>
  );
}
