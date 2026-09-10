import { useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Grid,
  Input,
  Popconfirm,
  Skeleton,
  Tag,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Link } from "react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { templates } from "../api/templates";
import type { MemoTemplate } from "../types";
import { TemplateEditor } from "../features/templates/TemplateEditor";
import { TemplateInstantiate } from "../features/templates/TemplateInstantiate";
import { useMemoFilters } from "../features/memo/useMemoFilters";
type Dialog =
  | { kind: "closed" }
  | { kind: "edit"; template?: MemoTemplate }
  | { kind: "use"; id: number };
export default function TemplatesPage() {
  const [dialog, setDialog] = useState<Dialog>({ kind: "closed" });
  const filters = useMemoFilters();
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  const cache = useQueryClient();
  const { message } = App.useApp();
  const list = useQuery({
    queryKey: ["templates", filters.q, filters.offset],
    queryFn: ({ signal }) => templates.list(filters.q, filters.offset, signal),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({
    mutationFn: templates.delete,
    onSuccess: () => {
      if (list.data?.items.length === 1 && filters.offset > 0)
        filters.page(Math.max(0, filters.offset - 30));
      void cache.invalidateQueries({ queryKey: ["templates"] });
      message.success("模板已删除");
    },
    onError: (e) => message.error(e.message),
  });
  return (
    <main className={`templates-page ${mobile ? "templates-mobile" : ""}`}>
      <div className="templates-container">
        <Link to="/">
          <ArrowLeftOutlined /> 返回备忘录
        </Link>
        <header className="templates-heading">
          <div>
            <Typography.Title level={2}>模板库</Typography.Title>
            <Typography.Text type="secondary">
              保存常用结构，填写变量，生成新的备忘录。
            </Typography.Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            aria-label="新建模板"
            onClick={() => setDialog({ kind: "edit" })}
          >
            新建模板
          </Button>
        </header>
        <Input
          size="large"
          prefix={<SearchOutlined />}
          allowClear
          aria-label="搜索模板"
          placeholder="搜索模板名称、标题或正文"
          value={filters.search}
          onChange={(e) => filters.changeSearch(e.target.value)}
          className="templates-search"
        />
        {list.isPending ? (
          <Skeleton active />
        ) : list.isError ? (
          <Alert
            type="error"
            title="模板加载失败"
            description={list.error.message}
            action={<Button onClick={() => void list.refetch()}>重试</Button>}
          />
        ) : list.data.items.length === 0 ? (
          <Empty description={filters.q ? "未找到模板" : "还没有模板"}>
            <Button
              onClick={() =>
                filters.q ? filters.clear() : setDialog({ kind: "edit" })
              }
            >
              {filters.q ? "清除搜索" : "创建第一个模板"}
            </Button>
          </Empty>
        ) : (
          <div
            className="template-grid"
            style={{
              gridTemplateColumns: mobile
                ? "minmax(0,1fr)"
                : screens.xl
                  ? "repeat(3,minmax(0,1fr))"
                  : "repeat(2,minmax(0,1fr))",
            }}
          >
            {list.data.items.map((template) => (
              <Card
                key={template.id}
                className="template-card"
                title={template.name}
              >
                <Typography.Paragraph className="template-card-title">
                  {template.title}
                </Typography.Paragraph>
                <Typography.Paragraph className="memo-preview">
                  {template.content || "暂无正文"}
                </Typography.Paragraph>
                <Flex gap={4} wrap className="template-variables">
                  {template.variables.slice(0, 5).map((v) => (
                    <Tag key={v}>{`{{${v}}}`}</Tag>
                  ))}
                  {template.variables.length > 5 && (
                    <Tag>+{template.variables.length - 5}</Tag>
                  )}
                  {!template.variables.length && (
                    <Typography.Text type="secondary">
                      固定内容模板
                    </Typography.Text>
                  )}
                </Flex>
                <Flex gap={8} wrap className="template-card-actions">
                  <Button
                    type="primary"
                    onClick={() => setDialog({ kind: "use", id: template.id })}
                  >
                    使用模板
                  </Button>
                  <Button onClick={() => setDialog({ kind: "edit", template })}>
                    编辑
                  </Button>
                  <Popconfirm
                    title="确定删除模板？"
                    description="已生成的备忘录不受影响。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true, loading: remove.isPending }}
                    onConfirm={() => remove.mutateAsync(template.id)}
                  >
                    <Button danger type="text">
                      删除
                    </Button>
                  </Popconfirm>
                </Flex>
              </Card>
            ))}
          </div>
        )}
        <Flex
          align="center"
          justify="space-between"
          className="templates-pagination"
        >
          <Typography.Text type="secondary">
            第 {Math.floor(filters.offset / 30) + 1} 页
          </Typography.Text>
          <Flex gap={8}>
            <Button
              disabled={filters.offset === 0 || list.isFetching}
              onClick={() => filters.page(Math.max(0, filters.offset - 30))}
            >
              上一页
            </Button>
            <Button
              disabled={!list.data?.pagination.hasMore || list.isFetching}
              onClick={() => filters.page(filters.offset + 30)}
            >
              下一页
            </Button>
          </Flex>
        </Flex>
      </div>
      {dialog.kind === "edit" && (
        <TemplateEditor
          template={dialog.template}
          mobile={mobile}
          onClose={() => setDialog({ kind: "closed" })}
        />
      )}
      {dialog.kind === "use" && (
        <TemplateInstantiate
          id={dialog.id}
          mobile={mobile}
          onClose={() => setDialog({ kind: "closed" })}
        />
      )}
    </main>
  );
}
