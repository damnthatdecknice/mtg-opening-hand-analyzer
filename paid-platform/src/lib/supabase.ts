import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const recognitionCachePrefix = "mtg-hand-pro:image-signature:";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storage: {
          getItem(key: string) {
            if (typeof window === "undefined") {
              return null;
            }

            return window.localStorage.getItem(key);
          },
          setItem(key: string, value: string) {
            if (typeof window === "undefined") {
              return;
            }

            try {
              window.localStorage.setItem(key, value);
              return;
            } catch {
              clearRecognitionCache();
            }

            try {
              window.localStorage.setItem(key, value);
            } catch {
              // Supabase will still report the signed-in user for this page load.
            }
          },
          removeItem(key: string) {
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(key);
            }
          }
        }
      }
    })
  : null;

export type AuthMode = "sign-in" | "sign-up";

function clearRecognitionCache() {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith(recognitionCachePrefix)) {
      window.localStorage.removeItem(key);
    }
  }
}
