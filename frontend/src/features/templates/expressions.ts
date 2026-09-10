import type { MemoInput } from "../../types";
function visit(text: string, variable: (name: string) => string): string {
  let result = "";
  while (text.length) {
    const start = text.indexOf("{{"),
      end = text.indexOf("}}");
    if (start < 0) {
      if (end >= 0) throw new Error("存在未配对的 }}");
      result += text;
      break;
    }
    if (end >= 0 && end < start) throw new Error("存在未配对的 }}");
    result += text.slice(0, start);
    const rest = text.slice(start + 2),
      close = rest.indexOf("}}");
    if (close < 0) throw new Error("变量缺少结束符 }}");
    const name = rest.slice(0, close).trim();
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name) || Array.from(name).length > 64)
      throw new Error(
        "变量名须以字母、中文或下划线开头，只能包含字母、数字和下划线，最多 64 个字符",
      );
    result += variable(name);
    if (new TextEncoder().encode(result).length > 128 * 1024)
      throw new Error("生成内容超过 128 KiB");
    text = rest.slice(close + 2);
  }
  if (new TextEncoder().encode(result).length > 128 * 1024)
    throw new Error("生成内容超过 128 KiB");
  return result;
}
export function variableNames(input: MemoInput): string[] {
  const names = new Set<string>();
  for (const text of [input.title, ...input.tags, input.content])
    visit(text, (name) => {
      names.add(name);
      return "";
    });
  if (names.size > 50) throw new Error("每个模板最多包含 50 个变量");
  return [...names];
}
export function renderTemplate(
  input: MemoInput,
  values: Record<string, string>,
): MemoInput {
  const replace = (text: string) =>
    visit(text, (name) =>
      Object.hasOwn(values, name) ? values[name] : `{{${name}}}`,
    );
  return {
    title: replace(input.title),
    tags: input.tags.map(replace),
    content: replace(input.content),
  };
}
