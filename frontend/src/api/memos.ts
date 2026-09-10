import { api } from "./client";
import type { Memo, MemoInput, MemoPage } from "../types";
export const memos = {
  list: (q: string, tag: string, offset: number, signal?: AbortSignal) =>
    api<MemoPage>(
      `/memos?${new URLSearchParams({ q, tag, offset: String(offset) })}`,
      { signal },
    ),
  tags: (signal?: AbortSignal) =>
    api<{ items: { name: string; count: number }[] }>("/tags", { signal }),
  save: (input: MemoInput, id?: number) =>
    api<Memo>(id ? `/memos/${id}` : "/memos", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(input),
    }),
  delete: (id: number) =>
    api<void>(`/memos/${id}`, { method: "DELETE", body: "{}" }),
};
