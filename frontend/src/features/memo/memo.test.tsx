import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, Grid, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import MemoPage from "../../pages/MemoPage";
import { memos } from "../../api/memos";
vi.mock("../../api/memos", () => ({
  memos: { list: vi.fn(), tags: vi.fn(), save: vi.fn(), delete: vi.fn() },
}));
const memo = {
  id: 1,
  title: "Cloudflare TLS",
  tags: ["PKI"],
  content: "original\r\n中文 body",
  createdAt: "2026-09-09T00:00:00Z",
  updatedAt: "2026-09-09T00:00:00Z",
};
function Location() {
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{useLocation().search}</output>
      <button onClick={() => navigate(-1)}>测试后退</button>
    </>
  );
}
function setup(url = "/") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <App>
          <MemoryRouter initialEntries={[url]}>
            <MemoPage />
            <Location />
          </MemoryRouter>
        </App>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(memos.list)
    .mockReset()
    .mockResolvedValue({
      items: [memo],
      pagination: { limit: 30, offset: 0, hasMore: false },
    });
  vi.mocked(memos.tags)
    .mockReset()
    .mockResolvedValue({ items: [{ name: "PKI", count: 1 }] });
  vi.mocked(memos.save).mockReset().mockResolvedValue(memo);
  vi.mocked(memos.delete).mockReset().mockResolvedValue(undefined);
  vi.spyOn(Grid, "useBreakpoint").mockReturnValue({ md: true, xl: true });
});
describe("Memo workspace", () => {
  it("lists complete memos and copies exact content without a request", async () => {
    const user = userEvent.setup();
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboard },
      configurable: true,
    });
    setup();
    await screen.findByRole("button", { name: memo.title });
    const calls = vi.mocked(memos.list).mock.calls.length;
    await user.click(screen.getByRole("button", { name: `复制${memo.title}` }));
    expect(clipboard).toHaveBeenCalledWith(memo.content);
    expect(memos.list).toHaveBeenCalledTimes(calls);
  });
  it("debounces search and writes the URL", async () => {
    setup();
    await screen.findByRole("button", { name: memo.title });
    vi.useFakeTimers();
    try {
      fireEvent.change(
        screen.getByRole("textbox", { name: "搜索全部备忘录" }),
        { target: { value: "origin" } },
      );
      await act(async () => {
        vi.advanceTimersByTime(149);
      });
      expect(memos.list).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(memos.list).toHaveBeenLastCalledWith(
        "origin",
        "",
        0,
        expect.any(AbortSignal),
      );
      expect(screen.getByTestId("location")).toHaveTextContent("?q=origin");
    } finally {
      vi.useRealTimers();
    }
  });
  it("creates a memo", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "新建" }));
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "New title" },
    });
    fireEvent.change(screen.getByLabelText("正文"), {
      target: { value: "Exact body" },
    });
    await user.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() =>
      expect(memos.save).toHaveBeenCalledWith(
        { title: "New title", tags: [], content: "Exact body" },
        undefined,
      ),
    );
  });
  it("edits a memo", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(
      await screen.findByRole("button", { name: "编辑当前备忘录" }),
    );
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "Updated" },
    });
    await user.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() =>
      expect(memos.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Updated",
          content: expect.any(String),
        }),
        1,
      ),
    );
  });
  it("confirms deletion", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(
      await screen.findByRole("button", { name: `${memo.title}的更多操作` }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /删除/ }));
    await screen.findByText("确定删除这条备忘录？");
    const buttons = screen.getAllByRole("button", {
      name: /删\s*除/,
    });
    await user.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(memos.delete).toHaveBeenCalledWith(1, expect.anything()),
    );
  });
  it("opens detail and editor as full-screen mobile drawers", async () => {
    vi.mocked(Grid.useBreakpoint).mockReturnValue({ md: false, xl: false });
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole("button", { name: memo.title }));
    expect(await screen.findByRole("dialog", { name: "备忘录" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "编辑当前备忘录" }));
    // Ant Design assigns the same aria-labelledby test-id to every Drawer in test mode.
    const editorDialog = (await screen.findByText("编辑备忘录")).closest(
      '[role="dialog"]',
    )!;
    expect(editorDialog).toBeVisible();
    expect(editorDialog.closest(".ant-drawer-content-wrapper")).toHaveStyle({
      width: "100%",
    });
    fireEvent.keyDown(editorDialog, {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "编辑备忘录" }),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole("dialog", { name: "备忘录" })).toBeVisible();
  });
  it("distinguishes empty search and request errors", async () => {
    vi.mocked(memos.list).mockResolvedValue({
      items: [],
      pagination: { limit: 30, offset: 0, hasMore: false },
    });
    setup("/?q=missing");
    expect(await screen.findByText("未找到备忘录")).toBeVisible();
  });

  it("uses a tablet list/detail layout with tags in a drawer", async () => {
    vi.mocked(Grid.useBreakpoint).mockReturnValue({ md: true, xl: false });
    const user = userEvent.setup();
    setup();
    expect(
      await screen.findByRole("article", { name: "备忘录详情" }),
    ).toBeVisible();
    expect(screen.getByRole("main")).toHaveAttribute("data-layout", "tablet");
    expect(
      screen.queryByRole("navigation", { name: "标签导航" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "筛选标签" }));
    const drawer = await screen.findByRole("dialog", { name: "筛选标签" });
    await user.click(within(drawer).getByRole("button", { name: /PKI/ }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("tag=PKI"),
    );
  });
  it("does not overwrite browser back navigation with a pending search", async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByRole("textbox", { name: "搜索全部备忘录" });
    fireEvent.change(input, { target: { value: "first" } });
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("q=first"),
    );
    fireEvent.change(input, { target: { value: "second" } });
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("q=second"),
    );
    fireEvent.change(input, { target: { value: "pending" } });
    fireEvent.click(screen.getByRole("button", { name: "测试后退" }));
    await waitFor(() => expect(input).toHaveValue("first"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(screen.getByTestId("location")).toHaveTextContent("q=first");
  });
  it("keeps an unsaved draft when closing is cancelled", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "新建" }));
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "未保存的草稿" },
    });
    await user.click(screen.getByRole("button", { name: /取\s*消/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "放弃未保存的修改？" }),
      ).toBeVisible(),
    );
    await user.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(screen.getByLabelText("标题")).toHaveValue("未保存的草稿");
    expect(memos.save).not.toHaveBeenCalled();
  });
  it("shows a request failure separately from an empty library", async () => {
    vi.mocked(memos.list).mockRejectedValue(new Error("网络不可用"));
    setup();
    expect(await screen.findByText("备忘录加载失败")).toBeVisible();
    expect(screen.queryByText("还没有备忘录")).not.toBeInTheDocument();
  });

  it("closes the mobile detail overlay when resized to desktop", async () => {
    vi.mocked(Grid.useBreakpoint).mockReturnValue({ md: false, xl: false });
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole("button", { name: memo.title }));
    expect(await screen.findByRole("dialog", { name: "备忘录" })).toBeVisible();
    vi.mocked(Grid.useBreakpoint).mockReturnValue({ md: true, xl: true });
    fireEvent.change(screen.getByRole("textbox", { name: "搜索全部备忘录" }), {
      target: { value: "resize" },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "备忘录" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("main")).toHaveAttribute("data-layout", "desktop");
    expect(screen.getByRole("article", { name: "备忘录详情" })).toBeVisible();
  });
  it("returns to the previous page after deleting its last memo", async () => {
    const user = userEvent.setup();
    setup("/?offset=30");
    await user.click(
      await screen.findByRole("button", { name: `${memo.title}的更多操作` }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /删除/ }));
    await user.click(await screen.findByRole("button", { name: /删\s*除/ }));
    await waitFor(() => expect(memos.delete).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("location")).not.toHaveTextContent("offset=30"),
    );
  });
});
