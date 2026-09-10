import { useEffect, useRef, useState } from "react";
import {
  App,
  Alert,
  Button,
  Drawer,
  Empty,
  Flex,
  Grid,
  Input,
  Skeleton,
  Spin,
  Tag,
  Typography,
} from "antd";
import type { InputRef } from "antd";
import {
  FilterOutlined,
  SnippetsOutlined,
  PlusOutlined,
  SettingOutlined,
  SearchOutlined,
  BookOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { memos } from "../api/memos";
import type { Memo, MemoPage as MemoPageData } from "../types";
import { MemoEditor } from "../features/memo/MemoEditor";
import { MemoDetail } from "../features/memo/MemoDetail";
import { MemoList } from "../features/memo/MemoList";
import { TagNavigation } from "../features/memo/TagNavigation";
import { useMemoFilters } from "../features/memo/useMemoFilters";

type Overlay =
  | { kind: "closed" }
  | { kind: "tags" }
  | { kind: "detail"; memo: Memo }
  | { kind: "editor"; memo?: Memo; returnTo?: Memo };
export default function MemoPage() {
  const navigate = useNavigate();
  const filters = useMemoFilters();
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  const mode = screens.xl ? "desktop" : screens.md ? "tablet" : "mobile";
  const [selectedId, setSelectedId] = useState<number>();
  const [overlay, setOverlay] = useState<Overlay>({ kind: "closed" });
  const searchRef = useRef<InputRef>(null);
  const { message } = App.useApp();
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ["memos", filters.q, filters.tag, filters.offset],
    queryFn: ({ signal }) =>
      memos.list(filters.q, filters.tag, filters.offset, signal),
    placeholderData: keepPreviousData,
  });
  const tags = useQuery({
    queryKey: ["tags"],
    queryFn: ({ signal }) => memos.tags(signal),
  });
  const items = list.data?.items ?? [];
  const selected =
    items.find((m) => m.id === selectedId) ?? (!mobile ? items[0] : undefined);
  useEffect(() => {
    if (
      !mobile &&
      (overlay.kind === "detail" || (screens.xl && overlay.kind === "tags"))
    )
      setOverlay({ kind: "closed" });
  }, [mobile, screens.xl, overlay.kind]);
  const fresh = () => {
    if (overlay.kind === "editor") return;
    setOverlay({ kind: "editor" });
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (overlay.kind === "editor") {
        if (
          (e.ctrlKey || e.metaKey) &&
          ["k", "n"].includes(e.key.toLowerCase())
        )
          e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOverlay({ kind: "closed" });
        searchRef.current?.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setOverlay({ kind: "editor" });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [overlay.kind]);
  const remove = useMutation({
    mutationFn: memos.delete,
    onSuccess: (_, id) => {
      if (selectedId === id) setSelectedId(undefined);
      if (overlay.kind === "detail" && overlay.memo.id === id)
        setOverlay({ kind: "closed" });
      if (items.length === 1 && filters.offset > 0)
        filters.page(Math.max(0, filters.offset - 30));
      cache.setQueriesData<MemoPageData>({ queryKey: ["memos"] }, (data) =>
        data
          ? { ...data, items: data.items.filter((memo) => memo.id !== id) }
          : data,
      );
      void cache.invalidateQueries({ queryKey: ["memos"] });
      void cache.invalidateQueries({ queryKey: ["tags"] });
      message.success("已删除");
    },
    onError: (e) => message.error(e.message),
  });
  const copy = async (m: Memo) => {
    try {
      await navigator.clipboard.writeText(m.content);
      message.success("已复制");
    } catch {
      message.error("复制失败");
    }
  };
  const edit = (memo: Memo) =>
    setOverlay({
      kind: "editor",
      memo,
      returnTo: overlay.kind === "detail" ? overlay.memo : undefined,
    });
  const select = (memo: Memo) => {
    setSelectedId(memo.id);
    if (mobile) setOverlay({ kind: "detail", memo });
  };
  const chooseTag = (tag: string) => {
    filters.chooseTag(tag);
    setSelectedId(undefined);
    setOverlay({ kind: "closed" });
  };
  const tagNav = (
    <TagNavigation
      tags={tags.data?.items ?? []}
      active={filters.tag}
      loading={tags.isPending}
      error={tags.isError}
      onSelect={chooseTag}
      onRetry={() => void tags.refetch()}
    />
  );
  const closeEditor = () =>
    setOverlay(
      overlay.kind === "editor" && overlay.returnTo && mobile
        ? { kind: "detail", memo: overlay.returnTo }
        : { kind: "closed" },
    );
  const saved = (memo: Memo) => {
    setSelectedId(memo.id);
    setOverlay(mobile ? { kind: "detail", memo } : { kind: "closed" });
  };
  return (
    <main className={`memo-workspace workspace-${mode}`} data-layout={mode}>
      <header className="workspace-header">
        <div className="workspace-brand">
          <BookOutlined />
          <div>
            <Typography.Title level={4}>备忘录</Typography.Title>
            {!mobile && (
              <Typography.Text type="secondary">个人资料库</Typography.Text>
            )}
          </div>
        </div>
        <Input
          className="workspace-search"
          ref={searchRef}
          size="large"
          prefix={<SearchOutlined />}
          suffix={
            !mobile ? (
              <Typography.Text keyboard>⌘ / Ctrl K</Typography.Text>
            ) : null
          }
          aria-label="搜索全部备忘录"
          placeholder="搜索标题、标签和正文"
          allowClear
          value={filters.search}
          onChange={(e) => filters.changeSearch(e.target.value)}
        />
        <Flex gap={8} className="workspace-actions">
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            aria-label="新建"
            onClick={fresh}
          >
            {mobile ? "新建" : "新建备忘录"}
          </Button>
          <Button
            size="large"
            type="text"
            icon={<SnippetsOutlined />}
            aria-label="模板库"
            onClick={() => navigate("/templates")}
          >
            {!mobile && "模板库"}
          </Button>
          <Button
            size="large"
            type="text"
            icon={<SettingOutlined />}
            aria-label="设置"
            onClick={() => navigate("/settings")}
          />
        </Flex>
      </header>
      <div className="workspace-body">
        {screens.xl && (
          <aside className="workspace-sidebar">
            {tagNav}
            <div className="sidebar-footer">
              <Typography.Text type="secondary">
                随时记录，随手取用
              </Typography.Text>
            </div>
          </aside>
        )}
        <section className="list-panel" aria-label="备忘录列表">
          <header className="list-panel-header">
            <Flex align="center" justify="space-between" gap={8}>
              <div>
                <Typography.Title level={4}>
                  {filters.q ? "搜索结果" : filters.tag || "全部备忘录"}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {filters.q ? "匹配标题、标签和正文" : "最近更新优先"}
                </Typography.Text>
              </div>
              {!screens.xl && (
                <Button
                  icon={<FilterOutlined />}
                  aria-label="筛选标签"
                  onClick={() => setOverlay({ kind: "tags" })}
                >
                  标签
                </Button>
              )}
            </Flex>
            {(filters.q || filters.tag) && (
              <Flex gap={6} align="center" wrap className="active-filters">
                {filters.tag && (
                  <Tag closable onClose={() => chooseTag("")}>
                    {filters.tag}
                  </Tag>
                )}
                {filters.q && (
                  <Typography.Text ellipsis className="search-summary">
                    “{filters.q}”
                  </Typography.Text>
                )}
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    filters.clear();
                    setSelectedId(undefined);
                  }}
                >
                  清除筛选
                </Button>
              </Flex>
            )}
          </header>
          <div className="list-scroll" aria-busy={list.isFetching}>
            {list.isPending ? (
              <div className="panel-placeholder">
                <Skeleton active />
                <Skeleton active />
              </div>
            ) : list.isError ? (
              <div className="panel-placeholder">
                <Alert
                  type="error"
                  title="备忘录加载失败"
                  description={list.error.message}
                  action={
                    <Button onClick={() => void list.refetch()}>重试</Button>
                  }
                />
              </div>
            ) : items.length === 0 ? (
              <div className="panel-placeholder empty-panel">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    filters.q || filters.tag ? "未找到备忘录" : "还没有备忘录"
                  }
                >
                  {filters.q || filters.tag ? (
                    <Button onClick={() => filters.clear()}>
                      查看全部备忘录
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={fresh}
                    >
                      创建第一条备忘录
                    </Button>
                  )}
                </Empty>
              </div>
            ) : (
              <MemoList
                items={items}
                selectedId={selected?.id}
                onSelect={select}
                onCopy={(m) => void copy(m)}
                onEdit={edit}
                onDelete={(id) => remove.mutateAsync(id)}
                deleting={remove.isPending}
              />
            )}
          </div>
          <footer className="list-pagination">
            <span role="status">
              {list.isFetching ? (
                <>
                  <Spin size="small" /> 正在加载
                </>
              ) : items.length ? (
                `第 ${filters.offset + 1}–${filters.offset + items.length} 条`
              ) : (
                "0 条备忘录"
              )}
            </span>
            <Flex gap={4}>
              <Button
                type="text"
                icon={<LeftOutlined />}
                aria-label="上一页"
                disabled={filters.offset === 0 || list.isFetching}
                onClick={() => filters.page(Math.max(0, filters.offset - 30))}
              />
              <Button
                type="text"
                icon={<RightOutlined />}
                aria-label="下一页"
                disabled={!list.data?.pagination.hasMore || list.isFetching}
                onClick={() => filters.page(filters.offset + 30)}
              />
            </Flex>
          </footer>
        </section>
        {!mobile && (
          <section className="detail-panel">
            {list.isError || !selected ? (
              <div className="detail-empty">
                <FileEmpty />
                <Typography.Title level={4}>
                  {list.isPending ? "正在加载备忘录" : "在这里查看备忘录"}
                </Typography.Title>
                <Typography.Text type="secondary">
                  从左侧选择一条，查看正文或一键复制。
                </Typography.Text>
              </div>
            ) : (
              <MemoDetail
                memo={selected}
                onCopy={(m) => void copy(m)}
                onEdit={edit}
              />
            )}
          </section>
        )}
      </div>
      <Drawer
        title="筛选标签"
        placement="left"
        size={mobile ? "min(88vw, 360px)" : 320}
        open={overlay.kind === "tags" && !screens.xl}
        onClose={() => setOverlay({ kind: "closed" })}
        destroyOnHidden
      >
        {tagNav}
      </Drawer>
      <Drawer
        title="备忘录"
        className="mobile-detail-drawer"
        size="100%"
        open={mobile && overlay.kind === "detail"}
        onClose={() => setOverlay({ kind: "closed" })}
        destroyOnHidden
        styles={{ body: { padding: 0 } }}
      >
        {overlay.kind === "detail" && (
          <MemoDetail
            memo={items.find((m) => m.id === overlay.memo.id) ?? overlay.memo}
            onCopy={(m) => void copy(m)}
            onEdit={edit}
          />
        )}
      </Drawer>
      <MemoEditor
        open={overlay.kind === "editor"}
        memo={overlay.kind === "editor" ? overlay.memo : undefined}
        mobile={mobile}
        tags={tags.data?.items.map((t) => t.name) ?? []}
        onClose={closeEditor}
        onSaved={saved}
      />
    </main>
  );
}
function FileEmpty() {
  return <BookOutlined className="detail-empty-icon" />;
}
