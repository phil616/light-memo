import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi, beforeEach } from "vitest";
import { App, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TemplateInstantiate } from "./TemplateInstantiate";
import { MemoryRouter } from "react-router";
import TemplatesPage from "../../pages/TemplatesPage";
import { TemplateEditor } from "./TemplateEditor";
import { templates } from "../../api/templates";
import { variableNames, renderTemplate } from "./expressions";
vi.mock("../../api/templates", () => ({
  templates: {
    list: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    instantiate: vi.fn(),
    save: vi.fn(),
  },
}));
const template = {
  id: 1,
  name: "每日任务",
  title: "任务 {{task_name}}",
  tags: [],
  content: "今天的任务是{{task_name}}",
  variables: ["task_name"],
  version: 1,
  createdAt: "",
  updatedAt: "",
};
function setup(child: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <ConfigProvider theme={{ token: { motion: false } }}>
        <App>{child}</App>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(templates.get).mockResolvedValue(template);
  vi.mocked(templates.instantiate).mockResolvedValue({
    ...template,
    id: 2,
    title: "任务 写周报",
    content: "今天的任务是写周报",
  });
  vi.mocked(templates.save).mockResolvedValue(template);
});
it("recognizes repeated Unicode variables and preserves literal injected expressions", () => {
  const input = {
    title: "{{任务}}",
    tags: ["{{__proto__}}"],
    content: "{{ 任务 }} {{other}}",
  };
  expect(variableNames(input)).toEqual(["任务", "__proto__", "other"]);
  const values = Object.fromEntries([
    ["任务", "{{other}} $& <script>"],
    ["__proto__", "安全"],
  ]);
  expect(renderTemplate(input, values)).toEqual({
    title: "{{other}} $& <script>",
    tags: ["安全"],
    content: "{{other}} $& <script> {{other}}",
  });
  for (const text of ["{{}}", "{{x", "}}", "{{a.b}}", "{{1x}}", "{{x-y}}"])
    expect(() => variableNames({ ...input, title: text })).toThrow();
  expect(() =>
    renderTemplate(
      { title: "标题", tags: [], content: "{{x}}" + "a".repeat(100) },
      { x: "x".repeat(131000) },
    ),
  ).toThrow();
});
it("requires values, previews input and creates a memo with the fetched version", async () => {
  setup(<TemplateInstantiate id={1} mobile={true} onClose={vi.fn()} />);
  await screen.findByLabelText("task_name");
  fireEvent.click(screen.getByRole("button", { name: "创建备忘录" }));
  await screen.findByText("请填写 task_name");
  expect(templates.instantiate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("task_name"), {
    target: { value: "写周报" },
  });
  expect(
    await within(screen.getByRole("region", { name: "生成预览" })).findByText(
      "今天的任务是写周报",
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "创建备忘录" }));
  await screen.findByText("备忘录已创建");
  expect(templates.instantiate).toHaveBeenCalledWith(template, {
    task_name: "写周报",
  });
});
it("confirms before discarding filled variables", async () => {
  const close = vi.fn();
  setup(<TemplateInstantiate id={1} mobile={false} onClose={close} />);
  fireEvent.change(await screen.findByLabelText("task_name"), {
    target: { value: "未完成" },
  });
  fireEvent.click(screen.getByRole("button", { name: /取\s*消/ }));
  await screen.findByRole("dialog", { name: "放弃已填写的变量？" });
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "放弃填写" }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
});
it("creates a template from named fields", async () => {
  const close = vi.fn();
  setup(<TemplateEditor mobile={false} onClose={close} />);
  fireEvent.change(screen.getByLabelText("模板名称"), {
    target: { value: "每日任务" },
  });
  fireEvent.change(screen.getByLabelText("备忘录标题"), {
    target: { value: "任务 {{task_name}}" },
  });
  fireEvent.change(screen.getByLabelText("模板正文"), {
    target: { value: "今天的任务是{{task_name}}" },
  });
  expect(await screen.findByText("task_name")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "保存模板" }));
  await waitFor(() =>
    expect(templates.save).toHaveBeenCalledWith(
      {
        name: template.name,
        title: template.title,
        tags: [],
        content: template.content,
      },
      undefined,
    ),
  );
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
});

it("opens a library template and retains inputs when creation fails", async () => {
  vi.mocked(templates.list).mockResolvedValue({
    items: [template],
    pagination: { limit: 30, offset: 0, hasMore: false },
  });
  vi.mocked(templates.instantiate).mockRejectedValue(
    new Error("模板已更新，请重新加载"),
  );
  setup(
    <MemoryRouter initialEntries={["/templates"]}>
      <TemplatesPage />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "使用模板" }));
  fireEvent.change(await screen.findByLabelText("task_name"), {
    target: { value: "保留我的输入" },
  });
  fireEvent.click(screen.getByRole("button", { name: "创建备忘录" }));
  await screen.findByText("模板已更新，请重新加载");
  expect(screen.getByLabelText("task_name")).toHaveValue("保留我的输入");
  expect(screen.queryByText("备忘录已创建")).not.toBeInTheDocument();
});
