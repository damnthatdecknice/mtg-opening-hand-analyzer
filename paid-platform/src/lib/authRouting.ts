import { loadGuestDeckIntent, safeInternalReturnPath, saveGuestDeckIntent } from "./guestDeck";
import type { GuestDeckIntent } from "./guestDeck";

export function hasSaveGuestDeckIntent(search: string) {
  const params = new URLSearchParams(search);
  return params.get("intent") === "save-guest-deck";
}

export function resolveAuthReturnPathFromParts({
  hasIntent,
  returnTo,
  storedIntent
}: {
  hasIntent: boolean;
  returnTo: string | null;
  storedIntent?: GuestDeckIntent | null;
}) {
  if (hasIntent) {
    return safeInternalReturnPath(returnTo ?? storedIntent?.returnPath ?? "/dashboard?importGuest=1");
  }

  if (storedIntent?.action === "save-after-auth") {
    return safeInternalReturnPath(returnTo ?? storedIntent.returnPath);
  }

  return safeInternalReturnPath(returnTo);
}

export function resolveAuthReturnPath(search: string) {
  const params = new URLSearchParams(search);
  const queryReturnPath = params.get("returnTo");
  const storedIntent = loadGuestDeckIntent();

  if (hasSaveGuestDeckIntent(search)) {
    const returnPath = resolveAuthReturnPathFromParts({
      hasIntent: true,
      returnTo: queryReturnPath,
      storedIntent
    });
    saveGuestDeckIntent({ action: "save-after-auth", returnPath });
    return returnPath;
  }

  return resolveAuthReturnPathFromParts({
    hasIntent: false,
    returnTo: queryReturnPath,
    storedIntent
  });
}
