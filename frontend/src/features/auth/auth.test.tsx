import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { App } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
import LoginPage from "../../pages/LoginPage";
import { AuthGate } from "./AuthGate";
import { auth } from "../../api/auth";
import { ApiError, api, setUnauthorizedHandler } from "../../api/client";
vi.mock("../../api/auth", () => ({
  auth: {
    login: vi.fn(),
    session: vi.fn(),
    renew: vi.fn().mockResolvedValue(undefined),
  },
}));
function wrap(ui: React.ReactNode) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <App>{ui}</App>
    </QueryClientProvider>
  );
}
it("logs in with Enter and navigates to memos", async () => {
  vi.mocked(auth.login).mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(
    wrap(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Memos unlocked</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await user.type(screen.getByLabelText("密码"), "secret{Enter}");
  expect(await screen.findByText("Memos unlocked")).toBeVisible();
  expect(auth.login).toHaveBeenCalledWith("secret");
});
it("redirects an unauthenticated session", async () => {
  vi.mocked(auth.session).mockRejectedValue(
    new ApiError(401, "UNAUTHORIZED", "Authentication required"),
  );
  render(
    wrap(
      <MemoryRouter>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/" element={<p>Private content</p>} />
          </Route>
          <Route path="/login" element={<p>Login required</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  expect(await screen.findByText("Login required")).toBeVisible();
  expect(screen.queryByText("Private content")).not.toBeInTheDocument();
});
it("handles API 401 and adds credentials and CSRF headers", async () => {
  const redirect = vi.fn();
  setUnauthorizedHandler(redirect);
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Expired" } }),
        { status: 401 },
      ),
    );
  await expect(api("/memos", { method: "POST", body: "{}" })).rejects.toThrow(
    "登录已过期，请重新登录。",
  );
  expect(redirect).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/v1/memos"),
    expect.objectContaining({
      credentials: "include",
      headers: expect.objectContaining({
        "X-Memo-CSRF": "1",
        "Content-Type": "application/json",
      }),
    }),
  );
  await waitFor(() => expect(redirect).toHaveBeenCalledTimes(1));
});
it("keeps a rejected password on the login form and shows a persistent error", async () => {
  vi.mocked(auth.login).mockRejectedValue(
    new ApiError(401, "INVALID_PASSWORD", "密码错误，请重新输入。"),
  );
  const user = userEvent.setup();
  render(
    wrap(
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage />
      </MemoryRouter>,
    ),
  );
  await user.type(screen.getByLabelText("密码"), "wrong{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "密码错误，请重新输入。",
  );
  expect(screen.getByLabelText("密码")).toHaveValue("wrong");
});
it("does not redirect or clear state for a login 401", async () => {
  const redirect = vi.fn();
  setUnauthorizedHandler(redirect);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        error: { code: "UNAUTHORIZED", message: "Invalid password" },
      }),
      { status: 401 },
    ),
  );
  await expect(
    api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "wrong" }),
    }),
  ).rejects.toThrow("密码错误");
  expect(redirect).not.toHaveBeenCalled();
});
it("reports a rejected cookie before navigating to private pages", async () => {
  const real =
    await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  const redirect = vi.fn();
  setUnauthorizedHandler(redirect);
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), {
        status: 401,
      }),
    );
  vi.mocked(auth.login).mockImplementation(real.auth.login);
  const user = userEvent.setup();
  render(
    wrap(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Private content</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await user.type(screen.getByLabelText("密码"), "correct{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "密码已验证，但浏览器未能建立登录会话",
  );
  expect(screen.queryByText("Private content")).not.toBeInTheDocument();
  expect(redirect).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("accepts a password only after the session cookie is confirmed", async () => {
  const real =
    await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: true }), { status: 200 }),
    );
  await expect(real.auth.login("correct")).resolves.toBeUndefined();
});
it("does not expire a valid session when the current password is wrong", async () => {
  const redirect = vi.fn();
  setUnauthorizedHandler(redirect);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        error: { code: "INVALID_PASSWORD", message: "Invalid password" },
      }),
      { status: 401 },
    ),
  );
  await expect(
    api("/auth/password", { method: "PUT", body: "{}" }),
  ).rejects.toThrow("密码错误");
  expect(redirect).not.toHaveBeenCalled();
});
it("offers the password form when the session probe is blocked by network or CORS", async () => {
  const real =
    await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  vi.mocked(auth.session).mockImplementation(real.auth.session);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new TypeError("Failed to fetch"),
  );
  render(
    wrap(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/" element={<p>Private content</p>} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  expect(await screen.findByLabelText("密码")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("暂时无法检查登录状态");
  expect(screen.getByRole("button", { name: "重试连接" })).toBeVisible();
  expect(screen.queryByText("Private content")).not.toBeInTheDocument();
});
it("lets users retry a failed session probe from the login page", async () => {
  vi.mocked(auth.session)
    .mockReset()
    .mockRejectedValueOnce(
      new ApiError(0, "NETWORK_ERROR", "无法连接服务器，请检查网络后重试。"),
    )
    .mockResolvedValue({ authenticated: true });
  const user = userEvent.setup();
  render(
    wrap(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/" element={<p>Private content</p>} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await user.click(await screen.findByRole("button", { name: "重试连接" }));
  expect(await screen.findByText("Private content")).toBeVisible();
});
it("shows the password form for an explicitly anonymous session", async () => {
  vi.mocked(auth.session)
    .mockReset()
    .mockResolvedValue({ authenticated: false });
  render(
    wrap(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/" element={<p>Private content</p>} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  expect(await screen.findByLabelText("密码")).toBeVisible();
  expect(screen.queryByText("Private content")).not.toBeInTheDocument();
});
