import { useEffect, useState } from "react";
import {
  App,
  Alert,
  Button,
  Drawer,
  Flex,
  Form,
  Input,
  Result,
  Skeleton,
  Tag,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { templates } from "../../api/templates";
import type { Memo, MemoTemplate } from "../../types";
import { renderTemplate } from "./expressions";
export function TemplateInstantiate({
  id,
  mobile,
  onClose,
}: {
  id: number;
  mobile: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { modal } = App.useApp();
  const close = () => {
    if (busy) return;
    if (!dirty) return onClose();
    modal.confirm({
      title: "放弃已填写的变量？",
      content: "尚未创建备忘录，关闭后输入将丢失。",
      okText: "放弃填写",
      cancelText: "继续填写",
      onOk: onClose,
    });
  };
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  const query = useQuery({
    queryKey: ["template", id],
    queryFn: ({ signal }) => templates.get(id, signal),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return (
    <Drawer
      title="从模板创建备忘录"
      open
      onClose={close}
      closable={!busy}
      keyboard={!busy}
      maskClosable={!busy}
      size={mobile ? "100%" : 800}
      destroyOnHidden
    >
      {query.isPending ? (
        <Skeleton active />
      ) : query.isError ? (
        <Alert
          type="error"
          title="模板加载失败"
          description={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      ) : (
        <InstanceForm
          key={`${id}:${query.data.version}`}
          template={query.data}
          onClose={close}
          setBusy={setBusy}
          setDirty={setDirty}
          onReload={() => void query.refetch()}
        />
      )}
    </Drawer>
  );
}
function InstanceForm({
  template,
  onClose,
  onReload,
  setBusy,
  setDirty,
}: {
  template: MemoTemplate;
  onClose: () => void;
  onReload: () => void;
  setBusy: (value: boolean) => void;
  setDirty: (value: boolean) => void;
}) {
  const [form] = Form.useForm<{ values: string[] }>();
  const values = Form.useWatch("values", { form, preserve: true }) ?? [];
  const [created, setCreated] = useState<Memo>();
  const { message } = App.useApp();
  const cache = useQueryClient();
  const variables = Object.fromEntries(
    template.variables
      .filter((_, i) => values[i] !== undefined)
      .map((name) => [name, values[template.variables.indexOf(name)]]),
  );
  let preview = {
      title: template.title,
      tags: template.tags,
      content: template.content,
    },
    previewError = "";
  try {
    preview = renderTemplate(template, variables);
  } catch (e) {
    previewError = (e as Error).message;
  }
  const instantiate = useMutation({
    mutationFn: (fields: { values?: string[] }) =>
      templates.instantiate(
        template,
        Object.fromEntries(
          template.variables.map((name, i) => [name, fields.values?.[i] ?? ""]),
        ),
      ),
    onSuccess: (m) => {
      setCreated(m);
      setDirty(false);
      void cache.invalidateQueries({ queryKey: ["memos"] });
      void cache.invalidateQueries({ queryKey: ["tags"] });
      message.success("已创建新备忘录");
    },
  });
  useEffect(() => {
    setBusy(instantiate.isPending);
  }, [instantiate.isPending, setBusy]);
  if (created)
    return (
      <>
        <Result
          status="success"
          title="备忘录已创建"
          subTitle="它已加入备忘录列表，可以独立编辑。"
          extra={
            <Button type="primary" onClick={onClose}>
              完成
            </Button>
          }
        />
        <Typography.Title level={4}>{created.title}</Typography.Title>
        <Flex wrap gap={6}>
          {created.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </Flex>
        <Typography.Paragraph className="memo-content">
          {created.content}
        </Typography.Paragraph>
      </>
    );
  return (
    <>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {template.name}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        填写变量后确认预览，创建一条新的备忘录。
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={instantiate.isPending}
        onValuesChange={() => setDirty(true)}
        onFinish={(v) => instantiate.mutate(v)}
      >
        {template.variables.length ? (
          template.variables.map((name, i) => (
            <Form.Item
              key={name}
              name={["values", i]}
              label={name}
              rules={[
                {
                  validator: (_, value) =>
                    value !== undefined
                      ? Promise.resolve()
                      : Promise.reject(new Error(`请填写 ${name}`)),
                },
              ]}
            >
              <Input.TextArea
                autoSize={{ minRows: 1, maxRows: 6 }}
                placeholder={`请输入 ${name} 的值`}
              />
            </Form.Item>
          ))
        ) : (
          <Alert type="info" title="此模板没有变量，可直接创建备忘录。" />
        )}
        <section className="template-preview" aria-label="生成预览">
          <Typography.Text className="section-label">生成预览</Typography.Text>
          {previewError ? (
            <Alert type="error" title={previewError} />
          ) : (
            <>
              <Typography.Title level={4}>{preview.title}</Typography.Title>
              <Flex gap={6} wrap>
                {preview.tags.map((tag, i) => (
                  <Tag key={i}>{tag}</Tag>
                ))}
              </Flex>
              <Typography.Paragraph className="memo-content">
                {preview.content}
              </Typography.Paragraph>
            </>
          )}
        </section>
        {instantiate.isError && (
          <Alert
            type="error"
            title="创建失败"
            description={instantiate.error.message}
            action={<Button onClick={onReload}>重新加载模板</Button>}
          />
        )}
        <Flex justify="flex-end" gap={8} className="template-submit">
          <Button onClick={onClose} disabled={instantiate.isPending}>
            取消
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={instantiate.isPending}
            disabled={!!previewError}
          >
            创建备忘录
          </Button>
        </Flex>
      </Form>
    </>
  );
}
