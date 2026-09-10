import {
  App,
  Button,
  Drawer,
  Flex,
  Form,
  Input,
  Select,
  Typography,
} from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { memos } from "../../api/memos";
import type { Memo, MemoInput } from "../../types";
export function MemoEditor({
  open,
  memo,
  mobile,
  tags,
  onClose,
  onSaved,
}: {
  open: boolean;
  memo?: Memo;
  mobile: boolean;
  tags: string[];
  onClose: () => void;
  onSaved: (m: Memo) => void;
}) {
  const [form] = Form.useForm<MemoInput>();
  const [dirty, setDirty] = useState(false);
  const baseline = useRef("");
  const confirming = useRef(false);
  const cache = useQueryClient();
  const { message, modal } = App.useApp();
  useEffect(() => {
    if (open) {
      const initial = {
        title: memo?.title ?? "",
        tags: memo?.tags ?? [],
        content: memo?.content ?? "",
      };
      baseline.current = JSON.stringify(initial);
      setDirty(false);
      form.resetFields();
      form.setFieldsValue(initial);
    }
  }, [open, memo, form]);
  useEffect(() => {
    if (!open || !dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, dirty]);
  const save = useMutation({
    mutationFn: (v: MemoInput) =>
      memos.save(
        { ...v, tags: v.tags ?? [], content: v.content ?? "" },
        memo?.id,
      ),
    onSuccess: (m) => {
      setDirty(false);
      void cache.invalidateQueries({ queryKey: ["memos"] });
      void cache.invalidateQueries({ queryKey: ["tags"] });
      onSaved(m);
      message.success("已保存");
    },
    onError: (e) => message.error(e.message),
  });
  const close = () => {
    if (save.isPending || confirming.current) return;
    if (!dirty) {
      onClose();
      return;
    }
    confirming.current = true;
    modal.confirm({
      title: "放弃未保存的修改？",
      content: "当前修改尚未保存，关闭后将丢失。",
      okText: "放弃修改",
      cancelText: "继续编辑",
      okButtonProps: { danger: true },
      onOk: onClose,
      afterClose: () => {
        confirming.current = false;
      },
    });
  };
  return (
    <Drawer
      title={memo ? "编辑备忘录" : "新建备忘录"}
      className="memo-editor"
      open={open}
      onClose={close}
      size={mobile ? "100%" : 640}
      destroyOnHidden
      closable={!save.isPending}
      maskClosable={!save.isPending}
      keyboard={!save.isPending}
      footer={
        <Flex
          className="editor-footer"
          align="center"
          justify="space-between"
          gap={12}
        >
          <Typography.Text type="secondary">
            {save.isPending
              ? "正在保存…"
              : dirty
                ? "有未保存的修改"
                : "修改后点击保存"}
          </Typography.Text>
          <Flex gap={8}>
            <Button onClick={close} disabled={save.isPending}>
              取消
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              aria-label="保存"
              onClick={() => form.submit()}
              loading={save.isPending}
            >
              保存
            </Button>
          </Flex>
        </Flex>
      }
    >
      <Form
        className="editor-form"
        form={form}
        disabled={save.isPending}
        layout="vertical"
        requiredMark={false}
        onValuesChange={(_, values) =>
          setDirty(
            JSON.stringify({
              title: values.title ?? "",
              tags: values.tags ?? [],
              content: values.content ?? "",
            }) !== baseline.current,
          )
        }
        onFinish={(v) => save.mutate(v)}
      >
        <Form.Item
          name="title"
          label="标题"
          rules={[
            { required: true, whitespace: true, message: "请输入标题" },
            {
              validator: (_, v) =>
                Array.from(v ?? "").length <= 200
                  ? Promise.resolve()
                  : Promise.reject(new Error("最多输入 200 个字符")),
            },
          ]}
        >
          <Input size="large" autoFocus placeholder="为这条备忘录起个标题" />
        </Form.Item>
        <Form.Item
          name="tags"
          label="标签"
          extra="输入标签后按回车确认，方便以后查找。"
          rules={[
            {
              validator: (_, v: string[] = []) =>
                v.length <= 20 &&
                v.every((t) => Array.from(t.trim()).length <= 32)
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error("最多 20 个标签，每个标签不超过 32 个字符"),
                    ),
            },
          ]}
        >
          <Select
            mode="tags"
            placeholder="选择或输入标签"
            options={tags.map((value) => ({ value, label: value }))}
          />
        </Form.Item>
        <Form.Item
          name="content"
          label="正文"
          rules={[
            {
              validator: (_, v) =>
                new TextEncoder().encode(v ?? "").length <= 128 * 1024
                  ? Promise.resolve()
                  : Promise.reject(new Error("正文不能超过 128 KiB")),
            },
          ]}
        >
          <Input.TextArea
            className="editor-content"
            placeholder="记录需要保存的内容…"
            autoSize={{ minRows: mobile ? 10 : 14, maxRows: 32 }}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
