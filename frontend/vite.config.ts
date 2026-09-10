import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root);
  const address = env.VITE_API_BASE_URL?.trim();
  let url: URL;
  try {
    url = new URL(address ?? "");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new Error(
      "请配置 VITE_API_BASE_URL 为有效的 HTTP(S) 后端地址（不含账号、查询参数或片段）。可先复制 .env.example 为 .env。",
    );
  }
  return {
    plugins: [
      react(),
      {
        name: "memo-api-csp",
        apply: "build",
        generateBundle() {
          const template = readFileSync(
            new URL("./config/headers.template", import.meta.url),
            "utf8",
          );
          this.emitFile({
            type: "asset",
            fileName: "_headers",
            source: template.replace("__API_ORIGIN__", url.origin),
          });
        },
      },
    ],
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test-setup.ts"],
      css: false,
      testTimeout: 15000,
    },
  };
});
