import {
  ArrowLeftOutlined,
  InfoCircleOutlined,
  LockOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { App, Button, Card, Form, Input, Typography } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { auth } from "../api/auth";
export default function SettingsPage() {
  const nav = useNavigate(),
    cache = useQueryClient(),
    { message } = App.useApp();
  const done = () => {
    cache.clear();
    nav("/login", { replace: true });
  };
  const change = useMutation({
    mutationFn: (v: { currentPassword: string; newPassword: string }) =>
      auth.password(v.currentPassword, v.newPassword),
    onSuccess: () => {
      message.success("密码已修改");
      done();
    },
    onError: (e) => message.error(e.message),
  });
  const logout = useMutation({
    mutationFn: auth.logout,
    onSuccess: done,
    onError: (e) => message.error(e.message),
  });
  return (
    <main className="settings-shell">
      <div className="settings">
        <Link to="/">
          <ArrowLeftOutlined /> 返回备忘录
        </Link>
        <header className="settings-header">
          <Typography.Title level={2}>设置</Typography.Title>
          <Typography.Text type="secondary">
            管理你的访问密码与当前登录状态。
          </Typography.Text>
        </header>
        <Card
          title={
            <>
              <LockOutlined /> 修改密码
            </>
          }
        >
          <Typography.Paragraph type="secondary">
            修改密码后，所有设备都需要重新登录。
          </Typography.Paragraph>
          <Form layout="vertical" onFinish={(v) => change.mutate(v)}>
            <Form.Item
              label="当前密码"
              name="currentPassword"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              label="新密码"
              name="newPassword"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              label="确认新密码"
              name="confirm"
              dependencies={["newPassword"]}
              rules={[
                { required: true, message: "请输入密码" },
                ({ getFieldValue }) => ({
                  validator: (_, v) =>
                    v === getFieldValue("newPassword")
                      ? Promise.resolve()
                      : Promise.reject(new Error("两次输入的密码不一致")),
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={change.isPending}>
              修改密码
            </Button>
          </Form>
        </Card>
        <Card>
          <div className="settings-session">
            <div>
              <Typography.Text strong>当前设备</Typography.Text>
              <Typography.Paragraph type="secondary">
                退出后，需要输入密码才能再次访问。
              </Typography.Paragraph>
            </div>
            <Button
              icon={<LogoutOutlined />}
              onClick={() => logout.mutate()}
              loading={logout.isPending}
            >
              退出登录
            </Button>
          </div>
        </Card>
        <Card
          title={
            <>
              <InfoCircleOutlined /> 关于
            </>
          }
        >
          <Typography.Paragraph type="secondary">
            Light Memo 是一个轻量级备忘录应用。
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            作者：phil616
          </Typography.Paragraph>
        </Card>
      </div>
    </main>
  );
}
