import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { Skeleton } from "antd";
import { AuthGate } from "../features/auth/AuthGate";
import LoginPage from "../pages/LoginPage";
const MemoPage = lazy(() => import("../pages/MemoPage"));
const TemplatesPage = lazy(() => import("../pages/TemplatesPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <AuthGate />,
    children: [
      {
        path: "/templates",
        element: (
          <Suspense fallback={<Skeleton active />}>
            <TemplatesPage />
          </Suspense>
        ),
      },
      {
        path: "/",
        element: (
          <Suspense fallback={<Skeleton active />}>
            <MemoPage />
          </Suspense>
        ),
      },
      {
        path: "/settings",
        element: (
          <Suspense fallback={<Skeleton active />}>
            <SettingsPage />
          </Suspense>
        ),
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
