import { Button, Flex, Tag, Typography } from "antd";
import {
  CopyOutlined,
  EditOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import type { Memo } from "../../types";
export function MemoDetail({
  memo,
  onCopy,
  onEdit,
}: {
  memo: Memo;
  onCopy: (m: Memo) => void;
  onEdit: (m: Memo) => void;
}) {
  return (
    <article className="memo-detail" aria-label="备忘录详情">
      <header className="detail-toolbar">
        <Typography.Text type="secondary">
          <FileTextOutlined /> 备忘录详情
        </Typography.Text>
        <Flex gap={8}>
          <Button
            icon={<EditOutlined />}
            aria-label="编辑当前备忘录"
            onClick={() => onEdit(memo)}
          >
            编辑
          </Button>
          <Button
            type="primary"
            icon={<CopyOutlined />}
            aria-label="复制当前备忘录"
            onClick={() => onCopy(memo)}
          >
            复制正文
          </Button>
        </Flex>
      </header>
      <div className="detail-scroll">
        <div className="detail-document">
          <Typography.Title level={2} className="detail-title">
            {memo.title}
          </Typography.Title>
          <Typography.Text type="secondary" className="detail-date">
            更新于{" "}
            {new Date(memo.updatedAt).toLocaleString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Typography.Text>
          {!!memo.tags.length && (
            <Flex gap={6} wrap className="detail-tags">
              {memo.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </Flex>
          )}
          <div className="document-divider" />
          {memo.content ? (
            <Typography.Paragraph className="memo-content">
              {memo.content}
            </Typography.Paragraph>
          ) : (
            <Typography.Text type="secondary">
              这条备忘录还没有正文。
            </Typography.Text>
          )}
        </div>
      </div>
    </article>
  );
}
