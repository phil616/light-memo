const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim().replace(
  /\/+$/,
  "",
);
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}
export async function api<T>(
  path: string,
  options: RequestInit & { skipUnauthorizedHandler?: boolean } = {},
): Promise<T> {
  if (!API_BASE_URL)
    throw new ApiError(
      0,
      "CONFIG_ERROR",
      "未配置后端地址，请设置 VITE_API_BASE_URL 后重新启动或构建前端。",
    );
  const { skipUnauthorizedHandler = false, ...requestOptions } = options;
  const method = options.method ?? "GET";
  const mutation = ["POST", "PUT", "DELETE"].includes(method);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      ...requestOptions,
      credentials: "include",
      headers: {
        ...options.headers,
        ...(mutation
          ? { "Content-Type": "application/json", "X-Memo-CSRF": "1" }
          : {}),
      },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "无法连接服务器，请检查网络后重试。",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const invalidPassword =
      body.error?.code === "INVALID_PASSWORD" ||
      body.error?.message === "Invalid password";
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      !invalidPassword &&
      !skipUnauthorizedHandler
    )
      onUnauthorized();
    throw new ApiError(
      response.status,
      body.error?.code ?? "INTERNAL_ERROR",
      errorMessage(body.error?.code, body.error?.message, path),
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function errorMessage(
  code: string | undefined,
  message: string | undefined,
  path: string,
): string {
  if (message === "Invalid password") return "密码错误";
  if (code === "UNAUTHORIZED")
    return path === "/auth/login" ? "密码错误" : "登录已过期，请重新登录。";
  const messages: Record<string, string> = {
    INVALID_PASSWORD: "密码错误，请重新输入。",
    TEMPLATE_NOT_FOUND: "模板不存在或已被删除。",
    TEMPLATE_SYNTAX:
      "变量表达式有误，请使用 {{变量名}}；变量名以字母、中文或下划线开头，最多 64 个字符。",
    INVALID_TEMPLATE: "模板字段不符合要求，请检查名称、标题、标签和正文长度。",
    TEMPLATE_VARIABLES: "请填写模板所需的全部变量，不要提交额外变量。",
    TEMPLATE_CHANGED: "模板已修改，请重新加载模板后再创建。",
    TEMPLATE_OUTPUT:
      "生成的标题、标签或正文超出限制，或标题为空，请调整变量值。",
    INVALID_REQUEST: "请求内容不符合要求，请检查后重试。",
    FORBIDDEN: "请求被拒绝，请检查访问地址和服务配置。",
    NOT_FOUND: "备忘录不存在或已被删除。",
    RATE_LIMITED: "操作过于频繁，请稍后再试。",
    CONTENT_TOO_LARGE: "内容过大，请缩短正文后重试。",
    INTERNAL_ERROR: "服务器暂时不可用，请稍后重试。",
  };
  return messages[code ?? ""] ?? "请求失败，请稍后重试。";
}
