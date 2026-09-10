import { api, ApiError } from "./client";
export const auth = {
  session: (signal?: AbortSignal) =>
    api<{ authenticated: boolean }>("/auth/session", {
      signal,
      skipUnauthorizedHandler: true,
    }),
  renew: () => api<void>("/auth/session", { method: "POST", body: "{}" }),
  login: async (password: string) => {
    await api<void>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
      skipUnauthorizedHandler: true,
    });
    // Confirm the browser actually retained the cookie before entering protected pages.
    try {
      const session = await api<{ authenticated: boolean }>("/auth/session", {
        skipUnauthorizedHandler: true,
      });
      if (!session.authenticated) throw new ApiError(401, "UNAUTHORIZED", "");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        throw new ApiError(
          401,
          "SESSION_NOT_PERSISTED",
          "密码已验证，但浏览器未能建立登录会话。请检查前后端是否使用同站点 HTTPS 地址；本地开发请统一使用 localhost，并允许 Cookie。",
        );
      throw error;
    }
  },
  logout: () => api<void>("/auth/logout", { method: "POST", body: "{}" }),
  password: (currentPassword: string, newPassword: string) =>
    api<void>("/auth/password", {
      method: "PUT",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};
