import { QueryClient } from "@tanstack/react-query";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 600_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});
