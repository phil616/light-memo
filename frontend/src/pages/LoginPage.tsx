import { BookOutlined, LockOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { auth } from "../api/auth";
export default function LoginPage() {
  const nav = useNavigate(),
    cache = useQueryClient();
  const location = useLocation();
  const login = useMutation({
    mutationFn: ({ password }: { password: string }) => auth.login(password),
    onSuccess: () => {
      cache.setQueryData(["auth"], { authenticated: true });
      nav("/", { replace: true });
    },
  });
  return (
    <main className="login">
      <div className="login-brand">
        <BookOutlined />
        <Typography.Title level={2}>备忘录</Typography.Title>
      </div>
      <Card className="login-card">
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          解锁个人资料库
        </Typography.Title>
        <Typography.Text type="secondary">
          输入密码，继续查看和记录。
        </Typography.Text>
        {!login.isError && location.state?.sessionCheckError && (
          <Alert
            type="warning"
            showIcon
            role="alert"
            style={{ marginTop: 16, marginBottom: 16 }}
            title="暂时无法检查登录状态"
            description={`${location.state.sessionCheckError} 你仍可输入密码尝试登录。`}
            action={
              <Button
                onClick={() => {
                  void cache
                    .resetQueries({ queryKey: ["auth"] })
                    .then(() => nav("/", { replace: true }));
                }}
              >
                重试连接
              </Button>
            }
          />
        )}
        {(login.isError || location.state?.sessionExpired) && (
          <Alert
            type="error"
            showIcon
            role="alert"
            style={{ marginTop: 16, marginBottom: 16 }}
            title={login.isError ? "登录失败" : "请重新登录"}
            description={
              login.isError
                ? login.error.message
                : "登录会话已失效，请重新输入密码。"
            }
          />
        )}
        <Form layout="vertical" onFinish={(v) => login.mutate(v)}>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              autoFocus
              autoComplete="current-password"
            />
          </Form.Item>
          <Button
            size="large"
            type="primary"
            htmlType="submit"
            block
            loading={login.isPending}
          >
            解锁
          </Button>
        </Form>
      </Card>
      <Typography.Text className="login-hint">
        你的记录，只属于你。
      </Typography.Text>
    </main>
  );
}
