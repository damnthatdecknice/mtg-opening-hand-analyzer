"use client";

import type { Session, User } from "@supabase/supabase-js";

const fallbackKey = "mtg-hand-pro:recent-auth";
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

  window.localStorage.setItem(
    fallbackKey,
    JSON.stringify({
      email: session.user.email,
      id: session.user.id,
      savedAt: Date.now()
    })
  );
}

export function getAuthFallbackUser(): AuthFallbackUser | null {
  const stored = readFallback();
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
}
