"use client";

import type { Session, User } from "@supabase/supabase-js";

const fallbackKey = "mtg-hand-pro:recent-auth";
const recognitionCachePrefix = "mtg-hand-pro:image-signature:";
const fallbackMaxAgeMs = 1000 * 60 * 60 * 24;

export type AuthFallbackUser = Pick<User, "email" | "id">;

type StoredAuthFallback = {
  email: string;
  id: string;
  savedAt: number;
};

function readFallback(): StoredAuthFallback | null {
  try {
    const raw = window.localStorage.getItem(fallbackKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredAuthFallback>;
    if (!parsed.email || !parsed.id || !parsed.savedAt) {
      return null;
    }

    if (Date.now() - parsed.savedAt > fallbackMaxAgeMs) {
      window.localStorage.removeItem(fallbackKey);
      return null;
    }

    return {
      email: parsed.email,
      id: parsed.id,
      savedAt: parsed.savedAt
    };
  } catch {
    return null;
  }
}

export function saveAuthFallback(session: Session | null) {
  if (!session?.user.email) {
    return;
  }

  const payload = JSON.stringify({
    email: session.user.email,
    id: session.user.id,
    savedAt: Date.now()
  });

  try {
    window.localStorage.setItem(fallbackKey, payload);
  } catch {
    clearRecognitionCache();

    try {
      window.localStorage.setItem(fallbackKey, payload);
    } catch {
      try {
        window.sessionStorage.setItem(fallbackKey, payload);
      } catch {
        // Auth has already succeeded. Optional UI fallback storage must not block navigation.
      }
    }
  }
}

export function getAuthFallbackUser(): AuthFallbackUser | null {
  const stored = readFallback() ?? readSessionFallback();
  if (!stored) {
    return null;
  }

  return {
    email: stored.email,
    id: stored.id
  };
}

export function clearAuthFallback() {
  window.localStorage.removeItem(fallbackKey);
  window.sessionStorage.removeItem(fallbackKey);
}

function readSessionFallback(): StoredAuthFallback | null {
  try {
    const raw = window.sessionStorage.getItem(fallbackKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredAuthFallback>;
    if (!parsed.email || !parsed.id || !parsed.savedAt) {
      return null;
    }

    return Date.now() - parsed.savedAt <= fallbackMaxAgeMs
      ? {
          email: parsed.email,
          id: parsed.id,
          savedAt: parsed.savedAt
        }
      : null;
  } catch {
    return null;
  }
}

function clearRecognitionCache() {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith(recognitionCachePrefix)) {
      window.localStorage.removeItem(key);
    }
  }
}
