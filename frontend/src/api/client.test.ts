import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("uses the configured API base URL and normalizes trailing slashes", async () => {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.org/gateway/");
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { status: 200 }));
  const { api } = await import("./client");
  await api("/memos");
  expect(request).toHaveBeenCalledWith(
    "https://api.example.org/gateway/api/v1/memos",
    expect.objectContaining({ credentials: "include" }),
  );
});
it("reports missing API configuration without silently contacting localhost", async () => {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", "");
  const request = vi.spyOn(globalThis, "fetch");
  const { api } = await import("./client");
  await expect(api("/memos")).rejects.toMatchObject({ code: "CONFIG_ERROR" });
  expect(request).not.toHaveBeenCalled();
});
