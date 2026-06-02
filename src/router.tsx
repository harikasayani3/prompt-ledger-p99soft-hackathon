import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Consider data fresh for 30 seconds — avoids redundant refetches when
        // navigating between pages or remounting components within the same session.
        staleTime: 30_000,
        // Keep unused query data in cache for 5 minutes so navigating back to a
        // page shows cached data instantly while a background refetch runs.
        gcTime: 5 * 60_000,
        // Don't hammer the server on transient failures — retry once after 1s.
        retry: 1,
        retryDelay: 1_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
