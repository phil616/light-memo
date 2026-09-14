import { beforeEach, expect, it, vi } from "vitest";
import { draftKey, readDraft, writeDraft } from "./drafts";

beforeEach(() => localStorage.clear());

it("keeps each backend, memo, and new memo draft separate", () => {
  const value = { title: "草稿", tags: ["本地"], content: "未上传正文" };
  const key = draftKey(1);
  expect(writeDraft(key, value)).toBe(true);
  expect(readDraft(key)).toEqual(value);
  expect(readDraft(draftKey(2))).toBeNull();
  expect(readDraft(draftKey())).toBeNull();
  const previous = import.meta.env.VITE_API_BASE_URL;
  vi.stubEnv("VITE_API_BASE_URL", "https://another-backend.example");
  try {
    expect(readDraft(draftKey(1))).toBeNull();
  } finally {
    vi.stubEnv("VITE_API_BASE_URL", previous);
  }
});

it("ignores malformed storage and handles unavailable storage", () => {
  const key = draftKey(1);
  localStorage.setItem(key, "{");
  expect(readDraft(key)).toBeNull();
  localStorage.setItem(key, JSON.stringify({ title: "x", tags: [1], content: "x" }));
  expect(readDraft(key)).toBeNull();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
  expect(readDraft(key)).toBeNull();
  expect(writeDraft(key, null)).toBe(false);
});
