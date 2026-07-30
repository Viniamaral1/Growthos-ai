const STORAGE_PREFIX = "growthos.ui";


function storageKey(key: string): string {
  return `${STORAGE_PREFIX}.${key}`;
}


export function readStoredString(
  key: string,
): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(
      storageKey(key),
    );
  } catch {
    return null;
  }
}


export function writeStoredString(
  key: string,
  value: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      storageKey(key),
      value,
    );
  } catch {
    // Storage may be blocked in private browsing.
  }
}


export function removeStoredValue(
  key: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(
      storageKey(key),
    );
  } catch {
    // Storage may be blocked in private browsing.
  }
}


export function readStoredNumber(
  key: string,
): number | null {
  const value = readStoredString(key);

  if (value === null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}


export function writeStoredNumber(
  key: string,
  value: number | null,
): void {
  if (value === null) {
    removeStoredValue(key);
    return;
  }

  writeStoredString(key, String(value));
}


export function readStoredBoolean(
  key: string,
  fallback = false,
): boolean {
  const value = readStoredString(key);

  if (value === null) {
    return fallback;
  }

  return value === "true";
}


export function writeStoredBoolean(
  key: string,
  value: boolean,
): void {
  writeStoredString(
    key,
    value ? "true" : "false",
  );
}


export const uiStorageKeys = {
  activeView: "active-view",
  activeWorkspace: "active-workspace",
  activeDocument: "active-document",
  useAllDocuments: "use-all-documents",
  startNewCofounder: "start-new-cofounder",

  cofounderConversation(
    companyId: number,
  ): string {
    return `workspace.${companyId}.cofounder-conversation`;
  },

  researchTask(
    companyId: number,
  ): string {
    return `workspace.${companyId}.research-task`;
  },

  scrollPosition(
    view: string,
  ): string {
    return `scroll.${view}`;
  },
} as const;
