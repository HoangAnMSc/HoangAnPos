export function readLocalDraft<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalDraft(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The form remains usable when storage is unavailable.
  }
}

export function clearLocalDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage restrictions.
  }
}
