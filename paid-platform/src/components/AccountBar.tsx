"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { AuthFallbackUser } from "@/lib/authFallback";
import { supabase } from "@/lib/supabase";

type AccountBarProps = {
  user: User | AuthFallbackUser;
  onSignOut: () => void;
};

function metadataDisplayName(user: User | AuthFallbackUser) {
  if ("user_metadata" in user) {
    const value = user.user_metadata?.display_name;
    return typeof value === "string" ? value.trim() : "";
  }
  return "";
}

export function AccountBar({ user, onSignOut }: AccountBarProps) {
  const fallbackName = useMemo(
    () => metadataDisplayName(user) || user.email?.split("@")[0] || "Player",
    [user]
  );
  const [displayName, setDisplayName] = useState(fallbackName);

  useEffect(() => {
    let isMounted = true;
    setDisplayName(fallbackName);

    if (!supabase || !user.id) {
      return () => {
        isMounted = false;
      };
    }

    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const profileName = typeof data?.display_name === "string" ? data.display_name.trim() : "";
        if (isMounted && profileName) {
          setDisplayName(profileName);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [fallbackName, user.id]);

  return (
    <div className="account-bar">
      <span>{displayName}</span>
      <button className="text-button" onClick={onSignOut} type="button">
        Sign out
      </button>
    </div>
  );
}
