import { api } from "./client";
import type {
  Memo,
  MemoInput,
  MemoTemplate,
  TemplateInput,
  TemplatePage,
} from "../types";
export const templates = {
  list: (q: string, offset: number, signal?: AbortSignal) =>
    api<TemplatePage>(
      `/templates?${new URLSearchParams({ q, offset: String(offset) })}`,
      { signal },
    ),
  get: (id: number, signal?: AbortSignal) =>
    api<MemoTemplate>(`/templates/${id}`, { signal }),
  save: (input: TemplateInput, id?: number) =>
    api<MemoTemplate>(id ? `/templates/${id}` : "/templates", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(input),
    }),
  delete: (id: number) =>
    api<void>(`/templates/${id}`, { method: "DELETE", body: "{}" }),
  preview: (template: MemoTemplate, variables: Record<string, string>) =>
    api<MemoInput>(`/templates/${template.id}/preview`, {
      method: "POST",
      body: JSON.stringify({ version: template.version, variables }),
    }),
  instantiate: (template: MemoTemplate, variables: Record<string, string>) =>
    api<Memo>(`/templates/${template.id}/instantiate`, {
      method: "POST",
      body: JSON.stringify({ version: template.version, variables }),
    }),
};
