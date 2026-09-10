import { Alert, Badge, Button, Empty, Flex, Skeleton, Typography } from "antd";
import { AppstoreOutlined, TagOutlined } from "@ant-design/icons";

export function TagNavigation({
  tags,
  active,
  loading,
  error,
  onSelect,
  onRetry,
}: {
  tags: { name: string; count: number }[];
  active: string;
  loading: boolean;
  error: boolean;
  onSelect: (tag: string) => void;
  onRetry: () => void;
}) {
  return (
    <nav className="tag-navigation" aria-label="标签导航">
      <Typography.Text className="section-label">资料库</Typography.Text>
      <Button
        className="nav-item"
        type={!active ? "primary" : "text"}
        icon={<AppstoreOutlined />}
        aria-current={!active ? "page" : undefined}
        onClick={() => onSelect("")}
      >
        全部备忘录
      </Button>
      <Flex justify="space-between" align="center" className="tag-heading">
        <Typography.Text className="section-label">按标签浏览</Typography.Text>
        <Typography.Text type="secondary">{tags.length}</Typography.Text>
      </Flex>
      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : error ? (
        <Alert
          type="error"
          title="标签加载失败"
          action={
            <Button size="small" onClick={onRetry}>
              重试
            </Button>
          }
        />
      ) : tags.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无标签" />
      ) : (
        tags.map((t) => (
          <Button
            key={t.name}
            type={active === t.name ? "primary" : "text"}
            className="nav-item"
            aria-current={active === t.name ? "page" : undefined}
            onClick={() => onSelect(t.name)}
          >
            <TagOutlined />
            <span className="nav-label">{t.name}</span>
            <Badge
              count={t.count}
              overflowCount={9999}
              color={active === t.name ? "#ffffff40" : "#e6ebf2"}
              style={{
                color: active === t.name ? "white" : "#526278",
                boxShadow: "none",
              }}
            />
          </Button>
        ))
      )}
    </nav>
  );
}
