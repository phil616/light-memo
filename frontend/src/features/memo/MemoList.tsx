import {
  Button,
  Dropdown,
  Flex,
  List,
  Popconfirm,
  Tag,
  Typography,
} from "antd";
import {
  CopyOutlined,
  EditOutlined,
  MoreOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import type { Memo } from "../../types";

export function MemoList({
  items,
  selectedId,
  onSelect,
  onCopy,
  onEdit,
  onDelete,
  deleting,
}: {
  items: Memo[];
  selectedId?: number;
  onSelect: (memo: Memo) => void;
  onCopy: (memo: Memo) => void;
  onEdit: (memo: Memo) => void;
  onDelete: (id: number) => Promise<unknown>;
  deleting: boolean;
}) {
  const [confirmId, setConfirmId] = useState<number>();
  return (
    <List
      className="memo-list"
      split={false}
      dataSource={items}
      renderItem={(memo) => (
        <List.Item
          className={`memo-row ${selectedId === memo.id ? "is-selected" : ""}`}
          key={memo.id}
        >
          <article className="memo-card" aria-label={memo.title}>
            <Button
              type="text"
              className="memo-select"
              aria-label={memo.title}
              aria-pressed={selectedId === memo.id}
              onClick={() => onSelect(memo)}
            >
              <span className="memo-title">{memo.title}</span>
              <span className="memo-preview">{memo.content || "暂无正文"}</span>
            </Button>
            {!!memo.tags.length && (
              <Flex className="memo-tags" gap={4} wrap>
                {memo.tags.slice(0, 3).map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
                {memo.tags.length > 3 && <Tag>+{memo.tags.length - 3}</Tag>}
              </Flex>
            )}
            <Flex
              className="memo-card-footer"
              justify="space-between"
              align="center"
              gap={8}
            >
              <time
                dateTime={memo.updatedAt}
                title={new Date(memo.updatedAt).toLocaleString("zh-CN")}
              >
                {new Date(memo.updatedAt).toLocaleDateString("zh-CN")} 更新
              </time>
              <Flex gap={4}>
                <Button
                  size="small"
                  type="text"
                  icon={<CopyOutlined />}
                  aria-label={`复制${memo.title}`}
                  onClick={() => onCopy(memo)}
                >
                  复制
                </Button>
                <Popconfirm
                  title="确定删除这条备忘录？"
                  description="删除后无法恢复。"
                  open={confirmId === memo.id}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true, loading: deleting }}
                  onCancel={() => setConfirmId(undefined)}
                  onConfirm={async () => {
                    await onDelete(memo.id);
                    setConfirmId(undefined);
                  }}
                >
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: [
                        { key: "edit", label: "编辑", icon: <EditOutlined /> },
                        { type: "divider" },
                        {
                          key: "delete",
                          label: "删除",
                          danger: true,
                          icon: <DeleteOutlined />,
                        },
                      ],
                      onClick: ({ key }) =>
                        key === "edit" ? onEdit(memo) : setConfirmId(memo.id),
                    }}
                  >
                    <Button
                      size="small"
                      type="text"
                      icon={<MoreOutlined />}
                      aria-label={`${memo.title}的更多操作`}
                    />
                  </Dropdown>
                </Popconfirm>
              </Flex>
            </Flex>
          </article>
        </List.Item>
      )}
    />
  );
}
