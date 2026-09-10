export interface Memo {
  id: number;
  title: string;
  tags: string[];
  content: string;
  createdAt: string;
  updatedAt: string;
}
export type MemoInput = Pick<Memo, "title" | "tags" | "content">;
export interface MemoPage {
  items: Memo[];
  pagination: { limit: number; offset: number; hasMore: boolean };
}

export interface MemoTemplate extends Memo {
  name: string;
  variables: string[];
  version: number;
}
export type TemplateInput = MemoInput & { name: string };
export interface TemplatePage {
  items: MemoTemplate[];
  pagination: MemoPage["pagination"];
}
