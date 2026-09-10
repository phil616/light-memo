import { useEffect, useState } from "react";
import {
  App,
  Alert,
  Button,
  Drawer,
  Flex,
  Form,
  Input,
  Select,
  Tag,
  Typography,
} from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { templates } from "../../api/templates";
import type { MemoTemplate, TemplateInput } from "../../types";
import { variableNames } from "./expressions";
export function TemplateEditor({
  template,
  mobile,
  onClose,
}: {
  template?: MemoTemplate;
  mobile: boolean;
  onClose: () => void;
}) {
  const [form] = Form.useForm<TemplateInput>();
  const [dirty, setDirty] = useState(false);
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  useEffect(() => {
    form.setFieldsValue(
      template ?? { name: "", title: "", tags: [], content: "" },
    );
  }, [form, template]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const fields = Form.useWatch([], form) ?? {};
  let names: string[] = [],
    syntax = "";
  try {
    names = variableNames({
      title: fields.title ?? "",
      tags: fields.tags ?? [],
      content: fields.content ?? "",
    });
  } catch (e) {
    syntax = (e as Error).message;
  }
  const save = useMutation({
    mutationFn: (input: TemplateInput) =>
      templates.save(
        { ...input, tags: input.tags ?? [], content: input.content ?? "" },
        template?.id,
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["templates"] });
      void cache.invalidateQueries({ queryKey: ["template"] });
      message.success("模板已保存");
      onClose();
    },
    onError: (e) => message.error(e.message),
  });
  const close = () => {
    if (save.isPending) return;
    if (!dirty) {
      onClose();
      return;
    }
    modal.confirm({
      title: "放弃未保存的模板？",
      content: "当前修改尚未保存。",
      okText: "放弃修改",
      cancelText: "继续编辑",
      onOk: onClose,
    });
  };
  return (
    <Drawer
      title={template ? "编辑模板" : "新建模板"}
      open
      onClose={close}
      size={mobile ? "100%" : 680}
      className="memo-editor"
      closable={!save.isPending}
      keyboard={!save.isPending}
      maskClosable={!save.isPending}
      footer={
        <Flex justify="space-between" align="center">
          <Typography.Text type="secondary">
            {names.length} 个变量
          </Typography.Text>
          <Flex gap={8}>
            <Button onClick={close} disabled={save.isPending}>
              取消
            </Button>
            <Button
              type="primary"
              aria-label="保存模板"
              loading={save.isPending}
              disabled={!!syntax}
              onClick={() => form.submit()}
            >
              保存模板
            </Button>
          </Flex>
        </Flex>
      }
    >
      <Alert
        type="info"
        showIcon
        title="用变量复用内容"
        description={
          "在标题、标签或正文中写入 {{task_name}}，使用模板时填写实际内容。同名变量只需填写一次。"
        }
      />
      <Form
        form={form}
        layout="vertical"
        className="template-editor-form"
        disabled={save.isPending}
        requiredMark={false}
        onValuesChange={() => setDirty(true)}
        onFinish={(v) => {
          if (!syntax) save.mutate(v);
        }}
      >
        <Form.Item
          name="name"
          label="模板名称"
          rules={[
            { required: true, whitespace: true, message: "请输入模板名称" },
            {
              validator: (_, v) =>
                Array.from(v ?? "").length <= 100
                  ? Promise.resolve()
                  : Promise.reject(new Error("模板名称最多 100 个字符")),
            },
          ]}
        >
          <Input autoFocus placeholder="例如：每日任务" />
        </Form.Item>
        <Form.Item
          name="title"
          label="备忘录标题"
          rules={[
            {
              required: true,
              whitespace: true,
              message: "请输入生成的备忘录标题",
            },
            {
              validator: (_, v) =>
                Array.from(v ?? "").length <= 200
                  ? Promise.resolve()
                  : Promise.reject(new Error("标题最多 200 个字符")),
            },
          ]}
        >
          <Input placeholder={"例如：任务 · {{task_name}}"} />
        </Form.Item>
        <Form.Item
          name="tags"
          label="标签"
          rules={[
            {
              validator: (_, v: string[] = []) =>
                v.length <= 20 &&
                v.every((t) => Array.from(t.trim()).length <= 32)
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error("最多 20 个标签，每个最多 32 个字符"),
                    ),
            },
          ]}
        >
          <Select mode="tags" placeholder="输入标签后按回车确认" />
        </Form.Item>
        <Form.Item
          name="content"
          label="模板正文"
          rules={[
            {
              validator: (_, v) =>
                new TextEncoder().encode(v ?? "").length <= 128 * 1024
                  ? Promise.resolve()
                  : Promise.reject(new Error("正文最多 128 KiB")),
            },
          ]}
        >
          <Input.TextArea
            autoSize={{ minRows: 10, maxRows: 24 }}
            placeholder={"今天的任务是{{task_name}}"}
          />
        </Form.Item>
      </Form>
      {syntax ? (
        <Alert type="error" title="变量表达式有误" description={syntax} />
      ) : (
        <Flex gap={6} wrap align="center">
          <Typography.Text type="secondary">已识别变量：</Typography.Text>
          {names.length ? (
            names.map((name) => <Tag key={name}>{name}</Tag>)
          ) : (
            <Typography.Text type="secondary">
              暂无，可直接作为固定内容模板使用
            </Typography.Text>
          )}
        </Flex>
      )}
    </Drawer>
  );
}
