import type { MemoInput } from "../../types";

// Device-only storage, separated by backend and memo. Never add drafts to API payloads
// or the query cache: only the editor's explicit Save action publishes its form.
export function draftKey(id?: number) {
  const backend = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
  return `memo:draft:v1:${encodeURIComponent(backend)}:${id ?? "new"}`;
}

export function readDraft(key: string): MemoInput | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      value && typeof value.title === "string" &&
      typeof value.content === "string" && Array.isArray(value.tags) &&
      value.tags.every((tag: unknown) => typeof tag === "string")
    ) return { title: value.title, tags: value.tags, content: value.content };
  } catch { /* Storage may be disabled or contain malformed data. */ }
  return null;
}

export function writeDraft(key: string, value: MemoInput | null): boolean {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
