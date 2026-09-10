import zhCN from "antd/locale/zh_CN";
import { Component, type ReactNode } from "react";
import { App as AntApp, Button, ConfigProvider, Result } from "antd";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { queryClient } from "./query-client";
import { router } from "./router";
import { setUnauthorizedHandler } from "../api/client";
setUnauthorizedHandler(() => {
  queryClient.clear();
  if (router.state.location.pathname !== "/login")
    void router.navigate("/login", {
      replace: true,
      state: { sessionExpired: true },
    });
});
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Result
        status="error"
        title="页面出现错误"
        extra={
          <Button onClick={() => window.location.reload()}>重新加载</Button>
        }
      />
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#285fc1",
          colorText: "#26374e",
          colorTextSecondary: "#5f6e82",
          colorBorder: "#dce3ed",
          borderRadius: 8,
          fontSize: 14,
          controlHeight: 36,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
        components: {
          Button: { primaryShadow: "0 2px 4px rgba(40,95,193,.12)" },
          Input: { activeShadow: "0 0 0 3px rgba(40,95,193,.08)" },
          Drawer: { paddingLG: 24 },
        },
      }}
    >
      <AntApp>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ErrorBoundary>
      </AntApp>
    </ConfigProvider>
  );
}
